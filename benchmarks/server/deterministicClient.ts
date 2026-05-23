export function deterministicClientScript(seed: number): string {
  const delayMs = 100 + (seed % 5) * 25;

  return `
document.addEventListener("click", (event) => {
  const target = event.target.closest("[role='link'][data-href]");
  if (target) window.location.href = target.dataset.href;
});
document.addEventListener("keydown", (event) => {
  const target = event.target.closest("[role='link'][data-href]");
  if (target && (event.key === "Enter" || event.key === " ")) window.location.href = target.dataset.href;
});
document.querySelectorAll("[data-delay-reveal]").forEach((element) => {
  window.setTimeout(() => element.hidden = false, ${delayMs});
});
`;
}
