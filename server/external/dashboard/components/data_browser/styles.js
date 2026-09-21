/**
 * @module dashboard/components/data_browser
 * data_browser — file-browser table tree + tabbed data views, local to this
 * component. The pane-level flex sizing lives in the workspace component
 * (which owns the layout); this file styles the tree contents and the tabs.
 */

export const dataBrowserCss = `/* Left pane: the schema tree fills the whole .pane-browser strip. The pane
   width itself is owned by the workspace layout; the tree's only job is to
   use every available pixel and scroll when it overflows. */
.schema-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 6px;
  background: color-mix(in srgb, var(--c-surface, #fff) 97%, var(--c-border));
}

.schema-tree:focus {
  outline: none;
}

.schema-empty {
  padding: 10px 4px;
  font-size: 12px;
  color: var(--c-text-muted);
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 6px;
  border-radius: 5px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.tree-item:hover {
  background: var(--c-row-hover);
}

.tree-item.selected {
  background: color-mix(in srgb, var(--c-primary) 15%, transparent);
  color: var(--c-primary);
}

.tree-caret {
  flex: 0 0 auto;
  font-size: 9px;
  color: var(--c-text-muted);
  min-width: 10px;
  transition: transform 0.12s ease;
}

.tree-item.selected .tree-caret { color: var(--c-primary); }

.tree-icon { font-size: 11px; opacity: 0.8; flex: 0 0 auto; }

.tree-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-count {
  flex: 0 0 auto;
  margin-left: 2px;
  padding: 0 5px;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 700;
  background: var(--c-border);
  color: var(--c-text-muted);
  letter-spacing: 0.3px;
}

/* Expandable column listing under each tree item — the file-browser children
   of a table node. */
.tree-children {
  margin: 0 0 2px 19px;
  padding-left: 8px;
  border-left: 1px solid var(--c-border-light);
}

.tree-children[hidden] { display: none; }

.tree-column {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 4px;
  font-size: 10px;
  font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
}

.tree-column-name { color: var(--c-text); }

.tree-column-type {
  color: var(--c-text-muted);
  font-size: 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Right pane: the tabbed data view. Open tables get one tab each; the active
   tab renders its rows as an HTML table (or the latest query result when the
   result view is active). */
.tab-strip {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 6px 8px 0;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  border-bottom: 1px solid var(--c-border);
  background: var(--c-surface);
}

/* With no open tabs the strip collapses entirely (no border, no gap) so the
   pane shows only its panel prompt ("Select a table to view its rows.") until
   the trainee opens a table. */
.tab-strip:empty {
  display: none;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid var(--c-border);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: var(--c-surface-raised, #fff);
  color: var(--c-text-muted);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.tab:hover { color: var(--c-text); }

.tab.is-active {
  background: color-mix(in srgb, var(--c-primary) 8%, var(--c-surface));
  border-color: var(--c-primary);
  color: var(--c-primary);
  font-weight: 600;
}

.tab-close {
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 3px;
  color: var(--c-text-muted);
}

.tab-close:hover {
  color: var(--c-danger);
  background: var(--c-border-light);
}

.tab-panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
  /* No top padding: the scroll container clips at its padding box while a
     sticky header clamps to the content box, so any top padding would leave a
     strip above the header where tbody rows scroll into view. Spacing comes
     from .data-table's margin-top instead. */
  padding: 0 12px 10px;
}

/* Data tables rendered inside the active tab. */

.data-empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--c-text-muted);
}

.data-table {
  width: 100%;
  /* Separate borders so each cell owns its background/border box — with
     border-collapse: collapse the shared border row is painted by the table
     and rows can bleed through the sticky header. margin-top replaces the
     panel's former top padding (see .tab-panel). */
  margin-top: 10px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}

.data-table th {
  position: sticky;
  top: 0;
  /* Above the body cells so scrolled rows can never paint over the header. */
  z-index: 1;
  background: var(--c-head-bg, var(--c-surface));
  border-bottom: 2px solid var(--c-border);
  text-align: left;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--c-text-muted);
}

.data-table td {
  padding: 5px 10px;
  border-bottom: 1px solid var(--c-border-light);
  vertical-align: top;
  font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
  white-space: nowrap;
}

.data-table tbody tr:hover td { background: var(--c-row-hover); }

.data-table .empty-row td {
  text-align: center;
  color: var(--c-text-muted);
  font-style: italic;
}`;