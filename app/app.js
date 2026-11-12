(() => {
"use strict";
const CFG = window.CNM_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL || /[?&]demo\b/.test(location.search);
const DAY = 864e5, REV = [1, 7, 15];
const L = "ABCD";
const $app = document.getElementById("app");
let sb = null, user = null, cargos = [], cargo = null, C = null, P = null, BY = {}, ASQ = {}, saveT = null;
let ACC = [], TRIAL = false, PLANO = false, AUDIO = false, BASES = [], GUEST = false, NOME_ACESSO = "", INSTALL = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); INSTALL = e; });
const base = c => c.replace(/-(amostra|plano|audio)$/, "");
let SES = null; // sessão de questões em andamento

// ---------- utilidades ----------
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const day0 = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
function toast(msg, ms) { document.querySelectorAll(".toast").forEach(x => x.remove()); const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), ms || 2200); }
const ICON = {
  hoje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/></svg>',
  estudar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/></svg>',
  erros: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  prog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  perfil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>'
};
const LOGO = '<svg viewBox="0 0 100 100" width="34" height="34"><rect width="100" height="100" rx="26" fill="#1D3FD8"/><path d="M64 29 A 25 25 0 1 0 64 71" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"/><circle cx="73" cy="50" r="8.5" fill="#FFC727"/></svg>';

// ---------- dados ----------
async function loadContent(cg) {
  const key = "cnm-content-" + cg;
  if (DEMO) return (await fetch("data/" + cg + ".json?v=" + Date.now())).json();
  if (GUEST) { const r = await fetch("data/" + cg + ".json?v=3"); if (!r.ok) throw new Error("amostra"); return r.json(); }
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
  if (DEMO || GUEST) return local || emptyP();
  const { data } = await sb.from("progresso").select("dados,atualizado").eq("cargo", cargo).maybeSingle();
  const remote = data && data.dados;
  if (remote && local && (local._t || 0) > (remote._t || 0)) return local;
  return remote || local || emptyP();
}
function save() {
  P._t = Date.now();
  ls("cnm_p_" + cargo, JSON.stringify(P));
  if (DEMO || GUEST) return;
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const { error } = await sb.from("progresso").upsert({ user_id: user.id, cargo, dados: P, atualizado: new Date().toISOString() });
    if (error) console.warn("salvar progresso", error);
  }, 1200);
}

// ---------- nome ----------
function nomeUser() {
  const n = ls("cnm_nome") || (user && user.user_metadata && user.user_metadata.nome) || NOME_ACESSO || "";
  return n.trim().split(/\s+/)[0] ? n.trim() : "";
}
const primeiro = () => { const n = nomeUser(); return n ? n.split(/\s+/)[0].replace(/^./, c => c.toUpperCase()) : ""; };
async function salvaNome(n) {
  n = String(n || "").trim().slice(0, 40); ls("cnm_nome", n);
  if (sb && user && !GUEST && !DEMO) { try { await sb.auth.updateUser({ data: { nome: n } }); } catch (e) {} }
}
function editaNome(depois) {
  sheet("Como você quer ser chamado(a)?", `<input id="nmIn" class="inp" maxlength="40" placeholder="Seu nome" value="${esc(nomeUser())}"><button class="btn y full" id="nmOk" style="margin-top:12px">Salvar</button>`);
  const i = document.getElementById("nmIn"); i.focus();
  document.getElementById("nmOk").onclick = async () => { await salvaNome(i.value); document.querySelectorAll(".sheet").forEach(x => x.remove()); toast("Nome salvo!"); (depois || route)(); };
}
const RITMO = { "1h": { n: 3, t: "1 hora por dia" }, "2h": { n: 4, t: "2 horas por dia" }, "3h": { n: 6, t: "3 horas por dia" } };
function semana0() { const d = new Date(day0()); const w = (d.getDay() + 6) % 7; return d.getTime() - w * DAY; }

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
  if (AS[code] && AS[code].bloq) return { n: AS[code].nq || 0, f: 0, ok: 0 };
  ids.forEach(id => { const a = P.ans[id]; if (a) { f++; if (a.ok) ok++; } });
  return { n: ids.length, f, ok };
}
const wrongIds = () => Object.keys(P.ans).filter(id => P.ans[id] && !P.ans[id].ok && BY[id]);
const redoToday = () => wrongIds().filter(id => day0(P.ans[id].t) < day0());
function nextAs() { for (const c of (C.seq && C.seq.length ? C.seq : allAs().map(a => a.code))) if (!P.studied[c] && AS[c] && !AS[c].bloq) return AS[c]; return null; }
let AS = {};

// ---------- estímulos ----------
const ELOGIO = ["Mandou bem!", "Isso aí! 👏", "Arrasou!", "Na mosca! 🎯", "Que fera! 🦁", "Show de bola!", "Perfeito!", "Resposta de quem vai passar! 💪", "A banca que lute! 😎", "Você manda muito!", "Nível aprovação! 🏆", "Tá voando! ✈️"];
const CONSOLO = ["Quase! Leia o comentário 👇", "Errar aqui é melhor que errar na prova 😉", "Agora você não esquece mais!", "Faz parte! Bora pra próxima 💪", "Essa vai pro caderno de erros e volta mais forte!"];
const COMBO = { 3: "🔥 3 seguidas!", 5: "🔥 5 seguidas! Imparável!", 7: "🔥 7 seguidas! Que sequência!", 10: "🔥 10 seguidas! Lenda!", 15: "🔥 15 seguidas! Ninguém te segura!" };
const sorteia = a => a[Math.floor(Math.random() * a.length)];
const NIVEIS = [[0, "Iniciante"], [200, "Aprendiz"], [600, "Dedicação total"], [1500, "Concurseiro(a) raiz"], [3000, "Fera da ACCESS"], [6000, "Quase servidor(a)"], [10000, "Aprovação à vista"], [16000, "Lenda de Birigui"]];
function nivel(xp = P.xp || 0) { let i = 0; NIVEIS.forEach(([m], k) => { if (xp >= m) i = k; }); const prox = NIVEIS[i + 1]; return { n: i + 1, nome: NIVEIS[i][1], de: NIVEIS[i][0], ate: prox ? prox[0] : null, prox: prox ? prox[1] : null }; }
function frasePct(t) { return t >= 1 ? "Gabaritou! Perfeito! 🏆" : t >= .9 ? "Incrível! Isso é nível aprovação! 🤩" : t >= .8 ? "Muito bom! Você está mandando muito! 💪" : t >= .7 ? "Bom demais! Passou com folga! 👏" : t >= .5 ? "Tá no caminho! Cada erro é uma pegadinha a menos na prova." : "Calma, todo mundo começa assim. Releia a teoria e volta mais forte! 💙"; }
function boasVindas() {
  const k = "cnm_bv_" + cargo; if (ls(k) === String(day0())) return; ls(k, String(day0()));
  const st = streak(), nm = primeiro(), ontem = (P.days || {})[String(day0() - DAY)];
  if (!Object.keys(P.ans).length) return;
  if (st > 0 && ontem) toast(`${nm ? nm + ", que" : "Que"} bom te ver! 🔥 ${st} ${st > 1 ? "dias seguidos" : "dia seguido"}. Não deixa o fogo apagar!`, 4500);
  else toast(`${nm ? "Sentimos sua falta, " + nm + "!" : "Sentimos sua falta!"} Bora começar uma sequência nova hoje? 🔥`, 4500);
}

// ---------- trilha (estilo Duolingo) ----------
const MATCOR = { LP: "#1D3FD8", RL: "#6B3FD4", CG: "#0F7B6C", CE: "#0B1747" };
const MATAB = { LP: "Português", RL: "Raciocínio", CG: "Conh. Gerais", CE: "Específicos" };
const FASE_N = 10, REV_N = 5, PASSA = 0.7, BLOCO = 5;
const XP = { certa: 10, errada: 2, fase: 50, rev: 20, bloco: 100, sem: 80, qz: 120 };
function seqCodes() { const s = (C.seq && C.seq.length ? C.seq : allAs().map(a => a.code)).filter(c => AS[c]); return s; }
function addXP(n) { if (!n) return; const nv0 = nivel().n; P.xp = (P.xp || 0) + n; if (nivel().n > nv0) P._lvup = nivel().n; const k = String(day0()); P.days = P.days || {}; P.days[k] = (P.days[k] || 0) + n; if (SES) SES.xp = (SES.xp || 0) + n; }
function streak() {
  const d = P.days || {}; let t = day0(), n = 0;
  if (!d[t]) t -= DAY;
  while (d[t]) { n++; t -= DAY; }
  return n;
}
const hasQ = code => (ASQ[code] || []).length > 0;
const passed = code => !!(P.pass && P.pass[code]);
function stars(code) { return (P.star && P.star[code]) || 0; }
function unlocked(code, i, seq) {
  const a = AS[code]; if (!a || a.bloq) return false;
  if (TRIAL) return true;
  return i === 0 || passed(seq[i - 1]) || passed(code) || !!P.studied[code];
}
function rusty(code) { const d = revDue(code); return d !== Infinity && day0() - d >= 3 * DAY; }
// ordem das questões: erradas primeiro, depois as nunca feitas, depois as mais antigas
function pick(ids, n) {
  const w = [], u = [], r = [];
  ids.forEach(id => { const a = P.ans[id]; if (!a) u.push(id); else if (!a.ok) w.push(id); else r.push(id); });
  r.sort((x, y) => (P.ans[x].t || 0) - (P.ans[y].t || 0));
  return [...w, ...u, ...r].slice(0, n);
}
function migraTrilha() {
  P.pass = P.pass || {}; P.star = P.star || {}; P.wk = P.wk || {}; P.qz = P.qz || []; P.blk = P.blk || {}; P.med = P.med || {}; P.days = P.days || {};
  if (P.xp === undefined) { // quem já usava o app não começa do zero
    const v = Object.values(P.ans); P.xp = v.filter(a => a.ok).length * XP.certa + v.filter(a => !a.ok).length * XP.errada;
  }
  allAs().forEach(a => {
    if (P.pass[a.code] || a.bloq || !P.studied[a.code]) return;
    const ids = ASQ[a.code] || [];
    if (!ids.length) { P.pass[a.code] = P.studied[a.code]; return; }
    const f = ids.filter(id => P.ans[id]), ok = f.filter(id => P.ans[id].ok).length;
    if (f.length >= Math.min(FASE_N, ids.length) && ok / f.length >= PASSA) { P.pass[a.code] = P.studied[a.code]; P.star[a.code] = ok / f.length >= .9 ? 3 : ok / f.length >= .8 ? 2 : 1; }
  });
}
// missões
function blocos() { const s = seqCodes(), b = []; for (let i = 0; i < s.length; i += BLOCO) b.push(s.slice(i, i + BLOCO)); return b; }
function semAtual() { return String(semana0()); }
function semDisponivel() { return Object.keys(P.pass).filter(c => AS[c] && hasQ(c) && !AS[c].bloq).length >= 2; }
function qzInfo() {
  const last = P.qz.length ? P.qz[P.qz.length - 1].t : 0, n = Object.keys(P.pass).filter(c => AS[c] && hasQ(c) && !AS[c].bloq).length;
  const prox = last ? day0(last) + 15 * DAY : 0;
  return { pode: n >= 4 && (!last || day0() >= prox), n, prox, last };
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function mixFrom(codes, total, porAssunto) {
  const out = []; shuffle(codes.slice()).forEach(c => { out.push(...pick(ASQ[c] || [], porAssunto)); });
  return shuffle(out).slice(0, total);
}

// conquistas
const MEDALHAS = [
  ["f1", "🎯", "Primeira fase", "Concluiu a primeira fase da Trilha", () => Object.keys(P.pass).length >= 1],
  ["f10", "🚀", "10 fases", "Concluiu 10 fases", () => Object.keys(P.pass).length >= 10],
  ["meio", "⛰️", "Metade do edital", "Concluiu metade das fases", () => Object.keys(P.pass).length >= Math.ceil(allAs().length / 2)],
  ["todas", "👑", "Edital completo", "Concluiu todas as fases", () => Object.keys(P.pass).length >= allAs().length],
  ["s3", "🔥", "3 dias seguidos", "Estudou 3 dias seguidos", () => streak() >= 3],
  ["s7", "🔥", "7 dias seguidos", "Uma semana sem parar", () => streak() >= 7],
  ["s30", "💎", "30 dias seguidos", "Um mês sem parar", () => streak() >= 30],
  ["x1000", "⭐", "1.000 XP", "Juntou 1.000 pontos", () => (P.xp || 0) >= 1000],
  ["x5000", "🌟", "5.000 XP", "Juntou 5.000 pontos", () => (P.xp || 0) >= 5000],
  ["fix10", "🛠️", "Corrigiu 10 erros", "Acertou 10 questões que tinha errado", () => Object.values(P.ans).filter(a => a.ok && a.everWrong).length >= 10],
  ["est3", "✨", "Três estrelas", "Tirou 3 estrelas numa fase", () => Object.values(P.star).some(s => s >= 3)],
  ["bau", "🎁", "Primeiro baú", "Abriu um baú de revisão", () => Object.keys(P.blk).length >= 1],
  ["sem", "🏁", "Desafio da semana", "Fez um desafio da semana", () => Object.keys(P.wk).length >= 1],
  ["qz", "🏆", "Mini-simulado", "Fez um mini-simulado da quinzena", () => P.qz.length >= 1],
  ...["LP", "RL", "CG", "CE"].map(m => ["m" + m, { LP: "📝", RL: "🧮", CG: "🌎", CE: "🩺" }[m], "Fechou " + MATAB[m], "Concluiu todas as fases de " + MATAB[m],
    () => { const mm = C.materias.find(x => x.m === m); return !!mm && mm.assuntos.length > 0 && mm.assuntos.every(a => passed(a.code)); }])
];
function checaMedalhas() {
  const novas = [];
  MEDALHAS.forEach(([id, ic, t, d, f]) => { if (!P.med[id]) { let ok = false; try { ok = f(); } catch (e) {} if (ok) { P.med[id] = Date.now(); novas.push([ic, t, d]); } } });
  if (novas.length) { save(); sheet("Nova conquista! 🎉", novas.map(([ic, t, d]) => `<div class="medn"><div class="mi">${ic}</div><div><b>${esc(t)}</b><div class="muted">${esc(d)}</div></div></div>`).join("") + `<button class="btn y full" style="margin-top:16px" onclick="this.closest('.sheet').remove()">Oba!</button>`); }
}
function medalhasHtml() {
  return `<div class="meds">${MEDALHAS.map(([id, ic, t, d]) => `<div class="med ${P.med[id] ? "on" : ""}" title="${esc(d)}"><div class="mi">${P.med[id] ? ic : "🔒"}</div><b>${esc(t)}</b></div>`).join("")}</div>`;
}

function viewTrilha() {
  const seq = seqCodes(), all = allAs(), nome = primeiro();
  const dias = Math.max(0, Math.ceil((new Date(C.prova + "T08:00:00") - Date.now()) / DAY));
  const nPass = seq.filter(passed).length, st = streak(), hoje = (P.days || {})[String(day0())] || 0;
  const rt = RITMO[P.ritmo], s0 = semana0(), semPass = Object.values(P.pass).filter(t => t >= s0).length;
  // missões
  const due = all.filter(a => status(a.code) === "due" && !a.bloq), wr = wrongIds(), sk = semAtual(), wk = P.wk[sk], qi = qzInfo();
  const mis = (href, ic, t, d, done, lock) => `<${href && !done && !lock ? `a href="${href}"` : "div"} class="mis ${done ? "done" : ""} ${lock ? "lock" : ""}"><div class="mic">${done ? "✓" : ic}</div><div class="grow"><div class="t">${t}</div><div class="muted">${d}</div></div>${href && !done && !lock ? '<div class="go">›</div>' : ""}</${href && !done && !lock ? "a" : "div"}>`;
  const missoes = [
    due.length ? mis("#/q/revd/hoje", "🔁", "Revisão do dia", `${due.length} ${due.length > 1 ? "fases pedem" : "fase pede"} revisão · ${Math.min(due.length * 4, 16)} questões`) : mis("", "🔁", "Revisão do dia", "Nenhuma fase para revisar hoje", true),
    wr.length ? mis("#/q/fix/hoje", "🛠️", "Fase de correção", `Refaça ${Math.min(wr.length, 10)} ${Math.min(wr.length, 10) > 1 ? "questões erradas" : "questão errada"}`) : mis("", "🛠️", "Fase de correção", "Nenhum erro pendente", true),
    wk ? mis("", "🏁", "Desafio da semana", `Feito: ${wk.ok}/${wk.n} acertos`, true) : semDisponivel() ? mis("#/q/sem/" + sk, "🏁", "Desafio da semana", "15 questões das fases que você já passou") : mis("", "🏁", "Desafio da semana", "Libera quando você passar 2 fases", false, true),
    TRIAL ? mis("", "🏆", "Mini-simulado da quinzena", "Disponível no kit completo", false, true)
      : qi.pode ? mis("#/q/qz/novo", "🏆", "Mini-simulado da quinzena", "20 questões misturadas, como na prova")
      : qi.last ? mis("", "🏆", "Mini-simulado da quinzena", `Feito ✓ O próximo libera em ${new Date(qi.prox).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`, true)
      : mis("", "🏆", "Mini-simulado da quinzena", "Libera quando você passar 4 fases", false, true)
  ].join("");
  // caminho
  const ofs = [0, 46, 74, 46, 0, -46, -74, -46];
  let cur = seq.findIndex((c, i) => !passed(c) && unlocked(c, i, seq)); if (cur < 0) cur = -1;
  let k = 0, path = "";
  blocos().forEach((bl, bi) => {
    path += `<div class="blk"><span>Bloco ${bi + 1}</span></div>`;
    bl.forEach(code => {
      const i = seq.indexOf(code), a = AS[code], m = a.mat, x = ofs[k++ % ofs.length];
      let cls = "lockd", ic = "🔒", bub = "";
      if (a.bloq) { cls = "kit"; ic = "🔒"; }
      else if (passed(code)) {
        const sd = status(code);
        if (sd === "due") { cls = rusty(code) ? "rust" : "due"; ic = rusty(code) ? "🔧" : "🔁"; bub = rusty(code) ? "Enferrujou!" : "Revisar"; }
        else { cls = "done"; ic = "✓"; }
      } else if (unlocked(code, i, seq)) { cls = i === cur ? "cur" : "open"; ic = { LP: "Aa", RL: "π", CG: "◎", CE: "✚" }[m] || "★"; if (i === cur) bub = P.studied[code] ? "Fazer a fase" : "Começar"; }
      const sts = passed(code) ? `<div class="sts">${[1, 2, 3].map(s => s <= stars(code) ? "★" : "☆").join("")}</div>` : "";
      path += `<div class="nodew" style="transform:translateX(${x}px)"><button class="node ${cls}" data-code="${code}" ${i === cur ? 'id="nCur"' : ""} style="--mc:${MATCOR[m] || "#1D3FD8"}">${bub ? `<span class="bub">${bub}</span>` : ""}<span class="ni">${ic}</span></button>${sts}<div class="nl"><span class="nm" style="color:${MATCOR[m]}">${esc(MATAB[m] || "")}</span>${esc(a.titulo)}</div></div>`;
    });
    // baú do bloco
    const okBl = bl.every(c => passed(c) || (AS[c] && AS[c].bloq)) && bl.some(passed), feito = P.blk[bi];
    const temQ = bl.some(c => passed(c) && hasQ(c));
    path += `<div class="nodew bauw"><button class="node bau ${feito ? "aberto" : okBl && temQ && !TRIAL ? "pronto" : ""}" data-bau="${bi}"><span class="ni">${feito ? "🎉" : "🎁"}</span></button><div class="nl">${feito ? `Baú aberto · ${feito.ok}/${feito.n}` : "Baú de revisão do bloco"}</div></div>`;
  });
  shell("hoje", `
  <div class="th"><div class="row" style="align-items:flex-start"><div class="grow"><div class="muted" style="font-weight:700;color:#C9D2F2">Olá${nome ? ", " + esc(nome) : ""}! 👋</div><div style="font-size:20px;font-weight:800;margin-top:2px">Sua Trilha até a aprovação</div></div>
  <div class="dd"><b>${dias}</b><span>dias</span></div></div>
  ${(() => { const nv = nivel(); return `<div class="tlvl"><span class="lvb">Nível ${nv.n}</span><b>${esc(nv.nome)}</b>${nv.ate ? `<div class="bar"><i style="width:${pct((P.xp || 0) - nv.de, nv.ate - nv.de)}%"></i></div><span class="muted">${(nv.ate - (P.xp || 0)).toLocaleString("pt-BR")} XP para ${esc(nv.prox)}</span>` : ""}</div>`; })()}
  <div class="tstats"><div><b>🔥 ${st}</b><span>${st === 1 ? "dia seguido" : "dias seguidos"}</span></div><div><b>⭐ ${(P.xp || 0).toLocaleString("pt-BR")}</b><span>XP${hoje ? " · +" + hoje + " hoje" : ""}</span></div><div><b>🏁 ${nPass}/${seq.length}</b><span>fases</span></div></div>
  ${rt ? `<div class="tmeta"><div class="row"><div class="grow">Meta da semana: <b>${Math.min(semPass, rt.n)}/${rt.n} fases</b></div><a href="#/comece/4">mudar</a></div><div class="bar"><i style="width:${pct(Math.min(semPass, rt.n), rt.n)}%"></i></div></div>` : `<a class="tmeta" href="#/comece/4" style="display:block;text-decoration:none;color:inherit">🎯 <b>Defina seu ritmo</b> e ganhe uma meta da semana ›</a>`}</div>
  ${!nome ? `<a class="card task" href="#/perfil/nome" style="margin-top:12px"><div class="ic">✏️</div><div class="grow"><div class="t">Como você quer ser chamado(a)?</div><div class="muted">Toque para colocar seu nome</div></div><div class="go">›</div></a>` : ""}
  <h2 class="sec">Missões de hoje</h2><div class="miss">${missoes}</div>
  <h2 class="sec" style="margin-bottom:4px">Trilha</h2><p class="muted" style="margin:0 0 6px">Na ordem do que mais cai. Passe com ${Math.round(PASSA * 100)}% de acerto para liberar a próxima fase.</p>
  <div class="path">${path}<div class="nodew"><div class="node fim"><span class="ni">🏆</span></div><div class="nl"><b>Prova · 14/02/2027</b></div></div></div>
  ${cur >= 0 ? `<button class="tobtn" id="bCur">⬇ Ir para a fase atual</button>` : ""}`);
  document.querySelectorAll("[data-code]").forEach(b => b.onclick = () => faseSheet(b.dataset.code));
  boasVindas();
  document.querySelectorAll("[data-bau]").forEach(b => b.onclick = () => bauSheet(+b.dataset.bau));
  const nc = document.getElementById("nCur"), bc = document.getElementById("bCur");
  if (bc && nc) {
    bc.onclick = () => nc.scrollIntoView({ behavior: "smooth", block: "center" });
    bc.hidden = true;
    if ("IntersectionObserver" in window) { const io = new IntersectionObserver(es => { const e = es[0]; bc.hidden = e.isIntersecting; bc.textContent = e.boundingClientRect.top < 0 ? "⬆ Ir para a fase atual" : "⬇ Ir para a fase atual"; }); io.observe(nc); } else bc.hidden = false;
  }
  if (nc && ls("cnm_trail_scroll") !== String(day0()) && cur > 2) { ls("cnm_trail_scroll", String(day0())); setTimeout(() => nc.scrollIntoView({ block: "center" }), 60); }
}

function faseSheet(code) {
  const a = AS[code], seq = seqCodes(), i = seq.indexOf(code); if (!a) return;
  if (a.bloq) return go("#/bloq/" + code);
  const n = (ASQ[code] || []).length, sd = status(code), q = Math.min(FASE_N, n);
  const head = `<div class="kick" style="color:${MATCOR[a.mat]}">${esc(a.matNome)} · fase ${i + 1} de ${seq.length}</div><div style="font-weight:800;font-size:19px;line-height:1.25;margin:4px 0 6px">${esc(a.titulo)}</div>
  <div class="muted">Caiu em ${a.pct}% das provas · ${n} questões${passed(code) ? ` · ${[1, 2, 3].map(s => s <= stars(code) ? "★" : "☆").join("")}` : ""}</div>`;
  let btns = "";
  const B = (id, cls, t) => `<button class="btn ${cls} full" data-act="${id}">${t}</button>`;
  if (!unlocked(code, i, seq)) btns = `<div class="card" style="background:var(--ice);margin-top:12px">🔒 Conclua a fase anterior para liberar esta.</div>` + B("teoria", "w", "Estudar este assunto mesmo assim");
  else if (!P.studied[code]) btns = B("teoria", "y", "📖 Começar pela teoria") + (n ? B("fase", "w", `Já sei: ir direto para as ${q} questões`) : "");
  else if (!passed(code)) btns = (n ? B("fase", "y", `▶ Fazer a fase (${q} questões)`) : B("teoria", "y", "📖 Ler a teoria e concluir")) + B("teoria", "w", "📖 Reler a teoria");
  else if (sd === "due") btns = (n ? B("rev", "y", `🔁 Revisar agora (${Math.min(REV_N, n)} questões)`) : B("teoria", "y", "🔁 Revisar a teoria")) + B("teoria", "w", "📖 Ver a teoria");
  else btns = B("teoria", "w", "📖 Ver a teoria") + (n ? B("fase", "g", "▶ Refazer a fase e buscar mais estrelas") : "") + (sd === "st" ? `<p class="muted" style="text-align:center;margin:10px 0 0">Próxima revisão em ${new Date(revDue(code)).toLocaleDateString("pt-BR")}</p>` : sd === "done" ? `<p class="muted" style="text-align:center;margin:10px 0 0">Todas as revisões feitas ✓</p>` : "");
  sheet("Fase", head + `<div class="stack" style="margin-top:14px">${btns}</div>`);
  document.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
    document.querySelectorAll(".sheet").forEach(x => x.remove());
    const act = b.dataset.act;
    if (act === "teoria") return go("#/a/" + code);
    if (act === "fase") { SES = null; return location.hash === "#/q/f/" + code ? startSession("f", code) : go("#/q/f/" + code); }
    if (act === "rev") { SES = null; return location.hash === "#/q/rev/" + code ? startSession("rev", code) : go("#/q/rev/" + code); }
  });
}
function bauSheet(bi) {
  const bl = blocos()[bi] || [], feito = P.blk[bi];
  const ok = bl.every(c => passed(c) || (AS[c] && AS[c].bloq)) && bl.some(c => passed(c) && hasQ(c));
  let body = `<div style="text-align:center;font-size:54px">${feito ? "🎉" : "🎁"}</div><div style="text-align:center;font-weight:800;font-size:19px">Baú de revisão do bloco ${bi + 1}</div>
  <p class="muted" style="text-align:center">2 questões de cada fase do bloco, misturadas. Vale <b>+${XP.bloco} XP</b>.</p>`;
  if (TRIAL) body += `<a class="btn y full" href="${esc(C.checkout || C.site || CFG.SITE)}" target="_blank" rel="noopener">🔒 Disponível no kit completo</a>`;
  else if (feito) body += `<p style="text-align:center">Você já abriu: <b>${feito.ok}/${feito.n}</b> acertos.</p><button class="btn g full" data-b="1">Abrir de novo</button>`;
  else if (ok) body += `<button class="btn y full" data-b="1">Abrir o baú</button>`;
  else body += `<div class="card" style="background:var(--ice);text-align:center">🔒 Conclua as fases do bloco para abrir.</div>`;
  sheet("Baú", body);
  const b = document.querySelector("[data-b]"); if (b) b.onclick = () => { document.querySelectorAll(".sheet").forEach(x => x.remove()); SES = null; location.hash === "#/q/bloco/" + bi ? startSession("bloco", String(bi)) : go("#/q/bloco/" + bi); };
}


// ---------- telas ----------
function shell(active, body, top) {
  const nav = [["hoje", "Trilha", ICON.hoje], ["estudar", "Estudar", ICON.estudar], ["erros", "Erros", ICON.erros], ["progresso", "Progresso", ICON.prog], ["perfil", "Perfil", ICON.perfil]]
    .map(([k, t, i]) => `<a href="#/${k}" class="${active === k ? "on" : ""}">${i}<span>${t}</span></a>`).join("");
  const tp = top || `<div class="brand">${LOGO}<div>caneta<small>na mão</small></div></div><div class="grow"></div><div class="sub">${esc(C.nome)}</div>`;
  const buy = TRIAL ? `<a class="buybar" href="${esc(C.checkout || C.site || CFG.SITE)}" target="_blank" rel="noopener"><span><b>Teste grátis</b> · ${allAs().filter(x => !x.bloq).length} de ${allAs().length} assuntos</span><span class="bb">Quero o kit completo ›</span></a>` : "";
  $app.innerHTML = `<div class="shell${TRIAL ? " trialmode" : ""}"><div class="top">${tp}</div><div class="main">${body}</div>${buy}<nav class="nav"><div class="nbrand">${LOGO}<div>caneta<small>na mão</small></div></div>${nav}</nav></div>`;
  window.scrollTo(0, 0);
}
const backTop = (title, sub, href) => `<button class="back" onclick="${href ? `location.hash='${href}'` : "history.back()"}" aria-label="Voltar">‹</button><div class="grow"><div class="ttl">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>`;

function viewRevisoes() {
  const due = allAs().filter(a => status(a.code) === "due");
  const prox = allAs().filter(a => status(a.code) === "st").sort((a, b) => revDue(a.code) - revDue(b.code)).slice(0, 8);
  shell("hoje", `<h1 class="pg">Revisões</h1>
  ${due.length ? due.map(asRow).join("") : '<div class="card empty"><div class="e">✅</div>Nenhuma revisão para hoje.</div>'}
  ${prox.length ? `<h2 class="sec">Próximas</h2>` + prox.map(a => asRow(a, new Date(revDue(a.code)).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }))).join("") : ""}`, backTop("Revisões", "", "#/hoje"));
}

function trialBanner() {
  const livres = allAs().filter(a => !a.bloq).length, tot = allAs().length;
  return `<div class="card trial"><div class="kick" style="color:var(--navy)">AMOSTRA GRÁTIS</div><div style="font-weight:800;font-size:17px;margin:4px 0">Você está testando o app: ${livres} de ${tot} assuntos liberados</div>
  <div class="muted" style="color:var(--ink2)">No kit completo você tem todos os assuntos, as ${C.nq_total || ""} questões, simulados e os PDFs. Seu progresso continua de onde parou.</div>
  <a class="btn b full" style="margin-top:12px" href="${esc(C.checkout || C.site || CFG.SITE)}" target="_blank" rel="noopener">Quero o kit completo</a></div>`;
}
function asRowBloq(a) {
  return `<a class="as bloq" href="#/bloq/${a.code}"><div class="n">🔒</div><div class="grow"><div class="t">${esc(a.titulo)}</div>
  <div class="m"><span class="chip lock">Kit completo</span><span>caiu em ${a.pct}% das provas</span><span>${a.nq || 0} questões</span></div></div></a>`;
}
function viewBloq(code) {
  const a = AS[code]; if (!a) return go("#/estudar");
  shell("estudar", `<div class="kick">${esc(a.matNome)} · assunto ${String(a.n).padStart(2, "0")}</div><h1 class="pg">${esc(a.titulo)}</h1>
  <div class="card" style="text-align:center;padding:28px 18px"><div style="font-size:42px">🔒</div><div style="font-weight:800;font-size:18px;margin:8px 0">Este assunto faz parte do kit completo</div>
  <p class="muted">Caiu em <b>${a.pct}%</b> das provas da banca ACCESS e tem <b>${a.nq || 0} questões</b> reais com gabarito comentado esperando por você.</p>
  <a class="btn y full" href="${esc(C.checkout || C.site || CFG.SITE)}" target="_blank" rel="noopener">Desbloquear no kit completo</a>
  <p class="muted" style="font-size:13px;margin-top:12px">Depois da compra, entre com o mesmo e-mail: tudo é liberado e o seu progresso continua.</p></div>`, backTop(a.titulo, a.matNome, "#/estudar/" + a.mat));
}
function asRow(a, when) {
  if (a.bloq) return asRowBloq(a);
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
  const t = esc(user.email || "Amostra grátis · Caneta na Mão");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><text x='10' y='100' transform='rotate(-20 160 90)' font-family='sans-serif' font-size='14' fill='%230B1747'>${t}</text></svg>`;
  return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
}

function viewAssunto(code) {
  const a = AS[code]; if (!a) return go("#/estudar");
  if (a.bloq) return viewBloq(code);
  P.last = code; save();
  const st = status(code), s = asStats(code), n = P.rev[code] || 0;
  let act = "";
  if (st === "new") act = `<button class="btn y grow" id="bStudy">✓ Li a teoria</button>`;
  else if (!passed(code) && s.n) act = `<a class="btn y grow" href="#/q/f/${code}">▶ Fazer a fase</a>`;
  else if (st === "due") act = s.n ? `<a class="btn y grow" href="#/q/rev/${code}">🔁 Revisar (${Math.min(REV_N, s.n)})</a>` : `<button class="btn y grow" id="bRev">✓ Concluir ${n + 1}ª revisão</button>`;
  const qb = s.n ? `<a class="btn b grow" href="#/q/a/${code}">Questões (${s.n}${TRIAL && a.nqk > s.n ? " de " + a.nqk : ""})</a>` : "";
  const info = st === "new" ? "" : `<div class="card" style="margin-bottom:12px"><div class="row"><div class="grow"><div style="font-weight:800">${st === "done" ? "Assunto revisado ✓" : st === "due" ? "Hora de revisar!" : "Próxima revisão em " + new Date(revDue(code)).toLocaleDateString("pt-BR")}</div><div class="muted">Estudado em ${new Date(P.studied[code]).toLocaleDateString("pt-BR")}${s.f ? ` · ${s.f}/${s.n} questões feitas · ${pct(s.ok, s.f)}% de acerto` : ""}</div></div></div><div class="rvl">${REV.map((d, i) => `<span class="${i < n ? "d" : ""}"></span>`).join("")}</div></div>`;
  shell("estudar", `${info}<div class="kick">${esc(a.matNome)} · assunto ${String(a.n).padStart(2, "0")}</div><h1 class="pg">${esc(a.titulo)}</h1>
  ${a.tags ? `<p class="muted" style="margin-top:-8px">${esc(a.tags)}</p>` : ""}
  <div class="teoria"><div class="wm"></div>${a.html}</div>
  ${act || qb ? `<div class="endbar">${act}${qb}</div>` : ""}`, backTop(a.titulo, a.matNome));
  const wm = document.querySelector('.wm'); if (wm) wm.style.backgroundImage = watermark();
  const b1 = document.getElementById("bStudy"); if (b1) b1.onclick = () => {
    P.studied[code] = Date.now(); P.rev[code] = 0;
    if (!s.n) { P.pass[code] = Date.now(); P.star[code] = 3; addXP(XP.fase); save(); toast("Fase concluída! +" + XP.fase + " XP"); checaMedalhas(); return go("#/hoje"); }
    save(); toast("Boa! Agora faça a fase para liberar a próxima."); viewAssunto(code);
  };
  const b2 = document.getElementById("bRev"); if (b2) b2.onclick = () => { P.rev[code] = n + 1; (P.revAt[code] = P.revAt[code] || []).push(Date.now()); addXP(XP.rev); save(); toast(n + 1 >= 3 ? "Revisões completas! 🎉" : "Revisão feita! +" + XP.rev + " XP"); viewAssunto(code); };
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
  let codes = [];
  if (mode === "f") { ids = pick(ASQ[arg] || [], FASE_N); title = "Fase · " + (AS[arg] ? AS[arg].titulo : ""); }
  else if (mode === "rev") { ids = pick(ASQ[arg] || [], REV_N); title = "Revisão · " + (AS[arg] ? AS[arg].titulo : ""); }
  else if (mode === "revd") {
    codes = allAs().filter(a => status(a.code) === "due" && !a.bloq).slice(0, 4).map(a => a.code);
    ids = shuffle(codes.flatMap(c => pick(ASQ[c] || [], 4))); title = "Revisão do dia";
    if (!ids.length && codes.length) { codes.forEach(c => { P.rev[c] = (P.rev[c] || 0) + 1; (P.revAt[c] = P.revAt[c] || []).push(Date.now()); }); addXP(XP.rev * codes.length); save(); toast("Revisões feitas! +" + XP.rev * codes.length + " XP"); return go("#/hoje"); }
  }
  else if (mode === "fix") { ids = wrongIds().sort((x, y) => (P.ans[x].t || 0) - (P.ans[y].t || 0)).slice(0, 10); title = "Fase de correção"; }
  else if (mode === "sem" || mode === "qz") {
    const cs = Object.keys(P.pass).filter(c => AS[c] && hasQ(c) && !AS[c].bloq), s0 = semana0();
    const rec = cs.filter(c => P.pass[c] >= s0), base = mode === "sem" && rec.length >= 2 ? rec : cs, tot = mode === "sem" ? 15 : 20;
    ids = mixFrom(base, tot, Math.max(2, Math.ceil(tot / Math.max(1, base.length)) + 1));
    if (ids.length < tot) { const extra = mixFrom(cs.filter(c => !base.includes(c)), tot - ids.length, 3); ids = ids.concat(extra); }
    title = mode === "sem" ? "Desafio da semana" : "Mini-simulado da quinzena";
  }
  else if (mode === "bloco") { const bl = blocos()[+arg] || []; ids = shuffle(bl.filter(c => passed(c) && hasQ(c)).flatMap(c => pick(ASQ[c] || [], 2))); title = "Baú do bloco " + (+arg + 1); }
  if (!ids.length) { toast("Nenhuma questão aqui."); return go("#/hoje"); }
  SES = { mode, arg, ids, i: 0, res: {}, title, t0: Date.now(), codes, xp: 0 };
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
  if (done) fb = `<div class="fb ${done.ok ? "ok" : "bad"}">${done.combo ? `<div class="combo">${done.combo}</div>` : ""}<b class="h">${done.ok ? "✓ " + esc(done.frase || "Acertou!") : "✗ Resposta certa: " + q.r}</b>${!done.ok && done.frase ? `<div class="consolo">${esc(done.frase)}</div>` : ""}${q.k || ""}${q.w ? `<div class="w">⚠ ${q.w}</div>` : ""}</div>`;
  const last = S.i === S.ids.length - 1;
  const btn = done ? `<button class="btn b grow" id="bNext">${last ? "Ver resultado" : "Próxima ›"}</button>` : `<button class="btn y grow" id="bOk" ${S.sel ? "" : "disabled"}>Confirmar</button>`;
  const prevA = !done && P.ans[id] ? `<span class="chip ${P.ans[id].ok ? "ok" : "due"}">${P.ans[id].ok ? "já acertou" : "já errou"}</span>` : "";
  shell(S.mode === "a" ? "estudar" : S.mode === "erros" ? "erros" : S.mode === "sim" ? "progresso" : "hoje", `
  <div class="qhead"><span>Questão ${S.i + 1} de ${S.ids.length}</span>${prevA}<span>${esc(q.o)} · ${esc(q.y)}</span></div>
  <div class="qprog"><i style="width:${pct(S.i + (done ? 1 : 0), S.ids.length)}%"></i></div>
  <div class="card">${txb}${stem}<div class="alts">${alts}</div>${fb}</div>
  <div class="qnav">${S.i > 0 ? '<button class="btn w" id="bPrev">‹</button>' : ""}${btn}</div>`, backTop(S.title, `Questão ${q.num} do Caderno${S.xp ? " · +" + S.xp + " XP" : ""}`, S.mode === "a" ? "#/a/" + S.arg : S.mode === "erros" ? "#/erros" : S.mode === "sim" ? "#/progresso" : "#/hoje"));
  document.querySelectorAll(".alt").forEach(b => b.onclick = () => { S.sel = b.dataset.l; renderQ(); });
  const ok = document.getElementById("bOk"); if (ok) ok.onclick = () => {
    const right = S.sel === q.r;
    S.combo = right ? (S.combo || 0) + 1 : 0;
    S.res[id] = { a: S.sel, ok: right, frase: right ? sorteia(ELOGIO) : sorteia(CONSOLO), combo: right ? COMBO[S.combo] || "" : "" };
    const prev = P.ans[id]; P.ans[id] = { a: S.sel, ok: right, t: Date.now(), n: (prev ? prev.n || 1 : 0) + 1, everWrong: !!(prev && (!prev.ok || prev.everWrong)) || !right };
    addXP(right ? XP.certa : XP.errada);
    S.sel = null; save(); renderQ();
    setTimeout(() => { const f = document.querySelector(".fb"); if (f) f.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 50);
  };
  const nx = document.getElementById("bNext"); if (nx) nx.onclick = () => { if (last) return summary(); S.i++; S.sel = null; renderQ(); };
  const pv = document.getElementById("bPrev"); if (pv) pv.onclick = () => { S.i--; S.sel = null; renderQ(); };
  const tx = document.getElementById("bTx"); if (tx) tx.onclick = () => sheet("Texto · " + C.textos[q.tx].src, C.textos[q.tx].html);
}

function summary() {
  const S = SES, r = Object.values(S.res), ok = r.filter(x => x.ok).length, tx = r.length ? ok / r.length : 0;
  const code = S.arg, a = AS[code];
  let top = "", btns = "", msg = "";
  const cont = `<a class="btn y full" href="#/hoje">Continuar a Trilha</a>`, errs = r.length - ok ? `<a class="btn w full" href="#/erros">Ver as erradas</a>` : "";
  if (S.mode === "f") {
    const need = Math.ceil(r.length * PASSA);
    if (tx >= PASSA) {
      const first = !passed(code), st = tx >= .9 ? 3 : tx >= .8 ? 2 : 1;
      P.pass[code] = P.pass[code] || Date.now(); P.star[code] = Math.max(stars(code), st);
      if (!P.studied[code]) { P.studied[code] = Date.now(); P.rev[code] = 0; }
      if (first) addXP(XP.fase);
      top = `<div class="cele">🎉</div><div class="kick">${first ? "Fase concluída!" : "Fase refeita!"}</div><div class="bigstars">${[1, 2, 3].map(x => `<span class="${x <= st ? "on" : ""}">★</span>`).join("")}</div>`;
      msg = first ? "A próxima fase da Trilha foi liberada. A revisão desta fase fica marcada para amanhã." : "Boa! Refazer fases ajuda a fixar e pode render mais estrelas.";
      btns = cont + errs;
    } else {
      top = `<div class="cele">💪</div><div class="kick">Quase lá!</div>`;
      msg = `Para passar de fase você precisa de <b>${need} acertos</b>. As erradas voltam primeiro na próxima tentativa.`;
      btns = `<button class="btn y full" id="bAgain">Tentar de novo</button><a class="btn w full" href="#/a/${code}">Reler a teoria</a>`;
    }
  } else if (S.mode === "rev" || S.mode === "revd") {
    const cs = S.mode === "rev" ? [code] : S.codes;
    cs.forEach(c => { if ((P.rev[c] || 0) < REV.length) { P.rev[c] = (P.rev[c] || 0) + 1; (P.revAt[c] = P.revAt[c] || []).push(Date.now()); } });
    addXP(XP.rev * cs.length);
    top = `<div class="cele">🔁</div><div class="kick">Revisão feita!</div>`;
    msg = tx >= .6 ? "A matéria está firme. A próxima revisão já foi agendada." : "Algumas coisas escaparam. Vale reler a teoria e refazer as erradas.";
    btns = cont + (S.mode === "rev" && tx < .6 ? `<a class="btn w full" href="#/a/${code}">Reler a teoria</a>` : errs);
  } else if (S.mode === "fix") {
    top = `<div class="cele">🛠️</div><div class="kick">Fase de correção</div>`; msg = ok ? `Você corrigiu <b>${ok}</b> ${ok > 1 ? "questões" : "questão"}. ${r.length - ok ? "As que ainda errou continuam no caderno de erros." : "Caderno de erros mais leve!"}` : "Ainda não foi dessa vez. Releia a teoria desses assuntos e tente amanhã.";
    btns = cont;
  } else if (S.mode === "sem") {
    P.wk[semAtual()] = { ok, n: r.length, t: Date.now() }; addXP(XP.sem);
    top = `<div class="cele">🏁</div><div class="kick">Desafio da semana</div>`; msg = "Desafio concluído! Na semana que vem tem outro."; btns = cont + errs;
  } else if (S.mode === "qz") {
    P.qz.push({ t: Date.now(), ok, n: r.length }); addXP(XP.qz);
    top = `<div class="cele">🏆</div><div class="kick">Mini-simulado da quinzena</div>`; msg = tx >= .5 ? "Nesse ritmo você passa! O próximo libera em 15 dias." : "Bom treino de prova. Revise os assuntos em que mais errou (veja em Progresso → Pontos fracos)."; btns = cont + errs;
  } else if (S.mode === "bloco") {
    const first = !P.blk[S.arg]; P.blk[S.arg] = { ok, n: r.length, t: Date.now() }; if (first) addXP(XP.bloco);
    top = `<div class="cele">🎁</div><div class="kick">Baú aberto!</div>`; msg = "Revisar o bloco inteiro de uma vez é o que faz a matéria grudar."; btns = cont + errs;
  } else {
    if (S.mode === "sim") { P.sims = P.sims || []; P.sims.push({ t: Date.now(), ok, n: S.ids.length }); }
    top = `<div class="kick">${esc(S.title)}</div>`;
    msg = pct(ok, r.length) >= 70 ? "Mandou bem! Na revisão, refaça só as erradas." : pct(ok, r.length) >= 50 ? "Bom caminho. As erradas foram para o seu caderno de erros." : "Volte na teoria e refaça as erradas amanhã.";
    btns = (r.length - ok ? `<a class="btn y full" href="#/erros">Ver as erradas</a>` : "") + (S.mode === "a" ? `<a class="btn w full" href="#/a/${S.arg}">Voltar ao assunto</a>` : `<a class="btn w full" href="#/hoje">Voltar para a Trilha</a>`);
  }
  save();
  const xpTxt = S.xp ? `<div class="xpgain">+${S.xp} XP</div>` : "";
  const frase = r.length ? `<div class="frase">${frasePct(tx)}</div>` : "";
  shell("hoje", `<div class="card sum">${top}<div class="big" style="margin-top:10px">${ok}/${r.length}</div><div class="muted">${pct(ok, r.length)}% de acertos</div>${xpTxt}${frase}<p>${msg}</p>
  ${TRIAL && (S.mode === "a" || S.mode === "f") && a && a.nqk > (ASQ[code] || []).length ? `<div class="card trial" style="margin-top:14px;text-align:left"><b>Gostou?</b> No kit completo este assunto tem ${a.nqk} questões, e o app inteiro tem ${C.nq_total || ""} questões em ${allAs().length} assuntos.<a class="btn b full" style="margin-top:10px" href="${esc(C.checkout || C.site || CFG.SITE)}" target="_blank" rel="noopener">Quero o kit completo</a></div>` : ""}
  <div class="stack">${btns}</div></div>`, backTop("Resultado", "", "#/hoje"));
  const ag = document.getElementById("bAgain"); if (ag) ag.onclick = () => startSession("f", code);
  SES = null;
  checaMedalhas();
  if (P._lvup) { const nv = nivel(); delete P._lvup; save(); const old = document.querySelector(".sheet .bd"); const html = `<div class="lvup"><div class="lvn">${nv.n}</div><div style="font-weight:800;font-size:20px;margin-top:10px">Subiu de nível! 🎉</div><div class="muted" style="font-size:16px">Agora você é <b style="color:var(--blue)">${esc(nv.nome)}</b></div>${nv.prox ? `<p class="muted">Próximo nível: ${esc(nv.prox)} (${nv.ate.toLocaleString("pt-BR")} XP)</p>` : ""}</div>`;
    if (old) old.insertAdjacentHTML("afterbegin", html + "<hr style='border:0;border-top:1px solid var(--line);margin:14px 0'>"); else sheet("Parabéns! 🎉", html + `<button class="btn y full" style="margin-top:12px" onclick="this.closest('.sheet').remove()">Bora!</button>`); }
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
  const totSt = Object.values(P.star || {}).reduce((x, y) => x + y, 0);
  const nvp = nivel();
  shell("progresso", `<h1 class="pg">Meu progresso</h1>
  <div class="card" style="margin-bottom:12px"><div class="row"><div class="lvn sm">${nvp.n}</div><div class="grow"><div class="muted" style="font-weight:700">Nível ${nvp.n}</div><div style="font-weight:800;font-size:18px">${esc(nvp.nome)}</div></div></div>${nvp.ate ? `<div class="bar" style="margin-top:10px"><i style="width:${pct((P.xp || 0) - nvp.de, nvp.ate - nvp.de)}%"></i></div><div class="muted" style="margin-top:6px">${(nvp.ate - (P.xp || 0)).toLocaleString("pt-BR")} XP para ${esc(nvp.prox)}</div>` : ""}</div>
  <div class="grid2" style="margin-bottom:12px"><div class="card stat"><b>🔥 ${streak()}</b><span>dias seguidos</span></div><div class="card stat"><b>⭐ ${(P.xp || 0).toLocaleString("pt-BR")}</b><span>XP no total</span></div>
  <div class="card stat"><b>🏁 ${Object.keys(P.pass || {}).filter(c => AS[c]).length}/${allAs().length}</b><span>fases concluídas</span></div><div class="card stat"><b>★ ${totSt}</b><span>estrelas</span></div></div>
  ${mats}
  <h2 class="sec">Conquistas</h2>${medalhasHtml()}
  <h2 class="sec">Pontos fracos</h2>${weak.length ? weak.map(x => asRow(x.a)).join("") : '<p class="muted">Faça pelo menos 3 questões de um assunto para aparecer aqui.</p>'}
  <h2 class="sec">Simulado</h2><div class="card"><div style="font-weight:800">40 questões, 10 de cada matéria, como na prova</div><p class="muted">Sorteadas do Caderno. Para passar: 20 acertos e pelo menos 1 em cada matéria.</p>${TRIAL ? `<a class="btn g full" href="${esc(C.checkout || C.site || CFG.SITE)}" target="_blank" rel="noopener">🔒 Disponível no kit completo</a>` : `<a class="btn b full" href="#/q/sim/novo">Fazer um simulado</a>`}
  ${sims.length ? `<div class="muted" style="margin-top:12px">${sims.map(s => `${new Date(s.t).toLocaleDateString("pt-BR")}: <b>${s.ok}/${s.n}</b>`).join(" · ")}</div>` : ""}</div>
  <a class="card task" href="#/perfil" style="margin-top:12px"><div class="ic">👤</div><div class="grow"><div class="t">PDFs, conta e ajuda</div><div class="muted">Ficam na aba Perfil</div></div><div class="go">›</div></a>`);
}


// ---------- perfil ----------
const NOMES_KIT = { tec: "Técnico em Enfermagem", adm: "Oficial Administrativo", acs: "Agente Comunitário de Saúde", as: "Assistente Social", enf: "Enfermeiro 30h e ESF" };
function viewPerfil(sub) {
  const nm = nomeUser(), ini = (primeiro() || "?").slice(0, 1).toUpperCase();
  const item = (href, ic, t, d, extra = "") => `<a class="card task" href="${href}" ${extra}><div class="ic">${ic}</div><div class="grow"><div class="t">${t}</div><div class="muted">${d}</div></div><div class="go">›</div></a>`;
  shell("perfil", `<h1 class="pg">Perfil</h1>
  <div class="card pf"><div class="av">${esc(ini)}</div><div class="grow"><div style="font-weight:800;font-size:18px">${nm ? esc(nm) : "Sem nome"}</div>
  <div class="muted">${GUEST ? "Teste grátis neste aparelho" : esc(user.email || "")}</div><div class="muted">${esc(C.nome)}${TRIAL ? " · amostra grátis" : ""}</div></div>
  <button class="btn g" id="bNome">${nm ? "Editar" : "Colocar nome"}</button></div>
  ${TRIAL ? trialBanner() : ""}
  <h2 class="sec">Começar bem</h2><div class="stack">
  ${item("#/comece", "🚀", "Comece por aqui", "Como estudar com o app, em 1 minuto")}
  ${item("#/instalar", "📲", "Instalar no celular", "Vira um ícone na tela, como um aplicativo")}
  ${item("#/comece/4", "🎯", "Meu ritmo de estudo", RITMO[P.ritmo] ? RITMO[P.ritmo].t + " · " + RITMO[P.ritmo].n + " assuntos por semana" : "Defina quantas horas por dia")}</div>
  ${audios()}<h2 class="sec">Meus materiais</h2>${materiais()}
  <h2 class="sec">Ajuda</h2><div class="stack">
  ${item("mailto:" + esc(CFG.SUPORTE), "💬", "Falar com o suporte", esc(CFG.SUPORTE))}
  ${item("https://instagram.com/canetanamaoconcursos", "📷", "Instagram", "@canetanamaoconcursos", 'target="_blank" rel="noopener"')}</div>
  <h2 class="sec">Conta</h2><div class="stack">
  ${BASES.length > 1 ? `<button class="btn g full" id="bKit">Trocar de kit</button>` : ""}
  ${GUEST ? `<div class="card"><div style="font-weight:800">Já comprou o kit?</div><p class="muted" style="margin:4px 0 12px">Entre com o e-mail da compra para liberar tudo. O que você fez no teste continua aqui.</p><button class="btn b full" id="bEntrar">Entrar com meu e-mail</button></div>`
    : DEMO ? "" : `<button class="btn w full" id="bOut">Sair da conta</button>`}</div>`);
  document.getElementById("bNome").onclick = () => editaNome();
  const o = document.getElementById("bOut"); if (o) o.onclick = async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); };
  const k = document.getElementById("bKit"); if (k) k.onclick = () => { ls("cnm_cargo", ""); location.reload(); };
  const en = document.getElementById("bEntrar"); if (en) en.onclick = () => { history.replaceState(null, "", location.pathname); viewLogin("", true); };
  document.querySelectorAll("[data-pdf]").forEach(b => b.onclick = () => abrePdf(b.dataset.pdf, b));
  document.querySelectorAll("[data-aud]").forEach(b => b.onclick = () => abreAudio(+b.dataset.aud));
  if (sub === "nome") editaNome(() => go("#/hoje"));
}

// ---------- comece por aqui ----------
function marcaOnb() { ls("cnm_onb", "1"); if (!P.onb) { P.onb = Date.now(); save(); } }
function viewComece(step) {
  step = Math.min(4, Math.max(1, parseInt(step) || 1));
  const dots = [1, 2, 3, 4].map(i => `<span class="${i <= step ? "on" : ""}"></span>`).join("");
  const nav = (prox, txt = "Continuar") => `<div class="stack" style="margin-top:18px"><button class="btn y full" id="bProx">${txt}</button>${step > 1 ? `<button class="btn w full" onclick="history.back()">Voltar</button>` : ""}</div>`;
  let body = "";
  if (step === 1) body = `<div class="onb-ic">👋</div><h1 class="pg">Boas-vindas ao seu app de estudo!</h1>
    <p class="muted" style="font-size:16px">Em 1 minuto você aprende a usar e já começa. Primeiro: como você quer ser chamado(a)?</p>
    <input id="nmIn" class="inp" maxlength="40" placeholder="Seu nome" value="${esc(nomeUser())}">${nav()}`;
  if (step === 2) body = `<div class="onb-ic">📚</div><h1 class="pg">Como estudar com o app</h1>
    <div class="passos">
    <div class="ps"><b>1</b><div><div class="t">Leia a teoria</div><div class="muted">Cada assunto começa com “O que cai e quanto cai”. Leia com atenção e marque como estudado.</div></div></div>
    <div class="ps"><b>2</b><div><div class="t">Faça as questões</div><div class="muted">São questões reais da banca ACCESS. Você vê na hora se acertou e o porquê.</div></div></div>
    <div class="ps"><b>3</b><div><div class="t">Refaça os erros</div><div class="muted">Toda questão errada vai para o Caderno de erros. Quando acertar, ela sai de lá.</div></div></div>
    <div class="ps"><b>4</b><div><div class="t">Revise no dia certo</div><div class="muted">O app agenda revisões em 1, 7 e 15 dias. É isso que faz a matéria grudar.</div></div></div></div>
    <div class="card" style="margin-top:12px;background:var(--blue2);border-color:var(--blue2)"><b>🗺️ Siga a Trilha.</b> Cada assunto é uma fase, na ordem do que mais cai. Acerte ${Math.round(PASSA * 100)}% para liberar a próxima, ganhe XP e estrelas, mantenha a sequência 🔥 e cumpra as missões do dia. Prefere escolher o assunto? Use a aba <b>Estudar</b>: tudo conta junto.</div>${nav()}`;
  if (step === 3) body = `<div class="onb-ic">📲</div><h1 class="pg">Coloque o app na tela do celular</h1>
    <p class="muted" style="font-size:16px">Assim ele abre com um toque, como um aplicativo. Não precisa baixar nada da loja.</p>${instalarHtml()}${nav(0, "Continuar")}`;
  if (step === 4) body = `<div class="onb-ic">🎯</div><h1 class="pg">Qual vai ser o seu ritmo?</h1>
    <p class="muted" style="font-size:16px">Quanto tempo você consegue estudar por dia? O app monta a sua meta da semana. Dá para mudar quando quiser.</p>
    <div class="stack">${Object.entries(RITMO).map(([k, r]) => `<button class="opt ${P.ritmo === k ? "on" : ""}" data-r="${k}"><b>${r.t}</b><span>${r.n} assuntos novos por semana</span></button>`).join("")}</div>
    <div class="stack" style="margin-top:18px"><button class="btn y full" id="bProx" ${P.ritmo ? "" : "disabled"}>Começar a estudar</button></div>`;
  $app.innerHTML = `<div class="onb"><div class="onb-top"><div class="dots">${dots}</div><button class="skip" id="bPula">Pular</button></div><div class="onb-in">${body}</div></div>`;
  window.scrollTo(0, 0);
  bindInstalar();
  document.getElementById("bPula").onclick = () => { marcaOnb(); go("#/hoje"); };
  document.querySelectorAll("[data-r]").forEach(b => b.onclick = () => { P.ritmo = b.dataset.r; save(); document.querySelectorAll("[data-r]").forEach(x => x.classList.toggle("on", x === b)); document.getElementById("bProx").disabled = false; });
  document.getElementById("bProx").onclick = async () => {
    if (step === 1) { const v = document.getElementById("nmIn").value.trim(); if (v) await salvaNome(v); }
    if (step < 4) return go("#/comece/" + (step + 1));
    marcaOnb(); toast("Tudo pronto! Bons estudos 💙"); go("#/hoje");
  };
}

// ---------- instalar ----------
const UA = navigator.userAgent || "";
const IOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(UA);
const INAPP = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly/i.test(UA);
const STANDALONE = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const SHARE_IC = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1D3FD8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
const PLUS_IC = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1D3FD8" stroke-width="2" stroke-linecap="round" style="vertical-align:-4px"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
function instalarHtml() {
  if (STANDALONE()) return `<div class="card" style="background:var(--okbg);border-color:var(--okbg)"><b>✅ Pronto!</b> O app já está instalado neste aparelho.</div>`;
  const inapp = INAPP ? `<div class="ps"><b>!</b><div><div class="t">Primeiro, abra no navegador</div><div class="muted">Você abriu pelo Instagram ou Facebook. Toque nos <b>três pontinhos (⋯)</b> no canto da tela e escolha <b>“Abrir no navegador”</b>${IOS ? " (Safari)" : " (Chrome)"}.</div></div></div>` : "";
  const ios = `<div class="passos">${inapp}
    <div class="ps"><b>1</b><div><div class="t">Toque em Compartilhar ${SHARE_IC}</div><div class="muted">É o quadradinho com a seta para cima, na barra de baixo do Safari (no iPad, fica em cima).</div></div></div>
    <div class="ps"><b>2</b><div><div class="t">Toque em “Adicionar à Tela de Início” ${PLUS_IC}</div><div class="muted">Se não aparecer, role a lista para baixo.</div></div></div>
    <div class="ps"><b>3</b><div><div class="t">Toque em “Adicionar”</div><div class="muted">Pronto: o ícone da Caneta na Mão aparece na tela do iPhone.</div></div></div></div>`;
  const and = `<div class="passos">${inapp}
    ${INSTALL ? `<button class="btn b full" id="bInst" style="margin-bottom:12px">📲 Instalar agora</button><p class="muted" style="text-align:center;margin:-4px 0 10px">ou faça pelo menu:</p>` : ""}
    <div class="ps"><b>1</b><div><div class="t">Toque nos três pontinhos ⋮</div><div class="muted">No canto de cima, à direita, no Chrome.</div></div></div>
    <div class="ps"><b>2</b><div><div class="t">Toque em “Instalar app”</div><div class="muted">Em alguns celulares aparece “Adicionar à tela inicial”.</div></div></div>
    <div class="ps"><b>3</b><div><div class="t">Confirme em “Instalar”</div><div class="muted">Pronto: o ícone da Caneta na Mão aparece na tela do celular.</div></div></div></div>`;
  const pc = `<div class="passos"><div class="ps"><b>💻</b><div><div class="t">No computador</div><div class="muted">No Chrome ou no Edge, clique no ícone de instalar ⊕ na barra de endereço, ou salve nos favoritos. No celular é ainda melhor: abra este mesmo endereço lá.</div></div></div></div>`;
  const ini = IOS ? "ios" : ANDROID ? "and" : "pc";
  return `<div class="tabs inst" style="margin:6px 0 12px"><button data-os="ios" class="${ini === "ios" ? "on" : ""}">iPhone</button><button data-os="and" class="${ini === "and" ? "on" : ""}">Android</button><button data-os="pc" class="${ini === "pc" ? "on" : ""}">Computador</button></div>
  <div data-pane="ios" ${ini === "ios" ? "" : "hidden"}>${ios}</div><div data-pane="and" ${ini === "and" ? "" : "hidden"}>${and}</div><div data-pane="pc" ${ini === "pc" ? "" : "hidden"}>${pc}</div>`;
}
function bindInstalar() {
  document.querySelectorAll("[data-os]").forEach(b => b.onclick = () => {
    document.querySelectorAll("[data-os]").forEach(x => x.classList.toggle("on", x === b));
    document.querySelectorAll("[data-pane]").forEach(x => x.hidden = x.dataset.pane !== b.dataset.os);
  });
  const bi = document.getElementById("bInst");
  if (bi) bi.onclick = async () => { try { INSTALL.prompt(); const r = await INSTALL.userChoice; if (r && r.outcome === "accepted") toast("App instalado! 🎉"); INSTALL = null; } catch (e) {} };
}
function viewInstalar() {
  shell("perfil", `<h1 class="pg">Instalar no celular</h1><p class="muted" style="font-size:16px">O app vira um ícone na tela, abre com um toque e fica mais fácil estudar todo dia. Não precisa baixar nada da loja.</p>${instalarHtml()}`, backTop("Instalar no celular", "", "#/perfil"));
  bindInstalar();
}

// ---------- resumos em áudio ----------
const AUDIOS = { tec: ["Sinais vitais, pressão arterial e exame físico", "Interpretação de texto", "Lógica: proposições, tabela-verdade e negações", "Administração de medicamentos e cálculo", "Classes de palavras", "SUS: princípios e Leis 8.080 e 8.142", "Sequências lógicas", "Termos da oração", "Urgência e emergência: RCP e oxigenoterapia", "Período composto"] };
function audios() {
  const L = AUDIOS[cargo];
  if (!AUDIO || !L) return "";
  return `<h2 class="sec">🎧 Resumos em áudio</h2><div class="card"><p class="muted" style="margin-top:0">Os assuntos que mais caem, para ouvir no ônibus, no trabalho ou antes de dormir. Dá para acelerar.</p><div class="stack">` +
    L.map((t, i) => `<button class="pdfbtn" data-aud="${i + 1}"><span class="pe">🎧</span><span class="grow" style="text-align:left"><b>${String(i + 1).padStart(2, "0")} · ${esc(t)}</b></span><span class="go">▶</span></button>`).join("") + `</div></div>`;
}
async function abreAudio(n) {
  const L = AUDIOS[cargo] || [];
  if (DEMO) return toast("No app de verdade, o áudio toca aqui.");
  toast("Carregando o áudio…");
  const { data, error } = await sb.storage.from("audios").createSignedUrl(`${cargo}/${String(n).padStart(2, "0")}.mp3`, 3600);
  if (error || !data) return toast("Não deu para carregar o áudio. Tente de novo.");
  let vel = +(ls("cnm_vel") || 1);
  sheet(`${String(n).padStart(2, "0")} · ${L[n - 1] || "Resumo"}`, `<audio id="aud" src="${esc(data.signedUrl)}" controls autoplay style="width:100%"></audio>
  <p class="muted" style="margin:14px 0 6px;font-weight:700">Velocidade</p><div class="vel" style="display:flex;gap:8px;flex-wrap:wrap">${[1, 1.25, 1.5, 1.75, 2].map(v => `<button class="btn ${v === vel ? "b" : "w"}" data-v="${v}" style="flex:1;min-width:56px;padding:10px 0">${String(v).replace(".", ",")}x</button>`).join("")}</div>
  <div style="display:flex;gap:8px;margin-top:14px">${n > 1 ? `<button class="btn w full" id="aPrev">‹ Anterior</button>` : ""}${n < L.length ? `<button class="btn y full" id="aNext">Próximo ›</button>` : ""}</div>`);
  const a = document.getElementById("aud"); a.playbackRate = vel;
  const sh = a.closest(".sheet"); if (sh) sh.addEventListener("click", e => { if (e.target === sh || e.target.closest(".hd button")) a.pause(); });
  a.addEventListener("loadedmetadata", () => { a.playbackRate = vel; });
  document.querySelectorAll(".vel [data-v]").forEach(b => b.onclick = () => { vel = +b.dataset.v; a.playbackRate = vel; ls("cnm_vel", String(vel)); document.querySelectorAll(".vel [data-v]").forEach(x => x.className = "btn " + (+x.dataset.v === vel ? "b" : "w")); });
  const close = () => { a.pause(); document.querySelectorAll(".sheet").forEach(x => x.remove()); };
  const pv = document.getElementById("aPrev"); if (pv) pv.onclick = () => { close(); abreAudio(n - 1); };
  const nx = document.getElementById("aNext"); if (nx) nx.onclick = () => { close(); abreAudio(n + 1); };
  a.addEventListener("ended", () => { if (n < L.length) { close(); abreAudio(n + 1); } });
  try { clarity("event", "audio_" + n); } catch (e) {}
}

// ---------- materiais (PDFs) ----------
function materiais() {
  const itens = [["apostila", "📘", "Apostila completa", "Teoria dos assuntos do edital"], ["caderno", "📝", "Caderno de Questões", "Questões com gabarito comentado"], ["bonus", "🎁", "Bônus: reta final", "Edital verticalizado + roteiro da prova"]];
  if (PLANO) itens.push(["plano", "🗓️", "Plano de estudos + simulados", "Cronograma até a prova"]);
  if (TRIAL) return `<div class="card"><div style="font-weight:800">Apostila, caderno e bônus em PDF</div><p class="muted">Para ver no celular ou imprimir, com o seu nome. Disponível no kit completo.</p><a class="btn g full" href="${esc(C.checkout || C.site || CFG.SITE)}" target="_blank" rel="noopener">🔒 Desbloquear no kit completo</a></div>`;
  return `<div class="card"><p class="muted" style="margin-top:0">Abra para ler ou baixe para imprimir. Cada PDF sai com o seu nome no rodapé, de uso individual.</p><div class="stack">` +
    itens.map(([k, e, t, d]) => `<button class="pdfbtn" data-pdf="${k}"><span class="pe">${e}</span><span class="grow" style="text-align:left"><b>${t}</b><span class="muted" style="display:block;font-size:13px">${d}</span></span><span class="go">⬇</span></button>`).join("") + `</div></div>`;
}
async function abrePdf(arq, btn) {
  if (DEMO) return toast("No app de verdade, o PDF abre aqui.");
  const old = btn.innerHTML; btn.disabled = true; btn.querySelector(".go").textContent = "…";
  toast("Preparando seu PDF…");
  try {
    const { data } = await sb.auth.getSession();
    const r = await fetch((CFG.API || "https://entrega-caneta.vercel.app") + "/api/pdf", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token }, body: JSON.stringify({ cargo, arquivo: arq }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(j.msg || "erro");
    sheet("Seu PDF está pronto", `<p>O arquivo foi gerado com o seu nome. Toque para abrir ou baixar.</p><a class="btn y full" href="${esc(j.url)}" target="_blank" rel="noopener">Abrir PDF</a><p class="muted" style="font-size:13px">O link vale por 15 minutos. Depois é só gerar de novo aqui.</p>`);
  } catch (e) {
    toast(e.message && e.message !== "erro" ? e.message : "Não deu para gerar agora. Tente de novo.");
  } finally { btn.disabled = false; btn.innerHTML = old; }
}

// ---------- roteador ----------
function go(h) { location.hash = h; }
function route() {
  if (!C) return;
  document.querySelectorAll('.sheet').forEach(x => x.remove());
  const p = (/^#\//.test(location.hash) ? location.hash : "#/hoje").slice(2).split("/");
  if (p[0] !== "q" && SES && SES.ids.length && Object.keys(SES.res).length && p[0] !== "") SES = null;
  switch (p[0]) {
    case "estudar": return viewEstudar(p[1]);
    case "a": return viewAssunto(p[1]);
    case "q": return SES && SES.mode === p[1] && SES.arg === p[2] ? renderQ() : startSession(p[1], p[2]);
    case "erros": return viewErros();
    case "progresso": return viewProgresso();
    case "revisoes": return viewRevisoes();
    case "bloq": return viewBloq(p[1]);
    case "perfil": return viewPerfil(p[1]);
    case "comece": return viewComece(p[1]);
    case "instalar": return viewInstalar();
    default:
      if (!ls("cnm_onb") && !P.onb) return go("#/comece");
      return viewTrilha();
  }
}
window.addEventListener("hashchange", route);

// ---------- login ----------
function sugereEmail(e){
  e=(e||"").trim().toLowerCase(); var m=e.match(/^([^@\s]+)@([^@\s]+)$/); if(!m) return "";
  var u=m[1], d=m[2];
  var OK=["gmail.com","hotmail.com","hotmail.com.br","outlook.com","outlook.com.br","live.com","yahoo.com","yahoo.com.br","icloud.com","bol.com.br","uol.com.br","terra.com.br","msn.com"];
  if(OK.indexOf(d)>=0) return "";
  var FIX={"gmail.com.br":"gmail.com","gmail.br":"gmail.com","gmail":"gmail.com","hotmail":"hotmail.com","hotmail.br":"hotmail.com","outlook":"outlook.com","yahoo":"yahoo.com.br","icloud":"icloud.com","icloud.com.br":"icloud.com"};
  if(FIX[d]) return u+"@"+FIX[d];
  function lev(a,b){var p=[],i,j;for(j=0;j<=b.length;j++)p[j]=j;for(i=1;i<=a.length;i++){var q=[i];for(j=1;j<=b.length;j++)q[j]=Math.min(p[j]+1,q[j-1]+1,p[j-1]+(a[i-1]==b[j-1]?0:1));p=q;}return p[b.length];}
  var best="",bd=9;
  OK.forEach(function(k){var x=lev(d,k);if(x<bd){bd=x;best=k;}});
  if(bd>0&&bd<=2) return u+"@"+best;
  return "";
}
let EMAIL_OK = "";
function viewLogin(msg, deTeste) {
  $app.innerHTML = `<div class="login"><div class="box"><div class="brand" style="color:var(--navy);margin-bottom:18px">${LOGO}<div>caneta<small style="color:var(--blue)">na mão</small></div></div>
  <h1 class="pg" style="margin-bottom:6px">Entrar no app</h1>
  <form id="fP"${msg ? " hidden" : ""}><p class="muted">Comprou o kit? Digite o <b>CPF</b> que você usou na compra:</p><input id="cpf" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00" style="font-size:22px;letter-spacing:1px;text-align:center"><div class="err" id="erP"></div><button class="btn y full">Entrar</button><p class="muted" style="margin-top:14px;font-size:14px"><a href="#" id="bUsaEmail">Prefiro entrar pelo e-mail</a></p></form>
  <form id="fE"${msg ? "" : " hidden"}><p class="muted">Use o e-mail da sua compra. Vamos te mandar um e-mail com um botão para entrar.</p><input type="email" id="em" required placeholder="seu@email.com" autocomplete="email" value="${esc(ls("cnm_email") || "")}"><div class="err">${esc(msg || "")}</div><button class="btn y full">Receber e-mail de acesso</button><p class="muted" style="margin-top:14px;font-size:14px"><a href="#" id="bUsaCpf">‹ Entrar com o CPF</a></p></form>
  <form id="fC" hidden><div class="onb-ic" style="font-size:40px">📩</div><p id="sentTo"></p><p class="muted" style="margin-bottom:4px">Ou digite aqui o código de 6 números que veio no e-mail:</p><input class="code" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••"><div class="err" id="er2"></div><button class="btn y full">Entrar</button><button type="button" class="btn w full" id="bBack" style="margin-top:8px">Trocar e-mail</button></form>
  <p class="muted" style="margin-top:18px;font-size:13px">${deTeste || ls("cnm_guest") ? `<a href="#/hoje" id="bVolta">‹ Voltar para o teste grátis</a>` : `Ainda não tem o kit? <a href="${esc(CFG.SITE)}">Conheça aqui</a>`}</p></div></div>`;
  const bv = document.getElementById("bVolta"); if (bv) bv.onclick = e => { e.preventDefault(); location.hash = "#/hoje"; boot(); };
  const fE = document.getElementById("fE"), fC = document.getElementById("fC"), fP = document.getElementById("fP");
  const uE = document.getElementById("bUsaEmail"), uC = document.getElementById("bUsaCpf");
  if (uE) uE.onclick = e => { e.preventDefault(); fP.hidden = true; fE.hidden = false; };
  if (uC) uC.onclick = e => { e.preventDefault(); fE.hidden = true; fP.hidden = false; };
  const ci = document.getElementById("cpf");
  ci.oninput = () => { let d = ci.value.replace(/\D/g, "").slice(0, 11); ci.value = d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2"); };
  fP.onsubmit = async e => {
    e.preventDefault(); const er = document.getElementById("erP"), d = ci.value.replace(/\D/g, "");
    if (d.length !== 11) { er.textContent = "Digite os 11 números do seu CPF."; return; }
    const b = fP.querySelector("button"); b.disabled = true; b.textContent = "Entrando..."; er.textContent = "";
    try {
      const r = await fetch((CFG.API || "https://entrega-caneta.vercel.app") + "/api/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cpf: d }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 404) { er.innerHTML = `Não achamos uma compra com este CPF.<br>Acabou de comprar? Espere uns 5 minutos e tente de novo. Ou <a href="#" id="bErrEmail">entre pelo e-mail</a>.`; const x = document.getElementById("bErrEmail"); if (x) x.onclick = ev => { ev.preventDefault(); fP.hidden = true; fE.hidden = false; }; return; }
      if (!r.ok || !j.token_hash) { er.textContent = j.msg || "Não deu para entrar agora. Tente pelo e-mail."; return; }
      let { error } = await sb.auth.verifyOtp({ token_hash: j.token_hash, type: "magiclink" });
      if (error) ({ error } = await sb.auth.verifyOtp({ token_hash: j.token_hash, type: "email" }));
      if (error) { er.textContent = "Não deu para entrar agora. Tente pelo e-mail."; return; }
      ls("cnm_email", j.email); try { clarity("event", "login_cpf"); } catch (x) {} GUEST = false; boot();
    } catch (x) { er.textContent = "Sem conexão. Confira a internet e tente de novo."; }
    finally { b.disabled = false; b.textContent = "Entrar"; }
  };
  fE.onsubmit = async e => {
    e.preventDefault(); const email = document.getElementById("em").value.trim().toLowerCase();
    const sug = sugereEmail(email), er = fE.querySelector(".err");
    if (sug && EMAIL_OK !== email) {
      er.innerHTML = `Seu e-mail parece ter um erro de digitação. Você quis dizer <b>${esc(sug)}</b>?<br><button type="button" class="btn y full" id="bSug" style="margin-top:8px">Sim, usar ${esc(sug)}</button><button type="button" class="btn w full" id="bNao" style="margin-top:6px">Não, meu e-mail está certo</button>`;
      document.getElementById("bSug").onclick = () => { document.getElementById("em").value = sug; er.textContent = ""; fE.requestSubmit ? fE.requestSubmit() : fE.onsubmit(new Event("submit")); };
      document.getElementById("bNao").onclick = () => { EMAIL_OK = email; er.textContent = ""; fE.requestSubmit ? fE.requestSubmit() : fE.onsubmit(new Event("submit")); };
      return;
    }
    er.textContent = ""; ls("cnm_email", email);
    const b = fE.querySelector("button"); b.disabled = true; b.textContent = "Enviando...";
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + "/app/" } });
    b.disabled = false; b.textContent = "Receber e-mail de acesso";
    if (error) { fE.querySelector(".err").textContent = /rate|seconds/i.test(error.message) ? "Aguarde um minuto e tente de novo." : "Não deu para enviar. Confira o e-mail."; return; }
    fE.hidden = true; fC.hidden = false; document.getElementById("sentTo").innerHTML = `Enviamos um e-mail para <b>${esc(email)}</b>. Abra e toque em <b>Entrar no app</b>. Não chegou? Veja no spam ou em promoções.`; document.getElementById("cd").focus();
  };
  document.getElementById("bBack").onclick = () => { fC.hidden = true; fE.hidden = false; };
  fC.onsubmit = async e => {
    e.preventDefault(); const email = ls("cnm_email"), token = document.getElementById("cd").value.replace(/\D/g, "");
    const b = fC.querySelector("button"); b.disabled = true;
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    b.disabled = false;
    if (error) { document.getElementById("er2").textContent = "Código inválido ou vencido."; return; }
    GUEST = false; boot();
  };
}

let ss_semAcesso = 0;
function viewSemAcesso(teste) {
  $app.innerHTML = `<div class="login"><div class="box"><h1 class="pg">Não achamos uma compra com este e-mail</h1>
  <p class="muted">Você entrou como <b>${esc(user.email)}</b>. <b>Se você comprou o kit, entre com o mesmo e-mail que usou no pagamento</b> (confira letras e números).</p>
  <p class="muted">Acabou de comprar? A liberação leva alguns minutos depois da confirmação do pagamento. Se não liberar, escreva para <a href="mailto:${esc(CFG.SUPORTE)}">${esc(CFG.SUPORTE)}</a>.</p>
  <div class="stack"><button class="btn y full" onclick="location.reload()">Tentar de novo</button><button class="btn w full" id="bOut">Entrar com outro e-mail</button>${teste ? `<button class="btn g full" id="bTeste">Continuar no teste grátis</button>` : `<a class="btn g full" href="${esc(CFG.SITE)}">Conhecer os kits</a>`}</div></div></div>`;
  document.getElementById("bOut").onclick = async () => { await sb.auth.signOut(); location.reload(); };
  const bt = document.getElementById("bTeste"); if (bt) bt.onclick = () => { GUEST = true; cargos = [teste + "-amostra"]; ss_semAcesso = 1; boot(); };
}

function viewEscolha() {
  const N = NOMES_KIT;
  $app.innerHTML = `<div class="login"><div class="box"><h1 class="pg">Qual kit você quer estudar?</h1><div class="stack">${BASES.map(c => `<button class="btn b full" data-c="${c}">${esc(N[c] || c)}${!ACC.includes(c) ? " (amostra)" : ""}</button>`).join("")}</div></div></div>`;
  document.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { ls("cnm_cargo", b.dataset.c); boot(); });
}

// ---------- início ----------
async function boot() {
  try {
    // link do teste grátis: /app/?teste=enf&n=Maria
    const qs = new URLSearchParams(location.search), tq = qs.get("teste");
    if (tq && NOMES_KIT[tq]) { ls("cnm_guest", tq); ls("cnm_cargo", tq); if (qs.get("n") && !ls("cnm_nome")) ls("cnm_nome", qs.get("n").slice(0, 40)); }
    if (tq || qs.get("n")) history.replaceState(null, "", location.pathname + location.hash);
    if (DEMO) { user = { id: "demo", email: "aluna.demo@email.com" }; const dc = (location.search.match(/[?&]c=(\w+)/) || [])[1] || "tec"; cargos = /amostra/.test(location.search) ? [dc + "-amostra"] : [dc, dc + "-plano"]; }
    else {
      sb = sb || supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      const erroLink = /error_code=|error=/.test(location.hash);
      const { data } = await sb.auth.getSession();
      if (/access_token|error_code|error=/.test(location.hash)) history.replaceState(null, "", location.pathname);
      const g = ls("cnm_guest");
      if (!data.session) {
        if (erroLink) return viewLogin("O link de acesso venceu. Peça um novo aqui embaixo.");
        if (g && NOMES_KIT[g]) { GUEST = true; user = { id: "guest", email: "" }; cargos = [g + "-amostra"]; }
        else return viewLogin();
      } else {
        GUEST = false; user = data.session.user;
        let r = await sb.from("acessos").select("cargo,nome");
        if (r.error) r = await sb.from("acessos").select("cargo");
        cargos = [...new Set((r.data || []).map(x => x.cargo))];
        NOME_ACESSO = ((r.data || []).find(x => x.nome) || {}).nome || "";
        if (!cargos.length) { if (g && NOMES_KIT[g] && ss_semAcesso) { GUEST = true; cargos = [g + "-amostra"]; } else return viewSemAcesso(g && NOMES_KIT[g] ? g : ""); }
      }
    }
    ACC = cargos;
    BASES = [...new Set(cargos.filter(c => !/-(plano|audio)$/.test(c)).map(base))];
    if (!BASES.length) return viewSemAcesso();
    const pref = ls("cnm_cargo");
    cargo = BASES.includes(pref) ? pref : BASES.length === 1 ? BASES[0] : null;
    if (!cargo) return viewEscolha();
    ls("cnm_cargo", cargo);
    TRIAL = !cargos.includes(cargo);
    PLANO = cargos.includes(cargo + "-plano");
    AUDIO = cargos.includes(cargo + "-audio");
    $app.innerHTML = '<div class="boot"><div class="spin"></div></div>';
    [C, P] = await Promise.all([loadContent(TRIAL ? cargo + "-amostra" : cargo), loadProgress()]);
    P = Object.assign(emptyP(), P || {});
    BY = C.questoes; ASQ = {}; AS = {};
    allAs().forEach(a => { AS[a.code] = a; ASQ[a.code] = (a.q || []).filter(id => BY[id]); });
    migraTrilha();
    route();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="login"><div class="box"><h1 class="pg">Não foi possível carregar</h1><p class="muted">Confira sua internet e tente de novo.</p><button class="btn y full" onclick="location.reload()">Tentar de novo</button></div></div>`;
  }
}
if ("serviceWorker" in navigator && !DEMO) navigator.serviceWorker.register("sw.js").catch(() => {});
boot();
})();
