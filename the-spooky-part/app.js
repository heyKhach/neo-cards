// --- core: file reading and stats (no DOM) ---
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

async function readZip(file) {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const dec = new TextDecoder();

  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a zip file");

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const rows = [];

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const csize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (!/streaming_history_audio.*\.json$/i.test(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + csize);
    const text = method === 0 ? dec.decode(data) : await inflate(data);
    for (const r of JSON.parse(text)) rows.push(r);
  }
  return rows;
}

async function readHistory(files) {
  const rows = [];
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".zip")) {
      for (const r of await readZip(file)) rows.push(r);
    } else if (name.endsWith(".json")) {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data)) for (const r of data) rows.push(r);
    }
  }
  return rows.filter((r) => r.master_metadata_track_name && r.master_metadata_album_artist_name && r.ts);
}

function analyze(rows, year, artist) {
  const scoped = year === "all" ? rows : rows.filter((r) => r.ts.startsWith(year));
  const totals = new Map();
  for (const r of scoped) {
    const a = r.master_metadata_album_artist_name;
    totals.set(a, (totals.get(a) || 0) + 1);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const chosen = artist && totals.has(artist) ? artist : ranked[0] && ranked[0][0];
  if (!chosen) return null;

  const mine = scoped.filter((r) => r.master_metadata_album_artist_name === chosen);
  const buckets = new Map();
  const songs = new Map();
  for (const r of mine) {
    const key = year === "all" ? r.ts.slice(0, 4) : Number(r.ts.slice(5, 7)) - 1;
    buckets.set(key, (buckets.get(key) || 0) + r.ms_played / 60000);
    const t = r.master_metadata_track_name;
    songs.set(t, (songs.get(t) || 0) + 1);
  }
  const bars = year === "all"
    ? [...buckets.entries()].sort().map(([label, minutes]) => ({ label, minutes }))
    : MONTHS.map((label, i) => ({ label, minutes: buckets.get(i) || 0 }));

  return {
    artist: chosen,
    rank: ranked.findIndex(([n]) => n === chosen) + 1,
    artistOptions: ranked.map(([n]) => n),
    plays: mine.length,
    minutes: mine.reduce((s, r) => s + r.ms_played, 0) / 60000,
    bars,
    topSongs: [...songs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

// --- ui ---
let rows = null, year = "all", artist = "", current = null;
const $ = (id) => document.getElementById(id);

function render() {
  const stats = analyze(rows, year, artist);
  if (!stats) return;
  const years = [...new Set(rows.map((r) => r.ts.slice(0, 4)))].sort().reverse();

  $("artist").innerHTML = stats.artistOptions.slice(0, 200)
    .map((n) => `<option value="${esc(n)}"${n === stats.artist ? " selected" : ""}>${esc(n)}</option>`).join("");
  $("year").innerHTML = `<option value="all">All time</option>` +
    years.map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${y}</option>`).join("");
  $("controls").hidden = false;

  const max = Math.max(...stats.bars.map((b) => b.minutes), 1);
  current = { stats, year };
  $("saveBtn").hidden = false;
  $("card").hidden = false;
  $("downloadBtn").hidden = false;
  $("card").innerHTML = `
    <div class="head">
      <span class="title">${esc(stats.artist)}, ${year === "all" ? "all time" : year}</span>
      <span class="badge">#${stats.rank} by plays</span>
    </div>
    <div class="stats">
      <div><p class="label">Plays</p><p class="value">${fmt(stats.plays)}</p></div>
      <div><p class="label">Minutes</p><p class="value">${fmt(stats.minutes)}</p></div>
    </div>
    <p class="caption">Minutes per ${year === "all" ? "year" : "month"}</p>
    ${stats.bars.map((b) => `
      <div class="bar">
        <span class="bar-label">${b.label}</span>
        <div class="track"><div class="fill" style="width:${(b.minutes / max) * 100}%"></div></div>
        <span class="bar-value">${fmt(b.minutes)}</span>
      </div>`).join("")}
    <p class="caption" style="margin:16px 0 4px">Top songs by plays</p>
    ${stats.topSongs.map(([t, n]) => `<div class="song"><span>${esc(t)}</span><span>${fmt(n)}</span></div>`).join("")}`;
}

$("file").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  $("error").hidden = true;
  try {
    const parsed = await readHistory(files);
    if (!parsed.length) {
      $("error").textContent = "No listening history found. Choose the .zip from Spotify or its Streaming_History_Audio .json files.";
      $("error").hidden = false;
      return;
    }
    rows = parsed; year = "all"; artist = "";
    $("uploadText").textContent = "Choose a different file";
    render();
  } catch (err) {
    $("error").textContent = "Couldn’t read that file. Check that it’s the Extended streaming history export.";
    $("error").hidden = false;
  }
});
$("artist").addEventListener("change", (e) => { artist = e.target.value; render(); });
$("year").addEventListener("change", (e) => { year = e.target.value; artist = ""; render(); });

// --- themes ---
const THEMES = [
  { id: "blue", name: "Blue", color: "#378add" },
  { id: "green", name: "Green", color: "#639922" },
  { id: "gold", name: "Gold", color: "#d4a017" },
  { id: "mono", name: "Monochrome", color: "#888780" },
  { id: "red", name: "Red", color: "#e24b4a" },
  { id: "purple", name: "Purple", color: "#7f77dd" },
  { id: "rosegold", name: "Rosegold", color: "#d98a94" },
  { id: "maroon", name: "Maroon", color: "#a63a47" },
  { id: "teal", name: "Teal", color: "#1d9e9a" },
  { id: "pink", name: "Pink", color: "#e0559a" },
  { id: "velvet", name: "Velvet", color: "#8e3a73" },
  { id: "cyberpunk", name: "Cyberpunk", color: "linear-gradient(135deg, #0d0221 50%, #00f0ff 50%)", fixed: true },
  { id: "terminal", name: "Terminal", color: "linear-gradient(135deg, #020a02 50%, #00ff41 50%)", fixed: true },
  { id: "dracula", name: "Dracula", color: "linear-gradient(135deg, #282a36 50%, #bd93f9 50%)", fixed: true },
  { id: "nord", name: "Nord", color: "linear-gradient(135deg, #2e3440 50%, #88c0d0 50%)", fixed: true },
  { id: "cottagecore", name: "Cottagecore", color: "linear-gradient(135deg, #f1ede0 50%, #5e7d4f 50%)", fixed: true },
  { id: "academia", name: "Dark academia", color: "linear-gradient(135deg, #1c1713 50%, #d1a15f 50%)", fixed: true },
  { id: "vaporwave", name: "Vaporwave", color: "linear-gradient(135deg, #f3e5ff 50%, #c2258a 50%)", fixed: true },
  { id: "bloodmoon", name: "Bloodmoon", color: "linear-gradient(135deg, #1a0509 50%, #ff4d5e 50%)", fixed: true },
  { id: "pearlescent", name: "Pearlescent", color: "linear-gradient(135deg, #f4f0f8 50%, #5a62c4 50%)", fixed: true },
  { id: "midas", name: "Midas", color: "linear-gradient(135deg, #1d1609 50%, #ffd25a 50%)", fixed: true },
  { id: "ivorybloom", name: "Ivory bloom", color: "linear-gradient(135deg, #f8f1e6 50%, #b04a62 50%)", fixed: true },
  { id: "retro", name: "Retro", color: "linear-gradient(135deg, #f0dfba 50%, #b03d12 50%)", fixed: true },
  { id: "abyss", name: "Abyss", color: "linear-gradient(135deg, #04121f 50%, #3ec6e0 50%)", fixed: true },
  { id: "sunset", name: "Sunset", color: "linear-gradient(135deg, #2c0f33 50%, #ff9a5c 50%)", fixed: true },
  { id: "mintlatte", name: "Mint latte", color: "linear-gradient(135deg, #e9f1e6 50%, #2f7d5f 50%)", fixed: true },
];
const THEME_KEY = "neo-cards-theme";
const dialog = $("themeDialog");

function currentTheme() {
  return document.documentElement.dataset.theme || "blue";
}

function renderThemes() {
  const cur = currentTheme();
  const part = (label, list) => `<p class="group-title">${label}</p>` + list.map((t) =>
    `<button type="button" class="swatch" data-theme-id="${t.id}" aria-pressed="${t.id === cur}">` +
    `<i style="background:${t.color}"></i>${t.name}</button>`).join("");
  $("swatches").innerHTML = part("Accent colors", THEMES.filter((t) => !t.fixed)) +
    part("Full palettes", THEMES.filter((t) => t.fixed));
}

function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(THEME_KEY, id); } catch (e) {}
  renderThemes();
}

$("themeBtn").addEventListener("click", () => { renderThemes(); dialog.showModal(); });
$("themeClose").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
$("swatches").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-theme-id]");
  if (btn) applyTheme(btn.dataset.themeId);
});

if (!THEMES.some((t) => t.id === currentTheme())) document.documentElement.dataset.theme = "blue";

// --- fonts ---
const SYSTEM_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const FONTS = [
  { id: "system", name: "System", css: SYSTEM_STACK, google: null },
  { id: "inter", name: "Inter", css: '"Inter", ' + SYSTEM_STACK, google: "Inter:wght@400;500" },
  { id: "roboto", name: "Roboto", css: '"Roboto", ' + SYSTEM_STACK, google: "Roboto:wght@400;500" },
  { id: "poppins", name: "Poppins", css: '"Poppins", ' + SYSTEM_STACK, google: "Poppins:wght@400;500" },
  { id: "merriweather", name: "Merriweather", css: '"Merriweather", Georgia, serif', google: "Merriweather:wght@400;700" },
  { id: "robotomono", name: "Roboto Mono", css: '"Roboto Mono", ui-monospace, Menlo, monospace', google: "Roboto+Mono:wght@400;500" },
  { id: "rubik", name: "Rubik", css: '"Rubik", ' + SYSTEM_STACK, google: "Rubik:wght@400;500" },
  { id: "sourgummy", name: "Sour Gummy", css: '"Sour Gummy", ' + SYSTEM_STACK, google: "Sour+Gummy" },
  { id: "spacemono", name: "Space Mono", css: '"Space Mono", ui-monospace, Menlo, monospace', google: "Space+Mono:wght@400;700" },
  { id: "craftygirls", name: "Crafty Girls", css: '"Crafty Girls", cursive, ' + SYSTEM_STACK, google: "Crafty+Girls" },
  { id: "irishgrover", name: "Irish Grover", css: '"Irish Grover", cursive, ' + SYSTEM_STACK, google: "Irish+Grover" },
  { id: "cinzel", name: "Cinzel", css: '"Cinzel", Georgia, serif', google: "Cinzel:wght@400;500" },
  { id: "playfair", name: "Playfair Display", css: '"Playfair Display", Georgia, serif', google: "Playfair+Display:wght@400;500" },
  { id: "pacifico", name: "Pacifico", css: '"Pacifico", cursive, ' + SYSTEM_STACK, google: "Pacifico" },
  { id: "pressstart", name: "Press Start 2P", css: '"Press Start 2P", ui-monospace, monospace', google: "Press+Start+2P" },
  { id: "orbitron", name: "Orbitron", css: '"Orbitron", ' + SYSTEM_STACK, google: "Orbitron:wght@400;500" },
  { id: "caveat", name: "Caveat", css: '"Caveat", cursive, ' + SYSTEM_STACK, google: "Caveat:wght@400;500" },
  { id: "fredoka", name: "Fredoka", css: '"Fredoka", ' + SYSTEM_STACK, google: "Fredoka:wght@400;500" },
  { id: "specialelite", name: "Special Elite", css: '"Special Elite", "Courier New", monospace', google: "Special+Elite" },
];
const FONT_KEY = "neo-cards-font";
const fontDialog = $("fontDialog");
let fontId = "system";

function loadFont(f) {
  if (!f.google || document.getElementById("font-" + f.id)) return;
  const link = document.createElement("link");
  link.id = "font-" + f.id;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=" + f.google + "&display=swap";
  document.head.appendChild(link);
}

function renderFonts() {
  $("fonts").innerHTML = FONTS.map((f) =>
    `<button type="button" class="swatch fontopt" data-font-id="${f.id}" aria-pressed="${f.id === fontId}" ` +
    `style="font-family:${esc(f.css)}"><span class="aa">Aa</span>${f.name}</button>`).join("");
}

function applyFont(id, save) {
  const f = FONTS.find((x) => x.id === id) || FONTS[0];
  fontId = f.id;
  document.documentElement.dataset.font = f.id;
  loadFont(f);
  document.documentElement.style.setProperty("--font", f.css);
  if (save) { try { localStorage.setItem(FONT_KEY, f.id); } catch (e) {} }
  renderFonts();
}

$("fontBtn").addEventListener("click", () => { FONTS.forEach(loadFont); renderFonts(); fontDialog.showModal(); });
$("fontClose").addEventListener("click", () => fontDialog.close());
fontDialog.addEventListener("click", (e) => { if (e.target === fontDialog) fontDialog.close(); });
$("fonts").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-font-id]");
  if (btn) applyFont(btn.dataset.fontId, true);
});

let savedFont = null;
try { savedFont = localStorage.getItem(FONT_KEY); } catch (e) {}
if (savedFont) applyFont(savedFont, false);

// --- templates (a theme + a font in one tap) ---
const TEMPLATES = [
  { id: "hacker", name: "Hacker Terminal", theme: "terminal", font: "spacemono" },
  { id: "neon", name: "Neon Alley", theme: "cyberpunk", font: "orbitron" },
  { id: "arcade", name: "Retro Arcade", theme: "retro", font: "pressstart" },
  { id: "vampire", name: "Vampire", theme: "bloodmoon", font: "cinzel" },
  { id: "goldrush", name: "Gold Rush", theme: "midas", font: "playfair" },
  { id: "cottage", name: "Cottage Diary", theme: "cottagecore", font: "caveat" },
  { id: "pearlpop", name: "Pearl Pop", theme: "pearlescent", font: "poppins" },
  { id: "bubblegum", name: "Bubblegum", theme: "pink", font: "fredoka" },
  { id: "study", name: "Typewriter Study", theme: "academia", font: "specialelite" },
  { id: "sunsetstrip", name: "Sunset Strip", theme: "sunset", font: "pacifico" },
  { id: "deepsea", name: "Deep Sea", theme: "abyss", font: "rubik" },
  { id: "nordic", name: "Nordic Calm", theme: "nord", font: "inter" },
  { id: "velvetlounge", name: "Velvet Lounge", theme: "velvet", font: "playfair" },
  { id: "bloom", name: "Ivory Bloom", theme: "ivorybloom", font: "merriweather" },
];
const tplDialog = $("tplDialog");

function renderTemplates() {
  $("templates").innerHTML = TEMPLATES.map((t) => {
    const th = THEMES.find((x) => x.id === t.theme);
    const fo = FONTS.find((x) => x.id === t.font);
    const on = t.theme === currentTheme() && t.font === fontId;
    return `<button type="button" class="tpl" data-tpl-id="${t.id}" aria-pressed="${on}">` +
      `<i style="background:${th.color}"></i><span><span class="n">${t.name}</span>` +
      `<span class="m">${th.name} + ${fo.name}</span></span></button>`;
  }).join("");
}

function applyTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  applyTheme(t.theme);
  applyFont(t.font, true);
}

$("tplBtn").addEventListener("click", () => { renderTemplates(); tplDialog.showModal(); });
$("tplClose").addEventListener("click", () => tplDialog.close());
tplDialog.addEventListener("click", (e) => { if (e.target === tplDialog) tplDialog.close(); });
$("templates").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tpl-id]");
  if (btn) { applyTemplate(btn.dataset.tplId); tplDialog.close(); }
});

// --- png export ---
const PNG_URL = "heykhach.github.io/neo-cards";

function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "\u2026").width > maxW) t = t.slice(0, -1);
  return t + "\u2026";
}

function splitTop(str) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

function addStops(grad, stops) {
  stops.forEach((s, i) => {
    const m = s.match(/^(.*?)(?:\s+(-?[\d.]+)%)?$/);
    const pos = m[2] !== undefined ? parseFloat(m[2]) / 100 : (stops.length > 1 ? i / (stops.length - 1) : 0);
    grad.addColorStop(Math.min(1, Math.max(0, pos)), m[1]);
  });
}

// Paints the page background; understands the simple gradients used by the themes.
function paintBackdrop(ctx, w, h, bg, fallback) {
  ctx.fillStyle = fallback;
  ctx.fillRect(0, 0, w, h);
  const m = bg && bg.match(/^(linear|radial)-gradient\(([\s\S]*)\)$/);
  if (!m) return;
  try {
    const parts = splitTop(m[2]);
    if (m[1] === "linear") {
      let angle = 180, stops = parts;
      const am = parts[0].match(/^(-?[\d.]+)deg$/);
      if (am) { angle = parseFloat(am[1]); stops = parts.slice(1); }
      const rad = (angle * Math.PI) / 180, dx = Math.sin(rad), dy = -Math.cos(rad);
      const len = Math.abs(w * dx) + Math.abs(h * dy);
      const g = ctx.createLinearGradient(w / 2 - (dx * len) / 2, h / 2 - (dy * len) / 2, w / 2 + (dx * len) / 2, h / 2 + (dy * len) / 2);
      addStops(g, stops);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else {
      const rm = parts[0].match(/^([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%$/);
      if (!rm) return;
      const rx = (w * rm[1]) / 100, ry = (h * rm[2]) / 100, cx = (w * rm[3]) / 100, cy = (h * rm[4]) / 100;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      addStops(g, parts.slice(1));
      ctx.fillStyle = g;
      ctx.fillRect(-cx, (-cy * rx) / ry, w, (h * rx) / ry);
      ctx.restore();
    }
  } catch (e) { /* keep the solid fallback */ }
}

// Draws the card (plus the watermark) onto a canvas, mirroring the on-screen layout.
function drawCardPng(canvas, cur, C, fam, pixel) {
  const { stats, year } = cur;
  const S = pixel
    ? { title: 13, badge: 9, label: 9, value: 14, cap: 9, bar: 9, song: 9, lw: 40, vw: 72 }
    : { title: 15, badge: 12, label: 12, value: 22, cap: 12, bar: 12, song: 13, lw: 34, vw: 56 };
  const SCALE = 3, PAD = 20, CW = 348, IX = 20, IW = CW - IX * 2, FOOT = 44;
  const font = (wt, size) => `${wt} ${size}px ${fam}`;

  const labelH = Math.round(S.label * 1.3), valueH = Math.round(S.value * 1.25);
  const tileH = 10 + labelH + 2 + valueH + 10;
  const rowH = Math.round(S.bar * 1.5), pitch = rowH + 6;
  const songH = 14 + Math.round(S.song * 1.4);
  const capH = Math.round(S.cap * 1.4);
  const nBars = stats.bars.length, nSongs = stats.topSongs.length;
  const cardH = 16 + 24 + 12 + tileH + 16 + capH + 8 + nBars * pitch + 10 + capH + 4 + nSongs * songH + 16;
  const W = CW + PAD * 2, H = PAD + cardH + FOOT;

  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "middle";

  paintBackdrop(ctx, W, H, C.bg, C.s1);

  rr(ctx, PAD, PAD, CW, cardH, 12);
  ctx.fillStyle = C.s2; ctx.fill();
  ctx.strokeStyle = C.bd; ctx.lineWidth = 0.5; ctx.stroke();

  const x0 = PAD + IX;
  let y = PAD + 16;

  // header: title and rank badge
  ctx.font = font(400, S.badge);
  const badge = `#${stats.rank} by plays`;
  const bw = ctx.measureText(badge).width + 20, bh = S.badge + 10;
  rr(ctx, x0 + IW - bw, y + (24 - bh) / 2, bw, bh, 8);
  ctx.fillStyle = C.acbg; ctx.fill();
  ctx.fillStyle = C.ac; ctx.textAlign = "center";
  ctx.fillText(badge, x0 + IW - bw / 2, y + 12);
  ctx.textAlign = "left";
  ctx.font = font(500, S.title);
  ctx.fillStyle = C.tx;
  ctx.fillText(fit(ctx, `${stats.artist}, ${year === "all" ? "all time" : year}`, IW - bw - 8), x0, y + 12);
  y += 24 + 12;

  // stat tiles
  const tw = (IW - 8) / 2;
  [["Plays", fmt(stats.plays)], ["Minutes", fmt(stats.minutes)]].forEach(([label, value], i) => {
    const tx = x0 + i * (tw + 8);
    rr(ctx, tx, y, tw, tileH, 8);
    ctx.fillStyle = C.s1; ctx.fill();
    ctx.fillStyle = C.tx2; ctx.font = font(400, S.label);
    ctx.fillText(label, tx + 12, y + 10 + labelH / 2);
    ctx.fillStyle = C.tx; ctx.font = font(500, S.value);
    ctx.fillText(value, tx + 12, y + 10 + labelH + 2 + valueH / 2);
  });
  y += tileH + 16;

  // bars
  ctx.fillStyle = C.tx2; ctx.font = font(400, S.cap);
  ctx.fillText(`Minutes per ${year === "all" ? "year" : "month"}`, x0, y + capH / 2);
  y += capH + 8;
  const trackX = x0 + S.lw + 8, trackW = IW - S.lw - 8 - 8 - S.vw;
  const max = Math.max(...stats.bars.map((b) => b.minutes), 1);
  stats.bars.forEach((b) => {
    const cy = y + rowH / 2;
    ctx.font = font(400, S.bar); ctx.fillStyle = C.tx2;
    ctx.fillText(b.label, x0, cy);
    rr(ctx, trackX, cy - 5, trackW, 10, 4);
    ctx.fillStyle = C.s1; ctx.fill();
    const fw = (b.minutes / max) * trackW;
    if (fw > 0.2) { rr(ctx, trackX, cy - 5, fw, 10, 4); ctx.fillStyle = C.ac; ctx.fill(); }
    ctx.font = font(500, S.bar); ctx.fillStyle = C.tx; ctx.textAlign = "right";
    ctx.fillText(fmt(b.minutes), x0 + IW, cy);
    ctx.textAlign = "left";
    y += pitch;
  });
  y += 10;

  // top songs
  ctx.fillStyle = C.tx2; ctx.font = font(400, S.cap);
  ctx.fillText("Top songs by plays", x0, y + capH / 2);
  y += capH + 4;
  stats.topSongs.forEach(([title, plays]) => {
    ctx.strokeStyle = C.bd; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + IW, y); ctx.stroke();
    ctx.font = font(500, S.song);
    const pw = ctx.measureText(fmt(plays)).width;
    ctx.fillStyle = C.tx; ctx.textAlign = "right";
    ctx.fillText(fmt(plays), x0 + IW, y + songH / 2);
    ctx.textAlign = "left";
    ctx.font = font(400, S.song);
    ctx.fillText(fit(ctx, title, IW - pw - 10), x0, y + songH / 2);
    y += songH;
  });

  // watermark (PNG only)
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = C.tx; ctx.textAlign = "center";
  ctx.font = font(400, pixel ? 8 : 11);
  ctx.fillText(PNG_URL, W / 2, PAD + cardH + FOOT / 2);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

async function downloadPng() {
  if (!current) return;
  const f = FONTS.find((x) => x.id === fontId) || FONTS[0];
  try {
    await Promise.all([document.fonts.load(`400 14px ${f.css}`), document.fonts.load(`500 14px ${f.css}`)]);
  } catch (e) { /* draw with whatever font is available */ }
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const C = { s1: v("--s1"), s2: v("--s2"), tx: v("--tx"), tx2: v("--tx2"), ac: v("--ac"), acbg: v("--acbg"), bd: v("--bd"), bg: v("--bg") };
  const canvas = document.createElement("canvas");
  drawCardPng(canvas, current, C, f.css, fontId === "pressstart");
  canvas.toBlob((blob) => {
    if (!blob) return;
    const slug = current.stats.artist.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artist";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `neo-card-${slug}-${current.year}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
}

$("saveBtn").addEventListener("click", downloadPng);
// --- /png export ---

// --- PNG export (draws the card on a canvas; the watermark appears only in the PNG) ---
const WATERMARK = "heykhach.github.io/neo-cards";
const PNG_SCALE = 3;
const px = (v) => parseFloat(v) || 0;

function roundedRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(ctx, node, cs, origin) {
  const text = node.textContent;
  if (!text.trim()) return;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const range = document.createRange();
  let line = "", top = null, left = 0;
  const flush = () => {
    const t = line.replace(/\s+$/, "");
    if (t) {
      const ascent = ctx.measureText(t).fontBoundingBoxAscent || px(cs.fontSize) * 0.8;
      ctx.fillText(t, left - origin.x, top - origin.y + ascent);
    }
    line = "";
  };
  for (let i = 0; i < text.length; i++) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const rc = range.getClientRects()[0];
    if (!rc) continue;
    if (top === null || Math.abs(rc.top - top) > 2) { flush(); top = rc.top; left = rc.left; }
    line += text[i];
  }
  flush();
}

function drawNode(ctx, el, origin) {
  const cs = getComputedStyle(el);
  if (cs.display === "none") return;
  const r = el.getBoundingClientRect();
  const x = r.left - origin.x, y = r.top - origin.y;
  const radius = px(cs.borderTopLeftRadius);

  const bg = cs.backgroundColor;
  if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)" && r.width > 0 && r.height > 0) {
    ctx.fillStyle = bg;
    roundedRect(ctx, x, y, r.width, r.height, radius);
    ctx.fill();
  }

  const bt = px(cs.borderTopWidth), br = px(cs.borderRightWidth), bb = px(cs.borderBottomWidth), bl = px(cs.borderLeftWidth);
  if (bt > 0) {
    ctx.strokeStyle = cs.borderTopColor;
    ctx.lineWidth = Math.max(0.5, bt);
    if (br > 0 && bb > 0 && bl > 0) {
      roundedRect(ctx, x + bt / 2, y + bt / 2, r.width - bt, r.height - bt, radius);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y + bt / 2);
      ctx.lineTo(x + r.width, y + bt / 2);
      ctx.stroke();
    }
  }

  for (const child of el.childNodes) {
    if (child.nodeType === 1) drawNode(ctx, child, origin);
    else if (child.nodeType === 3) drawText(ctx, child, cs, origin);
  }
}

async function downloadPng() {
  const btn = $("downloadBtn");
  btn.disabled = true;
  try {
    const family = getComputedStyle(document.body).fontFamily;
    try {
      await Promise.all(["400", "500", "700"].map((w) => document.fonts.load(`${w} 16px ${family}`)));
      await document.fonts.ready;
    } catch (e) { /* fall back to whatever is loaded */ }

    const card = $("card");
    const rect = card.getBoundingClientRect();
    const root = getComputedStyle(document.documentElement);
    const padX = 24, padTop = 24, padBottom = 44;
    const W = Math.ceil(rect.width) + padX * 2;
    const H = Math.ceil(rect.height) + padTop + padBottom;

    const canvas = document.createElement("canvas");
    canvas.width = W * PNG_SCALE;
    canvas.height = H * PNG_SCALE;
    const ctx = canvas.getContext("2d");
    ctx.scale(PNG_SCALE, PNG_SCALE);

    ctx.fillStyle = root.getPropertyValue("--s1").trim() || "#f4f3ee";
    ctx.fillRect(0, 0, W, H);

    drawNode(ctx, card, { x: rect.left - padX, y: rect.top - padTop });

    // faded watermark, only in the PNG
    let size = 12;
    ctx.font = `400 ${size}px ${family}`;
    while (ctx.measureText(WATERMARK).width > W - 24 && size > 7) {
      size -= 1;
      ctx.font = `400 ${size}px ${family}`;
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = root.getPropertyValue("--tx").trim() || "#1f1e1d";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(WATERMARK, W / 2, padTop + rect.height + padBottom / 2);
    ctx.globalAlpha = 1;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG export failed");
    const slug = ($("artist").value || "artist").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `neo-card-${slug || "artist"}-${year}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (err) {
    $("error").textContent = "Couldn’t create the PNG in this browser.";
    $("error").hidden = false;
  } finally {
    btn.disabled = false;
  }
}

$("downloadBtn").addEventListener("click", downloadPng);
