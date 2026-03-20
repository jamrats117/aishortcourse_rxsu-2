function syncDataSheetToCloudflareKV() {
  // ✅ อ่านค่าจาก Script Properties
  const props = PropertiesService.getScriptProperties();

  const SHEET_NAME = props.getProperty("SHEET_NAME");
  const WORKER_SYNC_URL = props.getProperty("WORKER_SYNC_URL");
  const SYNC_TOKEN = props.getProperty("SYNC_TOKEN");

  if (!SHEET_NAME || !WORKER_SYNC_URL || !SYNC_TOKEN) {
    throw new Error("❌ Script Properties ยังไม่ครบ");
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("❌ ไม่พบชีตชื่อ: " + SHEET_NAME);
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    Logger.log("⚠️ ไม่มีข้อมูลให้ sync");
    return;
  }

  const headers = values[0];
  const rows = values.slice(1);

  // ✅ หา index ของคอลัมน์
  const idxTradeName = headers.indexOf("trade name");
  const idxTablets = headers.indexOf("tablets");
  const idxGroup = headers.indexOf("group");
  const idxCompound = headers.indexOf("compound");
  const idxHowToTake = headers.indexOf("How to take medicine");

  if (
    idxTradeName === -1 ||
    idxTablets === -1 ||
    idxGroup === -1 ||
    idxCompound === -1 ||
    idxHowToTake === -1
  ) {
    throw new Error("❌ Header ในชีตไม่ตรง");
  }

  // ✅ แปลงเป็น items สำหรับส่งไป KV
  const items = rows
    .filter(row => row[idxTradeName])
    .map(row => ({
      trade_name: String(row[idxTradeName]).trim(),
      tablets: String(row[idxTablets] || "").trim(),
      group: String(row[idxGroup] || "").trim(),
      compound: String(row[idxCompound] || "").trim(),
      how_to_take: String(row[idxHowToTake] || "").trim(),
    }));

  Logger.log("📦 จำนวนข้อมูลที่จะ sync: " + items.length);

  // ✅ ยิงไป Cloudflare Worker
  const res = UrlFetchApp.fetch(WORKER_SYNC_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-sync-token": SYNC_TOKEN,
    },
    payload: JSON.stringify({ items }),
    muteHttpExceptions: true,
  });

  const status = res.getResponseCode();
  const body = res.getContentText();

  Logger.log("📡 status: " + status);
  Logger.log("📨 response: " + body);

  if (status !== 200) {
    throw new Error("❌ sync ไม่สำเร็จ");
  }
}
