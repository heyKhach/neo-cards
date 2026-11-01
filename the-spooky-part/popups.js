// POPUPS (loads 1st): the $ shortcut and the shared open / close behavior for every popup.
// Needs: nothing. Provides: $(id), bindPopup({ button, dialog, close, onOpen }), bindMenu({ button, menu })

const $ = (id) => document.getElementById(id);

// Wires one popup: the button opens it, the x button, a tap outside, or Esc closes it.
// onOpen (optional) runs right before it opens, e.g. to build its contents.
function bindPopup({ button, dialog, close, onOpen }) {
  const el = $(dialog);
  $(button).addEventListener("click", () => {
    if (onOpen) onOpen();
    el.showModal();
  });
  $(close).addEventListener("click", () => el.close());
  el.addEventListener("click", (e) => { if (e.target === el) el.close(); });
  return el;
}

// Wires the top-right dropdown: the button toggles it; picking an item, a tap outside, or Esc closes it.
// To add an item later, just put another <button class="menu-item"> inside the menu in index.html.
function bindMenu({ button, menu }) {
  const btn = $(button), el = $(menu);
  const set = (open) => { el.classList.toggle("open", open); btn.setAttribute("aria-expanded", open); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); set(!el.classList.contains("open")); });
  el.addEventListener("click", (e) => { if (e.target.closest("button")) set(false); });
  document.addEventListener("click", (e) => { if (!el.contains(e.target)) set(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.classList.contains("open")) { set(false); btn.focus(); }
  });
}
bindMenu({ button: "menuBtn", menu: "menu" });
