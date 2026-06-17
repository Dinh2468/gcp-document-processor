const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Phục vụ giao diện Dashboard tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Nhận diện chế độ chạy: "cloud" (Google Cloud thật) hoặc "local" (Giả lập cục bộ)
const ENV_MODE = (process.env.ENV_MODE || 'cloud').toLowerCase();
const PORT = process.env.PORT || 8080;

let storage, bigquery;

if (ENV_MODE !== 'local') {
  const { Storage } = require('@google-cloud/storage');
  const { BigQuery } = require('@google-cloud/bigquery');
  
  console.log("Chế độ: Google Cloud thật. Đang khởi tạo GCP SDK...");
  storage = new Storage();
  bigquery = new BigQuery();
} else {
  console.log("Chế độ: GIẢ LẬP CỤC BỘ (LOCAL EMULATION). Sẽ sử dụng local JSON và thư mục cục bộ.");
}

// Cấu hình Dataset và Table BigQuery
const BQ_DATASET_ID = process.env.BQ_DATASET_ID || 'document_processing';
const BQ_TABLE_ID = process.env.BQ_TABLE_ID || 'document_metadata';

// Từ điển ánh xạ từ khóa tiếng Anh/tiếng Việt sang nhãn (tags)
const KEYWORD_TAGS = {
  "hóa đơn": "invoice",
  "invoice": "invoice",
  "bill": "invoice",
  "thanh toán": "payment",
  "payment": "payment",
  "báo cáo": "report",
  "report": "report",
  "hợp đồng": "contract",
  "contract": "contract",
  "cv": "cv",
  "resume": "cv",
  "xin việc": "cv",
  "nghỉ phép": "leave_request",
  "xin phép": "leave_request",
  "đơn": "document",
  "tài liệu": "document",
  "dự án": "project",
  "project": "project",
  "việt nam": "vietnam",
  "vietnam": "vietnam"
};

/**
 * Phân tích nội dung văn bản: đếm từ và trích xuất nhãn theo từ khóa
 */
function extractTagsAndCountWords(content) {
  const words = content.trim().split(/\s+/).filter(w => w.length > 0);
  const word_count = words.length;
  
  const content_lower = content.toLowerCase();
  const tags = new Set();
  
  for (const [keyword, tag] of Object.entries(KEYWORD_TAGS)) {
    if (content_lower.includes(keyword)) {
      tags.add(tag);
    }
  }
  
  // Gán nhãn mặc định nếu không khớp từ khóa nào
  if (tags.size === 0) {
    tags.add("general");
  }
  
  return {
    word_count,
    tags: Array.from(tags)
  };
}

// Endpoint chính xử lý Pub/Sub push notification
app.post('/', async (req, res) => {
  try {
    const envelope = req.body;
    if (!envelope || !envelope.message) {
      const msg = "LỖI: Sai định dạng tin nhắn Pub/Sub Envelope";
      console.error(msg);
      return res.status(400).send(msg);
    }

    const pubsubMessage = envelope.message;
    const attributes = pubsubMessage.attributes || {};
    
    let bucketName = attributes.bucketId;
    let objectName = attributes.objectId;
    const eventType = attributes.eventType;

    // Nếu các thuộc tính trong attributes rỗng, thử giải mã trường 'data'
    if (!bucketName || !objectName) {
      if (pubsubMessage.data) {
        try {
          const dataStr = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
          const dataJson = JSON.parse(dataStr);
          bucketName = dataJson.bucket;
          objectName = dataJson.name;
        } catch (e) {
          console.error("Lỗi giải mã trường data của Pub/Sub:", e);
        }
      }
    }

    if (!bucketName || !objectName) {
      console.warn("Bỏ qua thông điệp vì thiếu thông tin bucketId hoặc objectId.");
      return res.status(200).json({ status: "skipped", reason: "Thieu thong tin bucket hoac file" });
    }

    // Chỉ xử lý sự kiện tải mới/cập nhật tệp tin (OBJECT_FINALIZE)
    if (eventType && eventType !== "OBJECT_FINALIZE") {
      console.log(`Bỏ qua sự kiện không liên quan: ${eventType}`);
      return res.status(200).json({ status: "skipped", reason: `Bo qua event type ${eventType}` });
    }

    console.log(`Bắt đầu xử lý tệp: ${objectName} từ bucket: ${bucketName}`);

    let file_size = 0;
    let created_time = new Date();
    let content = "";

    // =====================================================================
    // Giai đoạn A: Đọc nội dung tệp (Thật hoặc Giả lập)
    // =====================================================================
    if (ENV_MODE === 'local') {
      // Chế độ Giả lập cục bộ: Đọc từ thư mục local_gcs_bucket
      const localDir = "local_gcs_bucket";
      const filePath = path.join(localDir, objectName);

      if (!fs.existsSync(filePath)) {
        const errMsg = `LỖI: Không tìm thấy tệp ${objectName} trong thư mục giả lập ${localDir}`;
        console.error(errMsg);
        return res.status(404).send(errMsg);
      }

      const stats = fs.statSync(filePath);
      file_size = stats.size;
      created_time = stats.birthtime; // Ngày tạo tệp trên máy local

      if (objectName.toLowerCase().endsWith('.txt')) {
        try {
          content = fs.readFileSync(filePath, 'utf-8');
          console.log(`[Local] Đọc tệp .txt cục bộ thành công (${content.length} ký tự).`);
        } catch (e) {
          console.error(`[Local] Lỗi đọc tệp .txt: ${e}. Sử dụng nội dung giả lập.`);
          content = `Simulated content for local file ${objectName} with size ${file_size} bytes.`;
        }
      } else {
        content = `Giả lập kết quả OCR cho tệp tin cục bộ ${objectName}. Từ khóa giả lập: hóa đơn, báo cáo, nghỉ phép.`;
        console.log("[Local] Giả lập OCR cho tệp không phải .txt.");
      }
    } else {
      // Chế độ Cloud thật: Đọc từ Google Cloud Storage
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(objectName);
      
      const [metadata] = await file.getMetadata();
      file_size = parseInt(metadata.size);
      created_time = new Date(metadata.timeCreated);

      if (objectName.toLowerCase().endsWith('.txt')) {
        try {
          const [fileContent] = await file.download();
          content = fileContent.toString('utf-8');
          console.log(`[Cloud] Tải và đọc tệp .txt thành công (${content.length} ký tự).`);
        } catch (e) {
          console.error(`[Cloud] Lỗi đọc văn bản từ GCS: ${e}`);
          content = `Simulated content for GCS file ${objectName} with size ${file_size} bytes.`;
        }
      } else {
        content = `Giả lập kết quả OCR cho tệp tin ${objectName}. Từ khóa giả lập: hóa đơn, báo cáo, nghỉ phép, việt nam.`;
        console.log("[Cloud] Giả lập OCR cho tệp không phải .txt.");
      }
    }

    // =====================================================================
    // Giai đoạn B: Phân tích số từ và nhãn
    // =====================================================================
    const { word_count, tags } = extractTagsAndCountWords(content);
    console.log(`Kết quả phân tích: word_count=${word_count}, tags=${tags.join(', ')}`);

    // =====================================================================
    // Giai đoạn C: Lưu siêu dữ liệu (SQLite hoặc File JSON cục bộ)
    // =====================================================================
    const rowToInsert = {
      filename: objectName,
      date: created_time.toISOString(),
      tags: tags,
      word_count: word_count,
      bucket_name: bucketName,
      file_size: file_size,
      processing_time: new Date().toISOString()
    };

    if (ENV_MODE === 'local') {
      // Chế độ Giả lập cục bộ: Ghi vào tệp JSON cục bộ làm cơ sở dữ liệu
      const dbPath = "local_bigquery.json";
      let dbData = [];
      
      if (fs.existsSync(dbPath)) {
        try {
          const rawData = fs.readFileSync(dbPath, 'utf-8');
          dbData = JSON.parse(rawData);
        } catch (e) {
          console.error("Lỗi đọc tệp database JSON giả lập:", e);
        }
      }

      dbData.push(rowToInsert);
      fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf-8');
      console.log("[Local] Ghi siêu dữ liệu vào local_bigquery.json thành công.");
    } else {
      // Chế độ Cloud thật: Ghi vào BigQuery
      await bigquery
        .dataset(BQ_DATASET_ID)
        .table(BQ_TABLE_ID)
        .insert([rowToInsert]);
      console.log("[Cloud] Ghi siêu dữ liệu vào BigQuery thành công.");
    }

    res.status(200).json({
      status: "success",
      filename: objectName,
      tags: tags,
      word_count: word_count,
      mode: ENV_MODE
    });

  } catch (error) {
    console.error("Lỗi hệ thống khi xử lý tài liệu:", error);
    res.status(500).send(error.toString());
  }
});

// Endpoint GET /metadata để xem dữ liệu đã xử lý từ xa
app.get('/metadata', (req, res) => {
  try {
    if (ENV_MODE === 'local') {
      const dbPath = "local_bigquery.json";
      if (fs.existsSync(dbPath)) {
        const rawData = fs.readFileSync(dbPath, 'utf-8');
        return res.status(200).json(JSON.parse(rawData));
      }
      return res.status(200).json([]);
    } else {
      res.status(501).send("Tính năng truy vấn trực tiếp BigQuery từ API chưa được kích hoạt.");
    }
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

app.listen(PORT, () => {
  console.log(`Dịch vụ xử lý tài liệu đang chạy tại cổng ${PORT} (${ENV_MODE.toUpperCase()})`);
});
