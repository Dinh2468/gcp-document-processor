variable "project_id" {
  description = "Google Cloud Project ID"
  type        = string
  default     = "dinh-serverless-doc-proc"
}

variable "region" {
  description = "Google Cloud Region"
  type        = string
  default     = "asia-southeast1"
}

variable "bucket_name" {
  description = "Tên duy nhất toàn cầu cho Cloud Storage bucket tải tài liệu"
  type        = string
  default     = "dinh-document-ingestion-bucket-2026"
}

variable "artifact_registry_repo" {
  description = "Tên kho lưu trữ Artifact Registry chứa Docker image"
  type        = string
  default     = "document-processor-repo"
}

variable "bq_dataset_id" {
  description = "BigQuery Dataset ID"
  type        = string
  default     = "document_processing"
}

variable "bq_table_id" {
  description = "BigQuery Table ID"
  type        = string
  default     = "document_metadata"
}

variable "cloud_run_service_name" {
  description = "Tên dịch vụ Cloud Run"
  type        = string
  default     = "document-processor"
}

variable "deploy_cloud_run" {
  description = "Biến cờ kiểm soát việc triển khai Cloud Run (false ở giai đoạn 1, true ở giai đoạn 2 sau khi build ảnh Docker)"
  type        = bool
  default     = false
}
