// EXPORT (loads 5th): draws the card (a "Neo Cards" title and the faded watermark too) onto a canvas and downloads it as a PNG.
// Needs: $, fmt, FONTS, fontId, and getShownCard() (the card on screen, from card.js). Provides: downloadPng()

const PNG_URL = "heykhach.github.io/neo-cards";

// The PNG title is always Rubik (whatever font is picked); only its colour follows the theme.
const RUBIK = FONTS.find((f) => f.id === "rubik");
const TITLE_FAM = RUBIK.css;
const TITLE_H = 40; // extra height the title adds above the card
const TITLE_WEIGHT = 600; // how heavy the PNG title is (500 = medium, 600 = semi-bold, 700 = bold)
const TRACK = 0.05; // letter spacing, in em (keep in sync with letter-spacing in style.css)

// Starts loading Rubik and resolves once its stylesheet is ready (or has failed).
function ensureRubik() {
  loadFont(RUBIK);
  const link = document.getElementById("font-" + RUBIK.id);
  if (!link || link.sheet) return Promise.resolve();
  return new Promise((res) => { link.addEventListener("load", res); link.addEventListener("error", res); });
}
ensureRubik(); // warm it up early so the first download isn't delayed

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

// Draws a card (plus the watermark) onto a canvas, mirroring the on-screen layout.
// `model` is the same data the on-screen card is built from: { title, badge?, tiles: [[label, value]], sections: [...] },
// where a section is { kind: "bars", caption, rows: [[label, number]] } or { kind: "list", caption, rows: [[text, value]] }.
function drawCardPng(canvas, model, C, fam, pixel) {
  const { title, badge, tiles, sections } = model;
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
  const sectionH = (sec, i) => capH + (sec.kind === "bars" ? 8 + sec.rows.length * pitch + 10 : 4 + sec.rows.length * songH + (i < sections.length - 1 ? 10 : 0)); // lists get a gap only when another section follows
  const cardH = 16 + 24 + 12 + (tiles.length ? tileH + 16 : 0) + sections.reduce((n, sec, i) => n + sectionH(sec, i), 0) + 16;
  const W = CW + PAD * 2, H = TITLE_H + PAD + cardH + FOOT;

  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "middle";
  const setFont = (wt, size) => { ctx.font = font(wt, size); ctx.letterSpacing = (size * TRACK) + "px"; };

  paintBackdrop(ctx, W, H, C.bg, C.s1);

  // title: "Neo Cards" in Rubik, in the theme's accent colour
  ctx.font = `${TITLE_WEIGHT} 22px ${TITLE_FAM}`; ctx.letterSpacing = (22 * TRACK) + "px";
  ctx.fillStyle = C.ac; ctx.textAlign = "center";
  ctx.fillText("Neo Cards", W / 2, PAD + 14);
  ctx.textAlign = "left";
  ctx.translate(0, TITLE_H); // everything below is drawn under the title

  rr(ctx, PAD, PAD, CW, cardH, 12);
  ctx.fillStyle = C.s2; ctx.fill();
  ctx.strokeStyle = C.bd; ctx.lineWidth = 0.5; ctx.stroke();

  const x0 = PAD + IX;
  let y = PAD + 16;

  // header: title and (optional) badge
  let bw = 0;
  if (badge) {
    setFont(400, S.badge);
    bw = ctx.measureText(badge).width + 20;
    const bh = S.badge + 10;
    rr(ctx, x0 + IW - bw, y + (24 - bh) / 2, bw, bh, 8);
    ctx.fillStyle = C.acbg; ctx.fill();
    ctx.fillStyle = C.ac; ctx.textAlign = "center";
    ctx.fillText(badge, x0 + IW - bw / 2, y + 12);
    ctx.textAlign = "left";
  }
  setFont(500, S.title);
  ctx.fillStyle = C.tx;
  ctx.fillText(fit(ctx, title, IW - (badge ? bw + 8 : 0)), x0, y + 12);
  y += 24 + 12;

  // stat tiles
  if (tiles.length) {
    const tw = (IW - 8 * (tiles.length - 1)) / tiles.length;
    tiles.forEach(([label, value], i) => {
      const tx = x0 + i * (tw + 8);
      rr(ctx, tx, y, tw, tileH, 8);
      ctx.fillStyle = C.s1; ctx.fill();
      ctx.fillStyle = C.tx2; setFont(400, S.label);
      ctx.fillText(label, tx + 12, y + 10 + labelH / 2);
      ctx.fillStyle = C.tx; setFont(500, S.value);
      ctx.fillText(value, tx + 12, y + 10 + labelH + 2 + valueH / 2);
    });
    y += tileH + 16;
  }

  sections.forEach((sec, i) => {
    ctx.fillStyle = C.tx2; setFont(400, S.cap);
    ctx.fillText(sec.caption, x0, y + capH / 2);

    if (sec.kind === "bars") {
      y += capH + 8;
      const trackX = x0 + S.lw + 8, trackW = IW - S.lw - 8 - 8 - S.vw;
      const max = Math.max(...sec.rows.map((r) => r[1]), 1);
      sec.rows.forEach(([label, value]) => {
        const cy = y + rowH / 2;
        setFont(400, S.bar); ctx.fillStyle = C.tx2;
        ctx.fillText(label, x0, cy);
        rr(ctx, trackX, cy - 5, trackW, 10, 4);
        ctx.fillStyle = C.s1; ctx.fill();
        const fw = (value / max) * trackW;
        if (fw > 0.2) { rr(ctx, trackX, cy - 5, fw, 10, 4); ctx.fillStyle = C.ac; ctx.fill(); }
        setFont(500, S.bar); ctx.fillStyle = C.tx; ctx.textAlign = "right";
        ctx.fillText(fmt(value), x0 + IW, cy);
        ctx.textAlign = "left";
        y += pitch;
      });
      y += 10;
    } else {
      y += capH + 4;
      sec.rows.forEach(([text, value]) => {
        ctx.strokeStyle = C.bd; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + IW, y); ctx.stroke();
        let pw = 0;
        if (value) {
          setFont(500, S.song);
          pw = ctx.measureText(value).width + 10;
          ctx.fillStyle = C.tx; ctx.textAlign = "right";
          ctx.fillText(value, x0 + IW, y + songH / 2);
          ctx.textAlign = "left";
        }
        setFont(400, S.song);
        ctx.fillStyle = C.tx;
        ctx.fillText(fit(ctx, text, IW - pw), x0, y + songH / 2);
        y += songH;
      });
      if (i < sections.length - 1) y += 10;
    }
  });

  // watermark (PNG only)
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = C.tx; ctx.textAlign = "center";
  setFont(400, pixel ? 8 : 11);
  ctx.fillText(PNG_URL, W / 2, PAD + cardH + FOOT / 2);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

async function downloadPng() {
  const shown = getShownCard();
  if (!shown) return;
  const f = FONTS.find((x) => x.id === fontId) || FONTS[0];
  try {
    await ensureRubik();
    await Promise.all([
      document.fonts.load(`400 14px ${f.css}`), document.fonts.load(`500 14px ${f.css}`),
      document.fonts.load(`${TITLE_WEIGHT} 22px ${TITLE_FAM}`),
    ]);
  } catch (e) { /* draw with whatever font is available */ }
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const C = { s1: v("--s1"), s2: v("--s2"), tx: v("--tx"), tx2: v("--tx2"), ac: v("--ac"), acbg: v("--acbg"), bd: v("--bd"), bg: v("--bg") };
  const canvas = document.createElement("canvas");
  drawCardPng(canvas, shown.model, C, f.css, fontId === "pressstart");
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `neo-card-${shown.file}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
}

$("downloadBtn").addEventListener("click", downloadPng);
