const fs = require('fs');
const path = require('path');

const LOCAL_BUCKET_DIR = "local_gcs_bucket";
const API_URL = "http://localhost:8080/";
const DB_PATH = "local_bigquery.json";

// Định nghĩa các tệp mẫu và nội dung kiểm thử
const SAMPLE_FILES = {
  "don_xin_nghi_phep.txt": "Kính gửi phòng nhân sự, tôi muốn xin nghỉ phép từ ngày mai để giải quyết việc gia đình. Cảm ơn.",
  "hoa_don_thanh_toan.txt": "Hóa đơn thanh toán dịch vụ Hosting tháng 6. Chi tiết: Bill chi phí 50 USD và thuế GTGT.",
  "bao_cao_du_an.txt": "Tài liệu báo cáo tiến độ dự án Event-Driven Serverless trên Google Cloud. Hợp đồng triển khai đã hoàn tất."
};

/**
 * Tạo thư mục giả lập bucket và các tệp văn bản mẫu
 */
void function setupLocalFiles() {
  if (!fs.existsSync(LOCAL_BUCKET_DIR)) {
    fs.mkdirSync(LOCAL_BUCKET_DIR);
    console.log(`[*] Đã tạo thư mục giả lập GCS Bucket: '${LOCAL_BUCKET_DIR}'`);
  }
  
  for (const [filename, content] of Object.entries(SAMPLE_FILES)) {
    const filePath = path.join(LOCAL_BUCKET_DIR, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[*] Đã ghi tệp mẫu: ${filename} (${content.split(/\s+/).length} từ)`);
  }
}();

/**
 * Gửi một request HTTP POST giả lập thông điệp Pub/Sub Push
 */
async function sendMockPubSubEvent(filename) {
  console.log(`\n[+] Đang gửi sự kiện tải tệp: ${filename}...`);
  
  // Payload giả lập định dạng Pub/Sub Push Message từ GCS Notification
  const payload = {
    message: {
      attributes: {
        bucketId: "mock-document-bucket-2026",
        objectId: filename,
        eventType: "OBJECT_FINALIZE"
      },
      data: ""  // Không cần trường data do attributes đã đầy đủ thông tin
    }
  };
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      const resData = await response.json();
      console.log(`[-] Kết quả phản hồi từ Node.js:`, JSON.stringify(resData));
    } else {
      const errText = await response.text();
      console.error(`[!] Lỗi phản hồi từ server (${response.status}): ${errText}`);
    }
  } catch (error) {
    console.error(`[!] Lỗi kết nối tới Node.js:`, error.message);
    console.error(`[!] Vui lòng đảm bảo dịch vụ Node.js đã chạy trên cổng 8080.`);
  }
}

/**
 * Đọc file JSON lưu kết quả và in ra bảng
 */
function verifyDatabaseResults() {
  console.log("\n" + "=".repeat(80));
  console.log(" TRUY VẤN CƠ SỞ DỮ LIỆU JSON (GIẢ LẬP BIGQUERY) ");
  console.log("=".repeat(80));
  
  if (!fs.existsSync(DB_PATH)) {
    console.log(`[!] Không tìm thấy tệp cơ sở dữ liệu giả lập '${DB_PATH}'`);
    return;
  }
  
  try {
    const rawData = fs.readFileSync(DB_PATH, 'utf-8');
    const rows = JSON.parse(rawData);
    
    if (!rows || rows.length === 0) {
      console.log("[*] Cơ sở dữ liệu đang trống.");
      return;
    }
    
    // Chuẩn bị dữ liệu hiển thị đẹp mắt
    const displayRows = rows.map(row => ({
      'Tên tệp': row.filename,
      'Số từ': row.word_count,
      'Kích thước': `${row.file_size} B`,
      'Thẻ nhãn': row.tags.join(', '),
      'Thời gian xử lý': row.processing_time.split('.')[0].replace('T', ' ')
    }));
    
    // In bảng kết quả
    console.table(displayRows);
    
  } catch (error) {
    console.error(`[!] Lỗi đọc/phân tích dữ liệu:`, error.message);
  }
}

// Hàm chạy kiểm thử chính
async function runTest() {
  console.log("=== BẮT ĐẦU CHƯƠNG TRÌNH KIỂM THỬ GIẢ LẬP CỤC BỘ ===");
  
  console.log("\n[*] Đang gửi thử nghiệm các sự kiện tải tệp lên...");
  for (const filename of Object.keys(SAMPLE_FILES)) {
    await sendMockPubSubEvent(filename);
    // Chờ 300ms giữa các request
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // Chờ 500ms để server ghi xong file hoàn toàn trước khi đọc hiển thị
  await new Promise(resolve => setTimeout(resolve, 500));
  verifyDatabaseResults();
}

runTest();
