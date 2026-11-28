"use strict";
// Tables in the paper: click a column heading to sort by it, click again to reverse.
(() => {
  const value = text => {
    const t = text.replace(/[,\s]/g, "").replace(/[−–]/g, "-");
    const m = t.match(/^[+]?(-?\d*\.?\d+)(%|h|min|days?)?/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return m[2] === "min" ? n / 60 : m[2] && m[2].startsWith("day") ? n * 24 : n;
  };
  for (const table of document.querySelectorAll(".paper table")) {
    const head = table.tHead, body = table.tBodies[0];
    if (!head || !body || head.rows.length !== 1 || table.querySelector("[colspan],[rowspan]") || body.rows.length < 3) continue;
    const original = [...body.rows];
    [...head.rows[0].cells].forEach((th, col) => {
      th.classList.add("sortable"); th.tabIndex = 0; th.setAttribute("role", "button");
      const sort = () => {
        const dir = th.dataset.dir === "desc" ? "asc" : th.dataset.dir === "asc" ? "" : "desc";
        for (const other of head.rows[0].cells) { other.dataset.dir = ""; other.removeAttribute("aria-sort"); }
        th.dataset.dir = dir;
        if (!dir) { original.forEach(r => body.appendChild(r)); return; }
        th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
        const rows = [...body.rows], cells = rows.map(r => r.cells[col] ? r.cells[col].textContent.trim() : "");
        const nums = cells.map(value), numeric = nums.filter(v => v != null).length >= rows.length * 0.6;
        rows.map((r, i) => [r, numeric ? nums[i] : cells[i]]).sort((a, b) => {
          if (a[1] == null) return 1; if (b[1] == null) return -1;
          return (numeric ? a[1] - b[1] : String(a[1]).localeCompare(String(b[1]), "en", {numeric: true})) * (dir === "asc" ? 1 : -1);
        }).forEach(([r]) => body.appendChild(r));
      };
      th.addEventListener("click", sort);
      th.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } });
    });
  }
})();
