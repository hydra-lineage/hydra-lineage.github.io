"use strict";
// Data explorer. Several datasets share one interface:
//   facets     every categorical field, date and numeric band, with counts that respond to the other filters
//   group by   any facet field against a measure (rows, or sum / mean / median of a numeric field), as clickable bars
//   table      sortable, with every categorical value clickable as a filter, totals, column chooser, CSV
//   address    the whole state lives in the URL fragment, so a view can be linked
//
// Field: {key, label, type: "cat" | "tags" | "date" | "num" | "text" | "viz", get(row), fmt(value, row, open) -> html,
//         text(row), edges: [..] (numeric bands), whole: true (integer bands), unit, sum, hidden, wide, facet: false}
window.HydraExplorer = function (root, cfg) {
  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const num = v => v == null || v === "" || Number.isNaN(v) ? "–" : Number(v).toLocaleString("en-GB", {maximumFractionDigits: 2});
  const fmtDate = (t, o) => new Intl.DateTimeFormat("en-GB", {timeZone: "UTC", ...o}).format(new Date(t * 1000));
  const day = t => fmtDate(t, {day: "numeric", month: "short"});
  const stamp = t => fmtDate(t, {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false});
  const sets = new Map(cfg.datasets.map(d => [d.id, d]));
  const cache = new Map();

  const blank = () => ({f: {}, r: {}, q: "", sort: null, g: null, page: 0, size: 25, hidden: null, open: null, more: {}, vq: {}});
  const views = new Map(cfg.datasets.map(d => [d.id, blank()]));
  let cur = cfg.datasets[0].id;
  const scopes = new Map();

  const ds = () => sets.get(cur);
  const st = () => views.get(cur);
  const rowsOf = id => { if (!cache.has(id)) cache.set(id, sets.get(id).rows()); return cache.get(id); };
  const val = (c, r) => c.get ? c.get(r) : r[c.key];
  const plain = (c, r) => { if (c.text) return c.text(r); const v = val(c, r); return v == null ? "" : Array.isArray(v) ? v.join(", ") : c.type === "date" ? stamp(v) : String(v); };
  const isFacet = c => c.facet !== false && (c.type === "cat" || c.type === "tags" || c.type === "date" || (c.type === "num" && c.edges));
  const field = k => ds().fields.find(c => c.key === k);

  // ---- numeric bands ----
  function bands(c) {
    if (c._bands) return c._bands;
    const e = c.edges, u = c.unit ? " " + c.unit : "", out = [];
    for (let i = 0; i <= e.length; i++) {
      const lo = i ? e[i - 1] : null, hi = i < e.length ? e[i] : null;
      out.push(c.whole ? (hi == null ? lo + "+" : lo == null ? (hi - 1 <= (c.from || 0) ? String(c.from || 0) : (c.from || 0) + "–" + (hi - 1)) : hi - 1 === lo ? String(lo) : lo + "–" + (hi - 1)) + u
        : (lo == null ? "under " + hi : hi == null ? lo + " or more" : lo + "–" + hi) + u);
    }
    return (c._bands = out);
  }
  const bandOf = (c, v) => { if (v == null) return null; let i = 0; while (i < c.edges.length && v >= c.edges[i]) i++; return bands(c)[i]; };
  // The values a row has for a facet field, as strings.
  function keysOf(c, r) {
    const v = val(c, r);
    if (c.type === "tags") return v || [];
    if (v == null || v === "") return [];
    return [c.type === "date" ? day(v) : c.type === "num" ? bandOf(c, v) : String(v)];
  }

  // ---- filtering ----
  function tests(except) {
    const s = st(), list = [];
    for (const [k, chosen] of Object.entries(s.f)) {
      if (k === except || !chosen.length) continue;
      const c = field(k); if (!c) continue;
      const want = new Set(chosen);
      list.push(r => keysOf(c, r).some(x => want.has(x)));
    }
    for (const [k, [lo, hi]] of Object.entries(s.r)) {
      if (k === except) continue;
      const c = field(k); if (!c || (lo == null && hi == null)) continue;
      list.push(r => { const v = val(c, r); return v != null && (lo == null || v >= lo) && (hi == null || v <= hi); });
    }
    const words = s.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length) {
      const where = ds().fields.filter(c => c.type === "text" || c.type === "cat" || c.type === "tags");
      list.push(r => { const hay = where.map(c => plain(c, r)).join(" \u0001 ").toLowerCase(); return words.every(w => hay.includes(w)); });
    }
    const scope = scopes.get(cur); if (scope) list.push(scope.test);
    return list;
  }
  const filtered = except => { const t = tests(except); return rowsOf(cur).filter(r => t.every(f => f(r))); };
  function sorted(rows) {
    const s = st().sort || ds().sort; if (!s) return rows;
    const c = field(s[0]); if (!c) return rows;
    const key = r => { const v = val(c, r); return Array.isArray(v) ? v.join(",") : v; };
    return [...rows].sort((a, b) => {
      const x = key(a), y = key(b);
      if (x == null || x === "") return y == null || y === "" ? 0 : 1;
      if (y == null || y === "") return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", {numeric: true})) * s[1];
    });
  }
  const active = () => { const s = st(); return Object.values(s.f).some(v => v.length) || Object.values(s.r).some(v => v[0] != null || v[1] != null) || s.q; };

  // ---- shell ----
  root.classList.add("x");
  root.innerHTML = '<div class="x-top"><div class="x-tabs" role="tablist"></div><span class="x-gap"></span><span class="x-count"></span>' +
    '<button type="button" class="soft" data-act="reset" hidden>Reset</button>' +
    '<details class="x-cols"><summary class="soft">Columns</summary><div class="x-menu"></div></details>' +
    '<button type="button" class="soft" data-act="csv">Download CSV</button><button type="button" class="soft" data-act="link">Copy link</button></div>' +
    '<div class="x-chips"></div><div class="x-body"><aside class="x-side"><input type="search" class="x-q" placeholder="Search" aria-label="Search">' +
    '<details class="x-fwrap" open><summary>Filters</summary><div class="x-facets"></div></details></aside>' +
    '<div class="x-main"><div class="x-group"></div><div class="x-scroll"><table><thead></thead><tbody></tbody><tfoot></tfoot></table></div><div class="pager x-pager"></div></div></div>';
  const q = sel => root.querySelector(sel);

  function drawTabs() {
    q(".x-tabs").innerHTML = cfg.datasets.map(d => '<button type="button" role="tab" aria-selected="' + (d.id === cur) + '" data-set="' + d.id + '">' + esc(d.label) +
      ' <span>' + num(rowsOf(d.id).length) + "</span></button>").join("");
  }
  function drawChips() {
    const s = st(), out = [], scope = scopes.get(cur);
    if (scope) out.push('<span class="x-chip scope">' + esc(scope.label) + '<button type="button" data-act="unscope" aria-label="Remove">×</button></span>');
    if (s.q) out.push('<span class="x-chip">Search: ' + esc(s.q) + '<button type="button" data-act="unq" aria-label="Remove">×</button></span>');
    for (const [k, chosen] of Object.entries(s.f)) for (const v of chosen)
      out.push('<span class="x-chip"><i>' + esc(field(k).label) + "</i> " + esc(v) + '<button type="button" data-unf="' + esc(k) + '" data-v="' + esc(v) + '" aria-label="Remove">×</button></span>');
    for (const [k, [lo, hi]] of Object.entries(s.r)) if (lo != null || hi != null)
      out.push('<span class="x-chip"><i>' + esc(field(k).label) + "</i> " + (lo != null && hi != null ? num(lo) + " to " + num(hi) : lo != null ? num(lo) + " or more" : "up to " + num(hi)) +
        '<button type="button" data-unr="' + esc(k) + '" aria-label="Remove">×</button></span>');
    q(".x-chips").innerHTML = out.join("");
    q('[data-act="reset"]').hidden = !active();
  }
  function facetCounts(c) {
    const count = new Map();
    for (const r of filtered(c.key)) for (const k of keysOf(c, r)) count.set(k, (count.get(k) || 0) + 1);
    return count;
  }
  function drawFacets() {
    const s = st();
    q(".x-facets").innerHTML = ds().fields.filter(isFacet).map(c => {
      const count = facetCounts(c), chosen = new Set(s.f[c.key] || []);
      let items;
      if (c.type === "num") items = bands(c).map(b => [b, count.get(b) || 0]).filter(([b, n]) => n || chosen.has(b));
      else if (c.type === "date") {
        const order = new Map(); for (const r of rowsOf(cur)) { const v = val(c, r); if (v != null && !order.has(day(v))) order.set(day(v), v); }
        items = [...order.entries()].sort((a, b) => a[1] - b[1]).map(([d]) => [d, count.get(d) || 0]).filter(([d, n]) => n || chosen.has(d));
      } else {
        for (const v of chosen) if (!count.has(v)) count.set(v, 0);
        items = [...count.entries()].sort((a, b) => (chosen.has(b[0]) - chosen.has(a[0])) || b[1] - a[1] || a[0].localeCompare(b[0]));
      }
      const total = items.length, needle = (s.vq[c.key] || "").toLowerCase();
      if (needle) items = items.filter(([v]) => v.toLowerCase().includes(needle));
      const limit = s.more[c.key] ? 400 : 7, peak = Math.max(1, ...items.map(i => i[1])), range = s.r[c.key] || [null, null];
      return '<section class="xf" data-k="' + c.key + '"><header><h4>' + esc(c.label) + "</h4>" +
        (c.type === "num" ? '<span class="xr"><input data-min="' + c.key + '" inputmode="decimal" placeholder="min" value="' + (range[0] == null ? "" : range[0]) + '" aria-label="' + esc(c.label) + ' at least">' +
          '<input data-max="' + c.key + '" inputmode="decimal" placeholder="max" value="' + (range[1] == null ? "" : range[1]) + '" aria-label="' + esc(c.label) + ' at most"></span>' : "") +
        (c.type !== "num" && c.type !== "date" && total > 7 ? '<input class="xvq" data-vq="' + c.key + '" placeholder="find" value="' + esc(s.vq[c.key] || "") + '" aria-label="Find a value in ' + esc(c.label) + '">' : "") +
        "</header><ul>" + items.slice(0, limit).map(([v, n]) => '<li><button type="button" class="xv' + (chosen.has(v) ? " on" : "") + (n ? "" : " zero") + '" data-f="' + c.key + '" data-v="' + esc(v) +
          '" aria-pressed="' + chosen.has(v) + '"><span class="xn">' + esc(v) + '</span><span class="xb"><i style="width:' + Math.round(100 * n / peak) + '%"></i></span><span class="xc">' + num(n) + "</span></button></li>").join("") +
        (items.length ? "" : '<li class="xnone">No values</li>') + "</ul>" +
        (items.length > 7 ? '<button type="button" class="xmore" data-more="' + c.key + '">' + (s.more[c.key] ? "Show fewer" : "Show all " + num(items.length)) + "</button>" : "") + "</section>";
    }).join("");
  }
  const MEASURES = {sum: "Sum of ", mean: "Mean ", median: "Median "};
  function drawGroup(rows) {
    const d = ds(), s = st(), dims = d.fields.filter(isFacet), nums = d.fields.filter(c => c.type === "num" && c.measure !== false);
    const g = s.g || d.group || [dims[0] && dims[0].key, "rows"];
    const dim = field(g[0]) || dims[0];
    if (!dim) { q(".x-group").innerHTML = ""; return; }
    const [how, on] = g[1] === "rows" ? ["rows", null] : g[1].split(":"), onField = on ? field(on) : null;
    const groups = new Map();
    for (const r of rows) for (const k of keysOf(dim, r)) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const measure = list => {
      if (how === "rows" || !onField) return list.length;
      const vs = list.map(r => val(onField, r)).filter(v => v != null); if (!vs.length) return null;
      if (how === "sum") return vs.reduce((a, b) => a + b, 0);
      if (how === "mean") return vs.reduce((a, b) => a + b, 0) / vs.length;
      vs.sort((a, b) => a - b); return vs.length % 2 ? vs[(vs.length - 1) / 2] : (vs[vs.length / 2 - 1] + vs[vs.length / 2]) / 2;
    };
    let items = [...groups.entries()].map(([k, list]) => [k, measure(list), list.length]).filter(i => i[1] != null);
    if (dim.type === "num") { const o = bands(dim); items.sort((a, b) => o.indexOf(a[0]) - o.indexOf(b[0])); }
    else if (dim.type === "date") { const o = new Map(); for (const r of rowsOf(cur)) { const v = val(dim, r); if (v != null && !o.has(day(v))) o.set(day(v), v); } items.sort((a, b) => o.get(a[0]) - o.get(b[0])); }
    else items.sort((a, b) => b[1] - a[1]);
    const additive = how === "rows" || how === "sum", whole = additive && dim.type !== "tags" ? items.reduce((a, i) => a + i[1], 0) : 0;
    const peak = Math.max(1e-9, ...items.map(i => Math.abs(i[1]))), limit = s.more.__g ? 400 : 12, chosen = new Set(s.f[dim.key] || []);
    q(".x-group").innerHTML = '<div class="xg-head"><label class="pick">Group by <select data-gdim>' + dims.map(c => '<option value="' + c.key + '"' + (c.key === dim.key ? " selected" : "") + ">" + esc(c.label) + "</option>").join("") +
      '</select></label><label class="pick">Measure <select data-gmeas><option value="rows">Rows</option>' + Object.entries(MEASURES).map(([m, text]) => nums.map(c =>
        '<option value="' + m + ":" + c.key + '"' + (g[1] === m + ":" + c.key ? " selected" : "") + ">" + text + esc(c.label.toLowerCase()) + "</option>").join("")).join("") + "</select></label>" +
      '<span class="xg-note">' + num(items.length) + (items.length === 1 ? " group" : " groups") + "</span></div>" +
      '<div class="xg-bars">' + items.slice(0, limit).map(([k, v, n]) => '<button type="button" class="xgb' + (chosen.has(k) ? " on" : "") + '" data-f="' + dim.key + '" data-v="' + esc(k) + '" title="' + num(n) + ' rows">' +
        '<span class="xn">' + esc(k) + '</span><span class="xb"><i style="width:' + Math.max(0.5, 100 * Math.abs(v) / peak).toFixed(1) + '%"></i></span><span class="xc">' + num(v) + "</span>" +
        '<span class="xs">' + (whole ? (100 * v / whole).toFixed(1) + "%" : how === "rows" ? "" : num(n) + " rows") + "</span></button>").join("") + "</div>" +
      (items.length > 12 ? '<button type="button" class="xmore" data-more="__g">' + (s.more.__g ? "Show fewer" : "Show all " + num(items.length)) + "</button>" : "");
  }
  function shownFields() { const s = st(), d = ds(); const hidden = s.hidden || new Set(d.fields.filter(c => c.hidden).map(c => c.key)); return d.fields.filter(c => !hidden.has(c.key)); }
  function drawTable(all) {
    const d = ds(), s = st(), shown = shownFields(), sort = s.sort || d.sort;
    q("thead").innerHTML = "<tr>" + shown.map(c => {
      const on = sort && sort[0] === c.key, right = c.type === "num" || c.type === "date";
      return '<th class="' + (right ? "n" : "") + '"' + (on ? ' aria-sort="' + (sort[1] > 0 ? "ascending" : "descending") + '"' : "") + ">" +
        (c.type === "viz" ? esc(c.label) : '<button type="button" data-sort="' + c.key + '">' + esc(c.label) + (on ? (sort[1] > 0 ? " ↑" : " ↓") : "") + "</button>") + "</th>";
    }).join("") + "</tr>";
    const pages = Math.max(1, Math.ceil(all.length / s.size));
    s.page = Math.min(s.page, pages - 1);
    const clickable = c => c.type === "cat" || c.type === "tags";
    const cell = (c, r, open) => {
      const v = val(c, r);
      if (c.fmt) return c.fmt(v, r, open);
      if (c.type === "num") return num(v);
      if (c.type === "date") return v == null ? "–" : stamp(v);
      if (clickable(c) && isFacet(c)) return (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(x => '<button type="button" class="cellf" data-f="' + c.key + '" data-v="' + esc(x) + '" title="Filter to this">' + esc(x) + "</button>").join(" ") || "–";
      return esc(v == null || v === "" ? "–" : v);
    };
    q("tbody").innerHTML = all.slice(s.page * s.size, (s.page + 1) * s.size).map(r => {
      const id = d.id_(r), open = String(s.open) === String(id);
      return '<tr class="x-row' + (d.rowClass ? " " + d.rowClass(r) : "") + '" data-id="' + esc(id) + '" tabindex="0"' + (d.detail ? ' aria-expanded="' + open + '"' : "") + ">" +
        shown.map(c => '<td class="' + (c.type === "num" || c.type === "date" ? "n" : "") + (c.wide ? " wide" : "") + '">' + cell(c, r, open) + "</td>").join("") + "</tr>" +
        (open && d.detail ? '<tr class="x-detail"><td colspan="' + shown.length + '">' + d.detail(r) + "</td></tr>" : "");
    }).join("") || '<tr><td colspan="' + shown.length + '" class="x-none">No rows match these filters.</td></tr>';
    q("tfoot").innerHTML = shown.some(c => c.sum) && all.length ? "<tr>" + shown.map((c, i) => '<td class="' + (c.type === "num" ? "n" : "") + '">' +
      (c.sum ? num(all.reduce((a, r) => a + (val(c, r) || 0), 0)) : i === 0 ? "Total" : "") + "</td>").join("") + "</tr>" : "";
    q(".x-pager").innerHTML = '<label class="pick">Rows per page <select data-size>' + [10, 25, 50, 100, 250].map(n => "<option" + (n === s.size ? " selected" : "") + ">" + n + "</option>").join("") + "</select></label>" +
      (pages > 1 ? '<button data-go="' + (s.page - 1) + '"' + (s.page ? "" : " disabled") + ">Previous</button><span>Page " + (s.page + 1) + " of " + num(pages) +
        '</span><button data-go="' + (s.page + 1) + '"' + (s.page + 1 < pages ? "" : " disabled") + ">Next</button>" : "");
    q(".x-menu").innerHTML = d.fields.map(c => '<label><input type="checkbox" data-col="' + c.key + '"' + (shown.includes(c) ? " checked" : "") + "> " + esc(c.label) + "</label>").join("");
  }
  function writeHash() {
    const s = st(), o = {d: cur};
    const f = Object.fromEntries(Object.entries(s.f).filter(e => e[1].length)); if (Object.keys(f).length) o.f = f;
    const r = Object.fromEntries(Object.entries(s.r).filter(e => e[1][0] != null || e[1][1] != null)); if (Object.keys(r).length) o.r = r;
    if (s.q) o.q = s.q; if (s.sort) o.s = s.sort; if (s.g) o.g = s.g;
    const plainState = Object.keys(o).length === 1 && cur === cfg.datasets[0].id;
    history.replaceState(null, "", plainState ? location.pathname + location.search : "#explore=" + encodeURIComponent(JSON.stringify(o)));
  }
  function readHash() {
    const m = location.hash.match(/^#explore=(.+)$/); if (!m) return false;
    try {
      const o = JSON.parse(decodeURIComponent(m[1])); if (!sets.has(o.d)) return false;
      cur = o.d; const s = st();
      s.f = o.f || {}; s.r = o.r || {}; s.q = o.q || ""; s.sort = o.s || null; s.g = o.g || null;
      return true;
    } catch (e) { return false; }
  }
  function draw(keepFacets) {
    const all = sorted(filtered());
    drawTabs(); drawChips(); if (!keepFacets) drawFacets(); drawGroup(all); drawTable(all);
    q(".x-count").textContent = num(all.length) + (all.length === rowsOf(cur).length ? " rows" : " of " + num(rowsOf(cur).length) + " rows");
    if (q(".x-q") !== document.activeElement) q(".x-q").value = st().q;
    writeHash();
    return all;
  }
  function toggle(k, v) { const s = st(), list = s.f[k] || (s.f[k] = []); const i = list.indexOf(v); i < 0 ? list.push(v) : list.splice(i, 1); s.page = 0; draw(); }
  function csv() {
    const shown = shownFields().filter(c => c.type !== "viz"), cellText = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const lines = [shown.map(c => cellText(c.label)).join(",")].concat(sorted(filtered()).map(r => shown.map(c => cellText(plain(c, r))).join(",")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], {type: "text/csv"})); a.download = "hydra-" + cur + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  root.addEventListener("click", e => {
    const t = e.target, s = st();
    const tab = t.closest("[data-set]"); if (tab) { cur = tab.dataset.set; draw(); return; }
    const fv = t.closest("[data-f]"); if (fv) { toggle(fv.dataset.f, fv.dataset.v); return; }
    const unf = t.closest("[data-unf]"); if (unf) { toggle(unf.dataset.unf, unf.dataset.v); return; }
    const unr = t.closest("[data-unr]"); if (unr) { delete s.r[unr.dataset.unr]; s.page = 0; draw(); return; }
    const more = t.closest("[data-more]"); if (more) { s.more[more.dataset.more] = !s.more[more.dataset.more]; draw(); return; }
    const so = t.closest("[data-sort]"); if (so) { const k = so.dataset.sort, c = field(k), now = s.sort || ds().sort; s.sort = [k, now && now[0] === k ? -now[1] : (c.type === "num" || c.type === "date" ? -1 : 1)]; s.page = 0; draw(true); return; }
    const go = t.closest("[data-go]"); if (go && !go.disabled) { s.page = +go.dataset.go; draw(true); q(".x-scroll").scrollTop = 0; return; }
    const act = t.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "csv") return csv();
      if (a === "link") { navigator.clipboard && navigator.clipboard.writeText(location.href); act.textContent = "Link copied"; setTimeout(() => { act.textContent = "Copy link"; }, 1400); return; }
      if (a === "reset") { s.f = {}; s.r = {}; s.q = ""; s.vq = {}; s.page = 0; draw(); return; }
      if (a === "unq") { s.q = ""; s.page = 0; draw(); return; }
      if (a === "unscope") { const sc = scopes.get(cur); if (sc && sc.clear) sc.clear(); return; }
    }
    if (t.closest(".x-detail") || t.closest("button, a, input, select, summary")) return;
    const row = t.closest(".x-row"); if (!row) return;
    const d = ds(), r = rowsOf(cur).find(x => String(d.id_(x)) === row.dataset.id);
    if (d.detail) { s.open = String(s.open) === row.dataset.id ? null : row.dataset.id; draw(true); }
    if (d.onRow) d.onRow(r);
  });
  root.addEventListener("keydown", e => { const row = e.target.closest(".x-row"); if (row && e.target === row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); row.click(); } });
  let typing;
  root.addEventListener("input", e => {
    const t = e.target, s = st();
    if (t.classList.contains("x-q")) { s.q = t.value.trim(); s.page = 0; clearTimeout(typing); typing = setTimeout(() => draw(), 120); }
    else if (t.dataset.vq != null) { s.vq[t.dataset.vq] = t.value; const k = t.dataset.vq, at = t.selectionStart; drawFacets(); const again = q('[data-vq="' + k + '"]'); if (again) { again.focus(); again.setSelectionRange(at, at); } }
  });
  root.addEventListener("change", e => {
    const t = e.target, s = st();
    if (t.dataset.min != null || t.dataset.max != null) {
      const k = t.dataset.min != null ? t.dataset.min : t.dataset.max, r = s.r[k] || (s.r[k] = [null, null]);
      const v = t.value.trim() === "" ? null : Number(t.value.replace(/,/g, "")); r[t.dataset.min != null ? 0 : 1] = Number.isFinite(v) ? v : null; s.page = 0; draw();
    } else if (t.dataset.gdim != null) { s.g = [t.value, (s.g || ds().group || [0, "rows"])[1]]; s.more.__g = false; draw(true); }
    else if (t.dataset.gmeas != null) { const g = s.g || ds().group || [ds().fields.filter(isFacet)[0].key, "rows"]; s.g = [g[0], t.value]; draw(true); }
    else if (t.dataset.size != null) { s.size = +t.value; s.page = 0; draw(true); }
    else if (t.dataset.col) { const d = ds(); if (!s.hidden) s.hidden = new Set(d.fields.filter(c => c.hidden).map(c => c.key)); t.checked ? s.hidden.delete(t.dataset.col) : s.hidden.add(t.dataset.col); draw(true); }
  });
  document.addEventListener("click", e => { const d = q(".x-cols"); if (d.open && !d.contains(e.target)) d.open = false; });
  if (window.matchMedia("(max-width: 900px)").matches) q(".x-fwrap").open = false;

  // A link opened in a page that is already showing the explorer changes only the fragment.
  window.addEventListener("hashchange", () => { if (readHash()) { draw(); root.scrollIntoView({block: "start"}); } });
  const fromLink = readHash();
  draw();
  if (fromLink) setTimeout(() => root.scrollIntoView({block: "start"}), 60);
  return {
    refresh: () => draw(),
    reload(id) { cache.delete(id); if (id === cur) draw(); else drawTabs(); },
    setScope(id, test, label, clear) { test ? scopes.set(id, {test, label, clear}) : scopes.delete(id); views.get(id).page = 0; if (id === cur) draw(); },
    filter(id, key, value) { cur = id; const s = st(); s.f[key] = [value]; s.page = 0; draw(); },
    current: () => cur,
  };
};
