// ======================================================
// Cloudflare Worker: Sync Data + Dialogflow Webhook
// ใช้ไฟล์เดียวเพื่อให้ง่ายต่อการสอน
//
// หน้าที่หลักมี 2 อย่าง
// 1) รับข้อมูลจาก Apps Script แล้ว sync ลง Workers KV
// 2) รับ webhook จาก Dialogflow แล้วค้นข้อมูลจาก KV ส่งกลับไป
//
// ------------------------------------------------------
// สิ่งที่ต้องมีใน Cloudflare
// 1) KV Binding ชื่อ DRUG_KV2
// 2) Secret/Variable ชื่อ SYNC_TOKEN
//
// ------------------------------------------------------
// Route ที่ใช้
// POST /sync-kv              -> สำหรับ sync data เข้า KV
// POST /dialogflow-webhook   -> สำหรับรับ request จาก Dialogflow
// GET  /drug?name=yaz        -> สำหรับ debug/query ทดสอบ
// ======================================================

export default {
  // --------------------------------------------------
  // fetch() คือ entry point หลักของ Worker
  // ทุก request จะเข้ามาที่นี่ก่อน
  // --------------------------------------------------
  async fetch(request, env) {
    const url = new URL(request.url);

    // --------------------------------------------------
    // Route 1: sync-kv
    // ใช้รับข้อมูลจาก Apps Script หรือ backend อื่น
    // แล้วบันทึกลง KV
    // --------------------------------------------------
    if (request.method === "POST" && url.pathname === "/sync-kv") {
      return handleSyncKV(request, env);
    }

    // --------------------------------------------------
    // Route 2: dialogflow-webhook
    // ใช้เป็น webhook endpoint สำหรับ Dialogflow
    // เมื่อ Dialogflow เรียกมา จะให้ route นี้ประมวลผล
    // --------------------------------------------------
    if (request.method === "POST" && url.pathname === "/dialogflow-webhook") {
      return handleDialogflowWebhook(request, env);
    }

    // --------------------------------------------------
    // Route 3: drug
    // ใช้สำหรับ debug/query ผ่าน browser หรือ Postman
    // เช่น /drug?name=yaz
    // --------------------------------------------------
    if (request.method === "GET" && url.pathname === "/drug") {
      return handleGetDrug(request, env);
    }

    // Default response
    return new Response("WORKER READY", { status: 200 });
  },
};

// ======================================================
// SECTION A: Sync Data
// ======================================================
// หน้าที่:
// - รับ JSON จาก Apps Script
// - ตรวจ token
// - loop ข้อมูลทีละรายการ
// - บันทึกลง KV
//
// ตัวอย่าง body:
// {
//   "items": [
//     {
//       "trade_name": "Yaz",
//       "tablets": "28",
//       "group": "ฮอร์โมนรวม",
//       "compound": "Drospirenone + Ethinyl estradiol",
//       "how_to_take": "วันละ 1 เม็ด"
//     }
//   ]
// }
// ======================================================
async function handleSyncKV(request, env) {
  try {
    // ตรวจ token จาก header เพื่อกันคนนอกยิงเข้ามา
    const token = request.headers.get("x-sync-token");
    if (token !== env.SYNC_TOKEN) {
      return Response.json(
        { ok: false, message: "unauthorized" },
        { status: 401 }
      );
    }

    // อ่าน JSON body
    const body = await request.json();
    const items = body.items || [];

    let saved = 0;

    // วนข้อมูลทีละรายการ
    for (const item of items) {
      // ใช้ trade_name เป็น key หลัก
      const key = normalize(item.trade_name);
      if (!key) continue;

      // value ที่จะเก็บลง KV
      const value = {
        trade_name: item.trade_name || "",
        tablets: item.tablets || "",
        group: item.group || "",
        compound: item.compound || "",
        how_to_take: item.how_to_take || "",
      };

      // บันทึกลง KV
      await env.DRUG_KV2.put(key, JSON.stringify(value));
      saved++;
    }

    return Response.json({
      ok: true,
      saved,
      message: "sync completed",
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        message: err?.message || "sync error",
      },
      { status: 500 }
    );
  }
}

// ======================================================
// SECTION B: Dialogflow Webhook
// ======================================================
// หน้าที่:
// - รับ request จาก Dialogflow
// - ดึงชื่อยาจาก parameters หรือ outputContexts
// - ค้นข้อมูลจาก KV
// - ส่ง fulfillmentText กลับไปให้ Dialogflow
//
// Dialogflow จะนำ fulfillmentText ไปแสดงต่อใน LINE OA
// ======================================================
async function handleDialogflowWebhook(request, env) {
  try {
    const body = await request.json();

    // ดึงชื่อยาออกจาก Dialogflow request
    const drugName = getDrugFromDialogflow(body);

    // ถ้าไม่พบชื่อยา ให้ตอบกลับไป
    if (!drugName) {
      return Response.json({
        fulfillmentText: "ไม่พบชื่อยาจาก Dialogflow context",
      });
    }

    // ค้นข้อมูลจาก KV
    const answer = await searchDrugFromKV(drugName, env);

    // ถ้าไม่พบข้อมูลใน KV
    if (!answer) {
      return Response.json({
        fulfillmentText: `ไม่พบข้อมูลของ ${drugName} ในระบบ`,
      });
    }

    // ส่งข้อความกลับไปยัง Dialogflow
    return Response.json({
      fulfillmentText: answer,
    });
  } catch (err) {
    return Response.json({
      fulfillmentText: "เกิดข้อผิดพลาดในการเชื่อมต่อระบบ",
    });
  }
}

// ======================================================
// SECTION C: ดึงชื่อยาจาก Dialogflow request
// ======================================================
// Logic:
// 1) ลองอ่านจาก queryResult.parameters.drug ก่อน
// 2) ถ้าไม่มี ค่อยไปอ่านจาก outputContexts[].parameters.drug
//
// รองรับเคส follow-up intent เช่น
// ผู้ใช้ตอบ "ใช่"
// แต่ชื่อยาจริงอยู่ใน context ก่อนหน้า
// ======================================================
function getDrugFromDialogflow(body) {
  // กรณี parameter มาโดยตรง
  const directDrug = body?.queryResult?.parameters?.drug;
  if (directDrug) return directDrug;

  // กรณีชื่อยาอยู่ใน outputContexts
  const contexts = body?.queryResult?.outputContexts || [];

  for (const ctx of contexts) {
    const drug = ctx?.parameters?.drug;
    if (drug) return drug;
  }

  return null;
}

// ======================================================
// SECTION D: ค้นข้อมูลจาก Workers KV
// ======================================================
// หน้าที่:
// - รับชื่อยาที่จะค้น
// - normalize ให้เป็น key มาตรฐาน
// - อ่านข้อมูลจาก KV
// - format เป็นข้อความตอบกลับ
// ======================================================
async function searchDrugFromKV(drugName, env) {
  const key = normalize(drugName);
  if (!key) return null;

  const raw = await env.DRUG_KV2.get(key);
  if (!raw) return null;

  const data = JSON.parse(raw);

  return [
    `ชื่อการค้า: ${data.trade_name}`,
    `จำนวนเม็ด: ${data.tablets}`,
    `กลุ่มยา: ${data.group}`,
    `ตัวยาสำคัญ: ${data.compound}`,
    `วิธีใช้: ${data.how_to_take}`,
  ].join("\n");
}

// ======================================================
// SECTION E: Debug Route
// ======================================================
// ใช้สำหรับทดลอง query ผ่าน browser/Postman
// เช่น
// /drug?name=yaz
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

  const raw = await env.DRUG_KV2.get(key);

  if (!raw) {
    return Response.json({
      ok: true,
      found: false,
    });
  }

  return Response.json({
    ok: true,
    found: true,
    data: JSON.parse(raw),
  });
}

// ======================================================
// SECTION F: Utility
// ======================================================
// normalize()
// ใช้ทำข้อความให้เป็นรูปแบบมาตรฐานก่อนเก็บ/ก่อนค้น
// เช่น Yaz -> yaz
// ======================================================
function normalize(text) {
  return String(text || "").trim().toLowerCase();
}
