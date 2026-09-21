/**
 * button — `.button`-family styles, local to this component.
 */

export const buttonCss = `.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  font-family: var(--font);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
  user-select: none;
}

.button:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: 1px;
}

.button-sm {
  height: 26px;
  padding: 0 8px;
  font-size: 11px;
}

.button-primary {
  background: var(--c-primary);
  color: #fff;
}
.button-primary:hover { background: var(--c-primary-hover); }

.button-danger {
  background: var(--c-danger);
  color: #fff;
}
.button-danger:hover { background: var(--c-danger-hover); }

.button-ghost {
  background: transparent;
  color: var(--c-text-muted);
  border-color: var(--c-border);
}
.button-ghost:hover {
  background: var(--c-bg);
  color: var(--c-text);
}

/* Bare button — no border, no background; only the glyph tints. */
.button-plain {
  background: transparent;
  border-color: transparent;
  color: var(--c-text-muted);
}
.button-plain:hover {
  background: transparent;
  border-color: transparent;
  color: var(--c-text);
}

/* Destructive bare button — same bare frame, danger-colored glyph. */
.button-plain-danger {
  color: var(--c-danger);
}
.button-plain-danger:hover {
  color: var(--c-danger-hover);
}

.button-block {
  width: 100%;
}

/* Icon-only buttons — a round 32px badge carrying an inline SVG. */
.button-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
}

.button-icon svg {
  display: block;
  width: 16px;
  height: 16px;
}`;