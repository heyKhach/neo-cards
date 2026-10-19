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
let rows = null, year = "all", artist = "";
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
  $("card").hidden = false;
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
