// api/comment.js  ── Vercel Serverless Function
// ---------------------------------------------------------------------------
// 役割: フロント(結果画面)から「機械計算済みの診断値」だけを受け取り、
//       ③レベル(該当可能性→専門家へ)の評価コメントを1本だけ生成して返す。
// 原則: ・APIキーはこの関数(サーバー側)だけが持つ。ブラウザには出さない。
//       ・氏名/メール等の個人情報は受け取らない・送らない。
//       ・AIに税額計算はさせない(数値は既に確定済み)。文章化のみ。
//       ・④(断定・個別助言)はプロンプト＋後処理フィルタの二重で弾く。
// 置き場所: リポジトリ直下に api/comment.js として置くだけ(Vercelが自動でFunction化)。
// ---------------------------------------------------------------------------

// 現行の無料枠対象モデル。AI Studioで対象が変わったらここだけ差し替える。
const MODEL = "gemini-3.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) {
    // キー未設定なら固定文でフォールバック(画面は壊さない)
    return res.status(200).json({ comment: fallbackText() });
  }

  // フロントから来る値(すべて非個人情報)
  const {
    taxable,
    taxManyen,
    basicDeductionManyen,
    hasSpouse,
    numChildren,
    realEstate, // 'low' | 'mid' | 'high'
    issueKeys,  // 例: ['cash','estate','spouse','realty']
  } = req.body || {};

  // --- モデルへ渡す入力を最小化(短い構造化テキスト = 低トークン)---
  const raEstate = { low: "少なめ", mid: "半分程度", high: "多め" }[realEstate] || "不明";
  const facts = [
    `課税: ${taxable ? "あり" : "なし(基礎控除内)"}`,
    taxable ? `概算税額: 約${taxManyen}万円` : `基礎控除: ${basicDeductionManyen}万円`,
    `配偶者: ${hasSpouse ? "あり" : "なし"}`,
    `子: ${numChildren}人`,
    `不動産割合: ${raEstate}`,
    `該当課題: ${(issueKeys || []).join(",") || "なし"}`,
  ].join(" / ");

  const system =
    "あなたは日本の相続に関する一般情報を提供するアシスタントで、税理士ではありません。" +
    "次を厳守: " +
    "(1)特定の税額の断定や『あなたは〜すべき』等の個別具体的な助言は禁止。" +
    "(2)一般的な制度説明と『該当する可能性がある→詳細は税理士へ確認』の型のみ使う。" +
    "(3)出力は日本語150〜200字程度の1段落。見出し・箇条書き・数式・絵文字は使わない。" +
    "(4)不安を煽らず、落ち着いた丁寧な語り口にする。数値の再計算はしない。";

  const userText =
    "以下は公開ルールで機械計算済みの概算診断結果です。これに対するやわらかい総評を" +
    "1段落で書いてください。あなたは計算しません。\n条件: " + facts;

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        // Gemini 3.x系は「思考トークン」も maxOutputTokens を消費するため、
        // 本文が途中で切れないよう十分な枠(1024)を確保する。
        generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
      }),
    });
    const data = await r.json();
    const cand = data?.candidates?.[0];
    let text = cand?.content?.parts?.map((p) => p.text || "").join("") || "";
    text = text.trim();
    const finish = cand?.finishReason;

    // 出力が空 / 途中で切れた(MAX_TOKENS) / ④に触れた → 固定文へ差し替え
    if (!text || finish === "MAX_TOKENS" || isDisallowed(text)) text = fallbackText();

    return res.status(200).json({ comment: text });
  } catch (e) {
    return res.status(200).json({ comment: fallbackText() });
  }
}

// ④に踏み込む典型表現の簡易検出(本命の担保はプロンプト＋監修者レビュー)
function isDisallowed(t) {
  const banned = [
    "すべきです", "したほうがよい", "しましょう",
    "必ず", "確実に", "節税できます", "対策としては",
    "あなたの税額は", "あなたは",
  ];
  return banned.some((w) => t.includes(w));
}

function fallbackText() {
  return (
    "この結果は公開されている算式にもとづく概算の目安です。財産の評価方法や適用できる特例に" +
    "よって、実際の税額は変わる可能性があります。気になる点は税理士にご確認いただくのが安心です。"
  );
}