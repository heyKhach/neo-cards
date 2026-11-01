// SEARCH (loads 6th): the artist search box. Finds artists even with typos, and drives the little results list.
// Needs: $, esc. Provides: findArtists(names, query, limit), bindArtistSearch({ input, list, getNames, getCurrent, onPick })

const SEARCH_LIMIT = 8; // how many results the list shows

// How many typos a query of this length may contain (spaces don't count): the longer, the more forgiving.
function maxTypos(len) { return len < 4 ? 0 : len < 6 ? 1 : len < 9 ? 2 : 3; }

// Makes names and queries comparable: no capitals, accents or punctuation, and look-alike
// symbols turned into letters ($uicideboy$ -> suicideboys, P!nk -> pink, Mötley Crüe -> motley crue).
const FOLD = { "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "đ": "d", "ð": "d", "þ": "th", "ł": "l", "ı": "i", "$": "s", "@": "a" };
function normalize(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[øæœßđðþłı$@]/g, (c) => FOLD[c])
    .replace(/(\p{L})!(?=\p{L})/gu, "$1i")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const normCache = new Map();
function info(name) {
  let v = normCache.get(name);
  if (!v) {
    const n = normalize(name), words = n.split(" ");
    let at = 0; const starts = words.map((w) => { const o = at; at += w.length; return o; }); // where each word begins in the spaceless name
    v = { n, c: n.replace(/ /g, ""), words, starts };
    normCache.set(name, v);
  }
  return v;
}

// Fewest typos (extra letter, missing letter, wrong letter, or two neighbouring letters swapped) needed to turn
// the query `q` into the start of the name `c`, beginning at offset `o`. Gives up early once it is above `limit`.
// (q is at most MAX_Q letters, so three reusable rows are enough and nothing is allocated per name.)
const MAX_Q = 40;
const rowA = new Int16Array(MAX_Q + 4), rowB = new Int16Array(MAX_Q + 4), rowC = new Int16Array(MAX_Q + 4);
function typoDistance(q, c, o, limit) {
  const m = q.length, n = Math.min(c.length - o, m + limit);
  let p2 = rowA, p1 = rowB, cur = rowC;
  for (let j = 0; j <= n; j++) p1[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = i;
    const qi = q.charCodeAt(i - 1), qp = i > 1 ? q.charCodeAt(i - 2) : -1;
    for (let j = 1; j <= n; j++) {
      const cj = c.charCodeAt(o + j - 1);
      let v = p1[j - 1] + (qi === cj ? 0 : 1);
      if (p1[j] + 1 < v) v = p1[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      if (j > 1 && qi === c.charCodeAt(o + j - 2) && qp === cj && p2[j - 2] + 1 < v) v = p2[j - 2] + 1;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    const t = p2; p2 = p1; p1 = cur; cur = t;
  }
  let best = p1[0];
  for (let j = 1; j <= n; j++) if (p1[j] < best) best = p1[j];
  return best;
}

// names must already be ranked (most played first). Order of results: exact matches first
// (starts with the query, then word starts, then anywhere inside), then typo matches (fewest typos first).
function findArtists(names, query, limit = SEARCH_LIMIT) {
  const q = normalize(query);
  if (!q) return names.slice(0, limit);
  const qc = q.replace(/ /g, "").slice(0, MAX_Q), tokens = q.split(" ");
  const k = maxTypos(qc.length);
  const hits = [], seen = new Set();

  names.forEach((name, idx) => {
    const v = info(name);
    let tier = -1;
    if (v.n.startsWith(q) || v.c.startsWith(qc)) tier = 0;
    else if (tokens.every((t) => v.words.some((w) => w.startsWith(t)))) tier = 1;
    else if (v.c.includes(qc)) tier = 2;
    if (tier >= 0) { hits.push({ idx, dist: 0, tier }); seen.add(idx); }
  });

  if (hits.length < limit && k > 0) {
    names.forEach((name, idx) => {
      if (seen.has(idx)) return;
      const v = info(name);
      if (v.c.length < qc.length - k) return; // too short to match even with k typos
      let best = k + 1; // the typos must line up with the start of the name or of one of its words
      for (const o of v.starts) {
        const d = typoDistance(qc, v.c, o, best - 1);
        if (d < best) best = d;
        if (best <= 1) break;
      }
      if (best <= k) hits.push({ idx, dist: best, tier: 3 });
    });
  }
  hits.sort((a, b) => a.dist - b.dist || a.tier - b.tier || a.idx - b.idx);
  return hits.slice(0, limit).map((h) => names[h.idx]);
}

// Wires the text box + results list. Tapping the box shows your top artists; typing filters them.
// getNames() = all artist names for the chosen period (ranked), getCurrent() = the artist now shown on the card,
// onPick(name) = called when one is chosen.
function bindArtistSearch({ input, list, getNames, getCurrent, onPick }) {
  const inp = $(input), ul = $(list);
  let results = [], active = -1, typed = false, fresh = false;

  function setActive(i) {
    active = i;
    [...ul.children].forEach((li, n) => li.classList.toggle("active", n === i));
    if (i >= 0 && ul.children[i]) {
      inp.setAttribute("aria-activedescendant", ul.children[i].id);
      ul.children[i].scrollIntoView({ block: "nearest" });
    } else inp.removeAttribute("aria-activedescendant");
  }
  function close() {
    ul.hidden = true; inp.setAttribute("aria-expanded", "false"); setActive(-1);
  }
  function show() {
    results = findArtists(getNames(), typed ? inp.value : "");
    const cur = getCurrent();
    ul.innerHTML = results.length
      ? results.map((n, i) => `<li id="${list}-opt-${i}" role="option" data-i="${i}"${n === cur ? ' aria-selected="true"' : ""}>${esc(n)}</li>`).join("")
      : `<li class="combo-empty">No artists found</li>`;
    ul.hidden = false; inp.setAttribute("aria-expanded", "true");
    setActive(typed && results.length ? 0 : -1);
  }
  function pick(name) { onPick(name); inp.blur(); }

  inp.addEventListener("focus", () => { typed = false; fresh = true; setTimeout(() => inp.select(), 0); show(); });
  inp.addEventListener("mouseup", (e) => { if (fresh) { e.preventDefault(); fresh = false; } }); // keep the text selected
  inp.addEventListener("input", () => { typed = true; show(); });
  inp.addEventListener("blur", () => { close(); typed = false; inp.value = getCurrent(); });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (ul.hidden) show();
      if (!results.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive(active < 0 ? (d > 0 ? 0 : results.length - 1) : (active + d + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results.length && !ul.hidden && (typed || active >= 0)) pick(results[active >= 0 ? active : 0]);
      else inp.blur();
    } else if (e.key === "Escape") {
      e.stopPropagation(); inp.blur();
    }
  });
  ul.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus so the click below still lands
  ul.addEventListener("mouseover", (e) => { const li = e.target.closest("li[data-i]"); if (li) setActive(Number(li.dataset.i)); });
  ul.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) pick(results[Number(li.dataset.i)]); });
}
