/**
 * offline_overlay — dedicated offline-mode overlay component (dashboard-only).
 *
 * Markup + styles only: the core client runtime toggles the section via
 * `showOfflineOverlay()` / `hideOfflineOverlay()` (#offline-overlay) and the
 * pending-write count via `refreshOfflinePending()` (#offline-pending). The
 * overlay is shown the moment the connection drops — every pointer action is
 * blocked by the full-viewport section — and is hidden only after the
 * IndexedDB outbox has been flushed on reconnect, so no new training action
 * runs while the server is unreachable.
 */

import { offlineOverlayCss } from "./styles.js";

export function offlineOverlay() {
  return `<style>
${offlineOverlayCss}
</style>
<section id="offline-overlay" class="offline-overlay" hidden>
  <div class="offline-overlay-card">
    <span class="offline-overlay-spinner" aria-hidden="true"></span>
    <h2>You're offline</h2>
    <p>Reconnecting to the server&hellip;</p>
    <p id="offline-pending" class="offline-overlay-pending" hidden></p>
  </div>
</section>`;
}