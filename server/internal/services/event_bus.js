/**
 * @module internal/services/event_bus
 * In-process event bus (pub/sub) that decouples the domain services.
 *
 * Services publish domain events by name (`emit`) and subscribe with exact
 * names or trailing `.*` wildcards (`data.changed`, `data.*`). The event bus
 * is the only shared communication channel between services — no service
 * imports another service directly.
 *
 * Event naming convention:
 *   - Domain events use dots:   `data.changed`, `data.*`
 *   - Wire events (SSE) keep colons: `data:changed` (streaming service maps)
 */

/**
 * Create a fresh event bus.
 */
export function createEventBus() {
  const subscriptions = new Set();

  function matches(pattern, eventName) {
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -1); // strip the trailing "*"
      return eventName.startsWith(prefix);
    }
    return pattern === eventName;
  }

  /**
   * Subscribe a handler to an event pattern (`data.*` or an exact name).
   * @param {string} pattern
   * @param {(event: { name: string, payload: any }) => void} handler
   * @returns {() => void} unsubscribe function
   */
  function on(pattern, handler) {
    const subscription = { pattern, handler };
    subscriptions.add(subscription);
    return () => subscriptions.delete(subscription);
  }

  /**
   * Publish an event to every matching subscriber.
   * @param {string} name
   * @param {any} payload
   */
  function emit(name, payload) {
    for (const subscription of subscriptions) {
      if (!matches(subscription.pattern, name)) continue;
      try {
        subscription.handler({ name, payload });
      } catch (error) {
        console.error(`[event_bus] handler for "${name}" failed:`, error);
      }
    }
  }

  return { on, emit };
}