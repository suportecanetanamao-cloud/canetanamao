(() => {
"use strict";
const CFG = window.CNM_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL || /[?&]demo\b/.test(location.search);
const DAY = 864e5, REV = [1, 7, 30];
const L = "ABCD";
const $app = document.getElementById("app");
let sb = null, user = null, cargos = [], cargo = null, C = null, P = null, BY = {}, ASQ = {}, saveT = null;
let SES = null; // sessão de questões em andamento

// ---------- utilidades ----------
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const day0 = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
const ICON = {
  hoje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  estudar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/></svg>',
  erros: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  prog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
};
const LOGO = '<svg viewBox="0 0 100 100" width="34" height="34"><rect width="100" height="100" rx="26" fill="#1D3FD8"/><path d="M64 29 A 25 25 0 1 0 64 71" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"/><circle cx="73" cy="50" r="8.5" fill="#FFC727"/></svg>';

// ---------- dados ----------
async function loadContent(cg) {
  const key = "cnm-content-" + cg;
  if (DEMO) return (await fetch("data/" + cg + ".json")).json();
  let cache = null;
  try { cache = await caches.open("cnm-v1"); const r = await cache.match(key); if (r) { const j = await r.json(); if (j && j.questoes) { refreshContent(cg, cache, key); return j; } } } catch (e) { cache = null; }
  return refreshContent(cg, cache, key);
}
async function refreshContent(cg, cache, key) {
  const { data, error } = await sb.storage.from("conteudo").download(cg + ".json");
  if (error) throw error;
  const txt = await data.text();
  try { if (cache) await cache.put(key, new Response(txt, { headers: { "Content-Type": "application/json" } })); } catch (e) {}
  return JSON.parse(txt);
}
const emptyP = () => ({ studied: {}, rev: {}, revAt: {}, ans: {}, sims: [] });
async function loadProgress() {
  let local = null; try { local = JSON.parse(ls("cnm_p_" + cargo) || "null"); } catch (e) {}
  if (DEMO) return local || emptyP();
  const { data } = await sb.from("progresso").select("dados,atualizado").eq("cargo", cargo).maybeSingle();
  const remote = data && data.dados;
  if (remote && local && (local._t || 0) > (remote._t || 0)) return local;
  return remote || local || emptyP();
}
function save() {
  P._t = Date.now();
  ls("cnm_p_" + cargo, JSON.stringify(P));
  if (DEMO) return;
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const { error } = await sb.from("progresso").upsert({ user_id: user.id, cargo, dados: P, atualizado: new Date().toISOString() });
    if (error) console.warn("salvar progresso", error);
  }, 1200);
}

// ---------- regras de estudo ----------
const allAs = () => C.materias.flatMap(m => m.assuntos.map(a => Object.assign(a, { mat: m.m, matNome: m.nome })));
function status(code) {
  if (!P.studied[code]) return "new";
  const n = P.rev[code] || 0;
  if (n >= REV.length) return "done";
  return revDue(code) <= day0() ? "due" : "st";
}
function revDue(code) { const n = P.rev[code] || 0; if (!P.studied[code] || n >= REV.length) return Infinity; return day0(P.studied[code]) + REV[n] * DAY; }
function chip(code) {
  const s = status(code), n = P.rev[code] || 0;
  return { new: '<span class="chip new">Não estudado</span>', st: `<span class="chip st">Estudado · ${n}/3 revisões</span>`, due: `<span class="chip due">Revisar hoje</span>`, done: '<span class="chip ok">Revisado ✓</span>' }[s];
}
function asStats(code) {
  const ids = ASQ[code] || []; let f = 0, ok = 0;
  ids.forEach(id => { const a = P.ans[id]; if (a) { f++; if (a.ok) ok++; } });
  return { n: ids.length, f, ok };
}
const wrongIds = () => Object.keys(P.ans).filter(id => P.ans[id] && !P.ans[id].ok && BY[id]);
const redoToday = () => wrongIds().filter(id => day0(P.ans[id].t) < day0());
function nextAs() { for (const c of (C.seq && C.seq.length ? C.seq : allAs().map(a => a.code))) if (!P.studied[c] && AS[c]) return AS[c]; return null; }
let AS = {};

// ---------- telas ----------
function shell(active, body, top) {
  const nav = [["hoje", "Hoje", ICON.hoje], ["estudar", "Estudar", ICON.estudar], ["erros", "Erros", ICON.erros], ["progresso", "Progresso", ICON.prog]]
    .map(([k, t, i]) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${i}<span>${t}</span></a>`).join("");
  const tp = top || `<div class="brand">${LOGO}<div>caneta<small>na mão</small></div></div><div class="grow"></div><div class="sub">${esc(C.nome)}</div>`;
  $app.innerHTML = `<div class="shell"><div class="top">${tp}</div><div class="main">${body}</div><nav class="nav"><div class="nbrand">${LOGO}<div>caneta<small>na mão</small></div></div>${nav}</nav></div>`;
  window.scrollTo(0, 0);
}
const backTop = (title, sub, href) => `<button class="back" onclick="${href ? `location.hash='${href}'` : "history.back()"}" aria-label="Voltar">‹</button><div class="grow"><div class="ttl">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>`;

function viewHoje() {
  const all = allAs(), est = all.filter(a => P.studied[a.code]).length;
  const dias = Math.max(0, Math.ceil((new Date(C.prova + "T08:00:00") - Date.now()) / DAY));
  const due = all.filter(a => status(a.code) === "due");
  const redo = redoToday(), nx = nextAs();
  const feitas = Object.keys(P.ans).length, acertos = Object.values(P.ans).filter(a => a.ok).length;
  const nome = (user.email || "").split("@")[0];
  let tasks = "";
  if (due.length) tasks += `<a class="card task" href="#/revisoes"><div class="ic">🔁</div><div class="grow"><div class="t">${due.length} ${due.length > 1 ? "revisões" : "revisão"} para hoje</div><div class="muted">${esc(due.slice(0, 2).map(a => a.titulo).join(" · "))}${due.length > 2 ? "…" : ""}</div></div><div class="go">›</div></a>`;
  if (redo.length) tasks += `<a class="card task" href="#/q/erros/hoje"><div class="ic">✗</div><div class="grow"><div class="t">Refazer ${redo.length} ${redo.length > 1 ? "questões erradas" : "questão errada"}</div><div class="muted">Errou antes de hoje? Tente de novo.</div></div><div class="go">›</div></a>`;
  if (nx) tasks += `<a class="card task" href="#/a/${nx.code}"><div class="ic">📖</div><div class="grow"><div class="t">Próximo assunto</div><div class="muted">${esc(nx.matNome)} · ${esc(nx.titulo)}</div></div><div class="go">›</div></a>`;
  if (!tasks) tasks = `<div class="card empty"><div class="e">🎉</div>Tudo em dia! Faça um simulado em Progresso.</div>`;
  shell("hoje", `
  <div class="hero"><div class="muted" style="font-weight:700">Olá, ${esc(nome)} 👋</div>
    <div class="row" style="margin-top:10px;align-items:flex-end"><div class="grow"><div class="big">${dias}</div><div class="muted">dias para a prova · 14/02/2027</div></div>
    <div style="text-align:right"><div style="font-size:26px;font-weight:800">${pct(est, all.length)}%</div><div class="muted">do edital estudado</div></div></div>
    <div class="bar" style="margin-top:14px"><i style="width:${pct(est, all.length)}%"></i></div></div>
  <h2 class="sec">Para hoje</h2><div class="stack">${tasks}</div>
  <h2 class="sec">Seus números</h2>
  <div class="grid2"><div class="card stat"><b>${est}/${all.length}</b><span>assuntos estudados</span></div><div class="card stat"><b>${feitas}</b><span>questões feitas</span></div>
  <div class="card stat"><b>${feitas ? pct(acertos, feitas) + "%" : "–"}</b><span>de acertos</span></div><div class="card stat"><b>${wrongIds().length}</b><span>no caderno de erros</span></div></div>
  <p class="muted" style="margin-top:18px">Ciclo de cada assunto: leia a teoria → faça as questões → revise em 1, 7 e 30 dias. O app agenda as revisões para você.</p>`);
}

function viewRevisoes() {
  const due = allAs().filter(a => status(a.code) === "due");
  const prox = allAs().filter(a => status(a.code) === "st").sort((a, b) => revDue(a.code) - revDue(b.code)).slice(0, 8);
  shell("hoje", `<h1 class="pg">Revisões</h1>
  ${due.length ? due.map(asRow).join("") : '<div class="card empty"><div class="e">✅</div>Nenhuma revisão para hoje.</div>'}
  ${prox.length ? `<h2 class="sec">Próximas</h2>` + prox.map(a => asRow(a, new Date(revDue(a.code)).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }))).join("") : ""}`, backTop("Revisões", "", "#/hoje"));
}

function asRow(a, when) {
  const s = asStats(a.code), st = status(a.code);
  const ac = s.f ? ` · ${pct(s.ok, s.f)}% de acerto` : "";
  return `<a class="as ${st !== "new" ? "done" : ""}" href="#/a/${a.code}"><div class="n">${String(a.n).padStart(2, "0")}</div><div class="grow"><div class="t">${esc(a.titulo)}</div>
  <div class="m">${chip(a.code)}${when ? `<span>revisar em ${when}</span>` : ""}<span>caiu em ${a.pct}% das provas</span><span>${s.n} questões${ac}</span></div></div></a>`;
}

function viewEstudar(m) {
  m = m || ls("cnm_tab") || C.materias[0].m; ls("cnm_tab", m);
  const mat = C.materias.find(x => x.m === m) || C.materias[0];
  const tabs = C.materias.map(x => `<button class="${x.m === mat.m ? "on" : ""}" onclick="location.hash='#/estudar/${x.m}'">${esc(x.nome.replace("Raciocínio Lógico e Matemático", "Raciocínio Lógico").replace("Conhecimentos ", "Conh. "))}</button>`).join("");
  const est = mat.assuntos.filter(a => P.studied[a.code]).length;
  shell("estudar", `<h1 class="pg">Estudar</h1><div class="tabs">${tabs}</div>
  <div class="mat"><h3><span>${esc(mat.nome)}</span><span class="muted">${est}/${mat.assuntos.length} estudados</span></h3>
  <p class="muted" style="margin:0 0 10px">Na ordem do que mais cai nas provas da ACCESS.</p>${mat.assuntos.map(a => asRow(a)).join("")}</div>`);
}

function watermark() {
  const t = esc(user.email || "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><text x='10' y='100' transform='rotate(-20 160 90)' font-family='sans-serif' font-size='14' fill='%230B1747'>${t}</text></svg>`;
  return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
}

function viewAssunto(code) {
  const a = AS[code]; if (!a) return go("#/estudar");
  P.last = code; save();
  const st = status(code), s = asStats(code), n = P.rev[code] || 0;
  let act = "";
  if (st === "new") act = `<button class="btn y grow" id="bStudy">✓ Marcar como estudado</button>`;
  else if (st === "due") act = `<button class="btn y grow" id="bRev">✓ Concluir ${n + 1}ª revisão</button>`;
  const qb = s.n ? `<a class="btn b grow" href="#/q/a/${code}">Questões (${s.n})</a>` : "";
  const info = st === "new" ? "" : `<div class="card" style="margin-bottom:12px"><div class="row"><div class="grow"><div style="font-weight:800">${st === "done" ? "Assunto revisado ✓" : st === "due" ? "Hora de revisar!" : "Próxima revisão em " + new Date(revDue(code)).toLocaleDateString("pt-BR")}</div><div class="muted">Estudado em ${new Date(P.studied[code]).toLocaleDateString("pt-BR")}${s.f ? ` · ${s.f}/${s.n} questões feitas · ${pct(s.ok, s.f)}% de acerto` : ""}</div></div></div><div class="rvl">${REV.map((d, i) => `<span class="${i < n ? "d" : ""}"></span>`).join("")}</div></div>`;
  shell("estudar", `${info}<div class="kick">${esc(a.matNome)} · assunto ${String(a.n).padStart(2, "0")}</div><h1 class="pg">${esc(a.titulo)}</h1>
  ${a.tags ? `<p class="muted" style="margin-top:-8px">${esc(a.tags)}</p>` : ""}
  <div class="teoria"><div class="wm"></div>${a.html}</div>
  ${act || qb ? `<div class="endbar">${act}${qb}</div>` : ""}`, backTop(a.titulo, a.matNome));
  const wm = document.querySelector('.wm'); if (wm) wm.style.backgroundImage = watermark();
  const b1 = document.getElementById("bStudy"); if (b1) b1.onclick = () => { P.studied[code] = Date.now(); P.rev[code] = 0; save(); toast("Estudado! Revisão marcada para amanhã."); viewAssunto(code); };
  const b2 = document.getElementById("bRev"); if (b2) b2.onclick = () => { P.rev[code] = n + 1; (P.revAt[code] = P.revAt[code] || []).push(Date.now()); save(); toast(n + 1 >= 3 ? "Revisões completas! 🎉" : "Revisão feita!"); viewAssunto(code); };
}

// ---------- questões ----------
function startSession(mode, arg) {
  let ids = [], title = "";
  if (mode === "a") { ids = (ASQ[arg] || []).slice(); title = AS[arg] ? AS[arg].titulo : "Questões"; }
  else if (mode === "erros") { ids = arg === "hoje" ? redoToday() : arg && arg !== "todos" ? wrongIds().filter(id => BY[id].a === arg || BY[id].m === arg) : wrongIds(); title = "Refazer erradas"; ids.sort((x, y) => BY[x].num - BY[y].num); }
  else if (mode === "sim") {
    title = "Simulado"; const pool = {};
    Object.values(BY).forEach(q => { (pool[q.m] = pool[q.m] || []).push(q.id); });
    ["LP", "RL", "CG", "CE"].forEach(m => { const p = (pool[m] || []).sort(() => Math.random() - .5); ids.push(...p.slice(0, 10)); });
  }
  if (!ids.length) { toast("Nenhuma questão aqui."); return go("#/hoje"); }
  SES = { mode, arg, ids, i: 0, res: {}, title, t0: Date.now() };
  renderQ();
}

function renderQ() {
  const S = SES, id = S.ids[S.i], q = BY[id], done = S.res[id];
  const hasAlts = q.alts && q.alts.length;
  const stem = q.fig ? `<img class="qfig" src="${q.fig}" alt="Questão ${q.num}">${q.stem ? `<div class="qstem" style="margin-top:10px">${q.stem}</div>` : ""}` : `<div class="qstem">${q.stem}</div>`;
  const txb = q.tx && C.textos[q.tx] ? `<p><button class="txbtn" id="bTx">📄 Ver o texto da questão</button></p>` : "";
  const alts = (hasAlts ? q.alts : ["", "", "", ""]).map((t, i) => {
    let cls = "alt";
    if (done) { if (L[i] === q.r) cls += " right"; else if (L[i] === done.a) cls += " wrong"; }
    else if (S.sel === L[i]) cls += " sel";
    return `<button class="${cls}" data-l="${L[i]}" ${done ? "disabled" : ""}><span class="l">${L[i]}</span><span class="grow">${t || (hasAlts ? "" : "Alternativa " + L[i])}</span></button>`;
  }).join("");
  let fb = "";
  if (done) fb = `<div class="fb ${done.ok ? "ok" : "bad"}"><b class="h">${done.ok ? "✓ Acertou!" : "✗ Resposta certa: " + q.r}</b>${q.k || ""}${q.w ? `<div class="w">⚠ ${q.w}</div>` : ""}</div>`;
  const last = S.i === S.ids.length - 1;
  const btn = done ? `<button class="btn b grow" id="bNext">${last ? "Ver resultado" : "Próxima ›"}</button>` : `<button class="btn y grow" id="bOk" ${S.sel ? "" : "disabled"}>Confirmar</button>`;
  const prevA = !done && P.ans[id] ? `<span class="chip ${P.ans[id].ok ? "ok" : "due"}">${P.ans[id].ok ? "já acertou" : "já errou"}</span>` : "";
  shell(S.mode === "a" ? "estudar" : S.mode === "erros" ? "erros" : "progresso", `
  <div class="qhead"><span>Questão ${S.i + 1} de ${S.ids.length}</span>${prevA}<span>${esc(q.o)} · ${esc(q.y)}</span></div>
  <div class="qprog"><i style="width:${pct(S.i + (done ? 1 : 0), S.ids.length)}%"></i></div>
  <div class="card">${txb}${stem}<div class="alts">${alts}</div>${fb}</div>
  <div class="qnav">${S.i > 0 ? '<button class="btn w" id="bPrev">‹</button>' : ""}${btn}</div>`, backTop(S.title, `Questão ${q.num} do Caderno`, S.mode === "a" ? "#/a/" + S.arg : S.mode === "erros" ? "#/erros" : "#/progresso"));
  document.querySelectorAll(".alt").forEach(b => b.onclick = () => { S.sel = b.dataset.l; renderQ(); });
  const ok = document.getElementById("bOk"); if (ok) ok.onclick = () => {
    const right = S.sel === q.r; S.res[id] = { a: S.sel, ok: right };
    const prev = P.ans[id]; P.ans[id] = { a: S.sel, ok: right, t: Date.now(), n: (prev ? prev.n || 1 : 0) + 1, everWrong: !!(prev && (!prev.ok || prev.everWrong)) || !right };
    S.sel = null; save(); renderQ();
    setTimeout(() => { const f = document.querySelector(".fb"); if (f) f.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 50);
  };
  const nx = document.getElementById("bNext"); if (nx) nx.onclick = () => { if (last) return summary(); S.i++; S.sel = null; renderQ(); };
  const pv = document.getElementById("bPrev"); if (pv) pv.onclick = () => { S.i--; S.sel = null; renderQ(); };
  const tx = document.getElementById("bTx"); if (tx) tx.onclick = () => sheet("Texto · " + C.textos[q.tx].src, C.textos[q.tx].html);
}

function summary() {
  const S = SES, r = Object.values(S.res), ok = r.filter(x => x.ok).length;
  if (S.mode === "sim") { P.sims = P.sims || []; P.sims.push({ t: Date.now(), ok, n: S.ids.length }); save(); }
  const msg = pct(ok, r.length) >= 70 ? "Mandou bem! Na revisão, refaça só as erradas." : pct(ok, r.length) >= 50 ? "Bom caminho. As erradas foram para o seu caderno de erros." : "Volte na teoria e refaça as erradas amanhã.";
  const back = S.mode === "a" ? `<a class="btn w full" href="#/a/${S.arg}">Voltar ao assunto</a>` : `<a class="btn w full" href="#/hoje">Voltar ao início</a>`;
  shell("hoje", `<div class="card sum"><div class="kick">${esc(S.title)}</div><div class="big" style="margin-top:10px">${ok}/${r.length}</div><div class="muted">${pct(ok, r.length)}% de acertos</div><p>${msg}</p>
  <div class="stack">${r.length - ok ? `<a class="btn y full" href="#/erros">Ver as erradas</a>` : ""}${back}</div></div>`, backTop("Resultado", "", "#/hoje"));
  SES = null;
}

function sheet(title, html) {
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div class="in"><div class="hd"><span>${esc(title)}</span><button aria-label="Fechar">×</button></div><div class="bd">${html}</div></div>`;
  d.onclick = e => { if (e.target === d || e.target.closest(".hd button")) d.remove(); };
  document.body.appendChild(d);
}

function viewErros() {
  const w = wrongIds(), by = {};
  w.forEach(id => { const a = BY[id].a; (by[a] = by[a] || []).push(id); });
  const rows = allAs().filter(a => by[a.code]).map(a => `<a class="as" href="#/q/erros/${a.code}"><div class="n" style="background:var(--badbg);color:var(--bad)">${by[a.code].length}</div><div class="grow"><div class="t">${esc(a.titulo)}</div><div class="m"><span>${esc(a.matNome)}</span></div></div><div class="go" style="color:var(--blue);font-weight:800">Refazer ›</div></a>`).join("");
  const fixed = Object.values(P.ans).filter(a => a.ok && a.everWrong).length;
  shell("erros", `<h1 class="pg">Caderno de erros</h1>
  ${w.length ? `<p class="muted">Toda questão que você errar vem para cá. Quando acertar de novo, ela sai da lista.${fixed ? ` Você já recuperou <b>${fixed}</b>.` : ""}</p><a class="btn y full" href="#/q/erros/todos">Refazer todas (${w.length})</a><div class="mat">${rows}</div>`
    : `<div class="card empty"><div class="e">🙌</div>Nenhuma questão errada por enquanto.${fixed ? `<br>Você já recuperou ${fixed} questões.` : ""}<br><br><a class="btn b" href="#/estudar">Ir estudar</a></div>`}`);
}

function viewProgresso() {
  const all = allAs();
  const mats = C.materias.map(m => {
    let f = 0, ok = 0, n = 0; m.assuntos.forEach(a => { const s = asStats(a.code); f += s.f; ok += s.ok; n += s.n; });
    const est = m.assuntos.filter(a => P.studied[a.code]).length;
    return `<div class="card"><div class="row"><div class="grow" style="font-weight:800">${esc(m.nome)}</div><div class="muted">${est}/${m.assuntos.length}</div></div>
    <div class="bar" style="margin:8px 0"><i style="width:${pct(est, m.assuntos.length)}%"></i></div><div class="muted">${f}/${n} questões feitas${f ? ` · <b style="color:var(--ink)">${pct(ok, f)}% de acerto</b>` : ""}</div></div>`;
  }).join("");
  const weak = all.map(a => ({ a, s: asStats(a.code) })).filter(x => x.s.f >= 3).sort((x, y) => x.s.ok / x.s.f - y.s.ok / y.s.f).slice(0, 5).filter(x => x.s.ok / x.s.f < .7);
  const sims = (P.sims || []).slice(-5).reverse();
  shell("progresso", `<h1 class="pg">Meu progresso</h1>${mats}
  <h2 class="sec">Pontos fracos</h2>${weak.length ? weak.map(x => asRow(x.a)).join("") : '<p class="muted">Faça pelo menos 3 questões de um assunto para aparecer aqui.</p>'}
  <h2 class="sec">Simulado</h2><div class="card"><div style="font-weight:800">40 questões, 10 de cada matéria, como na prova</div><p class="muted">Sorteadas do Caderno. Para passar: 20 acertos e pelo menos 1 em cada matéria.</p><a class="btn b full" href="#/q/sim/novo">Fazer um simulado</a>
  ${sims.length ? `<div class="muted" style="margin-top:12px">${sims.map(s => `${new Date(s.t).toLocaleDateString("pt-BR")}: <b>${s.ok}/${s.n}</b>`).join(" · ")}</div>` : ""}</div>
  <h2 class="sec">Conta</h2><div class="card"><div class="muted">Entrou como <b>${esc(user.email)}</b>${cargos.length > 1 ? ` · ${cargos.length} kits` : ""}</div>
  <p class="muted">Os PDFs da apostila, do caderno e do bônus, com o seu nome, foram enviados para o e-mail da compra. Dúvidas: <a href="mailto:${esc(CFG.SUPORTE)}">${esc(CFG.SUPORTE)}</a></p>
  <div class="stack">${cargos.length > 1 ? `<button class="btn g full" id="bKit">Trocar de kit</button>` : ""}${DEMO ? "" : `<button class="btn w full" id="bOut">Sair</button>`}</div></div>`);
  const o = document.getElementById("bOut"); if (o) o.onclick = async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); };
  const k = document.getElementById("bKit"); if (k) k.onclick = () => { ls("cnm_cargo", ""); location.reload(); };
}

// ---------- roteador ----------
function go(h) { location.hash = h; }
function route() {
  if (!C) return;
  document.querySelectorAll('.sheet').forEach(x => x.remove());
  const p = (location.hash || "#/hoje").slice(2).split("/");
  if (p[0] !== "q" && SES && SES.ids.length && Object.keys(SES.res).length && p[0] !== "") SES = null;
  switch (p[0]) {
    case "estudar": return viewEstudar(p[1]);
    case "a": return viewAssunto(p[1]);
    case "q": return SES && SES.mode === p[1] && SES.arg === p[2] ? renderQ() : startSession(p[1], p[2]);
    case "erros": return viewErros();
    case "progresso": return viewProgresso();
    case "revisoes": return viewRevisoes();
    default: return viewHoje();
  }
}
window.addEventListener("hashchange", route);

// ---------- login ----------
function viewLogin(msg) {
  $app.innerHTML = `<div class="login"><div class="box"><div class="brand" style="color:var(--navy);margin-bottom:18px">${LOGO}<div>caneta<small style="color:var(--blue)">na mão</small></div></div>
  <h1 class="pg" style="margin-bottom:6px">Entrar no app</h1><p class="muted">Use o e-mail da sua compra. Vamos mandar um código de acesso.</p>
  <form id="fE"><input type="email" id="em" required placeholder="seu@email.com" autocomplete="email" value="${esc(ls("cnm_email") || "")}"><div class="err">${esc(msg || "")}</div><button class="btn y full">Receber código</button></form>
  <form id="fC" hidden><p class="muted" id="sentTo"></p><input class="code" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••"><div class="err" id="er2"></div><button class="btn y full">Entrar</button><button type="button" class="btn w full" id="bBack" style="margin-top:8px">Trocar e-mail</button></form>
  <p class="muted" style="margin-top:18px;font-size:13px">Ainda não tem o kit? <a href="${esc(CFG.SITE)}">Conheça aqui</a></p></div></div>`;
  const fE = document.getElementById("fE"), fC = document.getElementById("fC");
  fE.onsubmit = async e => {
    e.preventDefault(); const email = document.getElementById("em").value.trim().toLowerCase(); ls("cnm_email", email);
    const b = fE.querySelector("button"); b.disabled = true; b.textContent = "Enviando...";
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    b.disabled = false; b.textContent = "Receber código";
    if (error) { fE.querySelector(".err").textContent = /rate|seconds/i.test(error.message) ? "Aguarde um minuto e tente de novo." : "Não deu para enviar. Confira o e-mail."; return; }
    fE.hidden = true; fC.hidden = false; document.getElementById("sentTo").innerHTML = `Enviamos um código para <b>${esc(email)}</b>. Veja também no spam.`; document.getElementById("cd").focus();
  };
  document.getElementById("bBack").onclick = () => { fC.hidden = true; fE.hidden = false; };
  fC.onsubmit = async e => {
    e.preventDefault(); const email = ls("cnm_email"), token = document.getElementById("cd").value.replace(/\D/g, "");
    const b = fC.querySelector("button"); b.disabled = true;
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    b.disabled = false;
    if (error) { document.getElementById("er2").textContent = "Código inválido ou vencido."; return; }
    boot();
  };
}

function viewSemAcesso() {
  $app.innerHTML = `<div class="login"><div class="box"><h1 class="pg">Não achamos uma compra com este e-mail</h1>
  <p class="muted">Você entrou como <b>${esc(user.email)}</b>. Entre com o mesmo e-mail que usou na compra.</p>
  <p class="muted">Acabou de comprar? A liberação leva alguns minutos depois da confirmação do pagamento. Se não liberar, escreva para <a href="mailto:${esc(CFG.SUPORTE)}">${esc(CFG.SUPORTE)}</a>.</p>
  <div class="stack"><button class="btn y full" onclick="location.reload()">Tentar de novo</button><button class="btn w full" id="bOut">Entrar com outro e-mail</button><a class="btn g full" href="${esc(CFG.SITE)}">Conhecer os kits</a></div></div></div>`;
  document.getElementById("bOut").onclick = async () => { await sb.auth.signOut(); location.reload(); };
}

function viewEscolha() {
  const N = { tec: "Técnico em Enfermagem", adm: "Oficial Administrativo", acs: "Agente Comunitário de Saúde", as: "Assistente Social" };
  $app.innerHTML = `<div class="login"><div class="box"><h1 class="pg">Qual kit você quer estudar?</h1><div class="stack">${cargos.map(c => `<button class="btn b full" data-c="${c}">${esc(N[c] || c)}</button>`).join("")}</div></div></div>`;
  document.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { ls("cnm_cargo", b.dataset.c); boot(); });
}

// ---------- início ----------
async function boot() {
  try {
    if (DEMO) { user = { id: "demo", email: "aluna.demo@email.com" }; cargos = ["tec"]; }
    else {
      sb = sb || supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await sb.auth.getSession();
      if (!data.session) return viewLogin();
      user = data.session.user;
      const r = await sb.from("acessos").select("cargo");
      cargos = [...new Set((r.data || []).map(x => x.cargo))];
      if (!cargos.length) return viewSemAcesso();
    }
    const pref = ls("cnm_cargo");
    cargo = cargos.includes(pref) ? pref : cargos.length === 1 ? cargos[0] : null;
    if (!cargo) return viewEscolha();
    ls("cnm_cargo", cargo);
    $app.innerHTML = '<div class="boot"><div class="spin"></div></div>';
    [C, P] = await Promise.all([loadContent(cargo), loadProgress()]);
    P = Object.assign(emptyP(), P || {});
    BY = C.questoes; ASQ = {}; AS = {};
    allAs().forEach(a => { AS[a.code] = a; ASQ[a.code] = a.q.filter(id => BY[id]); });
    route();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="login"><div class="box"><h1 class="pg">Não foi possível carregar</h1><p class="muted">Confira sua internet e tente de novo.</p><button class="btn y full" onclick="location.reload()">Tentar de novo</button></div></div>`;
  }
}
if ("serviceWorker" in navigator && !DEMO) navigator.serviceWorker.register("sw.js").catch(() => {});
boot();
})();
