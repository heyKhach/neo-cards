// EXPORT (loads 5th): draws the card (and the faded watermark) onto a canvas and downloads it as a PNG.
// Needs: $, fmt, FONTS, fontId, and `current` (the card's data, set by card.js). Provides: downloadPng()

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

$("downloadBtn").addEventListener("click", downloadPng);
