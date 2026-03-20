//function.gs
function randomTwoDigits() {
  // สุ่มตัวเลข 0–99
  var number = Math.floor(Math.random() * 100);

  // ถ้าตัวเลข < 10 ให้เติม 0 ข้างหน้า (เช่น 07)
  var result = number < 10 ? "0" + number : number.toString();

  // แสดงผล
  Logger.log("เลขท้ายสองตัว: " + result);

  // คืนค่า
  return result;
}

//variable.gs
function test(){
  var x = 3;
  return x;
}

var x = test();
var y = x + 5;

Logger.log("ค่า x ในฟังก์ชัน: " + x);
Logger.log("ผลลัพธ์ y = " + y);

//condition.gs
function checkScore() {
  var score = 85;

  if (score >= 80) {
    Logger.log("เกรด A");
  } else if (score >= 70) {
    Logger.log("เกรด B");
  } else {
    Logger.log("เกรด C หรือต่ำกว่า");
  }
}

//for loop.gs
function demoForLoop() {
  for (var i = 0; i < 5; i++) {
    Logger.log("รอบที่: " + i);
  }
}

//while loop.gs
function demoWhileLoop() {
  var i = 0;
  while (i < 5) {
    Logger.log("รอบที่: " + i);
    i++;
  }
}

//do while.gs
function demoDoWhileLoop() {
  var i = 0;
  do {
    Logger.log("รอบที่: " + i);
    i++;
  } while (i < 5);
}

//for in.gs
function demoForIn() {
  var person = {
    name: "Samart",
    age: 30,
    job: "Pharmacist"
  };

  for (var key in person) {
    Logger.log(key + ": " + person[key]);
  }
}

// for of.gs
function demoForOf() {
  var fruits = ["apple", "banana", "orange"];

  for (var fruit of fruits) {
    Logger.log(fruit);
  }
}

//string.gs
function demoStringManipulation() {
  // ✅ ต่อข้อความ (Concatenation)
  var name = "Samart";
  var greeting = "Hello, " + name;
  Logger.log("ต่อข้อความ: " + greeting);

  // ✅ ความยาวข้อความ (length)
  var message = "Hello";
  Logger.log("ความยาวข้อความ: " + message.length);

  // ✅ แปลงเป็นตัวพิมพ์ใหญ่ (toUpperCase)
  Logger.log("ตัวพิมพ์ใหญ่: " + message.toUpperCase());

  // ✅ แปลงเป็นตัวพิมพ์เล็ก (toLowerCase)
  Logger.log("ตัวพิมพ์เล็ก: " + message.toLowerCase());

  // ✅ ลบช่องว่างหัว-ท้าย (trim)
  var messy = "  Hi!  ";
  Logger.log("หลัง trim: '" + messy.trim() + "'");

  // ✅ ตัดข้อความบางส่วน (substring)
  var str = "Hello world";
  Logger.log("substring (0-5): " + str.substring(0, 5));

  // ✅ แทนที่ข้อความ (replace)
  var replaced = "Hello Samart";
  Logger.log("แทนที่ข้อความ: " + replaced.replace("Samart", "Everyone"));
}

//get sheet.gs
function readSheetById() {
  var sheetId = "SHEET_ID"; // ใส่ id ของ Google Sheet
  var sheetName = "SHEET_NAME"; // ใส่ชื่อชีทที่ต้องการ

  // เปิดสเปรดชีตตาม id
  var spreadsheet = SpreadsheetApp.openById(sheetId);

  // เข้าถึง sheet ตามชื่อ
  var sheet = spreadsheet.getSheetByName(sheetName);

  // ดึงข้อมูลทั้งหมด
  var data = sheet.getDataRange().getValues();

  // แสดงข้อมูลใน Logger
  Logger.log(data);
}

//dopost1.gs
function doPost(e) {
  // ✅ 1️⃣ รับข้อมูล JSON ที่ส่งมา
  var requestJSON = e.postData.contents;

  // ✅ 2️⃣ แปลง JSON → JavaScript Object
  var requestObj = JSON.parse(requestJSON).events[0];

  // ✅ 3️⃣ ดึงข้อความที่ผู้ใช้ส่งมา
  var userMessage = requestObj.message.text;

  // ✅ 4️⃣ ดึง reply token (สำหรับตอบกลับ LINE)
  var token = requestObj.replyToken;

  // ✅ 5️⃣ แสดงค่าต่างๆ ใน Logger (debug)
  Logger.log("ข้อความผู้ใช้: " + userMessage);
  Logger.log("replyToken: " + token);

  return ContentService.createTextOutput("OK");
}

//
