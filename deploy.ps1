# Kịch bản triển khai hệ thống xử lý tài liệu tự động trên Google Cloud (PowerShell)

# 1. Cấu hình các biến số
$PROJECT_ID = "dinh-serverless-doc-proc"
$REGION = "asia-southeast1"
$REPO_NAME = "document-processor-repo"
$SERVICE_NAME = "document-processor"
$GCLOUD_PATH = "$env:USERPROFILE\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

Write-Host "Bắt đầu thiết lập môi trường cho dự án: $PROJECT_ID" -ForegroundColor Green

# Thiết lập project mặc định trong gcloud CLI
& $GCLOUD_PATH config set project $PROJECT_ID
if ($LASTEXITCODE -ne 0) {
    Write-Error "Không thể đặt cấu hình project cho gcloud. Vui lòng kiểm tra lại đăng nhập."
    exit
}

# =====================================================================
# GIAI ĐOẠN 1: Triển khai hạ tầng cơ sở (Chưa có Cloud Run)
# =====================================================================
Write-Host "`n=== GIAI ĐOẠN 1: Triển khai hạ tầng cơ sở (GCS, Pub/Sub, BigQuery, Artifact Registry) ===" -ForegroundColor Cyan
cd terraform

Write-Host "Khởi tạo Terraform..." -ForegroundColor Yellow
terraform init

Write-Host "Áp dụng hạ tầng Giai đoạn 1..." -ForegroundColor Yellow
terraform apply -var="project_id=$PROJECT_ID" -var="region=$REGION" -var="deploy_cloud_run=false" -auto-approve

if ($LASTEXITCODE -ne 0) {
    Write-Error "Lỗi xảy ra trong Giai đoạn 1 của Terraform."
    cd ..
    exit
}

cd ..

# =====================================================================
# GIAI ĐOẠN 2: Biên dịch Docker Image bằng Cloud Build
# =====================================================================
Write-Host "`n=== GIAI ĐOẠN 2: Biên dịch và đẩy Docker Image bằng Cloud Build ===" -ForegroundColor Cyan
cd src

$IMAGE_TAG = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"
Write-Host "Gửi mã nguồn lên Cloud Build và gắn thẻ image: $IMAGE_TAG" -ForegroundColor Yellow

& $GCLOUD_PATH builds submit --tag $IMAGE_TAG .

if ($LASTEXITCODE -ne 0) {
    Write-Error "Lỗi biên dịch container bằng Cloud Build."
    cd ..
    exit
}

cd ..

# =====================================================================
# GIAI ĐOẠN 3: Triển khai Cloud Run và Pub/Sub Push Subscription
# =====================================================================
Write-Host "`n=== GIAI ĐOẠN 3: Triển khai Cloud Run và Pub/Sub Push Subscription ===" -ForegroundColor Cyan
cd terraform

Write-Host "Áp dụng hạ tầng Giai đoạn 3 (Bật deploy_cloud_run=true)..." -ForegroundColor Yellow
terraform apply -var="project_id=$PROJECT_ID" -var="region=$REGION" -var="deploy_cloud_run=true" -auto-approve

if ($LASTEXITCODE -ne 0) {
    Write-Error "Lỗi xảy ra trong Giai đoạn 3 của Terraform."
    cd ..
    exit
}

cd ..
Write-Host "`n=== TRIỂN KHAI HOÀN TẤT THÀNH CÔNG! ===" -ForegroundColor Green
