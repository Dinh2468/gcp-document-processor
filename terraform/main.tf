terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# =====================================================================
# 1. Cloud Storage
# =====================================================================
resource "google_storage_bucket" "ingestion_bucket" {
  name                        = var.bucket_name
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true
}

# =====================================================================
# 2. Pub/Sub
# =====================================================================
# Pub/Sub Topic nhận thông báo từ GCS khi tải tệp
resource "google_pubsub_topic" "gcs_notification_topic" {
  name = "gcs-document-upload-topic"
}

# Lấy Service Account mặc định của GCS để phân quyền ghi vào Pub/Sub
data "google_storage_project_service_account" "gcs_account" {}

# Cấp quyền cho GCS Service Account gửi tin nhắn vào Pub/Sub Topic
resource "google_pubsub_topic_iam_binding" "gcs_publisher" {
  topic = google_pubsub_topic.gcs_notification_topic.name
  role  = "roles/pubsub.publisher"
  members = [
    "serviceAccount:${data.google_storage_project_service_account.gcs_account.email_address}"
  ]
}

# Cấu hình GCS Notification: kích hoạt khi tệp tin tải lên thành công (OBJECT_FINALIZE)
resource "google_storage_notification" "notification" {
  bucket         = google_storage_bucket.ingestion_bucket.name
  payload_format = "JSON_API_V1"
  topic          = google_pubsub_topic.gcs_notification_topic.id
  event_types    = ["OBJECT_FINALIZE"]

  depends_on = [google_pubsub_topic_iam_binding.gcs_publisher]
}

# =====================================================================
# 3. Artifact Registry (Lưu trữ Docker Image)
# =====================================================================
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.artifact_registry_repo
  description   = "Kho luu tru Docker Image cho Cloud Run"
  format        = "DOCKER"
}

# =====================================================================
# 4. BigQuery (Lưu trữ siêu dữ liệu)
# =====================================================================
resource "google_bigquery_dataset" "dataset" {
  dataset_id                 = var.bq_dataset_id
  friendly_name              = "Document Processing Dataset"
  description                = "Dataset luu tru thong tin sieu du lieu cua tai lieu sau khi OCR"
  location                   = var.region
  delete_contents_on_destroy = true
}

resource "google_bigquery_table" "metadata_table" {
  dataset_id          = google_bigquery_dataset.dataset.dataset_id
  table_id            = var.bq_table_id
  deletion_protection = false

  schema = <<EOF
[
  {
    "name": "filename",
    "type": "STRING",
    "mode": "REQUIRED",
    "description": "Ten tep tin"
  },
  {
    "name": "date",
    "type": "TIMESTAMP",
    "mode": "REQUIRED",
    "description": "Ngay gio tap tin duoc tao tren GCS"
  },
  {
    "name": "tags",
    "type": "STRING",
    "mode": "REPEATED",
    "description": "Cac nhan phan loai cua tep tin"
  },
  {
    "name": "word_count",
    "type": "INTEGER",
    "mode": "REQUIRED",
    "description": "So luong tu trong tep tin"
  },
  {
    "name": "bucket_name",
    "type": "STRING",
    "mode": "REQUIRED",
    "description": "Ten bucket chua tep"
  },
  {
    "name": "file_size",
    "type": "INTEGER",
    "mode": "REQUIRED",
    "description": "Kich thuoc tep (bytes)"
  },
  {
    "name": "processing_time",
    "type": "TIMESTAMP",
    "mode": "REQUIRED",
    "description": "Thoi gian he thong hoan tat xu ly"
  }
]
EOF
}

# =====================================================================
# 5. Phân quyền và Service Accounts
# =====================================================================
# Service Account dành cho dịch vụ Cloud Run (để đọc GCS, ghi BigQuery)
resource "google_service_account" "run_sa" {
  account_id   = "doc-processor-run-sa"
  display_name = "Cloud Run Document Processor Service Account"
}

# Cấp quyền đọc từ bucket GCS
resource "google_storage_bucket_iam_member" "gcs_viewer" {
  bucket = google_storage_bucket.ingestion_bucket.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.run_sa.email}"
}

# Cấp quyền ghi dữ liệu streaming vào BigQuery Dataset
resource "google_bigquery_dataset_iam_member" "bq_editor" {
  dataset_id = google_bigquery_dataset.dataset.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.run_sa.email}"
}

# =====================================================================
# 6. Cloud Run & Pub/Sub Push Subscription (Conditional)
# =====================================================================
# Dịch vụ Cloud Run xử lý tài liệu
resource "google_cloud_run_service" "processor" {
  count    = var.deploy_cloud_run ? 1 : 0
  name     = var.cloud_run_service_name
  location = var.region

  template {
    spec {
      service_account_name = google_service_account.run_sa.email
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo}/${var.cloud_run_service_name}:latest"

        env {
          name  = "BQ_DATASET_ID"
          value = var.bq_dataset_id
        }
        env {
          name  = "BQ_TABLE_ID"
          value = var.bq_table_id
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

# Service Account để Pub/Sub gọi Cloud Run (Push Authentication)
resource "google_service_account" "pubsub_sa" {
  count        = var.deploy_cloud_run ? 1 : 0
  account_id   = "doc-processor-pubsub-sa"
  display_name = "Pub/Sub Invoker Service Account"
}

# Cho phép Service Account của Pub/Sub quyền gọi dịch vụ Cloud Run
resource "google_cloud_run_service_iam_member" "run_invoker" {
  count    = var.deploy_cloud_run ? 1 : 0
  service  = google_cloud_run_service.processor[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.pubsub_sa[0].email}"
}

# Cấu hình Pub/Sub Push Subscription hướng về Cloud Run
resource "google_pubsub_subscription" "push_sub" {
  count = var.deploy_cloud_run ? 1 : 0
  name  = "gcs-document-upload-sub"
  topic = google_pubsub_topic.gcs_notification_topic.name

  push_config {
    push_endpoint = google_cloud_run_service.processor[0].status[0].url

    oidc_token {
      service_account_email = google_service_account.pubsub_sa[0].email
      audience              = google_cloud_run_service.processor[0].status[0].url
    }
  }

  ack_deadline_seconds = 600
}
