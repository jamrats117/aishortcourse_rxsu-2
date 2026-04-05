/**
 * LINE + Gemini Vision Template (Reusable)
 * - Secrets stored in Script Properties
 * - Prompt profiles selectable by "mode:<name>"
 *
 * ① 🔐 ตั้งค่า Token/Key ที่ Script Properties (ไม่ฝังในโค้ด)
 * ② 🧠 เพิ่มงานใหม่ = เพิ่มโหมดใน PROMPT_PROFILES
 * ③ 🎯 เปลี่ยนโหมดเริ่มต้น = DEFAULT_MODE
 * ④ 💬 ผู้ใช้พิมพ์ mode:<name> เพื่อสลับงาน (ดู handleText_)
 * ⑤ 🖼️ การประมวลผลรูป = handleImage_ (เลือก prompt ตามโหมด)
 * ⑥ 🤖 ปรับพฤติกรรม Gemini = TEMPERATURE / MAX_OUTPUT_TOKENS / MODEL
 * ⑦ 📢 ปรับข้อความตอบกลับ = replyText_ และข้อความใน handleText_/handleImage_
 */

// ====== ② 🧠 PROMPT PROFILES (เพิ่มงานอื่นได้) ======
const PROMPT_PROFILES = {
  // ②.1 🧠 โหมดอ่าน PLT อย่างเดียว
  plt: [
    "ให้อ่านผลตรวจ CBC จากภาพนี้ และดึงเฉพาะค่า PLT (เกล็ดเลือด) เท่านั้น",
    "ตอบเป็นตัวเลขอย่างเดียว",
    "ห้ามมีหน่วย ห้ามมีคำอธิบาย ห้ามมีสัญลักษณ์",
    "ถ้าไม่พบให้ตอบ NA"
  ].join("\n"),

  // ②.2 🧠 โหมดสรุปเป็น bullet
  summary: [
    "ช่วยอ่านข้อความ/สรุปใจความจากภาพนี้ให้หน่อย",
    "ถ้าเป็นเอกสารให้ดึงข้อมูลสำคัญออกมาเป็น bullet",
    "ตอบภาษาไทย กระชับ"
  ].join("\n"),

  // ②.3 🧠 โหมด OCR ทั้งหน้า
  ocr_all: [
    "ทำ OCR จากภาพนี้และถอดข้อความทั้งหมดออกมา",
    "จัดรูปแบบให้อ่านง่าย แบ่งบรรทัดตามต้นฉบับ"
  ].join("\n"),

   smile: [
    "ดูภาพนี้แล้วบอกว่าคนในภาพยิ้มอยู่หรือไม่ ถ้ายิ้มก็ให้ตอบว่า ยิ้มครับ ถ้าไม่ได้ยิ้มก็ตอบว่า ไม่ได้ยิ้มครับ",
    "ถ้าคนในภาพปากเบี้ยว ก็ให้ตอบว่า ผู้ป่วยปากเบี้ยว ถ้าไม่ได้ปากเบี้ยวก็ตอบว่า อาการปกติครับ "
  ].join("\n")

  // ②.4 🧠 (ตัวอย่าง) เพิ่มโหมดใหม่ได้ที่นี่ เช่น hgb / inr / json ฯลฯ
};

// ====== ③ 🎯 DEFAULT SETTINGS ======
const DEFAULT_MODE = "smile";            // ③.1 🎯 โหมดเริ่มต้น (เปลี่ยนได้)
const GEMINI_MODEL_DEFAULT = "gemini-2.5-flash"; // ⑥.1 🤖 รุ่นโมเดลเริ่มต้น
const MAX_OUTPUT_TOKENS = 512;         // ⑥.2 🤖 อยากตอบยาวขึ้นค่อยเพิ่ม
const TEMPERATURE = 0.2;              // ⑥.3 🤖 อยากให้ “นิ่ง/แม่น” ลดลงเป็น 0.1

// ====== WEBHOOK ENTRY ======
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const events = body.events || [];

  for (const ev of events) {
    if (ev.type !== "message") continue;

    const replyToken = ev.replyToken;
    const msg = ev.message;

    try {
      if (msg.type === "image") {
        // ⑤ 🖼️ ส่งรูปเข้า pipeline อ่านภาพ
        handleImage_(replyToken, msg.id);
      } else if (msg.type === "text") {
        // ④ 💬 รับคำสั่ง/ข้อความจากผู้ใช้ (mode/help/ทั่วไป)
        handleText_(replyToken, msg.text || "");
      } else {
        // ⑦ 📢 ปรับข้อความตอบกลับได้
        replyText_(replyToken, "ตอนนี้รองรับข้อความและรูปภาพครับ");
      }
    } catch (err) {
      replyText_(replyToken, "เกิดข้อผิดพลาด: " + err);
    }
  }

  return ContentService.createTextOutput("OK");
}

// ====== ⑤ 🖼️ IMAGE HANDLER ======
function handleImage_(replyToken, messageId) {
  const props = getProps_();                 // ① 🔐 ดึง Token/Key จาก Script Properties
  const mode = getCurrentMode_();            // ④ 💬 ใช้โหมดล่าสุดที่ตั้งไว้
  const prompt = PROMPT_PROFILES[mode] || PROMPT_PROFILES[DEFAULT_MODE]; // ② 🧠 เลือก prompt

  const imgBlob = getLineContentBlob_(messageId, props.LINE_TOKEN); // ⑤.1 🖼️ โหลดรูปจาก LINE
  const resultText = callGeminiVision_(imgBlob, prompt, props.GEMINI_API_KEY, props.GEMINI_MODEL); // ⑤.2 🖼️ ส่งให้ Gemini

  // ⑦ 📢 ปรับข้อความ fallback ได้
  replyText_(replyToken, resultText || "อ่านภาพไม่สำเร็จ ลองส่งภาพชัดขึ้นอีกนิดครับ");
}

// ====== ④ 💬 TEXT HANDLER ======
function handleText_(replyToken, text) {
  const t = (text || "").trim();

  // ④.1 💬 คำสั่งเปลี่ยนโหมด: mode:plt / mode:summary / mode:ocr_all
  const m = t.match(/^mode\s*:\s*([a-zA-Z0-9_]+)\s*$/);
  if (m) {
    const mode = m[1];
    if (!PROMPT_PROFILES[mode]) {
      return replyText_(replyToken, `ไม่พบโหมด ${mode}\nโหมดที่มี: ${Object.keys(PROMPT_PROFILES).join(", ")}`);
    }
    setCurrentMode_(mode); // ④.2 💬 บันทึกโหมดล่าสุด
    return replyText_(replyToken, `ตั้งค่าโหมดเป็น ${mode} แล้วครับ`);
  }

  // ④.3 💬 คำสั่งช่วยเหลือ
  if (t === "help" || t === "?") {
    return replyText_(
      replyToken,
      [
        "คำสั่งที่ใช้ได้:",
        `- mode:<name> เช่น mode:plt, mode:summary, mode:ocr_all`,
        `โหมดที่มี: ${Object.keys(PROMPT_PROFILES).join(", ")}`
      ].join("\n")
    );
  }

  // ⑦ 📢 ข้อความทั่วไป (ปรับถ้อยคำได้)
  replyText_(
    replyToken,
    `ส่งรูปมาได้เลยครับ (โหมดปัจจุบัน: ${getCurrentMode_()})\nพิมพ์ help เพื่อดูคำสั่ง`
  );
}

// ====== ⑤.1 🖼️ LINE: DOWNLOAD CONTENT ======
function getLineContentBlob_(messageId, lineToken) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: `Bearer ${lineToken}` },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error(`LINE content fetch failed: ${res.getResponseCode()} ${res.getContentText()}`);
  }

  const blob = res.getBlob();
  return blob.setName("line_image").setContentType(blob.getContentType() || "image/jpeg");
}

// ====== ⑥ 🤖 GEMINI: VISION CALL ======
function callGeminiVision_(imageBlob, promptText, apiKey, modelName) {
  const model = modelName || GEMINI_MODEL_DEFAULT; // ⑥.1 🤖 เลือกโมเดล
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const base64 = Utilities.base64Encode(imageBlob.getBytes());
  const mimeType = imageBlob.getContentType() || "image/jpeg";

  const payload = {
    contents: [{
      role: "user",
      parts: [
        { text: promptText }, // ② 🧠 prompt จะมาจาก PROMPT_PROFILES
        { inline_data: { mime_type: mimeType, data: base64 } }
      ]
    }],
    generationConfig: {
      temperature: TEMPERATURE,      // ⑥.3 🤖 ปรับความนิ่ง/สร้างสรรค์
      maxOutputTokens: MAX_OUTPUT_TOKENS // ⑥.2 🤖 ปรับความยาวคำตอบ
    }
  };

  const res = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error(`Gemini failed: ${res.getResponseCode()} ${res.getContentText()}`);
  }

  const json = JSON.parse(res.getContentText());
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  return (text || "").trim();
}

// ====== ⑦ 📢 LINE: REPLY ======
function replyText_(replyToken, text) {
  const props = getProps_(); // ① 🔐 ใช้ LINE_TOKEN จาก Script Properties
  const url = "https://api.line.me/v2/bot/message/reply";
  const payload = {
    replyToken,
    messages: [{ type: "text", text: String(text).slice(0, 5000) }]
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${props.LINE_TOKEN}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ====== ① 🔐 PROPERTIES (SECRETS + MODE) ======
function getProps_() {
  const sp = PropertiesService.getScriptProperties();

  // ①.1 🔐 ตั้งค่าที่ Project Settings > Script Properties
  const LINE_TOKEN = sp.getProperty("LINE_TOKEN");
  const GEMINI_API_KEY = sp.getProperty("GEMINI_API_KEY");

  // ①.2 🔐 (ตัวเลือก) ตั้งค่าโมเดลผ่าน Script Properties ชื่อ GEMINI_MODEL
  const GEMINI_MODEL = sp.getProperty("GEMINI_MODEL") || GEMINI_MODEL_DEFAULT;

  if (!LINE_TOKEN) throw new Error("Missing Script Property: LINE_TOKEN");
  if (!GEMINI_API_KEY) throw new Error("Missing Script Property: GEMINI_API_KEY");

  return { LINE_TOKEN, GEMINI_API_KEY, GEMINI_MODEL };
}

function getCurrentMode_() {
  const sp = PropertiesService.getScriptProperties();
  return sp.getProperty("CURRENT_MODE") || DEFAULT_MODE; // ③ 🎯 ถ้าไม่เคยตั้ง จะใช้ DEFAULT_MODE
}

function setCurrentMode_(mode) {
  PropertiesService.getScriptProperties().setProperty("CURRENT_MODE", mode); // ④ 💬 บันทึกโหมด
}
