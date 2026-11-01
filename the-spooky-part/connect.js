// CONNECT (loads 8th): the "Connect" popup where Premium users paste the Client ID of their own Spotify developer app and log in.
// Needs: $, bindPopup, and everything from spotify.js. Provides: nothing (but announces login / logout with a "spotify-auth" event).

const connectInput = $("clientId"), connectError = $("connectError"), connectStatus = $("connectStatus");
const connectLogin = $("connectLogin"), connectLogout = $("connectLogout"), connectRemove = $("connectRemove");

function setConnectMsg(error, status) {
  connectError.textContent = error || ""; connectError.hidden = !error;
  connectStatus.textContent = status || ""; connectStatus.hidden = !status;
}

// Runs every time the popup opens, so it always shows how things are right now.
function refreshConnect() {
  $("redirectUri").textContent = getRedirectUri();
  connectInput.value = getClientId();
  connectLogin.disabled = false;
  connectLogin.textContent = isLoggedIn() ? "Log in again" : "Log in";
  connectLogout.hidden = !isLoggedIn();
  connectRemove.hidden = !getClientId();
  setConnectMsg("", isLoggedIn() ? "Logged in" + (getSpotifyName() ? " as " + getSpotifyName() : "") + "." : "");
}
bindPopup({ button: "connectBtn", dialog: "connectDialog", close: "connectClose", onOpen: refreshConnect });

async function logIn() {
  const id = connectInput.value.trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) return setConnectMsg("That doesn’t look like a Client ID. It’s 32 characters (0–9 and a–f).", "");
  connectLogin.disabled = true;
  setConnectMsg("", "Opening Spotify…");
  try { await startSpotifyLogin(id); }
  catch (e) {
    connectLogin.disabled = false;
    setConnectMsg("Couldn’t start the login. Is your browser blocking storage?", "");
  }
}
connectLogin.addEventListener("click", logIn);
connectInput.addEventListener("keydown", (e) => { if (e.key === "Enter") logIn(); });

const announce = (what) => window.dispatchEvent(new CustomEvent("spotify-auth", { detail: what }));
connectLogout.addEventListener("click", () => { spotifyLogout(); refreshConnect(); setConnectMsg("", "Logged out."); announce("logout"); });
connectRemove.addEventListener("click", () => { forgetClientId(); refreshConnect(); setConnectMsg("", "Removed."); announce("logout"); });

// Pressing the browser's back button from Spotify's page brings this page back as it was; un-stick the button.
window.addEventListener("pageshow", (e) => { if (e.persisted) refreshConnect(); });

// Copies the Redirect URI (falls back to just selecting it if the browser won't allow copying).
$("copyUri").addEventListener("click", async () => {
  const btn = $("copyUri");
  try {
    await navigator.clipboard.writeText(getRedirectUri());
    btn.textContent = "Copied";
  } catch (e) {
    const range = document.createRange();
    range.selectNodeContents($("redirectUri"));
    getSelection().removeAllRanges(); getSelection().addRange(range);
    btn.textContent = "Selected";
  }
  setTimeout(() => { btn.textContent = "Copy"; }, 1500);
});

// Coming back from Spotify's login page: finish logging in, then reopen the popup to show how it went.
finishSpotifyLogin().then((result) => {
  if (!result) return;
  refreshConnect();
  if (!result.ok) setConnectMsg(result.message, "");
  $("connectDialog").showModal();
  if (result.ok) announce("login");
});
