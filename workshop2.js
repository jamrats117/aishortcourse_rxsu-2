// ======================================================
// Cloudflare Worker Template
// ตัวอย่างนี้ทำ 3 อย่างหลัก
// 1) รับข้อมูลจาก Apps Script แล้ว sync ลง Workers KV
// 2) รับ webhook จาก LINE Messaging API
// 3) เปิด endpoint สำหรับ test/query ข้อมูลยา
//
// ------------------------------------------------------
// 🔴 ส่วนที่ "ห้ามแก้ / ห้ามลบ" สำหรับ LINE OA Bot
// (เป็นโครงสร้างพื้นฐานที่ทุกโปรเจกต์ต้องมี)
//
// 1) export default { fetch(...) }
//    → เป็น entry point ของ Cloudflare Worker
//    → ถ้าลบ = ระบบใช้ไม่ได้ทันที
//
// 2) route /webhook ใน fetch()
//    → เป็น endpoint ที่ LINE ใช้ยิงเข้ามา
//    → ถ้าเปลี่ยน path ต้องไปแก้ใน LINE Developer ด้วย
//
// 3) handleLineWebhook()
//    → เป็นตัวรับ event จาก LINE
//    → ต้องมี logic อ่าน events + replyToken เสมอ
//
// 4) replyText()
//    → ใช้ส่งข้อความกลับไปยัง LINE Messaging API
//    → ถ้าไม่มี = bot จะไม่ตอบผู้ใช้
//
// 5) env.LINE_ACCESS_TOKEN
//    → ต้องมีใน environment variable
//    → ใช้ authenticate กับ LINE API
//
// 6) ctx.waitUntil(...)
//    → ใช้กัน timeout (สำคัญมากใน production)
//
// ------------------------------------------------------
// 🟡 ส่วนที่ "แก้ได้ / เปลี่ยนตามโจทย์"
// - handleSyncKV() → schema data
// - searchDrugFromKV() → business logic
// - handleGetDrug() → optional (debug/test)
// - ข้อความตอบกลับ / format output
// ======================================================

export default {
  // fetch() คือ entry point หลักของ Cloudflare Worker
  // ทุก request ที่วิ่งเข้ามาจะเริ่มที่ function นี้ก่อนเสมอ
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --------------------------------------------------
    // Route 1: sync-kv
    // ใช้สำหรับรับข้อมูลจาก Google Apps Script หรือระบบ backend อื่น
    // แล้วบันทึกลง Cloudflare KV
    // --------------------------------------------------
    if (request.method === "POST" && url.pathname === "/sync-kv") {
      return handleSyncKV(request, env);
    }

    // --------------------------------------------------
    // Route 2: webhook
    // ใช้เป็น LINE webhook endpoint
    // LINE จะส่ง event ต่าง ๆ มาที่ path นี้
    // --------------------------------------------------
    if (request.method === "POST" && url.pathname === "/webhook") {
      try {
        const body = await request.json();

        // ctx.waitUntil()
        // ใช้สั่งให้ Worker ตอบกลับ LINE ทันที
        // แล้วค่อยไปทำงานเบื้องหลังต่อ เช่น ค้นข้อมูล / reply
        // ข้อดี: ลดโอกาส timeout จากฝั่ง LINE
        ctx.waitUntil(handleLineWebhook(body, env));

        return new Response("OK", { status: 200 });
      } catch (err) {
        console.log("webhook error:", err?.message);

        // สำคัญ: webhook บางระบบ เช่น LINE
        // ถ้าตอบ error บ่อย อาจมองว่า endpoint เรามีปัญหา
        // จึงนิยมตอบ 200 ไว้ก่อน แล้ว log error ฝั่งเราแทน
        return new Response("OK", { status: 200 });
      }
    }

    // --------------------------------------------------
    // Route 3: test query
    // เอาไว้ทดลองเรียกผ่าน browser หรือ Postman
    // เช่น /drug?name=yaz
    // --------------------------------------------------
    if (request.method === "GET" && url.pathname === "/drug") {
      return handleGetDrug(request, env);
    }

    // Default response
    return new Response("OK", { status: 200 });
  },
};

// ======================================================
// Function: handleSyncKV
// หน้าที่:
// - รับข้อมูล JSON จากภายนอก
// - ตรวจ token เพื่อกันคนนอกยิงเข้ามา
// - loop ข้อมูลทีละรายการ
// - แปลงเป็น key/value แล้วบันทึกลง KV
//
// Function นี้ "มักต้องมี" ถ้าระบบของเรามีการ sync data จากภายนอก
// แต่รายละเอียด field จะต้องเปลี่ยนตามงาน
// ======================================================
async function handleSyncKV(request, env) {
  try {
    // ตรวจ token จาก request header
    // ใช้เป็นชั้นความปลอดภัยเบื้องต้น
    const token = request.headers.get("x-sync-token");
    if (token !== env.SYNC_TOKEN) {
      return Response.json(
        { ok: false, message: "unauthorized" },
        { status: 401 }
      );
    }

    // รับ body ที่ส่งเข้ามา
    const body = await request.json();

    // คาดหวังรูปแบบประมาณ { items: [...] }
    const items = body.items || [];

    let saved = 0;

    // วนทีละรายการเพื่อบันทึกลง KV
    for (const item of items) {
      // ใช้ trade_name เป็น key หลัก
      // normalize เพื่อให้ค้นง่ายขึ้น เช่น Yaz = yaz
      const key = normalize(item.trade_name);
      if (!key) continue;

      // value ที่จะเก็บจริงใน KV
      // ตรงนี้คือส่วนที่ "ต้องเปลี่ยนตาม schema ของแต่ละงาน"
      const value = {
        trade_name: item.trade_name || "",
        tablets: item.tablets || "",
        group: item.group || "",
        compound: item.compound || "",
        how_to_take: item.how_to_take || "",
      };

      // บันทึกลง namespace ชื่อ DRUG_KV
      // key เป็น string
      // value ก็เก็บเป็น string จึงต้อง JSON.stringify()
      await env.DRUG_KV.put(key, JSON.stringify(value));
      saved++;
    }

    return Response.json({ ok: true, saved });
  } catch (err) {
    return Response.json(
      { ok: false, message: err?.message || "sync error" },
      { status: 500 }
    );
  }
}

// ======================================================
// Function: handleLineWebhook
// หน้าที่:
// - อ่าน events ที่ส่งมาจาก LINE
// - คัดเฉพาะ event ที่เราสนใจ
// - ดึงข้อความผู้ใช้
// - ส่งข้อความนั้นไปค้นข้อมูล
// - reply กลับไปยัง LINE
//
// Function นี้ "มักต้องมี" ถ้าทำ LINE bot
// แต่ logic การประมวลผลข้อความจะเปลี่ยนตาม use case
// ======================================================
async function handleLineWebhook(body, env) {
  try {
    const events = body.events || [];

    for (const event of events) {
      // event.mode บางครั้งอาจเป็น test / standby / active
      // ที่นี่เรารับเฉพาะ active
      if (event?.mode && event.mode !== "active") continue;

      // รับเฉพาะข้อความชนิด text
      if (event?.type !== "message" || event?.message?.type !== "text") continue;

      const userText = event?.message?.text || "";
      const replyToken = event?.replyToken;

      // ถ้าไม่มี replyToken จะตอบกลับไม่ได้
      if (!replyToken) continue;

      // ส่งข้อความผู้ใช้ไปค้นใน KV
      let answer = await searchDrugFromKV(userText, env);

      // ถ้าไม่พบข้อมูล ให้ตอบข้อความ default
      if (!answer) {
        answer =
          "ไม่พบข้อมูลยาคุมในระบบ กรุณาพิมพ์ชื่อการค้า เช่น Yaz, Yasmin, Mercilon";
      }

      // ส่งข้อความกลับไปที่ LINE
      await replyText(replyToken, answer, env);
    }
  } catch (err) {
    console.log("handleLineWebhook error:", err?.message);
  }
}

// ======================================================
// Function: searchDrugFromKV
// หน้าที่:
// - รับข้อความจากผู้ใช้
// - แปลงเป็น key มาตรฐาน
// - ไปค้นใน Workers KV
// - ถ้าพบก็ format ข้อความตอบกลับ
//
// Function นี้เป็น business logic หลักของงานค้นข้อมูล
// ส่วนนี้ "ต้องเปลี่ยนตาม use case"
// เช่น งานอื่นอาจค้นจากรหัสยา, ICD, herb code, etc.
// ======================================================
async function searchDrugFromKV(userText, env) {
  // normalize ก่อนค้น เพื่อให้ key มีรูปแบบเดียวกัน
  const key = normalize(userText);

  // อ่านข้อมูลจาก KV
  const raw = await env.DRUG_KV.get(key);

  if (!raw) return null;

  // แปลงกลับจาก JSON string เป็น object
  const data = JSON.parse(raw);

  // จัดรูปแบบข้อความตอบกลับ
  // ตรงนี้ควรเปลี่ยนได้ตามที่อยากสอน เช่น
  // - plain text
  // - flex message
  // - ข้อความแบบสั้น/ยาว
  return [
    `ชื่อการค้า: ${data.trade_name}`,
    `จำนวนเม็ด: ${data.tablets}`,
    `กลุ่มยา: ${data.group}`,
    `ตัวยาสำคัญ: ${data.compound}`,
    `วิธีใช้: ${data.how_to_take}`,
  ].join("\n");
}

// ======================================================
// Function: replyText
// หน้าที่:
// - เรียก LINE Messaging API
// - ส่งข้อความ text กลับไปยังผู้ใช้
//
// Function นี้ "มักต้องมี" ถ้าทำ LINE bot
// แต่ถ้าเปลี่ยนเป็น Flex Message หรือ Push Message
// ก็ต้องแก้เฉพาะส่วน body ที่ส่งไป
// ======================================================
async function replyText(replyToken, text, env) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.LINE_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "text",
          // กันข้อความยาวเกิน limit ของ LINE
          text: String(text || "").slice(0, 4900),
        },
      ],
    }),
  });

  // เก็บ response raw ไว้ดูเวลา debug
  const raw = await res.text();
  console.log("line status:", res.status);
  console.log("line raw:", raw);
}

// ======================================================
// Function: handleGetDrug
// หน้าที่:
// - ใช้สำหรับ test/query ผ่าน browser หรือ API client
// - รับ query string เช่น /drug?name=yaz
// - ค้นข้อมูลแล้วคืน JSON
//
// Function นี้ "ไม่จำเป็นต้องมีตลอด"
// แต่แนะนำให้มีในช่วงพัฒนา เพราะช่วย debug ง่ายมาก
// ======================================================
async function handleGetDrug(request, env) {
  const url = new URL(request.url);
  const key = normalize(url.searchParams.get("name") || "");

  if (!key) {
    return Response.json(
      { ok: false, message: "missing name" },
      { status: 400 }
    );
  }

  const raw = await env.DRUG_KV.get(key);

  if (!raw) {
    return Response.json({ ok: true, found: false });
  }

  return Response.json({
    ok: true,
    found: true,
    data: JSON.parse(raw),
  });
}

// ======================================================
// Function: normalize
// หน้าที่:
// - ทำข้อความให้เป็นรูปแบบมาตรฐานก่อนเก็บ/ก่อนค้น
// - ตัด space หน้า-หลัง
// - แปลงเป็น lowercase
//
// Function นี้ "ควรมีแทบทุกระบบค้นข้อมูล"
// เพราะช่วยลดปัญหา key ไม่ตรงกัน
// ======================================================
function normalize(text) {
  return String(text || "").trim().toLowerCase();
}
