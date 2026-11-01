// CARD (loads 10th): the page's state, draws the two cards (history and recent), and handles the file upload,
// the artist / year / period pickers and the card toggle.
// Needs: everything above. Provides: rows, year, artist, current, view, render(), applyView(), getShownCard()

let rows = null, year = "all", artist = "", current = null, artistNames = [];
let view = "local"; // "local" = the card from your history file, "synced" = the card from your Spotify login
let localCard = null, syncCard = null, syncRange = "short_term", syncToken = 0;

// The card on screen right now, as { model, file }; the PNG export draws this one.
const getShownCard = () => (view === "local" ? localCard : syncCard);

// ---- turning data into a card ----
// A card is described by a "model": { title, badge?, tiles: [[label, value]], sections }.
// A section is { kind: "bars", caption, rows: [[label, number]] } or { kind: "list", caption, rows: [[text, value]] }.
// The same model is used for the on-screen card (cardHtml) and the PNG (drawCardPng in export.js).

function buildLocalModel(stats, year) {
  return {
    title: `${stats.artist}, ${year === "all" ? "all time" : year}`,
    badge: `#${stats.rank} by plays`,
    tiles: [["Plays", fmt(stats.plays)], ["Minutes", fmt(stats.minutes)]],
    sections: [
      { kind: "bars", caption: `Minutes per ${year === "all" ? "year" : "month"}`, rows: stats.bars.map((b) => [b.label, b.minutes]) },
      { kind: "list", caption: "Top songs by plays", rows: stats.topSongs.map(([t, n]) => [t, fmt(n)]) },
    ],
  };
}

function cardHtml(m) {
  return `
    <div class="head">
      <span class="title">${esc(m.title)}</span>
      ${m.badge ? `<span class="badge">${esc(m.badge)}</span>` : ""}
    </div>
    <div class="stats">
      ${m.tiles.map(([l, v]) => `<div><p class="label">${esc(l)}</p><p class="value">${esc(v)}</p></div>`).join("")}
    </div>
    ${m.sections.map((sec, i) => {
      if (sec.kind === "bars") {
        const max = Math.max(...sec.rows.map((r) => r[1]), 1);
        return `<p class="caption">${esc(sec.caption)}</p>` + sec.rows.map(([label, v]) => `
      <div class="bar">
        <span class="bar-label">${esc(label)}</span>
        <div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div>
        <span class="bar-value">${fmt(v)}</span>
      </div>`).join("");
      }
      return `<p class="caption"${i ? ' style="margin:16px 0 4px"' : ""}>${esc(sec.caption)}</p>` +
        sec.rows.map(([t, v]) => `<div class="song"><span>${esc(t)}</span><span>${esc(v)}</span></div>`).join("");
    }).join("")}`;
}

// ---- which parts of the page show ----
function setSyncMsg(text, isError) {
  const el = $("syncMsg");
  el.textContent = text; el.className = isError ? "error" : "note";
}

function applyView() {
  const local = view === "local";
  $("controls").hidden = !(local && localCard);
  $("card").hidden = !(local && localCard);
  $("syncControls").hidden = local;
  $("syncMsg").hidden = local || !$("syncMsg").textContent;
  $("syncCard").hidden = local || !syncCard;
  $("downloadBtn").hidden = !getShownCard();
  $("cardToggleLabel").textContent = local ? "Recent stats" : "History card";
}

// ---- the history card (from your file) ----
function render() {
  const stats = analyze(rows, year, artist);
  if (!stats) return;
  const years = [...new Set(rows.map((r) => r.ts.slice(0, 4)))].sort().reverse();

  artistNames = stats.artistOptions; // every artist for this period, most played first (the search box looks through all of them)
  $("artist").value = stats.artist;
  $("year").innerHTML = `<option value="all">All time</option>` +
    years.map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${y}</option>`).join("");

  current = { stats, year };
  const slug = stats.artist.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artist";
  localCard = { model: buildLocalModel(stats, year), file: `${slug}-${year}` };
  $("card").innerHTML = cardHtml(localCard.model);
  applyView();
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
    view = "local";
    render();
  } catch (err) {
    $("error").textContent = "Couldn’t read that file. Check that it’s the Extended streaming history export.";
    $("error").hidden = false;
  }
});
bindArtistSearch({
  input: "artist", list: "artistList",
  getNames: () => artistNames,
  getCurrent: () => (current ? current.stats.artist : ""),
  onPick: (name) => { artist = name; render(); },
});
$("year").addEventListener("change", (e) => { year = e.target.value; render(); });

// ---- the recent card (from your Spotify login) ----
async function loadSynced() {
  const mine = ++syncToken; // if the person clicks around quickly, only the newest request is shown
  syncCard = null;
  $("syncCard").innerHTML = "";
  setSyncMsg("Loading from Spotify…", false);
  applyView();
  try {
    const model = await fetchRecent(syncRange);
    if (mine !== syncToken) return;
    syncCard = { model, file: `recent-${syncRange}` };
    $("syncCard").innerHTML = cardHtml(model);
    setSyncMsg("", false);
  } catch (err) {
    if (mine !== syncToken) return;
    setSyncMsg(err instanceof TypeError ? "Couldn’t reach Spotify. Check your connection and press Refresh." : err.message, true);
  }
  applyView();
}

$("syncRange").innerHTML = RANGES.map(([id, label]) => `<option value="${id}">${label}</option>`).join("");
$("syncRange").addEventListener("change", (e) => { syncRange = e.target.value; loadSynced(); });
$("syncRefresh").addEventListener("click", loadSynced);

// The menu's card toggle. Not logged in yet? Then it opens the Connect popup instead.
$("cardToggleBtn").addEventListener("click", () => {
  if (view === "synced") { view = "local"; applyView(); }
  else if (!isLoggedIn()) $("connectBtn").click();
  else { view = "synced"; loadSynced(); }
});

// connect.js announces logging in and out.
window.addEventListener("spotify-auth", (e) => {
  syncToken++; syncCard = null; $("syncCard").innerHTML = "";
  if (e.detail === "login") { view = "synced"; loadSynced(); }
  else { view = "local"; applyView(); }
});

applyView();
