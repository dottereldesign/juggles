const header = document.querySelector(".project-header");
const toggle = header.querySelector(".nav-toggle");
const nav = header.querySelector("nav");

function setOpen(open) {
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
}
toggle.hidden = false;
toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") === "false"));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
    setOpen(false);
    toggle.focus();
  }
});
document.addEventListener("pointerdown", event => {
  if (!header.contains(event.target)) setOpen(false);
});
header.addEventListener("focusout", event => {
  if (!header.contains(event.relatedTarget)) setOpen(false);
});
nav.addEventListener("click", event => {
  if (event.target.closest("a")) setOpen(false);
});
matchMedia("(max-width: 1180px), (pointer: coarse) and (max-width: 1366px)")
  .addEventListener("change", () => setOpen(false));
window.addEventListener("pageshow", () => setOpen(false));
