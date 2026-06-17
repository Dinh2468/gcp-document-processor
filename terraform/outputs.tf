output "bucket_name" {
  description = "Tên của Google Cloud Storage bucket"
  value       = google_storage_bucket.ingestion_bucket.name
}

output "pubsub_topic" {
  description = "Tên của Pub/Sub Topic"
  value       = google_pubsub_topic.gcs_notification_topic.name
}

output "artifact_registry_repo_url" {
  description = "Đường dẫn kho lưu trữ Docker Image"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo}"
}

output "cloud_run_url" {
  description = "URL của dịch vụ Cloud Run (chỉ hiển thị sau khi triển khai Cloud Run)"
  value       = var.deploy_cloud_run ? google_cloud_run_service.processor[0].status[0].url : "Chưa triển khai Cloud Run"
}
