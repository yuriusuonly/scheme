/**
 * @module dashboard/components/statusbar
 * statusbar — embedded "last synchronization" readout wiring.
 *
 * The core runtime owns the statusbar data: `refreshStatusbar()` writes the
 * `#table-count` text and `updateLastSynchronization()` stamps the sync time.
 * This standalone script only bridges the `scheme:synchronized` bus event onto
 * the update helper, so the bottom readout refreshes whenever the app finishes
 * a data exchange (schema/table load or an SSE-synced mutation).
 */

export const statusbarScript = `(function () {
  var SchemeApp = window.SchemeApp;
  if (!SchemeApp || SchemeApp.bound.statusbar) return;
  SchemeApp.bound.statusbar = true;

  if (typeof SchemeApp.updateLastSynchronization === "function") {
    SchemeApp.bus.on("scheme:synchronized", function () {
      SchemeApp.updateLastSynchronization();
    });
  }
})();
`;