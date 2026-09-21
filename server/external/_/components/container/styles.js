/**
 * container — base layout component.
 *
 * Owns the app's global stylesheet: reset, CSS variables, base typography and
 * body layout, responsive tweaks, and the `.container` wrapper rules. Pages
 * wrap their children in `container()` so every served page carries exactly
 * the base styles it needs — nothing is embedded centrally in the <head>.
 */

const resetCss = `/* Reset */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}`;

const varsCss = `:root {
  --c-bg:          #f5f6f8;
  --c-surface:     #ffffff;
  --c-border:      #d0d5dd;
  --c-border-light:#e4e7ec;
  --c-text:        #101828;
  --c-text-muted:  #667085;
  --c-primary:     #2563eb;
  --c-primary-hover:#1d4ed8;
  --c-danger:      #dc2626;
  --c-danger-hover:#b91c1c;
  --c-success:     #16a34a;
  --c-warning:     #f59e0b;
  --c-row-even:    #f9fafb;
  --c-row-odd:     #ffffff;
  --c-row-hover:   #eff6ff;
  --c-row-selected:#dbeafe;
  --c-head-bg:     #f1f3f5;
  --c-focus-ring:  rgba(37, 99, 235, 0.35);
  --radius:        6px;
  --shadow-sm:     0 1px 2px rgba(16, 24, 40, 0.05);
  --shadow-md:     0 4px 12px rgba(16, 24, 40, 0.08);
  --shadow-lg:     0 12px 32px rgba(16, 24, 40, 0.12);
  --font:          -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono:          "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
  --topbar-h:      52px;
  --statusbar-h:   28px;
}`;

const baseCss = `html, body {
  height: 100%;
  font-family: var(--font);
  font-size: 13px;
  line-height: 1.5;
  color: var(--c-text);
  background: var(--c-bg);
}

body {
  display: flex;
  flex-direction: column;
}`;

const containerCss = `.container {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}`;

const responsiveCss = `@media (max-width: 768px) {
  #topbar { padding: 0 10px; }
  .tagline { display: none; }
  .data-table { font-size: 11px; }
}`;

/**
 * The layout component's stylesheet — embedded by `container()` on every page.
 */
export const globalCss = [resetCss, varsCss, baseCss, containerCss, responsiveCss].join("\n\n");