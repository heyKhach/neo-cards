// POPUPS (loads 1st): the $ shortcut and the shared open / close behavior for every popup.
// Needs: nothing. Provides: $(id), bindPopup({ button, dialog, close, onOpen })

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
