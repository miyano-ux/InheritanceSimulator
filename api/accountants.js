// api/accountants.js ── Vercel Serverless Function
// ---------------------------------------------------------------------------
// 役割: 税理士「掲載」機能のプロキシ。フロント(App.jsx)とGAS受け口の間に立つ。
//   - GET            : 掲載一覧を返す（GASのdoGet?action=list をサーバー側で取得）
//   - POST register  : 掲載情報の新規登録（GASのdoPostへ転送）
//   - POST inquiry   : EUからの相談申し込み（GASのdoPostへ転送）
// なぜプロキシを挟むか:
//   ・ブラウザから直接GASをGETすると、GASのリダイレクト由来でCORSに引っかかりやすい。
//     サーバー側で取得すればCORSの影響を受けない（api/comment.js と同じ役割分担）。
//   ・APIのURL（ACCOUNTANT_GAS_URL）をブラウザに出さずサーバー側だけで持てる。
// 堅牢化（重要）:
//   ・ハンドラ全体を try/catch で包み、いかなる場合も 500 で落とさず 200 + JSON を返す。
//     → フロントの赤いエラーではなく、必ず「サンプル＋原因メモ」で画面が成立する。
//   ・GASへの fetch はタイムアウト付き（ハングで関数が落ちるのを防ぐ）。
//   ・GAS取得に失敗したときは source:"seed_error" と note（原因の文字列）を返す。
//     → 担当者は画面のバナーで原因を確認できる（Vercelのログを見なくても分かる）。
// 環境変数: ACCOUNTANT_GAS_URL（VITE_ は付けない＝サーバー専用。設定後は要・再デプロイ）。
// ---------------------------------------------------------------------------

// 一覧が空にならないためのシード（本番の登録が入るまでの見せ札）。
// ※ 実在の事務所ではありません。木下様確定の掲載に差し替える前提のサンプルです。
const SEED = [
  {
    id: "seed-001", plan: "premium", officeName: "大井町相続税理士事務所",
    name: "田中 誠一", regNumber: "第123456号", area: "品川区・大田区",
    address: "品川区大井1-2-3", years: 18, cases: 400,
    specialties: ["realestate", "secondary", "funds"], firstConsultFree: true,
    feeGuide: "申告報酬 遺産総額の0.5%〜（目安）",
    message:
      "相続に不安のあるご家族に寄り添い、まず全体像を分かりやすくご説明します。ご質問しやすい雰囲気を大切にしています。",
    photoUrl: "", tel: "",
  },
  {
    id: "seed-002", plan: "basic", officeName: "しながわ相続支援室",
    name: "佐藤 洋子", regNumber: "第234567号", area: "品川区",
    address: "品川区西大井2-4-5", years: 12, cases: 220,
    specialties: ["secondary", "donation"], firstConsultFree: true,
    feeGuide: "初回相談 無料 ／ 申告報酬は内容に応じてお見積り",
    message:
      "二次相続まで見すえた分け方のご相談を得意としています。ご家族の状況を丁寧にうかがいます。",
    photoUrl: "", tel: "",
  },
  {
    id: "seed-003", plan: "basic", officeName: "大田・品川相続あんしん税理士法人",
    name: "鈴木 健太", regNumber: "第345678号", area: "大田区・品川区",
    address: "大田区蒲田3-6-7", years: 9, cases: 150,
    specialties: ["funds", "business", "trouble"], firstConsultFree: false,
    feeGuide: "初回相談 5,500円（60分）",
    message:
      "納税資金や遺産分割でお困りの方へ。事業をお持ちのご家庭の承継もご相談ください。",
    photoUrl: "", tel: "",
  },
];

// タイムアウト付き fetch（GASがハングしても関数を落とさない）
async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms || 8000);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// GASの応答から掲載配列を取り出す（形が多少ぶれても拾えるように）
function extractList(d) {
  if (!d) return [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.accountants)) return d.accountants;
  if (d.data && Array.isArray(d.data.accountants)) return d.data.accountants;
  return [];
}

export default async function handler(req, res) {
  // ---- どんな例外が起きても 500 を返さない（全体を包む）----
  try {
    const GAS = (process.env.ACCOUNTANT_GAS_URL || "").trim();

    // ===== 一覧取得 =====
    if (req.method === "GET") {
      if (!GAS) {
        return res.status(200).json({ accountants: SEED, source: "seed" });
      }
      try {
        const url = GAS + (GAS.includes("?") ? "&" : "?") + "action=list";
        const r = await fetchWithTimeout(url, { redirect: "follow" }, 8000);
        const text = await r.text();
        let d = null;
        try { d = JSON.parse(text); } catch (e) { d = null; }

        if (!r.ok || d === null) {
          // GASが200のJSONを返していない（デプロイ/権限/URL間違いなど）
          return res.status(200).json({
            accountants: SEED,
            source: "seed_error",
            note:
              "GAS status " + r.status +
              (d === null ? " / 応答がJSONではありません: " + text.slice(0, 120) : ""),
          });
        }

        const list = extractList(d);
        return res.status(200).json({
          accountants: list.length ? list : SEED,
          source: list.length ? "gas" : "seed",
        });
      } catch (e) {
        // fetch失敗・タイムアウト等。落とさずサンプル＋原因メモ。
        const msg = e && e.name === "AbortError"
          ? "GASへの接続がタイムアウトしました（URL/デプロイをご確認ください）"
          : String(e && e.message ? e.message : e);
        return res.status(200).json({ accountants: SEED, source: "seed_error", note: msg });
      }
    }

    // ===== 登録・問い合わせ =====
    if (req.method === "POST") {
      const body = req.body || {};
      if (!GAS) {
        return res.status(200).json({ ok: true, demo: true });
      }
      try {
        const r = await fetchWithTimeout(
          GAS,
          {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(body),
            redirect: "follow",
          },
          8000
        );
        const text = await r.text();
        let d = null;
        try { d = JSON.parse(text); } catch (e) { d = null; }
        if (d) return res.status(200).json(d);
        return res.status(200).json({ ok: r.ok, note: "GAS status " + r.status });
      } catch (e) {
        const msg = e && e.name === "AbortError" ? "GAS timeout" : String(e && e.message ? e.message : e);
        return res.status(200).json({ ok: false, error: msg });
      }
    }

    return res.status(405).json({ error: "method_not_allowed" });
  } catch (fatal) {
    // ここに来ても 200 を返し、フロントを赤エラーにしない
    return res.status(200).json({
      accountants: SEED,
      source: "seed_error",
      note: "server exception: " + String(fatal && fatal.message ? fatal.message : fatal),
    });
  }
}