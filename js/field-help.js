/** Click-to-toggle field info tooltips (hover works too). */
export function initFieldTooltips() {
  document.querySelectorAll(".info-tip__btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const tip = btn.closest(".info-tip");
      const isOpen = tip.classList.contains("info-tip--open");

      document.querySelectorAll(".info-tip--open").forEach((el) => {
        el.classList.remove("info-tip--open");
      });

      if (!isOpen) tip.classList.add("info-tip--open");
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".info-tip--open").forEach((el) => {
      el.classList.remove("info-tip--open");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      document.querySelectorAll(".info-tip--open").forEach((el) => {
        el.classList.remove("info-tip--open");
      });
    }
  });
}
