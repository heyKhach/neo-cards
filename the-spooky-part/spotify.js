// SPOTIFY (loads 7th): logging in with Spotify through the person's own developer app, and calling Spotify's API.
// Uses the "PKCE" login, which needs no client secret, so everything can run in the browser.
// Needs: nothing. Provides: getClientId(), getRedirectUri(), isLoggedIn(), getSpotifyName(), startSpotifyLogin(clientId),
//   finishSpotifyLogin(), spotifyLogout(), forgetClientId(), spotifyGet(path)

const SPOTIFY_SCOPES = "user-read-recently-played user-top-read"; // what the app asks permission for
const CLIENT_ID_KEY = "neo-cards-spotify-client-id";
const TOKEN_KEY = "neo-cards-spotify-token";
const NAME_KEY = "neo-cards-spotify-name";
const AUTH_KEY = "neo-cards-spotify-auth"; // only exists while the person is away on Spotify's login page

const spotifyStore = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { localStorage.setItem(k, v); }, // can throw if the browser blocks storage; callers handle that
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};

function getClientId() { return spotifyStore.get(CLIENT_ID_KEY) || ""; }
// The exact address Spotify sends people back to after they log in. It has to be added to their developer app's settings too.
function getRedirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ""); }

function readToken() { try { return JSON.parse(spotifyStore.get(TOKEN_KEY)) || null; } catch (e) { return null; } }
function isLoggedIn() { return !!readToken(); }
function getSpotifyName() { return spotifyStore.get(NAME_KEY) || ""; }
function spotifyLogout() { spotifyStore.del(TOKEN_KEY); spotifyStore.del(NAME_KEY); }
function forgetClientId() { spotifyLogout(); spotifyStore.del(CLIENT_ID_KEY); }

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

// Step 1: sends the person to Spotify's login page.
async function startSpotifyLogin(clientId) {
  if (clientId !== getClientId()) spotifyLogout(); // a login belongs to the app that made it
  spotifyStore.set(CLIENT_ID_KEY, clientId);
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  spotifyStore.set(AUTH_KEY, JSON.stringify({ verifier, state }));
  location.assign("https://accounts.spotify.com/authorize?" + new URLSearchParams({
    response_type: "code", client_id: clientId, scope: SPOTIFY_SCOPES, redirect_uri: getRedirectUri(),
    state, code_challenge_method: "S256", code_challenge: base64url(await sha256(verifier)),
  }));
}

async function tokenRequest(params) {
  const res = await fetch("https://accounts.spotify.com/api/token", { method: "POST", body: new URLSearchParams(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || "Spotify refused the request.");
    err.fromSpotify = true;
    throw err;
  }
  return data;
}

function saveToken(data, oldRefresh) {
  spotifyStore.set(TOKEN_KEY, JSON.stringify({
    access: data.access_token,
    refresh: data.refresh_token || oldRefresh,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  }));
}

// Step 2: runs on every page load. If the person has just come back from Spotify, finishes the login.
// Returns null if they haven't, otherwise { ok: true, name } or { ok: false, message }.
async function finishSpotifyLogin() {
  const q = new URLSearchParams(location.search);
  if (!q.has("state") || !(q.has("code") || q.has("error"))) return null;
  history.replaceState(null, "", location.pathname + location.hash); // tidy the address bar
  let saved = null;
  try { saved = JSON.parse(spotifyStore.get(AUTH_KEY)); } catch (e) {}
  spotifyStore.del(AUTH_KEY);

  if (q.get("error")) {
    return { ok: false, message: q.get("error") === "access_denied" ? "Login cancelled." : "Spotify returned an error: " + q.get("error") + "." };
  }
  if (!saved || saved.state !== q.get("state")) return { ok: false, message: "Couldn’t verify the login. Please try again." };
  try {
    saveToken(await tokenRequest({
      grant_type: "authorization_code", code: q.get("code"), redirect_uri: getRedirectUri(),
      client_id: getClientId(), code_verifier: saved.verifier,
    }));
    const me = await spotifyGet("/me"); // also shows right away if Spotify won't let this account use the app
    const name = me.display_name || me.id;
    spotifyStore.set(NAME_KEY, name);
    return { ok: true, name };
  } catch (e) {
    spotifyLogout();
    return { ok: false, message: e.message };
  }
}

// Refreshes an expired login. Only ever runs once at a time, even if several requests ask together.
let refreshing = null;
async function refreshAccessToken(t) {
  try {
    const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: getClientId() });
    saveToken(data, t.refresh);
    return data.access_token;
  } catch (e) {
    if (e.fromSpotify) spotifyLogout(); // Spotify says the login is over; a plain network error keeps it
    return null;
  }
}

// A valid access token, refreshed first if it has run out. null if the person isn't logged in (any more).
async function getAccessToken() {
  const t = readToken();
  if (!t) return null;
  if (Date.now() < t.expires) return t.access;
  if (!refreshing) refreshing = refreshAccessToken(t).finally(() => { refreshing = null; });
  return refreshing;
}

// GETs something from Spotify's API, e.g. spotifyGet("/me").
async function spotifyGet(path) {
  const token = await getAccessToken();
  if (!token) throw new Error("You’re not logged in. Please log in again.");
  const res = await fetch("https://api.spotify.com/v1" + path, { headers: { Authorization: "Bearer " + token } });
  if (res.status === 403) throw new Error("Spotify refused this account. Add it under User Management in your app’s settings, then log in again.");
  if (res.status === 401) { spotifyLogout(); throw new Error("Your login expired. Please log in again."); }
  if (res.status === 429) throw new Error("Spotify is busy. Try again in a moment.");
  if (!res.ok) throw new Error("Spotify error " + res.status + ".");
  return res.json();
}
