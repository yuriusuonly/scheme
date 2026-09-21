/**
 * @module dashboard/components/workspace
 * workspace — the pane shell of the SQL training ground.
 *
 * Owns the layout that splits the dashboard horizontally: a left pane (the
 * file-browser table tree) and a right vertical column stacking the data
 * table on top of the SQL editor. The layout is identical at every screen
 * size — there is no small-screen drawer, so the tree pane keeps this row
 * placement and all of its interactions everywhere. The left tree is a fixed
 * width strip (resizable via the tree drag handle between it and the right
 * column, up to covering the whole column; dragging below 36px snaps it shut);
 * the right column reserves a base share of the height for the data table and
 * lets the SQL editor stretch below it (resizable via the editor drag handle
 * between them, up to covering the whole column; below 36px it snaps shut).
 * Both handles are touch-safe (`touch-action: none` + pointer capture). The
 * topbar nav button toggles the tree collapse/expand through core state on
 * any screen size (the '.pane-browser.is-snapping' width transition slides it
 * shut and back open).
 *
 * The workspace renders the two drag handles and embeds the workspace script
 * (editor resize wiring); the panes themselves come from their own components
 * as `left`, `rightTop`, and `rightBottom`.
 */

import { workspaceCss } from "./styles.js";
import { workspaceScript } from "./scripts.js";

/**
 * @param {object} opts
 * @param {string} [opts.left=""]         tree browser pane component
 * @param {string} [opts.rightTop=""]     data table pane component
 * @param {string} [opts.rightBottom=""]  SQL editor pane component
 * @returns {string}
 */
export function workspace({ left = "", rightTop = "", rightBottom = "" } = {}) {
  return `<style>
${workspaceCss}
</style>
<div class="workspace">
  ${left}
  <div id="tree-drag-handle" class="tree-drag-handle" title="Drag to resize the table tree"></div>
  <div class="workspace-vertical">
    ${rightTop}
    <div id="editor-drag-handle" class="editor-drag-handle" title="Drag to resize the SQL editor"></div>
    ${rightBottom}
  </div>
</div>
<script type="module">
${workspaceScript}
</script>`;
}