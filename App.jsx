import React, { useState, useEffect, useRef } from "react";

/* =========================================================================
   相続税かんたん診断 — 第一版モック
   - 位置づけ: リード獲得装置。税額の精緻さより「③レベルまで安全に攻めて
     専門家・不動産相談へ橋渡し」することが目的。
   - 入力: A案（配偶者/子/財産概算/不動産割合の4項目）。
   - 計算: 明示ルールの機械計算のみ（AIには計算させない）。
   - 結果: 概算"試算額"として枠付け。課題は③構文（該当可能性→専門家へ）。
   - AI総評: 「AI診断中」の演出中に /api/comment で生成し、完成してから結果へ遷移。
     （計算はさせない。氏名・メール等の個人情報は渡さない。）
   - 追加入力ボタンは次版のダミー入口（＝メール取得フックの想定位置）。
   ========================================================================= */

// ---- 表示上の運営設定（本番は管理画面で編集する想定。モックは固定）----
const CONFIG = {
  areaLabel: "品川区大井",
  supervisor: "大本税理士法人 監修",
  brand: "グレィスホーム",
  privacyUrl: "#", // 本番はプライバシーポリシーのURLに差し替え
  source: "sim-oimachi", // 地区LPごとに変えると流入元が記録される
};

// ---- 本番のGASデプロイURL（/exec）に差し替える ----
// 差し替えるとモックでも実際にGASへ送信します。XXXXXのままだとデモ動作（送信内容を画面表示）。
// Vercelの環境変数 VITE_GAS_URL があればそれを使う。なければデモ動作（送信内容を画面表示）。
const ENV_GAS_URL =
  (import.meta && import.meta.env && import.meta.env.VITE_GAS_URL) || "";
const IS_DEMO = !ENV_GAS_URL || ENV_GAS_URL.includes("XXXXX");
const GAS_URL = IS_DEMO ? "" : ENV_GAS_URL;

const isValidEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

// ---- フロント→GAS 送信（本番でそのまま動く）----
async function postLead(payload) {
  // GAS Web AppのCORS回避のため text/plain で送る（doPost側はJSON.parseで読む）
  await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
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

  // 法定相続分での按分
  const shares = [];
  if (hasSpouse && numChildren > 0) {
    shares.push(taxableEstate * 0.5); // 配偶者
    for (let i = 0; i < numChildren; i++) shares.push((taxableEstate * 0.5) / numChildren);
  } else if (hasSpouse && numChildren === 0) {
    shares.push(taxableEstate); // 配偶者のみ（簡易：親・兄弟は考慮しない）
  } else {
    for (let i = 0; i < numChildren; i++) shares.push(taxableEstate / numChildren); // 子のみ
  }

  const totalTax = shares.reduce((s, a) => s + taxByRate(a), 0);
  return { heirCount, basicDeduction, taxableEstate, totalTax };
}

// ---- 金額フォーマット（万円）----
const toManyen = (yen) => Math.round(yen / 10000);
const fmt = (n) => n.toLocaleString("ja-JP");

// ---- AI総評APIへ渡すペイロード（個人情報は含めない）----
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

// ==== 課題カード生成（すべて③構文：該当可能性→確認は専門家へ）====
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

  // 常設：不動産はまず不動産会社へ（本業誘導フック）
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

// =========================== 画面 ===========================
export default function App() {
  const [phase, setPhase] = useState("intro"); // intro | form | diagnosing | result
  const [form, setForm] = useState({
    hasSpouse: null, // true/false
    numChildren: null, // 0..4 (4=4人以上)
    assetsManyen: "", // 万円
    realEstate: null, // 割合バケット: 'low'|'mid'|'high'
  });
  const [result, setResult] = useState(null);
  const [aiComment, setAiComment] = useState(""); // AI総評（診断中に生成しておく）

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
        <Header />
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
          />
        )}
        <Footer />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="hdr">
      <div className="hdr-brand">
        <span className="mark" aria-hidden="true" />
        <span className="hdr-name">{CONFIG.brand}</span>
      </div>
      <div className="hdr-area">{CONFIG.areaLabel}の相続相談</div>
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
          <Choice
            active={form.hasSpouse === true}
            onClick={() => set({ hasSpouse: true })}
          >
            いる
          </Choice>
          <Choice
            active={form.hasSpouse === false}
            onClick={() => set({ hasSpouse: false })}
          >
            いない
          </Choice>
        </Question>

        <Question n="2" label="お子さまは何人ですか？">
          {[0, 1, 2, 3, 4].map((n) => (
            <Choice
              key={n}
              active={form.numChildren === n}
              onClick={() => set({ numChildren: n })}
            >
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
              onChange={(e) =>
                set({ assetsManyen: e.target.value.replace(/[^0-9]/g, "") })
              }
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
          <Choice
            active={form.realEstate === "low"}
            onClick={() => set({ realEstate: "low" })}
          >
            少なめ
          </Choice>
          <Choice
            active={form.realEstate === "mid"}
            onClick={() => set({ realEstate: "mid" })}
          >
            半分くらい
          </Choice>
          <Choice
            active={form.realEstate === "high"}
            onClick={() => set({ realEstate: "high" })}
          >
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

      <button
        className="btn btn-primary btn-block"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
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
    <button
      type="button"
      className={"choice" + (active ? " is-active" : "")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ---- AI診断の見せ方 ----
// 演出を見せつつ、その裏で /api/comment を叩いて総評を生成。
// 「最低表示時間(MIN_MS)」と「生成完了」の両方がそろってから結果画面へ遷移する。
// 万一APIが遅い/失敗しても、最大待ち時間(MAX_MS)で総評なしのまま先へ進む。
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
    const MIN_MS = 2200; // 演出を見せる最低時間
    const MAX_MS = 12000; // これを超えたら総評なしで先へ

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
      .catch(() => "") // 失敗時は総評なし（画面は成立する）
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
function ResultView({ result, form, aiComment, onReset }) {
  const { totalTax, basicDeduction, heirCount, taxable, issues, netAssets } = result;
  const [showRule, setShowRule] = useState(false);

  // メール登録フォーム
  const [lead, setLead] = useState({ name: "", email: "", optIn: false });
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
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
      // モック：実送信せず、GASへ渡る内容を画面に表示
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

      {/* AIによる総評（診断中に生成済みのものを表示。無ければ枠ごと非表示） */}
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
            <button className="btn btn-ghost">{it.cta} →</button>
          </article>
        ))}
      </div>

      {/* メール登録（＝Phase 1：結果メール送付＋同時にメール会員化） */}
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
              <span>
                相続のお役立ち情報や相談会のご案内を、メールで受け取る（任意）
              </span>
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

function Footer() {
  return (
    <footer className="ftr">
      <p>
        本診断は明示のルールによる概算で、税額を保証するものではありません。個別の税務相談は
        税理士が行います。表示内容は一般的な情報提供であり、特定の行動を助言するものでは
        ありません。{CONFIG.supervisor}。
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
  background:
    radial-gradient(120% 90% at 50% -10%, #F3F6F9 0%, var(--bg) 55%);
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
  padding:16px 22px;
  border-bottom:1px solid var(--line-soft);
  background:linear-gradient(180deg,#fff, #FBFCFD);
}
.hdr-brand{display:flex;align-items:center;gap:9px}
.mark{
  width:16px;height:16px;border-radius:4px;
  background:linear-gradient(135deg,var(--navy),var(--brass));
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.35);
}
.hdr-name{font-family:var(--mincho);font-weight:700;letter-spacing:.04em;color:var(--navy-deep)}
.hdr-area{font-size:12px;color:var(--ink-soft);letter-spacing:.02em}

/* intro */
.intro{padding:30px 24px 26px}
.eyebrow{
  font-size:11px;letter-spacing:.22em;color:var(--brass);
  font-weight:700;text-transform:none;margin-bottom:16px;
}
.h1{
  font-family:var(--mincho);font-weight:700;
  font-size:30px;line-height:1.42;letter-spacing:.02em;
  color:var(--navy-deep);margin:0 0 16px;
}
.h1 em{font-style:normal;color:var(--brass);}
.lead{font-size:15px;line-height:1.85;color:var(--ink-soft);margin:0 0 24px}
.intro-notes{
  list-style:none;padding:0;margin:20px 0 0;
  display:flex;flex-direction:column;gap:8px;
}
.intro-notes li{
  font-size:13px;color:var(--ink-soft);padding-left:20px;position:relative;
}
.intro-notes li::before{
  content:"";position:absolute;left:0;top:7px;width:8px;height:8px;
  border-radius:50%;background:var(--brass-soft);
}

/* buttons */
.btn{
  font-family:var(--gothic);font-weight:700;font-size:16px;
  border:none;border-radius:12px;cursor:pointer;
  padding:16px 26px;transition:transform .08s ease, box-shadow .2s ease, background .2s;
}
.btn:active{transform:translateY(1px)}
.btn-primary{
  background:linear-gradient(180deg,var(--navy),var(--navy-deep));
  color:#fff;box-shadow:0 12px 24px -12px rgba(23,50,87,.7);
}
.btn-primary:disabled{background:#B9C4CE;box-shadow:none;cursor:not-allowed;color:#EEF2F5}
.btn-block{width:100%}
.btn-ghost{
  background:transparent;color:var(--navy);
  border:1.5px solid var(--line);border-radius:10px;
  font-size:14px;font-weight:700;padding:11px 16px;
}
.btn-ghost:hover{border-color:var(--brass-soft);color:var(--navy-deep)}

/* form */
.form{padding:24px 22px 28px}
.q-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:26px}
.q-head{display:flex;align-items:baseline;gap:11px;margin-bottom:13px}
.q-n{
  font-family:var(--mincho);font-weight:700;color:#fff;
  background:var(--navy);border-radius:7px;
  width:26px;height:26px;flex:none;
  display:inline-flex;align-items:center;justify-content:center;
  font-size:14px;
}
.q-label{font-size:15.5px;font-weight:500;line-height:1.5;color:var(--ink)}
.q-choices{display:flex;flex-wrap:wrap;gap:9px}
.choice{
  font-family:var(--gothic);font-size:15px;font-weight:500;
  background:#fff;color:var(--ink);
  border:1.5px solid var(--line);border-radius:11px;
  padding:12px 20px;cursor:pointer;transition:all .15s;
}
.choice:hover{border-color:var(--brass-soft)}
.choice.is-active{
  background:var(--navy);color:#fff;border-color:var(--navy);
  box-shadow:0 8px 16px -10px rgba(23,50,87,.8);
}
.amount-row{display:flex;align-items:center;gap:10px}
.amount-input{
  font-family:var(--mincho);font-size:26px;font-weight:600;color:var(--navy-deep);
  width:100%;border:none;border-bottom:2px solid var(--line);
  background:transparent;padding:6px 2px;text-align:right;outline:none;
  transition:border-color .15s;
}
.amount-input:focus{border-color:var(--brass)}
.amount-unit{font-size:16px;color:var(--ink-soft);font-weight:500;flex:none}
.amount-hints{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.chip{
  font-family:var(--gothic);font-size:13px;color:var(--ink-soft);
  background:var(--line-soft);border:none;border-radius:20px;
  padding:7px 14px;cursor:pointer;transition:all .15s;
}
.chip:hover{background:var(--brass-soft);color:#fff}
.warn-inline{
  margin:22px 0 0;font-size:13.5px;line-height:1.7;color:var(--green);
  background:#EEF3EF;border-radius:10px;padding:13px 16px;
}
.micro{font-size:12px;color:var(--ink-soft);text-align:center;margin:14px 0 0;line-height:1.6}
.btn.btn-primary.btn-block{margin-top:26px}

/* diagnosing */
.diag{padding:56px 24px 60px;text-align:center}
.diag-orb{position:relative;width:132px;height:132px;margin:0 auto 30px}
.diag-orb .ring{
  position:absolute;inset:0;border-radius:50%;
  border:1.5px solid transparent;
}
.diag-orb .r1{border-top-color:var(--navy);animation:spin 1.6s linear infinite}
.diag-orb .r2{inset:16px;border-right-color:var(--brass);animation:spin 2.1s linear infinite reverse}
.diag-orb .r3{inset:32px;border-bottom-color:var(--green);animation:spin 1.3s linear infinite}
.diag-orb .core{
  position:absolute;inset:52px;border-radius:50%;
  background:radial-gradient(circle at 40% 35%, var(--brass-soft), var(--navy));
  animation:pulse 1.4s ease-in-out infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.14);opacity:1}}
.diag-label{font-family:var(--mincho);font-size:19px;font-weight:700;color:var(--navy-deep);letter-spacing:.06em;margin-bottom:22px}
.diag-steps{list-style:none;padding:0;margin:0;display:inline-flex;flex-direction:column;gap:12px;text-align:left}
.diag-steps li{
  font-size:14px;color:#AEB9C3;padding-left:26px;position:relative;transition:color .3s;
}
.diag-steps li::before{
  content:"";position:absolute;left:0;top:3px;width:15px;height:15px;border-radius:50%;
  border:1.5px solid #CDD6DE;transition:all .3s;
}
.diag-steps li.done{color:var(--ink)}
.diag-steps li.done::before{background:var(--green);border-color:var(--green)}

/* result */
.result{padding:28px 22px 30px}
.result-badge{
  display:inline-block;font-size:11px;font-weight:700;letter-spacing:.16em;
  color:var(--brass);border:1px solid var(--brass-soft);border-radius:20px;
  padding:5px 14px;margin-bottom:18px;
}
.result-kicker{font-size:13px;color:var(--ink-soft);margin:0 0 6px;letter-spacing:.03em}
.amount-hero{display:flex;align-items:baseline;gap:6px;margin:0 0 18px;color:var(--navy-deep)}
.amount-hero .yen{font-size:22px;font-family:var(--mincho);align-self:center}
.amount-hero .big{font-family:var(--mincho);font-weight:700;font-size:56px;line-height:1;letter-spacing:.01em}
.amount-hero .unit{font-size:24px;font-family:var(--mincho)}
.amount-hero.zero .big{font-size:34px;color:var(--green)}
.disclaimer-strong{
  font-size:13.5px;line-height:1.85;color:var(--ink);
  background:#F4F0E6;border-left:3px solid var(--brass);
  border-radius:0 10px 10px 0;padding:14px 16px;margin:0 0 18px;
}
.disclaimer-strong em{font-style:normal;font-weight:700;color:var(--navy-deep)}

/* AI総評 */
.ai-comment{
  margin:0 0 18px;padding:14px 16px;
  border:1px dashed var(--brass-soft);border-radius:12px;background:#FCFAF4;
}
.ai-comment-tag{
  font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--brass);margin-bottom:8px;
}
.ai-comment-body{font-size:13.5px;line-height:1.85;color:var(--ink);margin:0}

.rule-toggle{
  background:none;border:none;color:var(--navy);font-family:var(--gothic);
  font-size:13.5px;font-weight:700;cursor:pointer;padding:4px 0;
}
.rule-box{
  margin:12px 0 8px;font-size:13px;line-height:1.8;color:var(--ink-soft);
  background:#F6F8FA;border:1px solid var(--line-soft);border-radius:12px;padding:16px 18px;
}
.rule-box ul{margin:8px 0;padding-left:18px}
.rule-box li{margin:4px 0}
.rule-note{margin:10px 0 0;color:var(--green);font-size:12.5px}
.issues-title{
  font-family:var(--mincho);font-size:20px;font-weight:700;color:var(--navy-deep);
  margin:30px 0 16px;letter-spacing:.03em;
}
.issues{display:flex;flex-direction:column;gap:14px}
.issue{
  border:1px solid var(--line);border-radius:14px;padding:18px 18px 16px;
  background:linear-gradient(180deg,#fff,#FCFDFE);
}
.issue-tag{
  display:inline-block;font-size:11px;font-weight:700;letter-spacing:.1em;
  color:var(--green);background:#EBF1ED;border-radius:6px;padding:4px 9px;margin-bottom:10px;
}
.issue-h{font-family:var(--mincho);font-size:16.5px;font-weight:600;color:var(--navy-deep);margin:0 0 9px;line-height:1.5}
.issue-b{font-size:13.5px;line-height:1.8;color:var(--ink-soft);margin:0 0 14px}

.upsell{
  margin:28px 0 4px;padding:22px 20px;border-radius:16px;
  background:linear-gradient(180deg,#173257,#0E2340);color:#fff;text-align:center;
}
.upsell-h{font-family:var(--mincho);font-size:18px;font-weight:700;margin:0 0 8px;letter-spacing:.03em}
.upsell-b{font-size:13px;line-height:1.75;color:#C6D2E0;margin:0 0 16px}
.upsell .btn-primary:disabled{background:rgba(255,255,255,.16);color:#DCE5EF}

/* lead form */
.lead-form{display:flex;flex-direction:column;gap:12px;margin-top:16px;text-align:left}
.lead-input{
  font-family:var(--gothic);font-size:15px;color:var(--ink);
  background:#fff;border:1.5px solid transparent;border-radius:11px;
  padding:14px 15px;outline:none;transition:border-color .15s;
}
.lead-input::placeholder{color:#9AA7B4}
.lead-input:focus{border-color:var(--brass-soft)}
.lead-check{
  display:flex;align-items:flex-start;gap:10px;
  font-size:13px;line-height:1.6;color:#DCE5EF;cursor:pointer;padding:2px 0;
}
.lead-check input{
  appearance:none;-webkit-appearance:none;flex:none;
  width:20px;height:20px;margin-top:1px;border-radius:6px;
  border:1.5px solid #6E829A;background:rgba(255,255,255,.06);
  cursor:pointer;position:relative;transition:all .15s;
}
.lead-check input:checked{background:var(--brass);border-color:var(--brass)}
.lead-check input:checked::after{
  content:"✓";position:absolute;inset:0;color:#fff;font-size:13px;
  display:flex;align-items:center;justify-content:center;
}
.lead-err{font-size:13px;color:#F2C4B8;margin:-2px 0 0}
.upsell .btn.btn-primary.btn-block{margin-top:2px;background:var(--brass);box-shadow:none}
.upsell .btn.btn-primary.btn-block:hover{background:#b9995a}
.upsell .btn.btn-primary.btn-block:disabled{background:rgba(255,255,255,.16);color:#DCE5EF}
.lead-consent{font-size:11px;line-height:1.7;color:#9FB0C2;margin:4px 0 0}
.lead-consent a{color:#DCE5EF;text-underline-offset:2px}

/* done */
.upsell.done{text-align:center}
.done-check{
  width:52px;height:52px;border-radius:50%;margin:0 auto 14px;
  background:var(--brass);color:#fff;font-size:26px;
  display:flex;align-items:center;justify-content:center;
}
.payload{
  margin-top:16px;background:rgba(255,255,255,.06);border-radius:12px;
  padding:16px;text-align:left;
}
.payload-h{font-size:12px;font-weight:700;color:var(--brass-soft);letter-spacing:.04em;margin-bottom:10px}
.payload-list{margin:0;display:flex;flex-direction:column;gap:7px}
.payload-list > div{display:flex;justify-content:space-between;gap:12px;font-size:13px}
.payload-list dt{color:#9FB0C2;margin:0;flex:none}
.payload-list dd{color:#EEF3F8;margin:0;text-align:right}
.payload-note{font-size:11px;color:#8C9DAF;line-height:1.6;margin:12px 0 0}

.restart{
  display:block;margin:22px auto 0;background:none;border:none;
  color:var(--ink-soft);font-family:var(--gothic);font-size:13px;
  text-decoration:underline;text-underline-offset:3px;cursor:pointer;
}

/* footer */
.ftr{
  border-top:1px solid var(--line-soft);padding:20px 22px 22px;
  background:#F6F8FA;
}
.ftr p{font-size:11px;line-height:1.75;color:#8695A2;margin:0}
.ftr-brand{margin-top:8px !important;font-family:var(--mincho);color:#A6B0BB !important}

@media (max-width:420px){
  .h1{font-size:26px}
  .amount-hero .big{font-size:46px}
}
@media (prefers-reduced-motion: reduce){
  .diag-orb .ring,.diag-orb .core{animation:none}
}
`}</style>
  );
}