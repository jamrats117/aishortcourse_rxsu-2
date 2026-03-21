/**
 * @file Code.gs
 * @description LINE OA + Gemini (แก้ 404 model not found)
 */

const props = PropertiesService.getScriptProperties();
const LINE_ACCESS_TOKEN = props.getProperty('CHANNEL_ACCESS_TOKEN');
const GEMINI_API_KEY = props.getProperty('GEMINI_API_KEY');

// ใช้โมเดลที่ยังรองรับอยู่
const GEMINI_MODEL = 'gemini-2.5-flash';

// ถ้ามี BetterLog ใน Comment.gs ให้ใช้ได้เลย
// var log = BetterLog.useSpreadsheet();

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      if (typeof log !== 'undefined') log.info("❌ doPost: ไม่พบ postData");
      return ContentService.createTextOutput("No postData");
    }

    const jsonData = JSON.parse(e.postData.contents);
    const event = jsonData.events && jsonData.events[0];

    if (!event) {
      if (typeof log !== 'undefined') log.info("⚠️ ไม่พบ event ใน webhook");
      return ContentService.createTextOutput("No event");
    }

    const replyToken = event.replyToken;
    const userId = event.source && event.source.userId ? event.source.userId : "unknown";

    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;

      if (typeof log !== 'undefined') {
        log.info(`📩 จาก: ${userId} | ข้อความ: ${userMessage}`);
      }

      const geminiResponse = callGemini(userMessage);
      replyToLine(replyToken, geminiResponse);
    }

    return ContentService.createTextOutput("OK");

  } catch (err) {
    if (typeof log !== 'undefined') {
      log.info("🔴 Critical Error: " + err.toString());
    }
    return ContentService.createTextOutput("Error");
  }
}

/**
 * ฟังก์ชันเรียกใช้ Gemini API
 */
function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    const resJson = JSON.parse(responseText);

    if (typeof log !== 'undefined') {
      log.info(`🤖 Gemini HTTP ${responseCode}`);
      log.info(`🤖 Gemini raw response: ${responseText}`);
    }

    if (resJson.error) {
      if (typeof log !== 'undefined') {
        log.info(`❌ API Error (${responseCode}): ${resJson.error.message}`);
      }
      return `ขออภัยครับ ระบบ AI มีปัญหา: ${resJson.error.message}`;
    }

    if (
      !resJson.candidates ||
      resJson.candidates.length === 0
    ) {
      return "ขออภัยครับ Gemini ไม่สามารถสร้างคำตอบได้ในขณะนี้";
    }

    const parts = resJson.candidates[0].content &&
                  resJson.candidates[0].content.parts
                  ? resJson.candidates[0].content.parts
                  : [];

    const text = parts
      .filter(part => part.text)
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!text) {
      return "ขออภัยครับ ไม่พบข้อความตอบกลับจาก Gemini";
    }

    return text;

  } catch (e) {
    if (typeof log !== 'undefined') {
      log.info("❌ Connection Error: " + e.toString());
    }
    return "ไม่สามารถติดต่อระบบประมวลผลได้";
  }
}

/**
 * ฟังก์ชันส่งข้อความตอบกลับ LINE
 */
function replyToLine(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';

  const payload = {
    replyToken: replyToken,
    messages: [
      {
        type: "text",
        text: text && text.length <= 5000
          ? text
          : String(text || "ขออภัยครับ ไม่สามารถแสดงผลได้").substring(0, 4990)
      }
    ]
  };

  const options = {
    method: "post",
    headers: {
      Authorization: "Bearer " + LINE_ACCESS_TOKEN
    },
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (typeof log !== 'undefined') {
      log.info(`✅ Reply Sent Success (${responseCode})`);
      log.info(`📤 LINE response: ${responseText}`);
    }
  } catch (e) {
    if (typeof log !== 'undefined') {
      log.info("❌ LINE Error: " + e.toString());
    }
  }
}
