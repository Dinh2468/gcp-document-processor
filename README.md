# Hệ Thống Xử Lý Tài Liệu Event-Driven Serverless (Giả Lập & Đám Mây)

Dự án này là một hệ thống xử lý tài liệu hướng sự kiện (Event-Driven), tự động trích xuất siêu dữ liệu (metadata), đếm số từ và phân loại nhãn (Tags) tệp tin dựa trên từ khóa (hỗ trợ cả tiếng Anh và tiếng Việt). 

Dự án được xây dựng bằng **Node.js (Express)** và sẵn sàng triển khai trên **Google Cloud (Cloud Run, Pub/Sub, Storage, BigQuery)** hoặc chạy ở chế độ **Giả lập cục bộ / Render.com** (hoàn toàn miễn phí, không yêu cầu thẻ tín dụng).

---

## 1. Cấu Trúc Thư Mục Dự Án

```
google-cloud-serverless-app/
├── src/                          # Mã nguồn chính của dịch vụ
│   ├── public/
│   │   └── index.html            # Giao diện Web Dashboard (Glassmorphism)
│   ├── index.js                  # Máy chủ Express nhận Webhook xử lý file
│   ├── package.json              # Quản lý thư viện Node.js
│   ├── Dockerfile                # Đóng gói Docker Container
│   ├── test_local.js             # Script chạy kiểm thử cục bộ
│   └── test_render.js            # Script chạy kiểm thử trực tuyến (Render)
├── terraform/                    # Hạ tầng cơ sở dưới dạng mã (IaC)
│   ├── main.tf                   # Định nghĩa tài nguyên GCP
│   ├── variables.tf              # Biến cấu hình (Project ID, Region, v.v.)
│   └── outputs.tf                # Các giá trị đầu ra (Cloud Run URL, GCS Bucket)
├── deploy.ps1                    # Script tự động hóa triển khai GCP (PowerShell)
└── README.md                     # Tài liệu hướng dẫn này
```

---

## 2. Kiến Trúc Luồng Xử Lý

```
[Người dùng tải file]
        │
        ▼
[Cloud Storage / Thư mục Local] ──(Kích hoạt sự kiện)──> [Pub/Sub / Webhook POST]
                                                                │
                                                                ▼
                                                       [Dịch vụ Node.js]
                                                       (Đọc file + Phân tích)
                                                                │
                                                                ▼
                                                       [BigQuery / JSON DB]
```

---

## 3. Hướng Dẫn Chạy & Kiểm Thử Cục Bộ (Local Emulation)

Chế độ giả lập cục bộ giúp bạn lập trình và kiểm tra luồng dữ liệu ngay trên máy tính mà không cần tài khoản Google Cloud. Dữ liệu siêu dữ liệu sẽ được lưu trữ vào tệp JSON `src/local_bigquery.json`.

### Bước 3.1: Cài đặt thư viện
Di chuyển vào thư mục `src` và chạy lệnh cài đặt:
```bash
cd src
npm install
```

### Bước 3.2: Khởi chạy máy chủ ở chế độ local
Đặt biến môi trường `ENV_MODE=local` và khởi chạy máy chủ Express trên cổng 8080:
```powershell
# Trên PowerShell (Windows):
$env:ENV_MODE="local"; node index.js
```
*Bạn sẽ thấy thông báo: "Dịch vụ xử lý tài liệu đang chạy tại cổng 8080 (LOCAL)"*

### Bước 3.3: Xem giao diện Web Dashboard
Mở trình duyệt web và truy cập địa chỉ: [http://localhost:8080/](http://localhost:8080/)

### Bước 3.4: Chạy script kiểm thử gửi tệp mẫu
Mở một cửa sổ terminal mới trong thư mục `src` và chạy:
```bash
node test_local.js
```
Script sẽ tự động tạo thư mục `local_gcs_bucket/`, tạo 3 file văn bản mẫu tiếng Việt, gửi webhook giả lập đến server. Khi hoàn tất, bảng dữ liệu trên trình duyệt sẽ tự động cập nhật hiển thị kết quả.

---

## 4. Triển Khai Lên Render.com (Miễn Phí, Không Cần Thẻ)

Bạn có thể chạy container này trực tuyến trên Render.com hoàn toàn miễn phí:

1. Đẩy toàn bộ mã nguồn lên repository GitHub cá nhân của bạn.
2. Đăng ký tài khoản trên [Render](https://render.com/).
3. Tạo một **Web Service** mới, liên kết với repo GitHub vừa tạo.
4. Cấu hình các thông số:
   * **Language/Runtime**: Chọn **Docker** (Render sẽ tự động dùng `src/Dockerfile`).
   * **Root Directory**: Để trống (không điền).
   * **Advanced Settings**:
     * **Docker Build Context Directory**: `src/`
     * **Dockerfile Path**: `src/Dockerfile`
     * **Environment Variables**: Thêm biến `ENV_MODE` = `local`
5. Nhấn **Deploy Web Service** và đợi Render chạy xong (Live).
6. Mở trình duyệt truy cập đường dẫn Render cung cấp (ví dụ: `https://gcp-document-processor.onrender.com`) để xem trang Dashboard trực tuyến.
7. Bạn có thể mở file `src/test_render.js`, thay thế biến `RENDER_APP_URL` bằng link Render của bạn và chạy `node test_render.js` để kiểm thử từ xa.

---

## 5. Triển Khai Lên Google Cloud Platform (Hạ Tầng Thật)

Khi bạn có tài khoản Google Cloud đã kích hoạt thanh toán (Billing):

### Điều kiện cần:
1. Đã cài đặt `gcloud` CLI trên máy và chạy đăng nhập:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```
2. Đã thay đổi Project ID của bạn trong tệp `terraform/variables.tf` và `deploy.ps1` (Ví dụ: `dinh-serverless-doc-proc`).

### Quy trình deploy tự động:
Chạy kịch bản tự động hóa triển khai bằng PowerShell:
```powershell
./deploy.ps1
```
Script sẽ tự động thực hiện:
1. Chạy Terraform giai đoạn 1 để khởi tạo các tài nguyên cơ bản (GCS, Pub/Sub, BigQuery, Artifact Registry).
2. Xây dựng Docker Image trực tiếp trên đám mây bằng Cloud Build và đẩy vào Artifact Registry.
3. Chạy Terraform giai đoạn 2 để khởi tạo dịch vụ Cloud Run trỏ tới Docker Image thật và tạo Pub/Sub Push Subscription tự động gửi tin nhắn.
