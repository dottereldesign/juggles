const filterBar = document.querySelector("#filters");
const filterButtons = [...filterBar.querySelectorAll("button")];
const hardwareSections = [...document.querySelectorAll(".part")].filter(section => section.querySelector(".offer"));
const statusText = document.querySelector("#filter-status");

function showOffers(origin) {
  let total = 0;
  for (const section of hardwareSections) {
    let visibleCount = 0;
    let cheapest;
    let lowestPrice = Infinity;
    for (const offer of section.querySelectorAll(".offer")) {
      offer.hidden = origin !== "all" && origin !== offer.dataset.origin;
      if (offer.hidden) continue;
      visibleCount++;
      const amount = Number(offer.querySelector(".price").textContent.replace(/[^\d.]/g, ""));
      if (amount < lowestPrice) {
        cheapest = offer;
        lowestPrice = amount;
      }
    }
    section.hidden = visibleCount === 0;
    if (cheapest) {
      const price = cheapest.querySelector(".price").textContent;
      const unit = cheapest.querySelector(".terms").textContent.split(" · ")[0].toLowerCase();
      section.querySelector(".offer-floor").textContent = "From " + price + " · " + unit;
    }
    section.querySelector(".offer-count").textContent = visibleCount + (visibleCount === 1 ? " offer" : " offers");
    total += visibleCount;
  }
  for (const button of filterButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === origin));
  }
  statusText.textContent = total + " hardware offers shown.";
}

for (const button of filterButtons) {
  button.addEventListener("click", () => showOffers(button.dataset.filter));
}
filterBar.hidden = false;

function revealPart(hash) {
  const target = document.getElementById(hash.slice(1));
  const section = target?.closest(".part");
  if (!section) return;
  if (target.hidden || section.hidden) showOffers("all");
  section.open = true;
  target.scrollIntoView({ block: "start" });
}

for (const link of document.querySelectorAll('a[href^="#"]')) {
  link.addEventListener("click", () => revealPart(link.hash));
}
window.addEventListener("hashchange", () => revealPart(location.hash));
if (location.hash) revealPart(location.hash);
