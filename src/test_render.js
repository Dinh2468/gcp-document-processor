// Kịch bản kiểm thử hệ thống chạy trực tuyến trên Render.com
// Hướng dẫn: 
// 1. Triển khai ứng dụng lên Render.com.
// 2. Lấy URL của Web Service (ví dụ: https://dinh-document-processor.onrender.com).
// 3. Thay thế giá trị RENDER_APP_URL ở dưới bằng URL của bạn.
// 4. Chạy lệnh: node test_render.js

const RENDER_APP_URL = "https://gcp-document-processor.onrender.com"; // <-- THAY THẾ LINK RENDER CỦA BẠN TẠI ĐÂY

const API_URL = RENDER_APP_URL.endsWith('/') ? RENDER_APP_URL : RENDER_APP_URL + '/';
const METADATA_URL = API_URL + 'metadata';

// Danh sách các tệp mẫu giả định đã có trên hệ thống hoặc được mô phỏng
const SAMPLE_FILES = [
  "don_xin_nghi_phep.txt",
  "hoa_don_thanh_toan.txt",
  "bao_cao_du_an.txt"
];

/**
 * Gửi một request HTTP POST giả lập thông điệp Pub/Sub Push lên Render
 */
async function sendMockPubSubEvent(filename) {
  console.log(`[+] Đang gửi sự kiện giả lập tải tệp: ${filename} lên Render...`);
  
  const payload = {
    message: {
      attributes: {
        bucketId: "render-mock-bucket",
        objectId: filename,
        eventType: "OBJECT_FINALIZE"
      },
      data: ""
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
      console.log(`[-] Phản hồi thành công từ Render:`, JSON.stringify(resData));
    } else {
      const errText = await response.text();
      console.error(`[!] Lỗi phản hồi từ Render (${response.status}): ${errText}`);
    }
  } catch (error) {
    console.error(`[!] Lỗi kết nối tới Render:`, error.message);
  }
}

/**
 * Gọi API GET /metadata của Render để lấy bảng dữ liệu siêu dữ liệu đã lưu
 */
async function verifyRenderDatabase() {
  console.log("\n" + "=".repeat(80));
  console.log(" TRUY VẤN CƠ SỞ DỮ LIỆU CỦA SERVER RENDER ");
  console.log("=".repeat(80));
  
  try {
    const response = await fetch(METADATA_URL);
    if (!response.ok) {
      console.error(`[!] Không thể lấy dữ liệu từ Render (${response.status})`);
      return;
    }
    
    const rows = await response.json();
    if (!rows || rows.length === 0) {
      console.log("[*] Cơ sở dữ liệu trên Render đang trống.");
      return;
    }
    
    // Chuẩn bị dữ liệu hiển thị dạng bảng
    const displayRows = rows.map(row => ({
      'Tên tệp': row.filename,
      'Số từ': row.word_count,
      'Kích thước': `${row.file_size} B`,
      'Thẻ nhãn': row.tags.join(', '),
      'Thời gian xử lý': row.processing_time.split('.')[0].replace('T', ' ')
    }));
    
    console.table(displayRows);
    
  } catch (error) {
    console.error(`[!] Lỗi đọc dữ liệu từ Render:`, error.message);
  }
}

// Hàm chạy kiểm thử chính
async function runTest() {
  if (RENDER_APP_URL.includes("your-service-name")) {
    console.error("[!] VUI LÒNG CẤU HÌNH RENDER_APP_URL CHÍNH XÁC TRƯỚC KHI CHẠY.");
    console.log("Xem hướng dẫn deploy lên Render ở khung chat.");
    process.exit(1);
  }
  
  console.log("=== BẮT ĐẦU CHƯƠNG TRÌNH KIỂM THỬ TRỰC TUYẾN RENDER ===");
  
  console.log("\n[*] Gửi các sự kiện mô phỏng tải tệp...");
  for (const filename of SAMPLE_FILES) {
    await sendMockPubSubEvent(filename);
    // Chờ 500ms giữa các request để server xử lý tuần tự
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Chờ 1 giây để đảm bảo Render ghi file hoàn tất trước khi đọc dữ liệu
  await new Promise(resolve => setTimeout(resolve, 1000));
  await verifyRenderDatabase();
}

runTest();
