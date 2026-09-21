/**
 * @module dashboard/components/workspace
 * workspace — horizontal pane shell + drag handles, local to this component.
 *
 * The workspace is a row: the file-browser tree pane (left), the tree drag
 * handle, and the vertical column (right) containing the data table pane, the
 * editor drag handle, and the SQL editor pane. The layout is identical at
 * every screen size — there is no small-screen drawer, so the tree pane keeps
 * its normal row placement and all of its interactions (toggle collapse,
 * drag resize, 36px snap) work the same everywhere. The table keeps a base
 * vertical share; the editor flexes to fill the rest unless the vertical drag
 * handle has overridden it with an inline flex. Both drag handles are
 * pill-shaped and carry `touch-action: none` (so a touch drag is never
 * hijacked into a page scroll mid-gesture) and — below their 36px snap
 * threshold — their pane snaps shut (the '.is-snapping' class animates the
 * slide).
 */

export const workspaceCss = `.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 6px;
  padding: 12px;
  overflow: hidden;
}

.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

/* Left: the file-browser tree pane — a fixed-width strip the trainee grows or
   shrinks with the tree drag handle (or up to the whole column width). The
   '.is-snapping' class animates the final slide when the drag passes the 36px
   snap threshold. */
.pane-browser {
  flex: 0 0 auto;
  width: 224px;
}

.pane-browser.is-snapping { transition: width 180ms ease; }

/* Right: the vertical column that stacks the data table above the SQL editor. */
.workspace-vertical {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

/* The data table keeps a base vertical share; the editor takes the rest. The
   vertical drag handle rewrites the editor's inline flex to a fixed pixel
   height so the table always gets the leftover room — or, past the snap
   threshold, the editor covers the table completely. */
.pane-table  { flex: 1 1 0; }
.pane-editor { flex: 1 1 0; }

.pane-editor.is-snapping { transition: flex-basis 180ms ease; }

/* Resizer between the tree and the vertical column — pill-shaped with rounded
   ends. */
.tree-drag-handle {
  flex: 0 0 auto;
  width: 6px;
  margin: 6px 0;
  border-radius: 3px;
  cursor: col-resize;
  background: var(--c-border-light);
  transition: background 0.15s;
  touch-action: none;
}

.tree-drag-handle:hover { background: var(--c-primary); }

/* Resizer between the data table and the SQL editor — pill-shaped as well. */
.editor-drag-handle {
  flex: 0 0 auto;
  height: 6px;
  margin: 0 6px;
  border-radius: 3px;
  cursor: row-resize;
  background: var(--c-border-light);
  transition: background 0.15s;
  touch-action: none;
}

.editor-drag-handle:hover { background: var(--c-primary); }

/* While dragging, the whole document shows the resize cursor so the mouse
   never flickers back to the default. */
body.tree-resizing,
body.tree-resizing * {
  cursor: col-resize !important;
  user-select: none !important;
}

body.editor-resizing,
body.editor-resizing * {
  cursor: row-resize !important;
  user-select: none !important;
}

/* Collapsed tree — the browser pane animates its width shut (the
   '.pane-browser.is-snapping' width transition, applied by the core toggle)
   so the vertical column glides to the full pane width, and the handle hides
   with it. The '!important' deliberately beats a drag-applied inline width so
   the collapsed state is authoritative; the border has to go too, because a
   border-box element cannot shrink below its borders and the 1px left/right
   edges would leave a 2px sliver at width 0. Toggled by the topbar nav button
   via core state on any screen size — the same width slide everywhere. */
.workspace.tree-collapsed .pane-browser {
  width: 0 !important;
  border-width: 0;
}

.workspace.tree-collapsed .tree-drag-handle {
  display: none;
}`;