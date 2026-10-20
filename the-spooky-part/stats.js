// STATS (loads 3rd): turns the list of plays into the numbers the card shows.
// Needs: nothing. Provides: MONTHS, fmt, esc, analyze(rows, year, artist)

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
