// CARD (loads 6th): the page's state, draws the card, and handles the file upload and the artist / year pickers.
// Needs: everything above. Provides: rows, year, artist, current, render()

let rows = null, year = "all", artist = "", current = null;

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
