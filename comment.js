//ID: 1DSyxam1ceq72bMHsE6aOVeOl94X78WCwiYPytKi7chlg4x5GqiNXSw0l

var log = BetterLog.useSpreadsheet();
function testBetterLog() {
  var log = BetterLog.useSpreadsheet();
  log.log("🔵 นี่คือ log ปกติ (log)");
  log.info("🟢 นี่คือ log ระดับ info");
  
  // แทน .warn() → ใช้ .info()
  log.info("🟠 นี่คือ log ระดับ warn (จำลอง)");
  
  // แทน .error() → ใช้ .info()
  log.info("🔴 นี่คือ log ระดับ error (จำลอง)");
  
  var sampleData = {
    name: "Samart",
    project: "BetterLog Test",
    time: new Date()
  };
  log.log("📦 ตัวอย่าง object:", JSON.stringify(sampleData));
  Logger.log("✅ ทดสอบ BetterLog เสร็จแล้ว!");
}
