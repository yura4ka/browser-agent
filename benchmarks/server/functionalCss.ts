export const functionalCss = `
[hidden] { display: none !important; }
.is-hidden { display: none !important; }
.is-disabled, [aria-disabled="true"] { pointer-events: none; opacity: 0.6; }
.is-selected, [aria-selected="true"] { outline: 2px solid currentColor; }
.validation-error { color: #b00020; }
.interaction-row { display: flex; gap: 0.5rem; align-items: center; }
.stack { display: grid; gap: 0.75rem; }
.spinner { width: 1rem; height: 1rem; border: 2px solid currentColor; border-right-color: transparent; border-radius: 999px; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
