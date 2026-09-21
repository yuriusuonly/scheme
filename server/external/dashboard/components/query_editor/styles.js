/**
 * @module dashboard/components/query_editor
 * query_editor — editor, highlighter, completion, popup-diagnostic, and
 * toolbar styles.
 */

export const queryEditorCss = `.pane-editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.editor-shell {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  background: #ffffff;
}

/* The <pre> overlay sits behind the textarea and shows the highlighted code.
   Both share identical metrics so the caret stays aligned with the colour. */
.sql-highlight,
.sql-input {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 12px;
  font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  tab-size: 2;
  white-space: pre;
  word-wrap: normal;
  overflow: auto;
  border: 0;
  box-sizing: border-box;
}

.sql-highlight {
  pointer-events: none;
  color: var(--c-text);
  overflow: hidden;
  text-shadow: none;
}

.sql-input {
  z-index: 2;
  color: transparent;
  background: transparent;
  caret-color: var(--c-primary, #2563eb);
  resize: none;
  outline: none;
}

.sql-input::selection { background: rgba(37, 99, 235, 0.25); }

/* Highlight token colours — dark-on-light palette for the plain white editor */
.tok-keyword { color: #7c3aed; font-weight: 600; }
.tok-string  { color: #15803d; }
.tok-table   { color: #1d4ed8; }
.tok-operator{ color: #b45309; font-weight: 600; }
.tok-comment { color: #6b7280; font-style: italic; }
.tok-number  { color: #c2410c; }
.tok-ident   { color: #111827; }

/* Completion dropdown — positioned by the editor script just below the caret
   line (flipping above when there is no room) so the text being typed stays
   visible. */
.sql-completions {
  position: absolute;
  z-index: 20;
  min-width: 220px;
  max-width: 280px;
  max-height: 220px;
  overflow: auto;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 6px;
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.35));
  font-size: 12px;
}

.sql-completions:not([hidden]) { display: block; }

.completion-item {
  padding: 5px 10px;
  cursor: pointer;
  font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
  white-space: nowrap;
}

.completion-item.active { background: var(--c-primary); color: #fff; }

/* Live diagnostics — a small scrollable popup anchored to the top-right of
   the editor shell. It only appears while there are lint messages (hidden by
   default and when the code is clean). */
.editor-diagnostics {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 15;
  max-width: 280px;
  max-height: 150px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 10px;
  border: 1px solid var(--c-border);
  border-radius: 6px;
  background: #f8fafc;
  box-shadow: var(--shadow-md);
  font-size: 11px;
  flex-direction: column;
  gap: 2px;
}

/* The base rule above omits display on purpose — an unconditional display
   rule would neutralise the hidden attribute (author rules beat the UA
   [hidden] rule) and leave an unexplained popup. */
.editor-diagnostics:not([hidden]) { display: block; }

.diag { padding: 2px 0; }

.diag-error { color: var(--c-danger, #dc2626); }

.diag-warn { color: #b45309; }

/* Runtime SQL failures render in this slim strip between the editor shell
   and the toolbar — a light danger-tinted row written by the core runtime's
   setEditorError helper. */
.editor-error {
  flex-shrink: 0;
  padding: 6px 12px;
  border-top: 1px solid var(--c-border);
  background: #fef2f2;
  font-size: 11px;
  font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
  color: var(--c-danger);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.editor-error:not([hidden]) { display: block; }

/* The toolbar closes the editor pane: the shortcut hint stays left while the
   Clear + Run query buttons sit flush against the right edge. */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--c-border);
  flex-shrink: 0;
}

.editor-shortcut {
  margin-right: auto;
  font-size: 10px;
  color: var(--c-text-muted);
}`;