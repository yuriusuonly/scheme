/**
 * @module internal/services/synchronization
 * Synchronization microservice — mutation audit trail.
 *
 * Subscribes to the queries service's `data.changed` domain event (every SQL
 * mutation from the training ground) and appends a `synchronizations`
 * entry so clients can audit what changed. Each entry records the SQL
 * statement (in `operation`), the acting user, and the request provenance
 * (source IP, user agent) forwarded by the HTTP adapter.
 *
 * Also exposes the `pending` / `acknowledge` use-cases consumed by the
 * `/api/synchronization/*` HTTP adapters — entries stay unacknowledged
 * (`synchronized_at IS NULL`) until a client acknowledges their ids.
 */

/**
 * Create the synchronization service.
 * @param {object} dependencies
 * @param {object} dependencies.repositories  repository set from persistence
 * @param {object} dependencies.eventBus      the shared event bus
 */
export function createSynchronizationService({ repositories, eventBus }) {
  /**
   * Append an audit entry for a completed mutation.
   */
  function appendEntry({ operation, userId, sourceIp, userAgent }) {
    repositories.synchronization.insert({ operation, userId, sourceIp, userAgent });
  }

  // Arbitrary SQL mutations from the training ground.
  eventBus.on("data.changed", ({ payload }) => {
    appendEntry({
      operation: payload.statement,
      userId: payload.userId,
      sourceIp: payload.sourceIp,
      userAgent: payload.userAgent,
    });
  });

  /**
   * List unacknowledged mutations (`synchronized_at IS NULL`).
   */
  function pending() {
    return repositories.synchronization.listUnsynced();
  }

  /**
   * Acknowledge mutation ids by stamping `synchronized_at`.
   * @param {number[]} ids
   */
  function acknowledge(ids) {
    const safeIds = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : [];
    repositories.synchronization.markSynced(safeIds);
    return safeIds.length;
  }

  return { pending, acknowledge };
}
