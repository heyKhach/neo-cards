// RECENT (loads 9th): turns live Spotify data into the data for the "recent stats" card.
// Needs: spotifyGet, getSpotifyName, fmt. Provides: RANGES, fetchRecent(range)

// Spotify's "top" lists cover roughly these windows.
const RANGES = [["short_term", "Last 4 weeks"], ["medium_term", "Last 6 months"], ["long_term", "Last year"]];

function ago(iso) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 60) return min < 2 ? "just now" : `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const trackLine = (t) => `${t.name} – ${t.artists && t.artists[0] ? t.artists[0].name : "Unknown"}`;
const orEmpty = (rows) => (rows.length ? rows : [["Not enough listening yet", ""]]);

// Fetches the top artists / songs for a time range plus the last 50 plays, and shapes them into a card.
async function fetchRecent(range) {
  const [artists, tracks, recent] = await Promise.all([
    spotifyGet(`/me/top/artists?limit=5&time_range=${range}`),
    spotifyGet(`/me/top/tracks?limit=5&time_range=${range}`),
    spotifyGet("/me/player/recently-played?limit=50"),
  ]);
  const plays = (recent.items || []).filter((it) => it.track);
  const minutes = Math.round(plays.reduce((n, it) => n + (it.track.duration_ms || 0), 0) / 60000);
  const name = getSpotifyName();
  return {
    title: name ? `${name}, recently` : "Recent stats",
    badge: RANGES.find((r) => r[0] === range)[1],
    tiles: [["Recent plays", fmt(plays.length)], ["Recent minutes", fmt(minutes)]],
    sections: [
      { kind: "list", caption: "Top artists", rows: orEmpty((artists.items || []).map((a, i) => [`${i + 1}. ${a.name}`, ""])) },
      { kind: "list", caption: "Top songs", rows: orEmpty((tracks.items || []).map((t, i) => [`${i + 1}. ${trackLine(t)}`, ""])) },
      { kind: "list", caption: "Last played", rows: orEmpty(plays.slice(0, 5).map((it) => [trackLine(it.track), ago(it.played_at)])) },
    ],
  };
}
