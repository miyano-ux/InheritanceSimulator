import React, { useState, useEffect } from "react";

/* =========================================================================
   相続税かんたん診断 — モック
   - 位置づけ: リード獲得装置。③レベル統制（該当可能性→専門家へ）。
   - 今回の追加: 税理士「掲載」機能（登録ページ＋紹介＝掲載一覧ページ）。
     * 法的実体は「広告掲載枠」。紹介手数料・成功報酬は取らない（登録料＋月額）。
       → 自動マッチングはしない。EUが自分で選ぶ「自己選択」を貫く。
     * 登録・一覧・問い合わせは /api/accountants（Vercel関数）経由でGASと接続。
       ブラウザから直接GASを読まない（CORS/リダイレクト回避。comment.jsと同思想）。
   - ルーティング: URLハッシュのみ（依存を足さずフラット構成を維持）。
       (無し)=シミュレーター / #tax-list=掲載一覧(EU向け) / #tax-register=登録(税理士向け)
   ========================================================================= */

// ---- 表示上の運営設定（本番は管理画面で編集する想定。モックは固定）----
const CONFIG = {
  areaLabel: "品川区大井",
  supervisor: "大本税理士法人 監修",
  brand: "グレィスホーム",
  privacyUrl: "#", // 本番はプライバシーポリシーのURLに差し替え
  source: "sim-oimachi", // 地区LPごとに変えると流入元が記録される
};

// ---- リード保存（メール登録）用GAS。既存のまま。 ----
const ENV_GAS_URL =
  (import.meta && import.meta.env && import.meta.env.VITE_GAS_URL) || "";
const IS_DEMO = !ENV_GAS_URL || ENV_GAS_URL.includes("XXXXX");
const GAS_URL = IS_DEMO ? "" : ENV_GAS_URL;

const isValidEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

// ---- フロント→リード保存GAS 送信（本番でそのまま動く）----
async function postLead(payload) {
  await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
}

/* =========================================================================
   税理士掲載: 語彙と掲載プラン（マネタイズの見せどころ）
   - 得意分野は「固定語彙」。登録の選択肢・一覧のタグ・EUのフィルタで共有する
     （自由記述だと診断からのフィルタや集計が効かないため）。
   - プランは「初期登録料＋月額」を製品の中で可視化するための表示。価格は仮値。
   ========================================================================= */
const SPECIALTIES = [
  { key: "realestate", label: "不動産の相続" },
  { key: "secondary", label: "二次相続対策" },
  { key: "funds", label: "納税資金・遺産分割" },
  { key: "business", label: "事業承継" },
  { key: "donation", label: "生前贈与" },
  { key: "trouble", label: "相続トラブル・調停" },
];
const specLabel = (key) =>
  (SPECIALTIES.find((s) => s.key === key) || {}).label || key;

const PLANS = [
  {
    key: "basic",
    label: "基本掲載",
    price: "初期 33,000円 ＋ 月額 5,500円",
    perks: ["一覧に掲載", "得意分野タグ", "ひとことメッセージ"],
  },
  {
    key: "premium",
    label: "上位掲載",
    price: "初期 55,000円 ＋ 月額 16,500円",
    perks: ["一覧の上位に表示", "「PR」枠で強調", "写真・実績を大きく掲載"],
    recommended: true,
  },
];
const planLabel = (key) => (PLANS.find((p) => p.key === key) || {}).label || "";

// ---- 税理士掲載API（GET一覧 / POST登録・問い合わせ）----
// いずれも /api/accountants（Vercel関数）を叩く。関数側でGASへプロキシする。
// ※ ローカル `npm run dev` では /api が無いため一覧は取得できない（デプロイ環境で動く）。

// クライアント側の最終フォールバック（万一 /api に届かなくても一覧を空にしない）。
// api/accountants.js の SEED と同じ内容。実在の事務所ではないサンプル。
const CLIENT_SEED = [
  {
    id: "cseed-001", plan: "premium", officeName: "大井町相続税理士事務所",
    name: "田中 誠一", regNumber: "第123456号", area: "品川区・大田区",
    address: "品川区大井1-2-3", years: 18, cases: 400,
    specialties: ["realestate", "secondary", "funds"], firstConsultFree: true,
    feeGuide: "申告報酬 遺産総額の0.5%〜（目安）",
    message: "相続に不安のあるご家族に寄り添い、まず全体像を分かりやすくご説明します。",
    photoUrl: "", tel: "",
  },
  {
    id: "cseed-002", plan: "basic", officeName: "しながわ相続支援室",
    name: "佐藤 洋子", regNumber: "第234567号", area: "品川区",
    address: "品川区西大井2-4-5", years: 12, cases: 220,
    specialties: ["secondary", "donation"], firstConsultFree: true,
    feeGuide: "初回相談 無料 ／ 申告報酬は内容に応じてお見積り",
    message: "二次相続まで見すえた分け方のご相談を得意としています。",
    photoUrl: "", tel: "",
  },
  {
    id: "cseed-003", plan: "basic", officeName: "大田・品川相続あんしん税理士法人",
    name: "鈴木 健太", regNumber: "第345678号", area: "大田区・品川区",
    address: "大田区蒲田3-6-7", years: 9, cases: 150,
    specialties: ["funds", "business", "trouble"], firstConsultFree: false,
    feeGuide: "初回相談 5,500円（60分）",
    message: "納税資金や遺産分割でお困りの方へ。事業承継もご相談ください。",
    photoUrl: "", tel: "",
  },
];

// 一覧取得。例外を投げず、必ず {ok, accountants, source, status, raw} を返す。
// ok=false のときも呼び出し側で診断できるよう status/raw を添える。
async function apiListAccountants() {
  try {
    const r = await fetch("/api/accountants", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await r.text();
    let d = null;
    try { d = JSON.parse(text); } catch (e) { /* JSONでない */ }
    if (r.ok && d && Array.isArray(d.accountants)) {
      return { ok: true, accountants: d.accountants, source: d.source || "", note: d.note || "", status: r.status };
    }
    // サーバーには届いたが、200でない or JSONでない（関数未配置/リライト/GAS認証HTML等）
    return { ok: false, accountants: [], source: "", status: r.status, raw: (text || "").slice(0, 160) };
  } catch (e) {
    // /api にそもそも到達できない（ネットワーク or ローカルdev）
    return { ok: false, accountants: [], source: "", status: 0, raw: String(e) };
  }
}

async function apiRegisterAccountant(payload) {
  try {
    const r = await fetch("/api/accountants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register", ...payload }),
    });
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { return { ok: false, status: r.status }; }
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function apiSendInquiry(payload) {
  try {
    const r = await fetch("/api/accountants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "inquiry", ...payload }),
    });
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) { return { ok: true }; }
  } catch (e) {
    return { ok: true }; // 申し込みは画面を止めない（スタブ成功）
  }
}

// HTTPステータスから担当者向けの原因ヒントを返す
function listErrorHint(status) {
  if (status === 0)
    return "/api に到達できません。デプロイ済みURLで見ているか（localhostでは /api は動きません）、ネットワークをご確認ください。";
  if (status === 404)
    return "/api/accountants が見つかりません（404）。api/accountants.js がデプロイに含まれているか、環境変数追加後に再デプロイしたかをご確認ください。";
  if (status === 401 || status === 403)
    return "アクセスが拒否されました。GASのデプロイ設定「アクセスできるユーザー=全員」をご確認ください。";
  if (status >= 500)
    return "サーバー側でエラーが発生しています（" + status + "）。ACCOUNTANT_GAS_URL が正しい /exec URL か、GASのデプロイをご確認ください。";
  return "応答がJSONではありませんでした（status " + status + "）。ACCOUNTANT_GAS_URL の値とGASのデプロイをご確認ください。";
}

// ---- 相続税の速算表（実装確定時に最新税制を再確認する前提）----
const TAX_TABLE = [
  [10000000, 0.1, 0],
  [30000000, 0.15, 500000],
  [50000000, 0.2, 2000000],
  [100000000, 0.3, 7000000],
  [200000000, 0.4, 17000000],
  [300000000, 0.45, 27000000],
  [600000000, 0.5, 42000000],
  [Infinity, 0.55, 72000000],
];

function taxByRate(amount) {
  if (amount <= 0) return 0;
  for (const [cap, rate, deduct] of TAX_TABLE) {
    if (amount <= cap) return amount * rate - deduct;
  }
  return 0;
}

// ---- 明示ルールによる相続税総額の概算（法定相続分で按分→速算表→合算）----
function calcTax({ hasSpouse, numChildren, netAssets }) {
  const heirCount = (hasSpouse ? 1 : 0) + numChildren;
  const basicDeduction = 30000000 + 6000000 * heirCount;
  const taxableEstate = Math.max(0, netAssets - basicDeduction);

  const shares = [];
  if (hasSpouse && numChildren > 0) {
    shares.push(taxableEstate * 0.5);
    for (let i = 0; i < numChildren; i++)
      shares.push((taxableEstate * 0.5) / numChildren);
  } else if (hasSpouse && numChildren === 0) {
    shares.push(taxableEstate);
  } else {
    for (let i = 0; i < numChildren; i++) shares.push(taxableEstate / numChildren);
  }

  const totalTax = shares.reduce((s, a) => s + taxByRate(a), 0);
  return { heirCount, basicDeduction, taxableEstate, totalTax };
}

const toManyen = (yen) => Math.round(yen / 10000);
const fmt = (n) => n.toLocaleString("ja-JP");

function buildCommentPayload(result, form) {
  return {
    taxable: result.taxable,
    taxManyen: toManyen(result.totalTax),
    basicDeductionManyen: toManyen(result.basicDeduction),
    hasSpouse: form.hasSpouse,
    numChildren: form.numChildren,
    realEstate: form.realEstate,
    issueKeys: (result.issues || []).map((i) => i.key),
  };
}

// ==== 課題カード生成（すべて③構文）====
function buildIssues({ result, hasSpouse, realEstateRatio, taxable }) {
  const issues = [];

  if (taxable) {
    issues.push({
      key: "cash",
      tag: "納税資金",
      title: "相続税は現金一括での納付が原則です",
      body:
        "相続税は申告期限までに現金で納めるのが原則とされています。財産に占める現金の割合によっては、納税資金の準備が論点になるケースがあります。準備の方法は状況で変わるため、税理士にご確認ください。",
      cta: "納税資金にくわしい税理士を見る",
    });
  }

  if (realEstateRatio >= 60) {
    issues.push({
      key: "estate",
      tag: "分割・特例",
      title: "不動産の割合が高いケースです",
      body:
        "財産に不動産が多いと、複数の相続人での分割が難しくなることがあります。また小規模宅地等の特例に該当する可能性があり、適用の可否で税額が大きく変わるため、税理士にご確認ください。不動産の見立ては事前に不動産会社へのご相談をおすすめします。",
      cta: `${CONFIG.areaLabel}の専門家を見る`,
    });
  }

  if (hasSpouse) {
    issues.push({
      key: "spouse",
      tag: "配偶者",
      title: "配偶者の税額軽減という制度があります",
      body:
        "配偶者が財産を取得する場合、一定額まで相続税がかからない「配偶者の税額軽減」という制度があります。二次相続まで含めた分け方で結果が変わることがあるため、具体的な適用は税理士にご確認ください。",
      cta: "相続にくわしい税理士を見る",
    });
  }

  issues.push({
    key: "realty",
    tag: "不動産",
    title: "不動産のことは、事前のご相談を",
    body:
      "土地・建物の評価は、路線価と実際の相場が離れることも多く、入力だけでは正確に出せません。ご売却・住み替え・空き家の管理などは、事前に不動産会社へご相談ください。",
    cta: `${CONFIG.brand}に相談する`,
  });

  return issues.slice(0, 3);
}

// ---- ハッシュルーティング（依存なし）----
function readRoute() {
  const h = (window.location.hash || "").replace(/^#/, "");
  if (h === "tax-list") return "tax-list";
  if (h === "tax-register") return "tax-register";
  return "sim";
}
function navigate(route) {
  window.location.hash = route === "sim" ? "" : route;
  try {
    window.scrollTo(0, 0);
  } catch (e) {}
}

// =========================== アプリ本体 ===========================
export default function App() {
  const [route, setRoute] = useState(readRoute());

  // シミュレーターの状態はここで保持（掲載ページへ往復しても診断結果が消えないように）
  const [phase, setPhase] = useState("intro"); // intro | form | diagnosing | result
  const [form, setForm] = useState({
    hasSpouse: null,
    numChildren: null,
    assetsManyen: "",
    realEstate: null,
  });
  const [result, setResult] = useState(null);
  const [aiComment, setAiComment] = useState("");

  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const canSubmit =
    form.hasSpouse !== null &&
    form.numChildren !== null &&
    form.assetsManyen !== "" &&
    Number(form.assetsManyen) > 0 &&
    form.realEstate !== null &&
    !(form.hasSpouse === false && form.numChildren === 0);

  const runDiagnosis = () => {
    const netAssets = Number(form.assetsManyen) * 10000;
    const r = calcTax({
      hasSpouse: form.hasSpouse,
      numChildren: form.numChildren,
      netAssets,
    });
    const ratioMap = { low: 30, mid: 55, high: 80 };
    const realEstateRatio = ratioMap[form.realEstate];
    const taxable = r.totalTax > 0;
    const issues = buildIssues({
      result: r,
      hasSpouse: form.hasSpouse,
      realEstateRatio,
      taxable,
    });
    setResult({ ...r, netAssets, taxable, issues, realEstateRatio });
    setAiComment("");
    setPhase("diagnosing");
  };

  const reset = () => {
    setForm({ hasSpouse: null, numChildren: null, assetsManyen: "", realEstate: null });
    setResult(null);
    setAiComment("");
    setPhase("intro");
  };

  return (
    <div className="app">
      <StyleTag />
      <div className="frame">
        <Header route={route} />

        {route === "sim" && (
          <>
            {phase === "intro" && <Intro onStart={() => setPhase("form")} />}
            {phase === "form" && (
              <FormView
                form={form}
                setForm={setForm}
                canSubmit={canSubmit}
                onSubmit={runDiagnosis}
              />
            )}
            {phase === "diagnosing" && result && (
              <Diagnosing
                payload={buildCommentPayload(result, form)}
                onDone={(comment) => {
                  setAiComment(comment);
                  setPhase("result");
                }}
              />
            )}
            {phase === "result" && result && (
              <ResultView
                result={result}
                form={form}
                aiComment={aiComment}
                onReset={reset}
                onFindTax={() => navigate("tax-list")}
              />
            )}
          </>
        )}

        {route === "tax-list" && (
          <AccountantListPage form={form} result={result} onBack={() => navigate("sim")} />
        )}
        {route === "tax-register" && (
          <AccountantRegisterPage onBack={() => navigate("sim")} />
        )}

        <Footer />
      </div>
    </div>
  );
}

function Header({ route }) {
  return (
    <header className="hdr">
      <div className="hdr-brand">
        <span className="mark" aria-hidden="true" />
        <span className="hdr-name">{CONFIG.brand}</span>
      </div>
      <div className="hdr-area">
        {route === "tax-list"
          ? `${CONFIG.areaLabel}の掲載税理士`
          : route === "tax-register"
          ? "税理士の先生へ（掲載のご案内）"
          : `${CONFIG.areaLabel}の相続相談`}
      </div>
    </header>
  );
}

function Intro({ onStart }) {
  return (
    <section className="intro">
      <div className="eyebrow">AI相続診断 ・ 無料 ・ 3分</div>
      <h1 className="h1">
        ご両親の相続、
        <br />
        <em>いくらかかるか</em>の見当を。
      </h1>
      <p className="lead">
        いくつかの質問にお答えいただくと、明示のルールにもとづいて相続税のおおよその
        試算と、いま考えておきたい課題を診断します。むずかしい書類は要りません。
      </p>
      <button className="btn btn-primary" onClick={onStart}>
        診断をはじめる
      </button>
      <ul className="intro-notes">
        <li>入力は4つの質問だけ</li>
        <li>あくまで概算の目安です</li>
        <li>{CONFIG.supervisor}</li>
      </ul>
    </section>
  );
}

// ---- 入力（A案 4項目・1画面）----
function FormView({ form, setForm, canSubmit, onSubmit }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const noHeir = form.hasSpouse === false && form.numChildren === 0;

  return (
    <section className="form">
      <ol className="q-list">
        <Question n="1" label="配偶者（夫・妻）はいらっしゃいますか？">
          <Choice active={form.hasSpouse === true} onClick={() => set({ hasSpouse: true })}>
            いる
          </Choice>
          <Choice active={form.hasSpouse === false} onClick={() => set({ hasSpouse: false })}>
            いない
          </Choice>
        </Question>

        <Question n="2" label="お子さまは何人ですか？">
          {[0, 1, 2, 3, 4].map((n) => (
            <Choice key={n} active={form.numChildren === n} onClick={() => set({ numChildren: n })}>
              {n === 4 ? "4人以上" : `${n}人`}
            </Choice>
          ))}
        </Question>

        <Question n="3" label="財産はおおよそいくらですか？（借入などを引いた概算）">
          <div className="amount-row">
            <input
              className="amount-input"
              inputMode="numeric"
              placeholder="例：8000"
              value={form.assetsManyen}
              onChange={(e) => set({ assetsManyen: e.target.value.replace(/[^0-9]/g, "") })}
              aria-label="財産の概算（万円）"
            />
            <span className="amount-unit">万円</span>
          </div>
          <div className="amount-hints">
            {[3000, 5000, 8000, 12000].map((v) => (
              <button
                key={v}
                type="button"
                className="chip"
                onClick={() => set({ assetsManyen: String(v) })}
              >
                {fmt(v)}万
              </button>
            ))}
          </div>
        </Question>

        <Question n="4" label="そのうち、不動産（土地・建物）はどのくらいですか？">
          <Choice active={form.realEstate === "low"} onClick={() => set({ realEstate: "low" })}>
            少なめ
          </Choice>
          <Choice active={form.realEstate === "mid"} onClick={() => set({ realEstate: "mid" })}>
            半分くらい
          </Choice>
          <Choice active={form.realEstate === "high"} onClick={() => set({ realEstate: "high" })}>
            多め
          </Choice>
        </Question>
      </ol>

      {noHeir && (
        <p className="warn-inline">
          この簡易診断は、配偶者かお子さまがいる場合を対象にしています。
          あてはまらない場合は、直接ご相談ください。
        </p>
      )}

      <button className="btn btn-primary btn-block" disabled={!canSubmit} onClick={onSubmit}>
        AIで診断する
      </button>
      <p className="micro">
        入力内容は概算の試算に使うものです。正確な金額は税理士にご確認ください。
      </p>
    </section>
  );
}

function Question({ n, label, children }) {
  return (
    <li className="q">
      <div className="q-head">
        <span className="q-n">{n}</span>
        <span className="q-label">{label}</span>
      </div>
      <div className="q-choices">{children}</div>
    </li>
  );
}

function Choice({ active, onClick, children }) {
  return (
    <button type="button" className={"choice" + (active ? " is-active" : "")} onClick={onClick}>
      {children}
    </button>
  );
}

// ---- AI診断の見せ方 ----
function Diagnosing({ payload, onDone }) {
  const steps = [
    "入力内容を確認しています",
    "明示ルールで概算を計算しています",
    "AIが総評コメントを作成しています",
  ];
  const [i, setI] = useState(0);

  useEffect(() => {
    let done = false;
    const finish = (comment) => {
      if (!done) {
        done = true;
        onDone(comment);
      }
    };

    const started = Date.now();
    const MIN_MS = 2200;
    const MAX_MS = 12000;

    const maxTimer = setTimeout(() => finish(""), MAX_MS);
    const stepTimer = setInterval(
      () => setI((v) => Math.min(v + 1, steps.length - 1)),
      750
    );

    fetch("/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((d) => d.comment || "")
      .catch(() => "")
      .then((comment) => {
        const wait = Math.max(0, MIN_MS - (Date.now() - started));
        setTimeout(() => {
          clearTimeout(maxTimer);
          finish(comment);
        }, wait);
      });

    return () => {
      clearInterval(stepTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  return (
    <section className="diag">
      <div className="diag-orb" aria-hidden="true">
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="ring r3" />
        <span className="core" />
      </div>
      <div className="diag-label">AIが診断中</div>
      <ul className="diag-steps">
        {steps.map((s, idx) => (
          <li key={idx} className={idx <= i ? "done" : ""}>
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- 結果 ----
function ResultView({ result, form, aiComment, onReset, onFindTax }) {
  const { totalTax, basicDeduction, heirCount, taxable, issues, netAssets } = result;
  const [showRule, setShowRule] = useState(false);

  const [lead, setLead] = useState({ name: "", email: "", optIn: false });
  const [status, setStatus] = useState("idle");
  const [errMsg, setErrMsg] = useState("");
  const [sentPayload, setSentPayload] = useState(null);

  const buildPayload = () => ({
    name: lead.name.trim(),
    email: lead.email.trim(),
    marketingOptIn: lead.optIn,
    hasSpouse: form.hasSpouse,
    numChildren: form.numChildren,
    assetsManyen: Number(form.assetsManyen),
    realEstate: form.realEstate,
    taxManyen: toManyen(totalTax),
    basicDeductionManyen: toManyen(basicDeduction),
    taxable,
    source: CONFIG.source,
  });

  const submitLead = async () => {
    setErrMsg("");
    if (!isValidEmail(lead.email)) {
      setStatus("error");
      setErrMsg("メールアドレスをご確認ください。");
      return;
    }
    const payload = buildPayload();
    setStatus("sending");
    setSentPayload(payload);
    if (IS_DEMO) {
      setTimeout(() => setStatus("done"), 900);
      return;
    }
    try {
      await postLead(payload);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setErrMsg("送信に失敗しました。時間をおいて再度お試しください。");
    }
  };

  return (
    <section className="result">
      <div className="result-badge">AI診断の結果</div>

      {taxable ? (
        <>
          <p className="result-kicker">明示ルールによる概算の試算額</p>
          <div className="amount-hero">
            <span className="yen">約</span>
            <span className="big">{fmt(toManyen(totalTax))}</span>
            <span className="unit">万円</span>
          </div>
          <p className="disclaimer-strong">
            これは入力内容と下記のルールにもとづく<em>概算の目安</em>です。
            実際の税額は財産の評価や特例の適用で変わります。
            正確な金額は税理士にご確認ください。
          </p>
        </>
      ) : (
        <>
          <p className="result-kicker">明示ルールによる概算の試算</p>
          <div className="amount-hero zero">
            <span className="big">かからない見込み</span>
          </div>
          <p className="disclaimer-strong">
            入力内容では、基礎控除（{fmt(toManyen(basicDeduction))}万円）の範囲に収まり、
            相続税は<em>かからない見込み</em>です。ただし財産の評価しだいで変わることが
            あるため、心配な場合は税理士にご確認ください。
          </p>
        </>
      )}

      {aiComment && (
        <div className="ai-comment">
          <div className="ai-comment-tag">AIによる総評</div>
          <p className="ai-comment-body">{aiComment}</p>
        </div>
      )}

      <button className="rule-toggle" onClick={() => setShowRule((v) => !v)}>
        {showRule ? "− 計算のルールを閉じる" : "＋ どのルールで計算しているか見る"}
      </button>
      {showRule && (
        <div className="rule-box">
          <p>この診断は、公開されている次の算式で機械的に計算しています。</p>
          <ul>
            <li>基礎控除 ＝ 3,000万円 ＋ 600万円 × 法定相続人の数</li>
            <li>
              法定相続人 {heirCount}人 → 基礎控除 {fmt(toManyen(basicDeduction))}万円
            </li>
            <li>課税対象を法定相続分で分け、相続税の速算表で計算して合計</li>
          </ul>
          <p className="rule-note">
            配偶者の税額軽減や各種特例、不動産の詳しい評価は反映していません。
            これらは税額を大きく動かすため、専門家の確認が必要です。
          </p>
        </div>
      )}

      <h2 className="issues-title">いま、考えておきたいこと</h2>
      <div className="issues">
        {issues.map((it) => (
          <article key={it.key} className="issue">
            <div className="issue-tag">{it.tag}</div>
            <h3 className="issue-h">{it.title}</h3>
            <p className="issue-b">{it.body}</p>
            <button
              className="btn btn-ghost"
              onClick={it.key === "realty" ? undefined : onFindTax}
            >
              {it.cta} →
            </button>
          </article>
        ))}
      </div>

      {/* 税理士掲載一覧への誘導（「税理士はこちら →」）*/}
      <div className="findtax">
        <div className="findtax-tag">相続にくわしい税理士をお探しですか？</div>
        <p className="findtax-b">
          {CONFIG.areaLabel}を中心に、相続を得意とする税理士が掲載されています。
          得意分野や初回相談の費用を見くらべて、ご自身で選べます。
        </p>
        <button className="btn btn-brass btn-block" onClick={onFindTax}>
          税理士を探す（掲載一覧）はこちら →
        </button>
      </div>

      {/* メール登録 */}
      {status !== "done" ? (
        <div className="upsell">
          <h3 className="upsell-h">診断結果をメールで受け取る</h3>
          <p className="upsell-b">
            入力いただいたメールアドレスに、この診断結果をお送りします。
          </p>

          <div className="lead-form">
            <input
              className="lead-input"
              type="text"
              placeholder="お名前（任意）"
              value={lead.name}
              onChange={(e) => setLead((l) => ({ ...l, name: e.target.value }))}
              aria-label="お名前"
            />
            <input
              className="lead-input"
              type="email"
              inputMode="email"
              placeholder="メールアドレス"
              value={lead.email}
              onChange={(e) => setLead((l) => ({ ...l, email: e.target.value }))}
              aria-label="メールアドレス"
            />

            <label className="lead-check">
              <input
                type="checkbox"
                checked={lead.optIn}
                onChange={(e) => setLead((l) => ({ ...l, optIn: e.target.checked }))}
              />
              <span>相続のお役立ち情報や相談会のご案内を、メールで受け取る（任意）</span>
            </label>

            {errMsg && <p className="lead-err">{errMsg}</p>}

            <button
              className="btn btn-primary btn-block"
              onClick={submitLead}
              disabled={status === "sending"}
            >
              {status === "sending" ? "送信しています…" : "結果をメールで受け取る"}
            </button>

            <p className="lead-consent">
              ご入力内容は、結果の送付
              {lead.optIn ? "と、ご案内メールの配信" : ""}
              のために利用します。詳しくは
              <a href={CONFIG.privacyUrl} onClick={(e) => e.preventDefault()}>
                プライバシーポリシー
              </a>
              をご覧ください。
            </p>
          </div>
        </div>
      ) : (
        <div className="upsell done">
          <div className="done-check" aria-hidden="true">✓</div>
          <h3 className="upsell-h">送信しました</h3>
          <p className="upsell-b">
            {IS_DEMO
              ? "（モックのため、実際のメール送信・保存は行っていません）"
              : `${lead.email} に診断結果をお送りしました。`}
          </p>

          {IS_DEMO && sentPayload && (
            <div className="payload">
              <div className="payload-h">
                本番でスプレッドシートに追記され、メールで送られる内容
              </div>
              <dl className="payload-list">
                <div><dt>お名前</dt><dd>{sentPayload.name || "（未入力）"}</dd></div>
                <div><dt>メール</dt><dd>{sentPayload.email}</dd></div>
                <div><dt>配信同意</dt><dd>{sentPayload.marketingOptIn ? "同意あり" : "同意なし"}</dd></div>
                <div><dt>配偶者</dt><dd>{sentPayload.hasSpouse ? "いる" : "いない"}</dd></div>
                <div><dt>子の人数</dt><dd>{sentPayload.numChildren}人</dd></div>
                <div><dt>財産概算</dt><dd>{fmt(sentPayload.assetsManyen)}万円</dd></div>
                <div><dt>概算税額</dt><dd>{sentPayload.taxable ? `約${fmt(sentPayload.taxManyen)}万円` : "かからない見込み"}</dd></div>
                <div><dt>流入元</dt><dd>{sentPayload.source}</dd></div>
              </dl>
              <p className="payload-note">
                ※ GAS_URL を本番のデプロイURLに差し替えると、この内容が実際に送信されます。
              </p>
            </div>
          )}
        </div>
      )}

      <button className="restart" onClick={onReset}>
        はじめからやり直す
      </button>
    </section>
  );
}

/* =========================================================================
   税理士掲載一覧ページ（EU向け・#tax-list）
   - /api/accountants から掲載を取得して並べる。
   - 並び順は掲載モデルの商業判断（上位プランを先頭）＝関数/GAS側で決める。
   - 診断結果があれば「得意分野フィルタ」の初期ONを提案するが、操作はEU本人（自己選択）。
   ========================================================================= */
function AccountantListPage({ form, result, onBack }) {
  const [state, setState] = useState({ loading: true, list: [], notice: null });
  const [activeSpecs, setActiveSpecs] = useState(() => suggestSpecs(form, result));

  const load = () => {
    setState((s) => ({ ...s, loading: true }));
    apiListAccountants().then((d) => {
      if (d.ok && d.source === "gas") {
        // 実データ取得。案内なし。
        setState({ loading: false, list: d.accountants, notice: null });
      } else if (d.ok) {
        // 関数には届いたが、GAS未接続/空/GAS側エラー → サンプル表示＋穏やかな案内
        const isErr = d.source === "seed_error";
        setState({
          loading: false,
          list: d.accountants,
          notice: {
            level: isErr ? "error" : "sample",
            title: isErr
              ? "現在はサンプルを表示しています（掲載データの取得でエラー）"
              : "現在はサンプルを表示しています",
            body: isErr
              ? "ACCOUNTANT_GAS_URL が正しい /exec か、GASのデプロイ（アクセス=全員）をご確認ください。"
              : "まだ掲載の登録がないか、接続の準備中です。登録が入ると自動で切り替わります。",
            diag: d.note || null,
          },
        });
      } else {
        // /api にそもそも到達できない/非JSON → 担当者向け診断＋サンプルで画面は成立
        setState({
          loading: false,
          list: CLIENT_SEED,
          notice: {
            level: "error",
            title: "現在はサンプルを表示しています（掲載データを取得できませんでした）",
            body: listErrorHint(d.status),
            diag: "status " + d.status + (d.raw ? " ／ " + d.raw : ""),
          },
        });
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  const toggleSpec = (key) =>
    setActiveSpecs((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const filtered =
    activeSpecs.length === 0
      ? state.list
      : state.list.filter((a) => (a.specialties || []).some((k) => activeSpecs.includes(k)));

  return (
    <section className="tpage">
      <button className="tback" onClick={onBack}>
        ← 診断結果へ戻る
      </button>

      <div className="tpage-head">
        <div className="eyebrow">掲載税理士 一覧</div>
        <h1 className="tpage-h">相続にくわしい税理士から選ぶ</h1>
        <p className="tpage-lead">
          {CONFIG.areaLabel}を中心に、相続を得意とする税理士が掲載されています。得意分野や初回相談の
          費用を見くらべて、ご自身で選んでご相談ください。掲載順は各事務所の掲載プランによります。
        </p>
      </div>

      {/* 得意分野フィルタ（自己選択。診断に応じて初期ONを提案するだけ）*/}
      <div className="tfilter">
        <div className="tfilter-label">得意分野でしぼり込む</div>
        <div className="spec-grid">
          {SPECIALTIES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={"spec" + (activeSpecs.includes(s.key) ? " is-active" : "")}
              onClick={() => toggleSpec(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {state.loading && <div className="tinfo">掲載情報を読み込んでいます…</div>}

      {!state.loading && state.notice && (
        <div className={"tbanner tbanner-" + state.notice.level}>
          <div className="tbanner-h">{state.notice.title}</div>
          <div className="tbanner-b">{state.notice.body}</div>
          {state.notice.diag && (
            <div className="tbanner-diag">{state.notice.diag}</div>
          )}
          <button className="tbanner-retry" onClick={load}>
            再読み込み
          </button>
        </div>
      )}

      {!state.loading && filtered.length === 0 && (
        <div className="tinfo">条件に合う掲載が見つかりませんでした。フィルタを外してお試しください。</div>
      )}

      <div className="alist">
        {filtered.map((a) => (
          <AccountantCard key={a.id} a={a} form={form} result={result} />
        ))}
      </div>

      <p className="tnote">
        本ページは各税理士事務所の掲載（広告）です。当サイトは特定の事務所をあっせん・紹介して
        手数料を受け取るものではなく、掲載内容にもとづきご自身でお選びいただく形です。
      </p>
    </section>
  );
}

// 診断結果から「初期ONにすると親切な得意分野」を提案（あくまで初期値。EUが変更可）
function suggestSpecs(form, result) {
  const s = [];
  if (form && form.realEstate === "high") s.push("realestate");
  if (form && form.hasSpouse) s.push("secondary");
  if (result && result.taxable) s.push("funds");
  return s;
}

function Avatar({ photoUrl, name }) {
  if (photoUrl) {
    return <img className="avatar avatar-img" src={photoUrl} alt="" loading="lazy" />;
  }
  const initials = (name || "").trim().slice(0, 2) || "税";
  return (
    <div className="avatar avatar-ini" aria-hidden="true">
      {initials}
    </div>
  );
}

function AccountantCard({ a, form, result }) {
  const [open, setOpen] = useState(false);
  const isPremium = a.plan === "premium";

  return (
    <article className={"acard" + (isPremium ? " is-premium" : "")}>
      {isPremium && <div className="acard-pr">PR ・ 上位掲載</div>}

      <div className="acard-head">
        <Avatar photoUrl={a.photoUrl} name={a.officeName || a.name} />
        <div className="acard-id">
          <div className="acard-office">{a.officeName}</div>
          <div className="acard-name">
            税理士 {a.name}
            {a.regNumber ? <span className="acard-reg"> ・ 登録番号 {a.regNumber}</span> : null}
          </div>
          <div className="acard-area">{a.area}</div>
        </div>
      </div>

      <div className="atags">
        {(a.specialties || []).map((k) => (
          <span key={k} className="atag">
            {specLabel(k)}
          </span>
        ))}
      </div>

      <dl className="ameta">
        <div>
          <dt>相続税申告の実績</dt>
          <dd>
            {a.years ? `${a.years}年` : "―"}
            {a.cases ? ` ・ 累計${fmt(Number(a.cases))}件` : ""}
          </dd>
        </div>
        <div>
          <dt>初回相談</dt>
          <dd>{a.firstConsultFree ? "無料" : "有料"}</dd>
        </div>
        <div>
          <dt>料金の目安</dt>
          <dd>{a.feeGuide || "お問い合わせください"}</dd>
        </div>
      </dl>

      {a.message && <p className="amsg">{a.message}</p>}

      {!open ? (
        <button className="btn btn-primary btn-block" onClick={() => setOpen(true)}>
          この先生に相談する →
        </button>
      ) : (
        <InquiryPanel a={a} form={form} result={result} onClose={() => setOpen(false)} />
      )}
    </article>
  );
}

// 相談申し込み（自己選択＋同意取得のスタブ。実PII引き渡しはNDA/同意前提で本番実装）
function InquiryPanel({ a, form, result, onClose }) {
  const [v, setV] = useState({ name: "", email: "", consent: false });
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!isValidEmail(v.email)) {
      setErr("メールアドレスをご確認ください。");
      return;
    }
    if (!v.consent) {
      setErr("お名前・連絡先を税理士へお渡しすることへの同意が必要です。");
      return;
    }
    setStatus("sending");
    const payload = {
      accountantId: a.id,
      officeName: a.officeName,
      name: v.name.trim(),
      email: v.email.trim(),
      consent: v.consent,
      // 診断メモ（非個別助言の範囲。税額の生値ではなく概況のみ渡す）
      diagnosisNote: result
        ? `課税:${result.taxable ? "あり" : "なし"} / 配偶者:${form.hasSpouse ? "あり" : "なし"} / 子:${form.numChildren}人 / 不動産:${form.realEstate || "-"}`
        : "",
      source: CONFIG.source,
    };
    try {
      await apiSendInquiry(payload);
      setStatus("done");
    } catch (e) {
      // 失敗しても画面は成立させる（デモ用スタブ）
      setStatus("done");
    }
  };

  if (status === "done") {
    return (
      <div className="inq inq-done">
        <div className="done-check sm" aria-hidden="true">✓</div>
        <p className="inq-done-h">{a.officeName} へお申し込みを受け付けました</p>
        <p className="inq-done-b">
          担当者が内容を確認し、折り返しご連絡します。
          （※モックのため、実際の連絡は行われません）
        </p>
        <button className="tlink" onClick={onClose}>
          閉じる
        </button>
      </div>
    );
  }

  return (
    <div className="inq">
      <div className="inq-h">{a.officeName} に相談を申し込む</div>
      <input
        className="lead-input light"
        type="text"
        placeholder="お名前"
        value={v.name}
        onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))}
      />
      <input
        className="lead-input light"
        type="email"
        inputMode="email"
        placeholder="メールアドレス"
        value={v.email}
        onChange={(e) => setV((s) => ({ ...s, email: e.target.value }))}
      />
      <label className="inq-check">
        <input
          type="checkbox"
          checked={v.consent}
          onChange={(e) => setV((s) => ({ ...s, consent: e.target.checked }))}
        />
        <span>
          お名前・連絡先と診断の概況を、選んだ税理士へお渡しすることに同意します。詳しくは
          <a href={CONFIG.privacyUrl} onClick={(e) => e.preventDefault()}>
            プライバシーポリシー
          </a>
          。
        </span>
      </label>
      {err && <p className="lead-err dark">{err}</p>}
      <div className="inq-actions">
        <button className="tlink" onClick={onClose}>
          やめる
        </button>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={status === "sending"}
        >
          {status === "sending" ? "送信中…" : "この内容で申し込む"}
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   税理士 登録ページ（税理士向け・#tax-register）
   - 税理士自身がEUへアピールする情報を入力 → /api/accountants(register) へ。
   - 掲載プランを製品内で可視化（初期登録料＋月額）。価格は仮値（本番で確定）。
   - 送信成功後は「掲載一覧を見る」導線を出し、登録→掲載のループを体感させる。
   ========================================================================= */
function AccountantRegisterPage({ onBack }) {
  const empty = {
    officeName: "",
    name: "",
    regNumber: "",
    area: CONFIG.areaLabel,
    address: "",
    years: "",
    cases: "",
    specialties: [],
    firstConsultFree: true,
    feeGuide: "",
    message: "",
    photoUrl: "",
    tel: "",
    plan: "basic",
  };
  const [f, setF] = useState(empty);
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [err, setErr] = useState("");

  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const toggleSpec = (key) =>
    setF((s) => ({
      ...s,
      specialties: s.specialties.includes(key)
        ? s.specialties.filter((k) => k !== key)
        : [...s.specialties, key],
    }));

  const canSubmit =
    f.officeName.trim() &&
    f.name.trim() &&
    f.area.trim() &&
    f.specialties.length > 0 &&
    f.message.trim();

  const submit = async () => {
    setErr("");
    if (!canSubmit) {
      setErr("事務所名・税理士名・対応エリア・得意分野（1つ以上）・ひとことメッセージは必須です。");
      return;
    }
    setStatus("sending");
    const payload = {
      ...f,
      years: f.years === "" ? "" : Number(f.years),
      cases: f.cases === "" ? "" : Number(f.cases),
    };
    try {
      const d = await apiRegisterAccountant(payload);
      if (d && d.ok !== false) {
        setStatus("done");
      } else {
        setStatus("error");
        setErr("登録に失敗しました。時間をおいて再度お試しください。");
      }
    } catch (e) {
      setStatus("error");
      setErr("送信に失敗しました。時間をおいて再度お試しください。");
    }
  };

  if (status === "done") {
    return (
      <section className="tpage">
        <div className="treg-done">
          <div className="done-check" aria-hidden="true">✓</div>
          <h1 className="treg-done-h">掲載情報を登録しました</h1>
          <p className="treg-done-b">
            {f.officeName} の掲載情報を受け付けました。掲載一覧でご確認いただけます。
          </p>
          <button className="btn btn-brass btn-block" onClick={() => navigate("tax-list")}>
            掲載一覧を見る →
          </button>
          <button
            className="tlink center"
            onClick={() => {
              setF(empty);
              setStatus("idle");
            }}
          >
            続けて別の事務所を登録する
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="tpage">
      <button className="tback" onClick={onBack}>
        ← 戻る
      </button>

      <div className="tpage-head">
        <div className="eyebrow">税理士の先生へ</div>
        <h1 className="tpage-h">掲載情報の登録</h1>
        <p className="tpage-lead">
          相続でお困りのご家族（主に{CONFIG.areaLabel}周辺の50〜60代）へ向けて、先生ご自身の強みを
          お伝えする情報をご登録ください。ご入力内容がそのまま掲載一覧に表示されます。
        </p>
      </div>

      {/* 掲載プラン（マネタイズの可視化）*/}
      <div className="plan-grid">
        {PLANS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={
              "plan" +
              (f.plan === p.key ? " is-selected" : "") +
              (p.recommended ? " is-rec" : "")
            }
            onClick={() => set({ plan: p.key })}
          >
            {p.recommended && <span className="plan-ribbon">おすすめ</span>}
            <span className="plan-label">{p.label}</span>
            <span className="plan-price">{p.price}</span>
            <ul className="plan-perks">
              {p.perks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <span className="plan-pick">{f.plan === p.key ? "選択中" : "選ぶ"}</span>
          </button>
        ))}
      </div>
      <p className="plan-note">※ 掲載料は仮の金額です（本番で確定）。掲載順は上位掲載が優先されます。</p>

      <div className="treg-form">
        <Field label="事務所名" required>
          <input className="lead-input light" value={f.officeName}
            onChange={(e) => set({ officeName: e.target.value })} placeholder="例：大井町相続税理士事務所" />
        </Field>
        <Field label="税理士名" required>
          <input className="lead-input light" value={f.name}
            onChange={(e) => set({ name: e.target.value })} placeholder="例：田中 誠一" />
        </Field>
        <Field label="税理士登録番号">
          <input className="lead-input light" value={f.regNumber}
            onChange={(e) => set({ regNumber: e.target.value })} placeholder="例：第123456号" />
        </Field>
        <Field label="対応エリア" required>
          <input className="lead-input light" value={f.area}
            onChange={(e) => set({ area: e.target.value })} placeholder="例：品川区・大田区" />
        </Field>
        <Field label="所在地">
          <input className="lead-input light" value={f.address}
            onChange={(e) => set({ address: e.target.value })} placeholder="例：品川区大井1-2-3" />
        </Field>

        <div className="treg-row2">
          <Field label="相続税申告の実績（年数）">
            <div className="unit-row">
              <input className="lead-input light" inputMode="numeric" value={f.years}
                onChange={(e) => set({ years: e.target.value.replace(/[^0-9]/g, "") })} placeholder="18" />
              <span className="unit-suffix">年</span>
            </div>
          </Field>
          <Field label="相続税申告の実績（累計件数）">
            <div className="unit-row">
              <input className="lead-input light" inputMode="numeric" value={f.cases}
                onChange={(e) => set({ cases: e.target.value.replace(/[^0-9]/g, "") })} placeholder="400" />
              <span className="unit-suffix">件</span>
            </div>
          </Field>
        </div>

        <Field label="得意分野（1つ以上）" required>
          <div className="spec-grid">
            {SPECIALTIES.map((s) => (
              <button key={s.key} type="button"
                className={"spec" + (f.specialties.includes(s.key) ? " is-active" : "")}
                onClick={() => toggleSpec(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="初回相談">
          <div className="q-choices">
            <Choice active={f.firstConsultFree === true} onClick={() => set({ firstConsultFree: true })}>
              無料
            </Choice>
            <Choice active={f.firstConsultFree === false} onClick={() => set({ firstConsultFree: false })}>
              有料
            </Choice>
          </div>
        </Field>

        <Field label="料金の目安">
          <input className="lead-input light" value={f.feeGuide}
            onChange={(e) => set({ feeGuide: e.target.value })}
            placeholder="例：申告報酬 遺産総額の0.5%〜（目安）" />
        </Field>

        <Field label="ひとことメッセージ（自己PR）" required>
          <textarea className="lead-textarea" rows={4} value={f.message}
            onChange={(e) => set({ message: e.target.value })}
            placeholder="相続に不安のあるご家族へ、先生の姿勢や得意なことを一言で。" />
          <p className="field-hint">
            ※ 税理士会の広告規程に配慮し、他事務所より優位である旨の断定や、税額の減少・成果の保証は
            お控えください。
          </p>
        </Field>

        <Field label="写真URL（任意）">
          <input className="lead-input light" value={f.photoUrl}
            onChange={(e) => set({ photoUrl: e.target.value })}
            placeholder="https://… （未入力ならイニシャル表示）" />
        </Field>

        <Field label="連絡先（電話・任意）">
          <input className="lead-input light" value={f.tel}
            onChange={(e) => set({ tel: e.target.value })} placeholder="例：03-1234-5678" />
        </Field>

        {err && <p className="lead-err dark">{err}</p>}

        <button className="btn btn-primary btn-block" onClick={submit} disabled={status === "sending"}>
          {status === "sending" ? "登録しています…" : `この内容で掲載を申し込む（${planLabel(f.plan)}）`}
        </button>
        <p className="field-hint center">
          掲載内容は運営（{CONFIG.brand}）および監修税理士の確認のうえ公開される運用を想定しています。
        </p>
      </div>
    </section>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="field">
      <div className="field-label">
        {label}
        {required && <span className="field-req">必須</span>}
      </div>
      {children}
    </div>
  );
}

function Footer() {
  return (
    <footer className="ftr">
      <p>
        本診断は明示のルールによる概算で、税額を保証するものではありません。個別の税務相談は
        税理士が行います。掲載は各事務所の広告であり、当サイトはあっせん手数料を受け取りません。
        表示内容は一般的な情報提供であり、特定の行動を助言するものではありません。{CONFIG.supervisor}。
      </p>
      <p className="ftr-links">
        <a href="#tax-register" className="ftr-a">税理士の先生の掲載について</a>
      </p>
      <p className="ftr-brand">© {CONFIG.brand}</p>
    </footer>
  );
}

// =========================== スタイル ===========================
function StyleTag() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Zen+Old+Mincho:wght@400;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');

:root{
  --bg:#EAEEF2;
  --panel:#FBFCFD;
  --ink:#22303C;
  --ink-soft:#566573;
  --navy:#173257;
  --navy-deep:#0E2340;
  --brass:#A6884E;
  --brass-soft:#C7AE79;
  --green:#3C5A48;
  --line:#DBE2E8;
  --line-soft:#E9EEF2;
  --mincho:'Zen Old Mincho', serif;
  --gothic:'Zen Kaku Gothic New', sans-serif;
}

*{box-sizing:border-box}
.app{
  background:radial-gradient(120% 90% at 50% -10%, #F3F6F9 0%, var(--bg) 55%);
  min-height:100%;
  font-family:var(--gothic);
  color:var(--ink);
  padding:24px 14px 40px;
  display:flex;justify-content:center;
  -webkit-font-smoothing:antialiased;
}
.frame{
  width:100%;max-width:560px;
  background:var(--panel);
  border:1px solid var(--line);
  border-radius:20px;
  box-shadow:0 18px 50px -28px rgba(14,35,64,.4);
  overflow:hidden;
}

/* header */
.hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 22px;border-bottom:1px solid var(--line-soft);
  background:linear-gradient(180deg,#fff, #FBFCFD);
}
.hdr-brand{display:flex;align-items:center;gap:9px}
.mark{width:16px;height:16px;border-radius:4px;
  background:linear-gradient(135deg,var(--navy),var(--brass));
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.35);}
.hdr-name{font-family:var(--mincho);font-weight:700;letter-spacing:.04em;color:var(--navy-deep)}
.hdr-area{font-size:12px;color:var(--ink-soft);letter-spacing:.02em;text-align:right}

/* intro */
.intro{padding:30px 24px 26px}
.eyebrow{font-size:11px;letter-spacing:.22em;color:var(--brass);font-weight:700;margin-bottom:16px;}
.h1{font-family:var(--mincho);font-weight:700;font-size:30px;line-height:1.42;letter-spacing:.02em;color:var(--navy-deep);margin:0 0 16px;}
.h1 em{font-style:normal;color:var(--brass);}
.lead{font-size:15px;line-height:1.85;color:var(--ink-soft);margin:0 0 24px}
.intro-notes{list-style:none;padding:0;margin:20px 0 0;display:flex;flex-direction:column;gap:8px;}
.intro-notes li{font-size:13px;color:var(--ink-soft);padding-left:20px;position:relative;}
.intro-notes li::before{content:"";position:absolute;left:0;top:7px;width:8px;height:8px;border-radius:50%;background:var(--brass-soft);}

/* buttons */
.btn{font-family:var(--gothic);font-weight:700;font-size:16px;border:none;border-radius:12px;cursor:pointer;
  padding:16px 26px;transition:transform .08s ease, box-shadow .2s ease, background .2s;}
.btn:active{transform:translateY(1px)}
.btn-primary{background:linear-gradient(180deg,var(--navy),var(--navy-deep));color:#fff;box-shadow:0 12px 24px -12px rgba(23,50,87,.7);}
.btn-primary:disabled{background:#B9C4CE;box-shadow:none;cursor:not-allowed;color:#EEF2F5}
.btn-brass{background:linear-gradient(180deg,var(--brass-soft),var(--brass));color:#fff;box-shadow:0 12px 24px -14px rgba(166,136,78,.8);}
.btn-brass:hover{filter:brightness(1.03)}
.btn-block{width:100%}
.btn-ghost{background:transparent;color:var(--navy);border:1.5px solid var(--line);border-radius:10px;font-size:14px;font-weight:700;padding:11px 16px;}
.btn-ghost:hover{border-color:var(--brass-soft);color:var(--navy-deep)}

/* form */
.form{padding:24px 22px 28px}
.q-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:26px}
.q-head{display:flex;align-items:baseline;gap:11px;margin-bottom:13px}
.q-n{font-family:var(--mincho);font-weight:700;color:#fff;background:var(--navy);border-radius:7px;width:26px;height:26px;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:14px;}
.q-label{font-size:15.5px;font-weight:500;line-height:1.5;color:var(--ink)}
.q-choices{display:flex;flex-wrap:wrap;gap:9px}
.choice{font-family:var(--gothic);font-size:15px;font-weight:500;background:#fff;color:var(--ink);border:1.5px solid var(--line);border-radius:11px;padding:12px 20px;cursor:pointer;transition:all .15s;}
.choice:hover{border-color:var(--brass-soft)}
.choice.is-active{background:var(--navy);color:#fff;border-color:var(--navy);box-shadow:0 8px 16px -10px rgba(23,50,87,.8);}
.amount-row{display:flex;align-items:center;gap:10px}
.amount-input{font-family:var(--mincho);font-size:26px;font-weight:600;color:var(--navy-deep);width:100%;border:none;border-bottom:2px solid var(--line);background:transparent;padding:6px 2px;text-align:right;outline:none;transition:border-color .15s;}
.amount-input:focus{border-color:var(--brass)}
.amount-unit{font-size:16px;color:var(--ink-soft);font-weight:500;flex:none}
.amount-hints{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.chip{font-family:var(--gothic);font-size:13px;color:var(--ink-soft);background:var(--line-soft);border:none;border-radius:20px;padding:7px 14px;cursor:pointer;transition:all .15s;}
.chip:hover{background:var(--brass-soft);color:#fff}
.warn-inline{margin:22px 0 0;font-size:13.5px;line-height:1.7;color:var(--green);background:#EEF3EF;border-radius:10px;padding:13px 16px;}
.micro{font-size:12px;color:var(--ink-soft);text-align:center;margin:14px 0 0;line-height:1.6}
.btn.btn-primary.btn-block{margin-top:26px}

/* diagnosing */
.diag{padding:56px 24px 60px;text-align:center}
.diag-orb{position:relative;width:132px;height:132px;margin:0 auto 30px}
.diag-orb .ring{position:absolute;inset:0;border-radius:50%;border:1.5px solid transparent;}
.diag-orb .r1{border-top-color:var(--navy);animation:spin 1.6s linear infinite}
.diag-orb .r2{inset:16px;border-right-color:var(--brass);animation:spin 2.1s linear infinite reverse}
.diag-orb .r3{inset:32px;border-bottom-color:var(--green);animation:spin 1.3s linear infinite}
.diag-orb .core{position:absolute;inset:52px;border-radius:50%;background:radial-gradient(circle at 40% 35%, var(--brass-soft), var(--navy));animation:pulse 1.4s ease-in-out infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.14);opacity:1}}
.diag-label{font-family:var(--mincho);font-size:19px;font-weight:700;color:var(--navy-deep);letter-spacing:.06em;margin-bottom:22px}
.diag-steps{list-style:none;padding:0;margin:0;display:inline-flex;flex-direction:column;gap:12px;text-align:left}
.diag-steps li{font-size:14px;color:#AEB9C3;padding-left:26px;position:relative;transition:color .3s;}
.diag-steps li::before{content:"";position:absolute;left:0;top:3px;width:15px;height:15px;border-radius:50%;border:1.5px solid #CDD6DE;transition:all .3s;}
.diag-steps li.done{color:var(--ink)}
.diag-steps li.done::before{background:var(--green);border-color:var(--green)}

/* result */
.result{padding:28px 22px 30px}
.result-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.16em;color:var(--brass);border:1px solid var(--brass-soft);border-radius:20px;padding:5px 14px;margin-bottom:18px;}
.result-kicker{font-size:13px;color:var(--ink-soft);margin:0 0 6px;letter-spacing:.03em}
.amount-hero{display:flex;align-items:baseline;gap:6px;margin:0 0 18px;color:var(--navy-deep)}
.amount-hero .yen{font-size:22px;font-family:var(--mincho);align-self:center}
.amount-hero .big{font-family:var(--mincho);font-weight:700;font-size:56px;line-height:1;letter-spacing:.01em}
.amount-hero .unit{font-size:24px;font-family:var(--mincho)}
.amount-hero.zero .big{font-size:34px;color:var(--green)}
.disclaimer-strong{font-size:13.5px;line-height:1.85;color:var(--ink);background:#F4F0E6;border-left:3px solid var(--brass);border-radius:0 10px 10px 0;padding:14px 16px;margin:0 0 18px;}
.disclaimer-strong em{font-style:normal;font-weight:700;color:var(--navy-deep)}

.ai-comment{margin:0 0 18px;padding:14px 16px;border:1px dashed var(--brass-soft);border-radius:12px;background:#FCFAF4;}
.ai-comment-tag{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--brass);margin-bottom:8px;}
.ai-comment-body{font-size:13.5px;line-height:1.85;color:var(--ink);margin:0}

.rule-toggle{background:none;border:none;color:var(--navy);font-family:var(--gothic);font-size:13.5px;font-weight:700;cursor:pointer;padding:4px 0;}
.rule-box{margin:12px 0 8px;font-size:13px;line-height:1.8;color:var(--ink-soft);background:#F6F8FA;border:1px solid var(--line-soft);border-radius:12px;padding:16px 18px;}
.rule-box ul{margin:8px 0;padding-left:18px}
.rule-box li{margin:4px 0}
.rule-note{margin:10px 0 0;color:var(--green);font-size:12.5px}
.issues-title{font-family:var(--mincho);font-size:20px;font-weight:700;color:var(--navy-deep);margin:30px 0 16px;letter-spacing:.03em;}
.issues{display:flex;flex-direction:column;gap:14px}
.issue{border:1px solid var(--line);border-radius:14px;padding:18px 18px 16px;background:linear-gradient(180deg,#fff,#FCFDFE);}
.issue-tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--green);background:#EBF1ED;border-radius:6px;padding:4px 9px;margin-bottom:10px;}
.issue-h{font-family:var(--mincho);font-size:16.5px;font-weight:600;color:var(--navy-deep);margin:0 0 9px;line-height:1.5}
.issue-b{font-size:13.5px;line-height:1.8;color:var(--ink-soft);margin:0 0 14px}

/* 税理士一覧への誘導ブロック */
.findtax{margin:26px 0 4px;padding:20px 18px;border-radius:16px;border:1px solid var(--brass-soft);background:linear-gradient(180deg,#FCFAF4,#F7F1E5);}
.findtax-tag{font-family:var(--mincho);font-size:15.5px;font-weight:700;color:var(--navy-deep);margin-bottom:8px}
.findtax-b{font-size:13px;line-height:1.8;color:var(--ink-soft);margin:0 0 14px}

.upsell{margin:28px 0 4px;padding:22px 20px;border-radius:16px;background:linear-gradient(180deg,#173257,#0E2340);color:#fff;text-align:center;}
.upsell-h{font-family:var(--mincho);font-size:18px;font-weight:700;margin:0 0 8px;letter-spacing:.03em}
.upsell-b{font-size:13px;line-height:1.75;color:#C6D2E0;margin:0 0 16px}
.upsell .btn-primary:disabled{background:rgba(255,255,255,.16);color:#DCE5EF}
.lead-form{display:flex;flex-direction:column;gap:12px;margin-top:16px;text-align:left}
.lead-input{font-family:var(--gothic);font-size:15px;color:var(--ink);background:#fff;border:1.5px solid transparent;border-radius:11px;padding:14px 15px;outline:none;transition:border-color .15s;width:100%}
.lead-input.light{border-color:var(--line)}
.lead-input::placeholder{color:#9AA7B4}
.lead-input:focus{border-color:var(--brass-soft)}
.lead-check{display:flex;align-items:flex-start;gap:10px;font-size:13px;line-height:1.6;color:#DCE5EF;cursor:pointer;padding:2px 0;}
.lead-check input{appearance:none;-webkit-appearance:none;flex:none;width:20px;height:20px;margin-top:1px;border-radius:6px;border:1.5px solid #6E829A;background:rgba(255,255,255,.06);cursor:pointer;position:relative;transition:all .15s;}
.lead-check input:checked{background:var(--brass);border-color:var(--brass)}
.lead-check input:checked::after{content:"✓";position:absolute;inset:0;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;}
.lead-err{font-size:13px;color:#F2C4B8;margin:-2px 0 0}
.lead-err.dark{color:#C0392B}
.upsell .btn.btn-primary.btn-block{margin-top:2px;background:var(--brass);box-shadow:none}
.upsell .btn.btn-primary.btn-block:hover{background:#b9995a}
.upsell .btn.btn-primary.btn-block:disabled{background:rgba(255,255,255,.16);color:#DCE5EF}
.lead-consent{font-size:11px;line-height:1.7;color:#9FB0C2;margin:4px 0 0}
.lead-consent a{color:#DCE5EF;text-underline-offset:2px}
.upsell.done{text-align:center}
.done-check{width:52px;height:52px;border-radius:50%;margin:0 auto 14px;background:var(--brass);color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;}
.done-check.sm{width:40px;height:40px;font-size:20px;margin-bottom:10px}
.payload{margin-top:16px;background:rgba(255,255,255,.06);border-radius:12px;padding:16px;text-align:left;}
.payload-h{font-size:12px;font-weight:700;color:var(--brass-soft);letter-spacing:.04em;margin-bottom:10px}
.payload-list{margin:0;display:flex;flex-direction:column;gap:7px}
.payload-list > div{display:flex;justify-content:space-between;gap:12px;font-size:13px}
.payload-list dt{color:#9FB0C2;margin:0;flex:none}
.payload-list dd{color:#EEF3F8;margin:0;text-align:right}
.payload-note{font-size:11px;color:#8C9DAF;line-height:1.6;margin:12px 0 0}
.restart{display:block;margin:22px auto 0;background:none;border:none;color:var(--ink-soft);font-family:var(--gothic);font-size:13px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;}

/* ===== 税理士掲載: 共通ページ ===== */
.tpage{padding:26px 22px 30px}
.tback{background:none;border:none;color:var(--navy);font-family:var(--gothic);font-size:13.5px;font-weight:700;cursor:pointer;padding:2px 0 14px;}
.tpage-head{margin-bottom:18px}
.tpage-h{font-family:var(--mincho);font-size:24px;font-weight:700;color:var(--navy-deep);margin:6px 0 12px;line-height:1.4;letter-spacing:.02em}
.tpage-lead{font-size:13.5px;line-height:1.85;color:var(--ink-soft);margin:0}
.tnote{font-size:11px;line-height:1.7;color:#8695A2;margin:22px 0 0;padding-top:14px;border-top:1px solid var(--line-soft)}
.tinfo{text-align:center;color:var(--ink-soft);font-size:14px;padding:26px 12px;background:#F6F8FA;border-radius:12px;margin:8px 0}
.tinfo-err{color:var(--green);background:#EEF3EF}
.tbanner{margin:0 0 16px;padding:14px 16px;border-radius:12px}
.tbanner-sample{background:#F3F6F9;border:1px solid var(--line)}
.tbanner-error{background:#FBF3E4;border:1px solid var(--brass-soft)}
.tbanner-h{font-size:13.5px;font-weight:700;line-height:1.6}
.tbanner-sample .tbanner-h{color:var(--navy-deep)}
.tbanner-error .tbanner-h{color:#8A6D33}
.tbanner-b{font-size:12.5px;line-height:1.75;color:var(--ink-soft);margin-top:6px}
.tbanner-diag{font-size:11px;line-height:1.6;color:#9A855F;margin-top:8px;word-break:break-all;font-family:ui-monospace,Menlo,Consolas,monospace}
.tbanner-retry{margin-top:10px;background:var(--navy);color:#fff;border:none;border-radius:8px;font-family:var(--gothic);font-size:12.5px;font-weight:700;padding:8px 16px;cursor:pointer}
.tbanner-retry:hover{background:var(--navy-deep)}
.tinfo-sub{font-size:12px;color:#8695A2;margin-top:8px;line-height:1.7}
.tinfo-sub code{background:#E4EAEF;border-radius:4px;padding:1px 5px;font-size:11px}
.tlink{background:none;border:none;color:var(--navy);font-family:var(--gothic);font-size:13px;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:6px 2px}
.tlink.center{display:block;margin:12px auto 0}

/* ===== フィルタ / 得意分野チップ（複数選択）===== */
.tfilter{margin:0 0 18px;padding:14px 16px;background:#F6F8FA;border:1px solid var(--line-soft);border-radius:14px}
.tfilter-label{font-size:12px;font-weight:700;color:var(--ink-soft);letter-spacing:.04em;margin-bottom:10px}
.spec-grid{display:flex;flex-wrap:wrap;gap:8px}
.spec{font-family:var(--gothic);font-size:13px;font-weight:500;background:#fff;color:var(--ink-soft);border:1.5px solid var(--line);border-radius:20px;padding:8px 14px;cursor:pointer;transition:all .15s}
.spec:hover{border-color:var(--brass-soft)}
.spec.is-active{background:var(--green);color:#fff;border-color:var(--green)}

/* ===== 税理士カード ===== */
.alist{display:flex;flex-direction:column;gap:16px}
.acard{position:relative;border:1px solid var(--line);border-radius:16px;padding:18px;background:linear-gradient(180deg,#fff,#FCFDFE);}
.acard.is-premium{border-color:var(--brass-soft);box-shadow:0 14px 34px -24px rgba(166,136,78,.7);background:linear-gradient(180deg,#FFFDF8,#FCFAF3)}
.acard-pr{position:absolute;top:-10px;left:16px;background:linear-gradient(180deg,var(--brass-soft),var(--brass));color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.08em;border-radius:20px;padding:4px 12px;box-shadow:0 6px 14px -8px rgba(166,136,78,.9)}
.acard-head{display:flex;gap:14px;align-items:center;margin-bottom:12px}
.avatar{width:60px;height:60px;border-radius:14px;flex:none;overflow:hidden}
.avatar-img{object-fit:cover}
.avatar-ini{display:flex;align-items:center;justify-content:center;font-family:var(--mincho);font-weight:700;font-size:22px;color:#fff;background:linear-gradient(135deg,var(--navy),var(--brass));letter-spacing:.02em}
.acard-office{font-family:var(--mincho);font-size:17px;font-weight:700;color:var(--navy-deep);line-height:1.4}
.acard-name{font-size:12.5px;color:var(--ink-soft);margin-top:3px}
.acard-reg{color:#9AA7B4}
.acard-area{font-size:12px;color:var(--green);margin-top:4px;font-weight:500}
.atags{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px}
.atag{font-size:11.5px;font-weight:700;color:var(--green);background:#EBF1ED;border-radius:6px;padding:4px 9px}
.ameta{margin:0 0 12px;display:flex;flex-direction:column;gap:8px;background:#F6F8FA;border-radius:10px;padding:12px 14px}
.ameta > div{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.ameta dt{font-size:12px;color:var(--ink-soft);margin:0;flex:none}
.ameta dd{font-size:13px;color:var(--ink);margin:0;text-align:right;font-weight:500}
.amsg{font-size:13px;line-height:1.8;color:var(--ink-soft);margin:0 0 14px;padding-left:12px;border-left:2px solid var(--brass-soft)}
.acard .btn.btn-primary.btn-block{padding:13px 20px;font-size:15px}

/* ===== 相談申し込みパネル ===== */
.inq{background:#F6F8FA;border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:11px}
.inq-h{font-size:14px;font-weight:700;color:var(--navy-deep)}
.inq-check{display:flex;align-items:flex-start;gap:10px;font-size:12.5px;line-height:1.6;color:var(--ink-soft);cursor:pointer}
.inq-check input{appearance:none;-webkit-appearance:none;flex:none;width:20px;height:20px;margin-top:1px;border-radius:6px;border:1.5px solid var(--line);background:#fff;cursor:pointer;position:relative;transition:all .15s}
.inq-check input:checked{background:var(--brass);border-color:var(--brass)}
.inq-check input:checked::after{content:"✓";position:absolute;inset:0;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center}
.inq-check a{color:var(--navy)}
.inq-actions{display:flex;align-items:center;justify-content:space-between;gap:12px}
.inq-actions .btn-primary{padding:12px 20px;font-size:14px;flex:1}
.inq-done{text-align:center;align-items:center}
.inq-done-h{font-size:14.5px;font-weight:700;color:var(--navy-deep);margin:0}
.inq-done-b{font-size:12.5px;line-height:1.7;color:var(--ink-soft);margin:0}

/* ===== 掲載プラン ===== */
.plan-grid{display:flex;gap:12px;margin:0 0 8px}
.plan{flex:1;position:relative;text-align:left;background:#fff;border:1.5px solid var(--line);border-radius:14px;padding:16px 14px;cursor:pointer;transition:all .15s;display:flex;flex-direction:column;gap:8px}
.plan:hover{border-color:var(--brass-soft)}
.plan.is-selected{border-color:var(--navy);box-shadow:0 10px 22px -14px rgba(23,50,87,.7)}
.plan.is-rec.is-selected{border-color:var(--brass)}
.plan-ribbon{position:absolute;top:-10px;right:12px;background:var(--brass);color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;border-radius:20px;padding:3px 10px}
.plan-label{font-family:var(--mincho);font-size:16px;font-weight:700;color:var(--navy-deep)}
.plan-price{font-size:12px;color:var(--brass);font-weight:700;line-height:1.5}
.plan-perks{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:5px}
.plan-perks li{font-size:11.5px;color:var(--ink-soft);padding-left:15px;position:relative;line-height:1.5}
.plan-perks li::before{content:"✓";position:absolute;left:0;top:0;color:var(--green);font-weight:700;font-size:11px}
.plan-pick{margin-top:auto;font-size:12px;font-weight:700;color:var(--navy);text-align:center;background:#F1F5F8;border-radius:8px;padding:7px 0}
.plan.is-selected .plan-pick{background:var(--navy);color:#fff}
.plan.is-rec.is-selected .plan-pick{background:var(--brass)}
.plan-note{font-size:11px;color:#8695A2;line-height:1.6;margin:0 0 20px}

/* ===== 登録フォーム ===== */
.treg-form{display:flex;flex-direction:column;gap:16px}
.field{display:flex;flex-direction:column;gap:8px}
.field-label{font-size:13px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:8px}
.field-req{font-size:10px;font-weight:700;color:#fff;background:var(--brass);border-radius:5px;padding:2px 7px;letter-spacing:.04em}
.field-hint{font-size:11px;line-height:1.7;color:#8695A2;margin:2px 0 0}
.field-hint.center{text-align:center}
.lead-textarea{font-family:var(--gothic);font-size:15px;color:var(--ink);background:#fff;border:1.5px solid var(--line);border-radius:11px;padding:13px 15px;outline:none;transition:border-color .15s;width:100%;resize:vertical;line-height:1.7}
.lead-textarea:focus{border-color:var(--brass-soft)}
.lead-textarea::placeholder{color:#9AA7B4}
.treg-row2{display:flex;gap:12px}
.treg-row2 .field{flex:1}
.unit-row{display:flex;align-items:center;gap:8px}
.unit-suffix{font-size:14px;color:var(--ink-soft);flex:none}
.treg-done{text-align:center;padding:20px 4px}
.treg-done-h{font-family:var(--mincho);font-size:22px;font-weight:700;color:var(--navy-deep);margin:0 0 12px}
.treg-done-b{font-size:14px;line-height:1.8;color:var(--ink-soft);margin:0 0 22px}

/* footer */
.ftr{border-top:1px solid var(--line-soft);padding:20px 22px 22px;background:#F6F8FA;}
.ftr p{font-size:11px;line-height:1.75;color:#8695A2;margin:0}
.ftr-links{margin-top:10px !important}
.ftr-a{color:var(--navy);font-weight:700;text-underline-offset:2px}
.ftr-brand{margin-top:8px !important;font-family:var(--mincho);color:#A6B0BB !important}

@media (max-width:420px){
  .h1{font-size:26px}
  .amount-hero .big{font-size:46px}
  .plan-grid{flex-direction:column}
  .tpage-h{font-size:21px}
}
@media (prefers-reduced-motion: reduce){
  .diag-orb .ring,.diag-orb .core{animation:none}
}
`}</style>
  );
}