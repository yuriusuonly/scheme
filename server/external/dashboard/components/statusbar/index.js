/**
 * @module dashboard/components/statusbar
 * statusbar — footer status bar component.
 *
 * Sits at the very bottom of the dashboard below the workspace. It carries
 * three readouts separated by thin vertical dividers, ordered left to right:
 *   - `#synchronization-status` — the online/offline indicator, first in the
 *     left corner, written by the core runtime's `setOnlineStatus()` on SSE
 *     connect/errors and network loads.
 *   - `#table-count` — the active table's row total ("users · 2 total · showing
 *     50") or, while a SQL result is showing, the statement's returned row
 *     count; "No table selected" when no table is open. Written by the core
 *     runtime's `refreshStatusbar()` on every database re-render, replacing
 *     the per-panel `.data-summary` rows.
 *   - `#last-synchronization` — the "Last synchronization" time, refreshed
 *     when the core runtime emits the `scheme:synchronized` bus event after a
 *     data load or a synced mutation (see `scripts.js`).
 *
 * The row scrolls horizontally when its readouts exceed the viewport width.
 */

import { escapeHtml } from "../../../_/helpers/escape.js";

import { statusbarCss } from "./styles.js";
import { statusbarScript } from "./scripts.js";

export function statusbar({ tableCount = "", lastSynchronization = "\u2014" } = {}) {
  return `<style>
${statusbarCss}
</style>
<footer id="statusbar">
  <span id="synchronization-status" class="synchronization-badge" title="Synchronisation status">
    <span class="dot dot-green"></span> Online
  </span>
  <span class="separator"></span>
  <span id="table-count" title="Active table / result rows">${escapeHtml(tableCount)}</span>
  <span class="separator"></span>
  <span id="last-synchronization">${escapeHtml(lastSynchronization)}</span>
</footer>
<script type="module">
${statusbarScript}
</script>`;
}