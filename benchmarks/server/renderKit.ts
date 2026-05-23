import type { Difficulty } from "../schemas";

export type RenderContext = {
  difficulty: Difficulty;
  seed: number;
};

type Attributes = Record<string, string | number | boolean | undefined>;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function attrs(values: Attributes): string {
  const rendered = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) =>
      value === true ? key : `${key}="${escapeHtml(String(value))}"`,
    );

  return rendered.length === 0 ? "" : ` ${rendered.join(" ")}`;
}

export function pageShell(options: {
  title: string;
  body: string;
  css?: string;
  script?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title)}</title>
  ${options.css ? `<style>${options.css}</style>` : ""}
</head>
<body>
${options.body}
${options.script ? `<script>${options.script}</script>` : ""}
</body>
</html>`;
}

export function link(
  ctx: RenderContext,
  options: { href: string; label: string; id?: string },
): string {
  if (ctx.difficulty === "hard") {
    return `<span${attrs({ id: options.id, role: "link", tabindex: 0, "data-href": options.href })}>${escapeHtml(
      options.label,
    )}</span>`;
  }

  return `<a${attrs({ id: options.id, href: options.href })}>${escapeHtml(options.label)}</a>`;
}

export function button(
  ctx: RenderContext,
  options: { label: string; id?: string; type?: "button" | "submit" },
): string {
  if (ctx.difficulty === "hard") {
    return `<div${attrs({ id: options.id, role: "button", tabindex: 0, "data-type": options.type ?? "button" })}>${escapeHtml(
      options.label,
    )}</div>`;
  }

  return `<button${attrs({ id: options.id, type: options.type ?? "button" })}>${escapeHtml(options.label)}</button>`;
}

export function textInput(
  ctx: RenderContext,
  options: {
    name: string;
    label: string;
    id?: string;
    value?: string;
    required?: boolean;
  },
): string {
  const id = options.id ?? options.name;
  const input = `<input${attrs({ id, name: options.name, value: options.value, required: options.required })}>`;

  if (ctx.difficulty === "hard") {
    return `<div><span>${escapeHtml(options.label)}</span>${input}</div>`;
  }

  return `<label${attrs({ for: id })}>${escapeHtml(options.label)}</label>${input}`;
}

export function checkbox(
  ctx: RenderContext,
  options: { name: string; label: string; id?: string; checked?: boolean },
): string {
  const id = options.id ?? options.name;
  const input = `<input${attrs({ id, name: options.name, type: "checkbox", checked: options.checked })}>`;

  if (ctx.difficulty === "hard") {
    return `<div><span>${escapeHtml(options.label)}</span>${input}</div>`;
  }

  return `<label>${input}${escapeHtml(options.label)}</label>`;
}

export function select(
  ctx: RenderContext,
  options: {
    name: string;
    label: string;
    id?: string;
    values: Array<{ value: string; label: string }>;
  },
): string {
  const id = options.id ?? options.name;
  const renderedOptions = options.values
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
    )
    .join("");
  const control = `<select${attrs({ id, name: options.name })}>${renderedOptions}</select>`;

  if (ctx.difficulty === "hard") {
    return `<div><span>${escapeHtml(options.label)}</span>${control}</div>`;
  }

  return `<label${attrs({ for: id })}>${escapeHtml(options.label)}</label>${control}`;
}

export function modal(options: {
  id: string;
  title: string;
  body: string;
  hidden?: boolean;
}): string {
  return `<section${attrs({ id: options.id, role: "dialog", "aria-modal": "true", hidden: options.hidden })}>
  <h2>${escapeHtml(options.title)}</h2>
  ${options.body}
</section>`;
}

export function validationMessage(options: {
  id: string;
  message: string;
  hidden?: boolean;
}): string {
  return `<p${attrs({ id: options.id, class: "validation-error", role: "alert", hidden: options.hidden })}>${escapeHtml(
    options.message,
  )}</p>`;
}
