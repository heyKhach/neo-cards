// CUSTOMIZE (loads 4th): themes, fonts, and templates (a theme + a font in one tap), saved in the browser.
// Needs: $, bindPopup, esc. Provides: THEMES, FONTS, TEMPLATES, currentTheme(), fontId, applyTheme(), applyFont(), applyTemplate()

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

bindPopup({ button: "themeBtn", dialog: "themeDialog", close: "themeClose", onOpen: renderThemes });
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

bindPopup({
  button: "fontBtn", dialog: "fontDialog", close: "fontClose",
  onOpen: () => { FONTS.forEach(loadFont); renderFonts(); },
});
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

const tplDialog = bindPopup({ button: "tplBtn", dialog: "tplDialog", close: "tplClose", onOpen: renderTemplates });
$("templates").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tpl-id]");
  if (btn) { applyTemplate(btn.dataset.tplId); tplDialog.close(); }
});
