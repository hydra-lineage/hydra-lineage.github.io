"use strict";
(() => {
  const D = window.HYDRA;
  const $ = id => document.getElementById(id);
  if (!D) { $("stamp").textContent = "The study data could not be loaded."; return; }
  const S = D.summary, P = D.projects, HOUR = 3600;
  (D.roles || []).forEach((r, i) => { if (P[i]) P[i].role = r; });
  const T0 = Date.parse(S.start) / 1000, T1 = Date.parse(S.generated) / 1000;
  const MODES = {m: "Merged", r: "Re-applied", s: "Synced"};
  const ROUTES = {d: "from a project it is founded on", l: "relayed down its own line", b: "back up to a project the source is founded on",
    s: "from another line in the same family", x: "from another family", y: "mirrored history"};
  const num = v => v == null ? "–" : Number(v).toLocaleString("en-GB");
  const esc = v => String(v).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const fmt = (t, o) => new Intl.DateTimeFormat("en-GB", {timeZone: "UTC", ...o}).format(new Date(t * 1000));
  const day = t => fmt(t, {day: "numeric", month: "short"});
  const when = t => fmt(t, {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false});
  const span = h => h == null ? "–" : h < 1 ? Math.max(1, Math.round(h * 60)) + " min" : h < 48 ? (Math.round(h * 10) / 10) + " h" : Math.round(h / 24) + " days";
  const state = {modes: new Set(["m", "r"]), rows: "exchange", find: "", sel: null, change: null, cPage: 0, pPage: 0, sort: ["takersOut", -1]};

  // ---------- headline ----------
  const pct = (a, b) => b ? (Math.round(1000 * a / b) / 10) + "%" : "–";
  $("lede").innerHTML = "<b>" + num(S.projects) + "</b> projects from <b>" + num(S.owners) + "</b> separate owners are building on the same problem in public, many of them with AI coding agents. " +
    "Of the <b>" + num(S.changes) + "</b> changes they have made, <b>" + num(S.travelled) + "</b> were taken up by a project belonging to someone else" +
    (S.lagMedianH == null ? "." : ", half of them within <b>" + span(S.lagMedianH) + "</b>.");
  $("stamp").textContent = "Snapshot " + when(T1) + " UTC · " + num(S.commits) + " commits" + (S.recorded ? " · " + num(S.projects) + " of " + num(S.recorded) + " recorded repositories" : "") +
    (S.gone ? " · " + num(S.gone) + " projects no longer public" : "");
  const tiles = [
    [pct(S.travelled, S.changes), "of all changes were taken up by another owner"],
    [num(S.travelled2), "changes reached two or more other owners"],
    [num(S.twoHop), "were passed on again through an intermediary"],
    [span(S.lagMedianH), "median time from first appearance to take-up"],
    [num(S.adopt24), "take-ups in the last 24 hours"],
    [S.agentShare == null ? "–" : S.agentShare + "%", "of changes carry an AI agent signature"],
  ];
  $("tiles").innerHTML = tiles.map(([v, l]) => '<div class="tile"><b>' + v + "</b><span>" + l + "</span></div>").join("");

  // ---------- tooltip ----------
  const tip = $("tip");
  function showTip(html, e) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect(), x = Math.min(window.innerWidth - r.width - 8, e.clientX + 14);
    const y = e.clientY + 16 + r.height > window.innerHeight ? e.clientY - r.height - 10 : e.clientY + 16;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  // ---------- lineage ----------
  const kids = P.map(() => []);
  P.forEach((p, i) => { if (p.base != null) kids[p.base].push(i); });
  const order = [], rootOf = P.map(() => 0), family = new Map();
  // Families are listed busiest first, by how much of their work was exchanged; within a family, oldest first.
  const topOf = i => { while (P[i].base != null) i = P[i].base; return i; };
  const volume = P.map(() => 0);
  P.forEach((p, i) => { volume[topOf(i)] += p.in + p.ownTaken; });
  (function walk(list, root) {
    list.sort((a, b) => (root == null ? volume[b] - volume[a] : 0) || P[a].created - P[b].created).forEach(i => {
      const r = root == null ? i : root;
      if (root == null) family.set(i, family.size);
      rootOf[i] = r; order.push(i); walk(kids[i], r);
    });
  })(P.map((p, i) => i).filter(i => P[i].base == null), null);
  const descendants = P.map(() => 0);
  [...order].reverse().forEach(i => { if (P[i].base != null) descendants[P[i].base] += 1 + descendants[i]; });
  const ancestors = i => { const out = []; for (let j = P[i].base; j != null; j = P[j].base) out.push(j); return out; };
  const RH = 20, AX = 30;
  Object.assign(state, {folded: new Set(), isolate: true, range: "72", curves: "between", hover: null, cfind: ""});
  const viewStart = () => state.range === "all" ? T0 : Math.max(T0, T1 - (+state.range) * HOUR);
  const clock = t => fmt(t, {hour: "2-digit", minute: "2-digit", hour12: false});

  function passes(i) {
    const p = P[i];
    if (state.rows === "all") return true;
    if (state.rows === "active") return p.own > 0;
    return p.in > 0 || p.out > 0;
  }
  function partnersOf(sel) {
    const out = new Set();
    for (const [a, b, , m] of D.flows) { if (m === "s" && state.curves !== "mirror") continue; if (a === sel) out.add(b); else if (b === sel) out.add(a); }
    return out;
  }
  function projectTip(p) {
    const base = p.base == null ? "No earlier project in the study" : "Founded on " + esc(P[p.base].label);
    return "<b>" + esc(p.label) + "</b><br><i>" + (p.role ? p.role[0].toUpperCase() + p.role.slice(1) + " · " : "") + base + " · created " + when(p.created) + "</i><br>" +
      num(p.own) + " changes of its own" + (p.ownAgent ? " · " + num(p.ownAgent) + " carry an AI agent signature" : "") + "<br>" +
      num(p.ownTaken) + " of them taken up elsewhere, by " + num(p.takersOut) + " other owners<br>" +
      (p.gone ? "No longer public since " + when(p.gone) + "<br>" : "") +
      "Took up " + num(p.in) + " changes from " + num(p.sourcesIn) + " other owners" + (p.mirrored ? "<br><i>Also mirrors " + num(p.mirrored) + " changes synced from elsewhere</i>" : "");
  }
  function layoutRows() {
    const change = state.change != null ? D.changes[state.change] : null;
    let base;
    if (state.isolate && change) { base = new Set([change.o]); change.ev.forEach(e => { base.add(e[0]); base.add(e[1]); }); }
    else if (state.isolate && state.sel != null) { base = partnersOf(state.sel); base.add(state.sel); }
    else base = new Set(order.filter(passes));
    // A selection or a traced change is always shown in full, whatever is collapsed.
    const focused = change || state.sel != null;
    if (change && !state.isolate) base.forEach(i => { if (i === change.o || change.ev.some(e => e[0] === i || e[1] === i)) ancestors(i).forEach(j => state.folded.delete(j)); });
    const folds = focused && state.isolate ? new Set() : state.folded;
    // Ancestors stay so every branch has somewhere to start.
    const keep = new Set(base);
    base.forEach(i => ancestors(i).forEach(j => keep.add(j)));
    const foldedAbove = i => { let top = null; for (const j of ancestors(i)) if (folds.has(j)) top = j; return top; };
    const rows = order.filter(i => keep.has(i) && foldedAbove(i) == null);
    // A project inside a collapsed family is drawn on the family's visible row.
    const rep = i => { if (!keep.has(i)) return null; const top = foldedAbove(i); return top == null ? i : top; };
    return {rows, rowOf: new Map(rows.map((i, k) => [i, k])), rep, folds};
  }

  let geo = null;
  function drawLineage() {
    const {rows, rowOf, rep, folds: geo_folds} = layoutRows();
    const frame = $("lineage-scroll").clientWidth || 1000;
    const LW = frame < 700 ? 138 : 244;
    $("lineage").style.gridTemplateColumns = LW + "px max-content";
    const PW = Math.max(620, frame - LW - 18), PL = 14, PR = 24, H = rows.length * RH + 10;
    const v0 = viewStart(), span = T1 - v0, hourW = (PW - PL - PR) * HOUR / span;
    const x = t => PL + (PW - PL - PR) * (Math.min(T1, Math.max(v0, t)) - v0) / span;
    const y = i => rowOf.get(i) * RH + RH / 2 + 4;
    let grid = "", axis = "", lanes = "", arcs = "", labels = "";
    const step = span > 4 * 86400 ? 86400 : span > 30 * HOUR ? 6 * HOUR : 3 * HOUR;
    for (let t = Math.ceil(v0 / step) * step; t <= T1; t += step) {
      const midnight = t % 86400 === 0;
      grid += '<line class="' + (midnight ? "daygrid" : "hourgrid") + '" x1="' + x(t) + '" x2="' + x(t) + '" y1="0" y2="' + H + '"/>';
      axis += '<line class="tick" x1="' + x(t) + '" x2="' + x(t) + '" y1="' + (midnight ? 8 : 20) + '" y2="' + AX + '"/><text class="' + (midnight ? "" : "minor") + '" x="' + (x(t) + 5) + '" y="20">' + (midnight ? day(t) : clock(t)) + "</text>";
    }
    for (const nt of D.notices || []) {
      if (nt.t < v0 || nt.t > T1) continue;
      grid += '<line class="notice" x1="' + x(nt.t) + '" x2="' + x(nt.t) + '" y1="0" y2="' + H + '"/>';
      axis += '<path class="notice-mark" d="M' + (x(nt.t) - 4) + " 23h8l-4 7z" + '"><title>Takedown notice posted ' + when(nt.t) + " UTC</title></path>";
    }
    const maxAct = Math.max(1, ...P.flatMap(p => p.series.map(s => s[1]))), barW = Math.min(12, Math.max(1.6, hourW - .8));
    for (const i of rows) {
      const p = P[i], yy = y(i), born = p.created >= v0, x0 = x(p.created), x1 = Math.max(x0 + 2, x(p.last));
      const alt = family.get(rootOf[i]) % 2 === 1, folded = geo_folds.has(i);
      let g = (alt ? '<rect class="fam" x="0" y="' + (yy - RH / 2) + '" width="' + PW + '" height="' + RH + '"/>' : "") +
        '<rect class="row-band" x="0" y="' + (yy - RH / 2) + '" width="' + PW + '" height="' + RH + '"/>';
      if (born && p.base != null && rowOf.has(p.base)) {
        const yb = y(p.base);
        g += '<path class="branch" d="M' + (x0 - 7) + " " + yb + "Q" + x0 + " " + yb + " " + x0 + " " + (yb + 7) + "L" + x0 + " " + (yy - 4) + '"/>';
      }
      if (p.last >= v0) g += '<line class="life" x1="' + x0 + '" x2="' + x1 + '" y1="' + yy + '" y2="' + yy + '"/>';
      for (const [h, c] of p.series) {
        const t = T0 + h * HOUR; if (t < v0) continue;
        const hgt = 2 + 10 * Math.sqrt(c / maxAct);
        g += '<rect class="act" x="' + (x(t) + (hourW - barW) / 2) + '" y="' + (yy - hgt / 2) + '" width="' + barW + '" height="' + hgt + '" rx="1"/>';
      }
      if (born) g += '<circle class="birth" cx="' + x0 + '" cy="' + yy + '" r="3.2"/>';
      if (p.gone && p.gone >= v0) { const xg = x(p.gone); g += '<path class="gone" d="M' + (xg - 3.5) + " " + (yy - 3.5) + "l7 7m0 -7l-7 7" + '"/>'; }
      g += '<rect class="row-hit" data-p="' + i + '" x="0" y="' + (yy - RH / 2) + '" width="' + PW + '" height="' + RH + '"/>';
      lanes += '<g class="row" data-row="' + i + '">' + g + "</g>";
      labels += '<div class="lrow' + (p.base == null ? " root" : "") + (p.gone ? " was" : "") + (alt ? " alt" : "") + '" data-row="' + i + '" data-p="' + i + '" style="padding-left:' + (6 + Math.min(p.depth, 6) * (LW < 200 ? 5 : 11)) + 'px">' +
        (kids[i].length ? '<button type="button" class="fold" data-fold="' + i + '" aria-expanded="' + !folded + '" aria-label="' + (folded ? "Expand " : "Collapse ") + esc(p.label) + '">' + (folded ? "▸" : "▾") + "</button>" : '<span class="fold"></span>') +
        '<span class="lname">' + esc(p.label) + "</span>" + (folded ? '<span class="more">+' + descendants[i] + "</span>" : "") + "</div>";
    }
    // Most take-ups are a project pulling from the line it was founded on. Drawing each as a curve only repeats the
    // tree, so by default they become a quiet strip under the receiving row, and curves are kept for exchange
    // between lines. A selection, a traced change or the "all" setting draws every take-up as a curve.
    const everything = state.curves !== "between" || state.sel != null || state.change != null;
    const agg = new Map(), intake = new Map(); let hidden = 0, earlier = 0, drawn = 0, upstream = 0, strips = "";
    for (const [a, b, h3, m, k, r] of D.flows) {
      if (m === "s" && state.curves !== "mirror") continue;
      const ra = rep(a), rb = rep(b);
      if (ra == null || rb == null) { hidden += k; continue; }
      if (ra === rb) continue;
      if (T0 + (h3 * 3 + 3) * HOUR < v0) { earlier += k; continue; }
      const lateral = r === "b" || r === "s" || r === "x";
      if (m !== "s" && !lateral && !everything) { const at = rb + "|" + h3; intake.set(at, (intake.get(at) || 0) + k); upstream += k; continue; }
      const key = ra + "|" + rb + "|" + h3 + "|" + m + "|" + (m === "s" ? "y" : r || "d");
      agg.set(key, (agg.get(key) || 0) + k);
    }
    for (const [at, k] of intake) {
      const [row, h3] = at.split("|"), x0 = x(T0 + h3 * 3 * HOUR), x1 = x(T0 + (+h3 + 1) * 3 * HOUR);
      strips += '<rect class="intake" x="' + (x0 + 1) + '" y="' + (y(+row) + 5.5) + '" width="' + Math.max(2, x1 - x0 - 2) + '" height="3" rx="1.5" opacity="' + (.28 + .62 * Math.min(1, Math.log2(1 + k) / 8)).toFixed(2) + '"/>';
    }
    for (const [key, k] of agg) {
      const [a, b, h3, m, r] = key.split("|"), xt = x(T0 + (h3 * 3 + 1.5) * HOUR), ya = y(+a), yb = y(+b), bow = Math.min(40, 7 + Math.abs(yb - ya) * .14);
      const tag = ' data-a="' + a + '" data-b="' + b + '"', cls = "k-" + r + (m === "r" ? " re" : "");
      arcs += '<path class="arc ' + cls + '"' + tag + ' data-k="' + k + '" data-h="' + h3 + '" data-m="' + m + '" data-r="' + r + '" style="--o:' + (Math.max(.12, .85 - Math.abs(yb - ya) / 240) * (everything ? .55 : 1)).toFixed(2) + '" stroke-width="' + Math.min(3.2, .9 + .4 * Math.log2(1 + k)) + '" d="M' + xt + " " + ya + "C" + (xt - bow) + " " + ya + " " + (xt - bow) + " " + yb + " " + xt + " " + yb + '"/>' +
        '<circle class="end ' + cls + '"' + tag + ' cx="' + xt + '" cy="' + yb + '" r="2.6"/>';
      drawn += k;
    }
    $("lineage").innerHTML =
      '<div class="lg-corner">Project</div>' +
      '<div class="lg-axis"><svg width="' + PW + '" height="' + AX + '" aria-hidden="true">' + axis + "</svg></div>" +
      '<div class="lg-labels" style="height:' + H + 'px">' + labels + "</div>" +
      '<div class="lg-plot"><svg id="lsvg" width="' + PW + '" height="' + H + '" role="img" aria-label="Lineage of ' + rows.length + ' projects over time with changes moving between them">' +
      grid + '<g id="intake">' + strips + '</g><g id="arcs">' + arcs + "</g>" + lanes + '<g id="trace"></g></svg></div>';
    $("lineage").classList.toggle("dense", everything);
    $("lineage-note").textContent = rows.length + " of " + P.length + " projects · " +
      (everything ? num(drawn) + " take-ups" : num(drawn) + " take-ups between lines · " + num(upstream) + " from a project's own line") +
      (earlier ? " · " + num(earlier) + " before this time range" : "");
    geo = {x, y, rowOf, rep};
    paint();
  }

  function paint() {
    const root = $("lineage"), svg = $("lsvg"); if (!svg) return;
    const change = state.change != null ? D.changes[state.change] : null;
    const sel = state.sel != null ? geo.rep(state.sel) : null;
    const at = change ? null : sel != null ? sel : state.hover;
    const on = new Set();
    if (change) { [change.o, ...change.ev.flatMap(e => [e[0], e[1]])].forEach(i => { const r = geo.rep(i); if (r != null) on.add(r); }); }
    else if (at == null && state.find) found.forEach(i => { const r = geo.rep(i); if (r != null) on.add(r); });
    svg.querySelectorAll(".arc,.end").forEach(el => {
      const a = +el.dataset.a, b = +el.dataset.b, hit = at != null && (a === at || b === at);
      el.classList.toggle("on", hit);
      if (hit) { on.add(a); on.add(b); }
    });
    if (at != null) on.add(at);
    root.classList.toggle("focus", change != null || at != null || (state.find !== "" && found.length > 0));
    root.querySelectorAll("[data-row]").forEach(el => {
      const i = +el.dataset.row;
      el.classList.toggle("on", on.has(i)); el.classList.toggle("sel", !change && sel === i);
    });
    let trace = "";
    if (change && geo.rep(change.o) != null) {
      const xo = geo.x(change.t), yo = geo.y(geo.rep(change.o));
      for (const [to, from, t] of change.ev) {
        const rt = geo.rep(to); if (rt == null) continue;
        const rs = geo.rep(from) != null ? geo.rep(from) : geo.rep(change.o), xt = geo.x(t), ys = geo.y(rs), yt = geo.y(rt);
        trace += '<path class="trace" d="M' + xo + " " + yo + "L" + xt + " " + ys + "L" + xt + " " + yt + '"/><circle class="trace-dot" cx="' + xt + '" cy="' + yt + '" r="4"/>';
      }
      trace += '<circle class="trace-dot" cx="' + xo + '" cy="' + yo + '" r="5.5"/>';
    }
    $("trace").innerHTML = trace;
    $("clear").hidden = state.sel == null && !change;
    const info = $("lineage-sel");
    if (change) info.innerHTML = "<b>Tracing a change</b> · " + esc(change.s) + " · first appeared in " + esc(P[change.o].label) + " on " + when(change.t) + " · taken up by " + num(change.reach) + " other owners";
    else if (state.sel != null) {
      const p = P[state.sel];
      info.innerHTML = "<b>" + esc(p.label) + "</b> · " + (p.base == null ? "no earlier project beneath it" : "founded on " + esc(P[p.base].label)) + " · " + num(p.own) + " changes of its own · " +
        num(p.ownTaken) + " taken up by " + num(p.takersOut) + " other owners · took up " + num(p.in) + " from " + num(p.sourcesIn) + " owners" + (p.gone ? " · no longer public since " + when(p.gone) : "");
    }
    info.hidden = !change && state.sel == null;
  }

  function selectProject(i, keepOn) {
    state.change = null; state.cPage = 0;
    state.sel = !keepOn && state.sel === i ? null : i;
    if (state.sel != null) {
      ancestors(i).forEach(j => state.folded.delete(j));
      if (!state.isolate && !passes(i)) { state.rows = "all"; $("rows").value = "all"; }
    }
    drawLineage(); drawChanges();
    const row = $("lineage").querySelector('.lrow[data-row="' + i + '"]');
    if (row && state.sel != null) $("lineage-scroll").scrollTop = Math.max(0, row.offsetTop - 90);
  }
  $("lineage").addEventListener("click", e => {
    const fold = e.target.closest("[data-fold]");
    if (fold) { const i = +fold.dataset.fold; state.folded.has(i) ? state.folded.delete(i) : state.folded.add(i); drawLineage(); return; }
    const hit = e.target.closest("[data-p]");
    if (hit) selectProject(+hit.dataset.p);
  });
  $("lineage").addEventListener("mousemove", e => {
    const arc = e.target.closest(".arc");
    if (arc) {
      const t = T0 + arc.dataset.h * 3 * HOUR;
      showTip("<b>" + num(arc.dataset.k) + (arc.dataset.k === "1" ? " change " : " changes ") + MODES[arc.dataset.m].toLowerCase() + "</b><br>from " + esc(P[+arc.dataset.a].label) + "<br>into " + esc(P[+arc.dataset.b].label) +
        "<br>" + ROUTES[arc.dataset.r] +
        "<br><i>" + when(t) + " to " + clock(t + 3 * HOUR) + " UTC</i>", e);
      return;
    }
    const hit = e.target.closest("[data-p]"), i = hit ? +hit.dataset.p : null;
    if (hit) showTip(projectTip(P[i]), e); else hideTip();
    if (i !== state.hover) { state.hover = i; if (state.sel == null && state.change == null) paint(); }
  });
  $("lineage").addEventListener("mouseleave", () => { hideTip(); if (state.hover != null) { state.hover = null; paint(); } });

  // Search: a list of matching projects to jump to; rows that match stay lit while typing.
  let found = [], foundAt = 0;
  const findBox = $("find"), findList = $("find-list");
  function showFound() {
    const q = state.find;
    findList.hidden = !q; findBox.setAttribute("aria-expanded", Boolean(q));
    findList.innerHTML = !q ? "" : !found.length ? '<div class="none">No project matches “' + esc(findBox.value.trim()) + "”</div>" :
      found.slice(0, 8).map((i, n) => '<button type="button" role="option" aria-selected="' + (n === foundAt) + '" data-pick="' + i + '"><b>' + esc(P[i].label) + "</b><span>" +
        (P[i].base == null ? "no earlier project" : "founded on " + esc(P[P[i].base].label)) + " · " + num(P[i].own) + " own changes · taken up by " + num(P[i].takersOut) + "</span></button>").join("") +
      (found.length > 8 ? '<div class="none">' + (found.length - 8) + " more</div>" : "");
  }
  function runFind() {
    const q = findBox.value.trim().toLowerCase();
    state.find = q; foundAt = 0;
    found = !q ? [] : order.filter(i => P[i].label.toLowerCase().includes(q)).sort((a, b) =>
      (P[b].label.toLowerCase().startsWith(q) - P[a].label.toLowerCase().startsWith(q)) || (P[b].takersOut + P[b].in) - (P[a].takersOut + P[a].in));
    showFound(); paint();
  }
  function pickFound(i) { findBox.value = ""; state.find = ""; found = []; showFound(); selectProject(i, true); }
  findBox.addEventListener("input", runFind);
  findBox.addEventListener("focus", () => { if (state.find) showFound(); });
  findBox.addEventListener("blur", () => setTimeout(() => { findList.hidden = true; }, 150));
  findBox.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = Math.min(found.length, 8); if (n) { foundAt = (foundAt + (e.key === "ArrowDown" ? 1 : n - 1)) % n; showFound(); } }
    else if (e.key === "Enter" && found.length) { e.preventDefault(); pickFound(found[foundAt]); }
    else if (e.key === "Escape") { findBox.value = ""; runFind(); }
  });
  findList.addEventListener("mousedown", e => { const b = e.target.closest("[data-pick]"); if (b) { e.preventDefault(); pickFound(+b.dataset.pick); } });

  $("controls").addEventListener("click", e => {
    if (e.target.id === "clear") { state.sel = null; state.change = null; state.cPage = 0; drawLineage(); drawChanges(); }
    if (e.target.id === "fold-all") {
      const families = order.filter(i => kids[i].length && P[i].base == null), all = families.every(i => state.folded.has(i));
      state.folded = all ? new Set() : new Set(families);
      e.target.textContent = all ? "Collapse families" : "Expand families";
      drawLineage();
    }
  });
  $("rows").addEventListener("change", e => { state.rows = e.target.value; drawLineage(); });
  $("curves").addEventListener("change", e => { state.curves = e.target.value; drawLineage(); });
  $("range").addEventListener("change", e => { state.range = e.target.value; drawLineage(); });
  $("isolate").addEventListener("change", e => { state.isolate = e.target.checked; drawLineage(); });
  let resizeTimer; window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawLineage, 150); });

  // ---------- explorer ----------
  const ROUTE_NAME = {d: "down own line", l: "relayed down own line", b: "back up the line", s: "sideways, same family", x: "across families"};
  const after = s => "+" + span(s / HOUR);
  const familyOf = i => P[topOf(i)].label;
  const roleOf = i => P[i].role || "unclassified";
  let maxReach = 1;

  // One dot per take-up, placed by how long after first appearance it happened. Simultaneous take-ups stack.
  function spread(c) {
    const W = 150, H = 26, base = H - 7, win = 48 * HOUR, stack = new Map();
    let s = '<line class="sp-base" x1="3" x2="' + (W - 3) + '" y1="' + base + '" y2="' + base + '"/>';
    for (const h of [0, 24, 48]) { const xt = 3 + (W - 6) * h / 48; s += '<line class="sp-tick" x1="' + xt + '" x2="' + xt + '" y1="' + (base - 2) + '" y2="' + (base + 3) + '"/>'; }
    for (const [, , t, m, hop] of c.ev) {
      const xt = 3 + (W - 6) * Math.min(1, Math.max(0, t - c.t) / win), slot = Math.round(xt / 5), n = stack.get(slot) || 0;
      stack.set(slot, n + 1);
      if (n < 5) s += '<circle class="sp-dot ' + m + (hop > 1 ? " hop" : "") + '" cx="' + xt + '" cy="' + (base - 3.2 - n * 3.6) + '" r="2.3"/>';
    }
    return '<svg class="spread" width="' + W + '" height="' + H + '" role="img" aria-label="' + c.ev.length + ' take-ups over time">' + s + "</svg>";
  }
  function changeDetail(c, ci) {
    const owners = new Set(c.ev.map(e => P[e[0]].owner)).size, last = c.ev.length ? c.ev[c.ev.length - 1][2] - c.t : 0;
    const items = c.ev.map(([to, from, t, m, hop, r]) => '<li><span class="lag">' + after(t - c.t) + '</span><i class="sw ' + m + '"></i><span>' + (m === "m" ? "merged into " : "re-applied by ") +
      "<b>" + esc(P[to].label) + "</b>" + (hop > 1 && from !== c.o ? " <em>by way of " + esc(P[from].label) + "</em>" : "") + (ROUTE_NAME[r] ? " <em>· " + ROUTE_NAME[r] + "</em>" : "") + "</span></li>").join("");
    return '<div class="cd-head"><span><b>' + esc(c.s) + "</b> · first appeared in " + esc(P[c.o].label) + ", " + when(c.t) + " UTC · " + num(c.ev.length) + (c.ev.length === 1 ? " take-up" : " take-ups") +
      " by " + num(owners) + (owners === 1 ? " owner" : " owners") + (c.ev.length > 1 ? " over " + span(last / HOUR) : "") + (c.founding ? " · " + num(c.founding) + " projects founded with it" : "") +
      '</span><button type="button" class="soft" data-trace="' + ci + '">' + (state.change === ci ? "Stop tracing" : "Show on lineage") + '</button></div><ol class="cd-list">' + items + "</ol>";
  }
  const LINES = {edges: [11, 51, 201, 1001], whole: true, from: 1}, DELAY = {edges: [1, 3, 6, 12, 24, 48], unit: "h"};
  const caret = (v, r, open) => '<span class="caret">' + (open ? "▾" : "▸") + "</span>" + esc(v);

  function takeupRows() {
    const rows = [];
    D.changes.forEach((c, ci) => c.ev.forEach(([to, from, t, m, hop, r], n) => rows.push({
      id: ci + "." + n, ci, c, to, s: c.s, origin: P[c.o].label, taker: P[to].label, via: P[from].label,
      originFamily: familyOf(c.o), takerFamily: familyOf(to), within: familyOf(c.o) === familyOf(to) ? "within a family" : "across families",
      originRole: roleOf(c.o), takerRole: roleOf(to), t, lag: Math.round((t - c.t) / 36) / 100, mode: MODES[m], route: ROUTE_NAME[r] || "unclassified",
      step: hop > 1 ? "through an intermediary" : "direct", kind: c.kind || "unclassified", agent: c.agent || "none",
      lines: c.add + c.del, files: c.files, reach: c.reach,
    })));
    return rows;
  }
  function changeRows() {
    maxReach = Math.max(1, ...D.changes.map(c => c.reach));
    return D.changes.map((c, i) => ({
      i, c, s: c.s, origin: P[c.o].label, family: familyOf(c.o), originRole: roleOf(c.o), t: c.t, reach: c.reach, takeups: c.ev.length,
      first: c.lag == null ? null : Math.round(c.lag / 36) / 100, lines: c.add + c.del, files: c.files,
      agent: c.agent || "none", kind: c.kind || "unclassified", onward: c.hops > 1 ? "yes" : "no", founding: c.founding || 0,
      routes: [...new Set(c.ev.map(e => ROUTE_NAME[e[5]]).filter(Boolean))], modes: [...new Set(c.ev.map(e => MODES[e[3]]))],
      takers: [...new Set(c.ev.map(e => P[e[0]].label))],
    }));
  }
  function pairRows() {
    const pairs = new Map();
    for (const [a, b, h3, m, k, r] of D.flows) {
      const key = a + ">" + b, t = T0 + h3 * 3 * HOUR, same = familyOf(a) === familyOf(b);
      const p = pairs.get(key) || {id: key, a, b, from: P[a].label, to: P[b].label, fromFamily: familyOf(a), toFamily: familyOf(b), fromRole: roleOf(a), toRole: roleOf(b),
        within: same ? "within a family" : "across families", takeups: 0, merged: 0, reapplied: 0, mirrored: 0, routes: new Set(), first: null, last: null};
      if (m === "s") p.mirrored += k;
      else { p.takeups += k; m === "m" ? p.merged += k : p.reapplied += k; if (ROUTE_NAME[r]) p.routes.add(ROUTE_NAME[r]); p.first = p.first == null ? t : Math.min(p.first, t); p.last = p.last == null ? t : Math.max(p.last, t); }
      pairs.set(key, p);
    }
    return [...pairs.values()].map(p => ({...p, routes: [...p.routes], kindOfLink: p.takeups ? "take-ups" : "mirroring only"}));
  }
  const explorer = HydraExplorer($("explore"), {datasets: [
    {id: "takeups", label: "Take-ups", rows: takeupRows, id_: r => r.id, sort: ["t", -1], group: ["route", "rows"],
      rowClass: r => state.change === r.ci ? "traced" : "", detail: r => changeDetail(r.c, r.ci),
      fields: [
        {key: "s", label: "Change", type: "text", wide: true, fmt: caret},
        {key: "origin", label: "Origin", type: "cat"}, {key: "taker", label: "Taken up by", type: "cat"},
        {key: "route", label: "Route", type: "cat"}, {key: "mode", label: "Arrived by", type: "cat"},
        {key: "t", label: "When · UTC", type: "date"},
        {key: "lag", label: "Delay, h", type: "num", ...DELAY, fmt: (v, r) => after(r.t - r.c.t)},
        {key: "within", label: "Family boundary", type: "cat"}, {key: "step", label: "Step", type: "cat"},
        {key: "kind", label: "Kind of change", type: "cat"}, {key: "agent", label: "AI signature", type: "cat"},
        {key: "originRole", label: "Origin's role", type: "cat", hidden: true}, {key: "takerRole", label: "Taker's role", type: "cat"},
        {key: "originFamily", label: "Origin's family", type: "cat", hidden: true}, {key: "takerFamily", label: "Taker's family", type: "cat", hidden: true},
        {key: "via", label: "Came through", type: "cat", hidden: true},
        {key: "lines", label: "Lines changed", type: "num", ...LINES},
        {key: "reach", label: "Owners the change reached", type: "num", edges: [2, 3, 5, 10], whole: true, from: 1, hidden: true},
        {key: "files", label: "Files", type: "num", edges: [2, 4, 11], whole: true, from: 0, hidden: true},
      ]},
    {id: "changes", label: "Changes", rows: changeRows, id_: r => r.i, sort: ["reach", -1], group: ["kind", "rows"],
      rowClass: r => state.change === r.i ? "traced" : "", detail: r => changeDetail(r.c, r.i),
      fields: [
        {key: "s", label: "Change", type: "text", wide: true, fmt: caret},
        {key: "origin", label: "First appeared in", type: "cat"}, {key: "family", label: "Family", type: "cat"},
        {key: "t", label: "When · UTC", type: "date"},
        {key: "reach", label: "Owners reached", type: "num", edges: [2, 3, 5, 10], whole: true, from: 1,
          fmt: v => '<span class="reach"><b>' + num(v) + '</b><span class="rbar"><i style="width:' + Math.round(100 * v / maxReach) + '%"></i></span></span>'},
        {key: "takeups", label: "Take-ups", type: "num", sum: true, edges: [2, 3, 5, 10], whole: true, from: 1},
        {key: "spread", label: "Spread · 0, 24, 48 h", type: "viz", get: () => null, fmt: (v, r) => spread(r.c)},
        {key: "first", label: "First take-up, h", type: "num", ...DELAY, fmt: (v, r) => r.c.lag == null ? "–" : after(r.c.lag)},
        {key: "routes", label: "Route", type: "tags"}, {key: "modes", label: "Arrived by", type: "tags"},
        {key: "onward", label: "Passed onward", type: "cat"}, {key: "kind", label: "Kind of change", type: "cat"}, {key: "agent", label: "AI signature", type: "cat"},
        {key: "originRole", label: "Origin's role", type: "cat", hidden: true},
        {key: "lines", label: "Lines changed", type: "num", ...LINES, fmt: (v, r) => "+" + num(r.c.add) + " −" + num(r.c.del)},
        {key: "files", label: "Files", type: "num", edges: [2, 4, 11], whole: true, from: 0, hidden: true},
        {key: "founding", label: "Projects founded with it", type: "num", edges: [1, 2, 6, 21], whole: true, from: 0, hidden: true},
        {key: "takers", label: "Taken up by", type: "tags", hidden: true},
      ]},
    {id: "pairs", label: "Exchanges", rows: pairRows, id_: r => r.id, sort: ["takeups", -1], group: ["within", "sum:takeups"],
      onRow: r => { selectProject(r.b, true); $("lineage-title").scrollIntoView({behavior: "smooth", block: "start"}); },
      fields: [
        {key: "from", label: "From", type: "cat"}, {key: "to", label: "Into", type: "cat"},
        {key: "within", label: "Family boundary", type: "cat"}, {key: "kindOfLink", label: "Link", type: "cat"},
        {key: "takeups", label: "Take-ups", type: "num", sum: true, edges: [1, 2, 6, 21, 101], whole: true, from: 0},
        {key: "merged", label: "Merged", type: "num", sum: true}, {key: "reapplied", label: "Re-applied", type: "num", sum: true},
        {key: "mirrored", label: "Mirrored", type: "num", sum: true, edges: [1, 101, 1001], whole: true, from: 0},
        {key: "routes", label: "Route", type: "tags"},
        {key: "fromRole", label: "Source's role", type: "cat"}, {key: "toRole", label: "Taker's role", type: "cat"},
        {key: "fromFamily", label: "Source's family", type: "cat", hidden: true}, {key: "toFamily", label: "Taker's family", type: "cat", hidden: true},
        {key: "first", label: "First · UTC", type: "date"}, {key: "last", label: "Last · UTC", type: "date", facet: false},
      ]},
    {id: "projects", label: "Projects", id_: r => r.i, sort: ["takersOut", -1], group: ["role", "sum:own"],
      rows: () => P.map((p, i) => ({...p, i, family: familyOf(i), baseLabel: p.base == null ? "(none)" : P[p.base].label, role: roleOf(i),
        agentPct: p.own ? Math.round(100 * p.ownAgent / p.own) : null, status: p.gone ? "no longer public" : "public",
        takenPct: p.own ? Math.round(100 * p.ownTaken / p.own) : null})),
      rowClass: r => state.sel === r.i ? "traced" : "",
      onRow: r => { selectProject(r.i, true); $("lineage-title").scrollIntoView({behavior: "smooth", block: "start"}); },
      fields: [
        {key: "label", label: "Project", type: "text"}, {key: "role", label: "Role", type: "cat"}, {key: "family", label: "Family", type: "cat"},
        {key: "baseLabel", label: "Founded on", type: "cat"},
        {key: "depth", label: "Depth in family", type: "num", edges: [1, 2, 3, 5], whole: true, from: 0},
        {key: "created", label: "Created · UTC", type: "date"}, {key: "last", label: "Last active · UTC", type: "date", hidden: true},
        {key: "own", label: "Own changes", type: "num", sum: true, edges: [6, 21, 101, 501], whole: true, from: 2},
        {key: "agentPct", label: "AI signature, %", type: "num", edges: [1, 25, 50, 75], unit: "%"},
        {key: "ownTaken", label: "Taken up elsewhere", type: "num", sum: true}, {key: "takenPct", label: "Taken up, %", type: "num", hidden: true},
        {key: "takersOut", label: "Owners reached", type: "num", edges: [1, 2, 6, 11], whole: true, from: 0},
        {key: "in", label: "Took up", type: "num", sum: true, edges: [1, 11, 101, 1001], whole: true, from: 0},
        {key: "sourcesIn", label: "From owners", type: "num"}, {key: "mirrored", label: "Mirrored", type: "num", sum: true, hidden: true},
        {key: "authors", label: "Authors", type: "num", edges: [2, 3, 6, 11], whole: true, from: 1, hidden: true},
        {key: "commits", label: "Commits held", type: "num", hidden: true}, {key: "branches", label: "Branches", type: "num", hidden: true},
        {key: "status", label: "Status", type: "cat", hidden: true},
      ]},
  ]});
  function drawChanges() {
    const sel = state.sel, clear = () => { state.sel = null; state.change = null; drawLineage(); drawChanges(); };
    const label = sel == null ? "" : "Involving " + P[sel].label;
    explorer.setScope("takeups", sel == null ? null : r => r.c.o === sel || r.to === sel, label, clear);
    explorer.setScope("changes", sel == null ? null : r => r.c.o === sel || r.c.ev.some(e => e[0] === sel), label, clear);
    explorer.setScope("pairs", sel == null ? null : r => r.a === sel || r.b === sel, label, clear);
    explorer.refresh();
  }
  function drawProjects() {}
  $("explore").addEventListener("click", e => {
    const b = e.target.closest("[data-trace]"); if (!b) return;
    const i = +b.dataset.trace; state.change = state.change === i ? null : i;
    explorer.refresh(); drawLineage();
    if (state.change != null) $("lineage-title").scrollIntoView({behavior: "smooth", block: "start"});
  });
  // The page opens with the most widely taken-up changes; the full list follows and replaces them in the same order.
  function adoptAllChanges() {
    if (!window.HYDRA_CHANGES || window.HYDRA_CHANGES.length <= D.changes.length) return;
    D.changes = window.HYDRA_CHANGES; explorer.reload("takeups"); explorer.reload("changes");
  }
  window.__hydraChangesReady = adoptAllChanges; adoptAllChanges();

  // ---------- charts ----------
  function bars(el, labels, series, opts = {}) {
    const W = 420, H = 190, L = 34, R = 6, T = 10, B = 26, n = labels.length;
    const totals = labels.map((_, i) => series.reduce((s, q) => s + q.values[i], 0));
    const peak = Math.max(1, ...totals), mag = Math.pow(10, Math.floor(Math.log10(peak))), top = Math.ceil(peak / mag) * mag;
    const bw = (W - L - R) / n, yv = v => T + (H - T - B) * (1 - v / top);
    let s = "";
    for (const v of [0, top / 2, top]) s += '<line class="' + (v ? "gridline" : "base") + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + yv(v) + '" y2="' + yv(v) + '"/><text x="' + (L - 6) + '" y="' + (yv(v) + 4) + '" text-anchor="end">' + num(v) + (opts.unit || "") + "</text>";
    labels.forEach((label, i) => {
      let acc = 0;
      for (const q of series) {
        const v = q.values[i]; if (!v) continue;
        const h = Math.max(1, yv(acc) - yv(acc + v) - (acc ? 1 : 0)), w = Math.max(1, bw - (bw > 6 ? 2 : .6));
        s += '<rect class="bar ' + (q.cls || "") + '" x="' + (L + i * bw + (bw - w) / 2) + '" y="' + yv(acc + v) + '" width="' + w + '" height="' + h + '" rx="' + Math.min(2, w / 2) + '"/>';
        acc += v;
      }
      if (opts.values) s += '<text class="val" x="' + (L + i * bw + bw / 2) + '" y="' + (yv(totals[i]) - 5) + '" text-anchor="middle">' + totals[i] + (opts.unit || "") + "</text>";
      if (opts.tick(i)) s += '<text x="' + (L + i * bw + (opts.values ? bw / 2 : 0)) + '" y="' + (H - 8) + '" text-anchor="' + (opts.values ? "middle" : "start") + '">' + esc(opts.tick(i)) + "</text>";
      s += '<rect class="hit" data-i="' + i + '" x="' + (L + i * bw) + '" y="' + T + '" width="' + bw + '" height="' + (H - T - B) + '"/>';
    });
    el.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opts.label) + '">' + s + "</svg>";
    el.onmousemove = e => {
      const hit = e.target.closest("[data-i]"); if (!hit) return hideTip();
      const i = +hit.dataset.i;
      showTip("<b>" + esc(labels[i]) + "</b><br>" + series.map(q => (series.length > 1 ? esc(q.name) + ": " : "") + num(q.values[i]) + (opts.unit || "")).join("<br>") +
        (series.length > 1 ? "<br><i>Total " + num(totals[i]) + "</i>" : ""), e);
    };
    el.onmouseleave = hideTip;
  }
  const B3 = Math.ceil(S.bins / 3), fold = a => Array.from({length: B3}, (_, i) => (a[3 * i] || 0) + (a[3 * i + 1] || 0) + (a[3 * i + 2] || 0));
  const binLabel = i => when(T0 + i * 3 * HOUR) + " UTC, 3 hours";
  const dayTick = i => (T0 + i * 3 * HOUR) % 86400 === 0 && i % (B3 > 90 ? 16 : 8) === 0 ? day(T0 + i * 3 * HOUR) : "";
  const labels3 = Array.from({length: B3}, (_, i) => binLabel(i));
  bars($("chart-new"), labels3, [{name: "New changes", values: fold(D.rates.new)}], {tick: dayTick, label: "New changes per three hours"});
  bars($("chart-adopt"), labels3, [{name: "Merged", cls: "m", values: fold(D.rates.merge)}, {name: "Re-applied", cls: "r", values: fold(D.rates.reapply)}],
    {tick: dayTick, label: "Changes taken up by another owner per three hours"});
  const lagTotal = Math.max(1, S.lagHist.reduce((a, b) => a + b, 0)), E = S.lagEdges;
  const lagLabels = ["< " + E[0] + " h", ...E.slice(0, -1).map((e, i) => e + "–" + E[i + 1] + " h"), E[E.length - 1] + " h +"];
  bars($("chart-lag"), lagLabels, [{name: "Share of take-ups", values: S.lagHist.map(v => Math.round(100 * v / lagTotal))}], {tick: i => lagLabels[i], values: true, unit: "%", label: "Distribution of time to take-up"});

  // Whose work travels: the projects whose changes reached the most other owners.
  const givers = P.map((p, i) => i).filter(i => P[i].takersOut > 0).sort((a, b) => P[b].takersOut - P[a].takersOut || P[b].ownTaken - P[a].ownTaken).slice(0, 8);
  const giverMax = Math.max(1, ...givers.map(i => P[i].takersOut));
  $("chart-givers").innerHTML = givers.map(i => '<button type="button" class="hbar" data-giver="' + i + '"><span class="hb-name">' + esc(P[i].label) + '</span><span class="hb-track"><i style="width:' +
    Math.round(100 * P[i].takersOut / giverMax) + '%"></i></span><span class="hb-val">' + num(P[i].takersOut) + "</span></button>").join("") || '<p class="note">No cross-owner take-ups yet.</p>';
  $("chart-givers").addEventListener("click", e => { const b = e.target.closest("[data-giver]"); if (b) { selectProject(+b.dataset.giver, true); $("lineage-title").scrollIntoView({behavior: "smooth", block: "start"}); } });

  drawLineage(); drawChanges(); drawProjects();
})();
