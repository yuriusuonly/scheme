/**
 * @module internal/services/streaming
 * Streaming microservice — Server-Sent Events (SSE) transport.
 *
 * Subscribes to the domain event bus and broadcasts the SQL-training-ground
 * reload signal to the connected browsers as the named `data:changed` SSE wire
 * event. Every mutation frame carries its `mutationId` so clients can tell
 * their own mutation (the POST response repeats the same id) apart from remote
 * ones deterministically.
 *
 * SSE wire events use colons (matching the client's EventSource listeners);
 * domain events use dots. `data.changed` maps to the browser's `data:changed`
 * wire name unchanged.
 *
 * Why SSE instead of WebSocket?
 *   - One-way server → client push is all this app needs — writes already
 *     flow over HTTP, so there is no reason to carry a bidirectional socket.
 *   - EventSource has automatic reconnection with exponential backoff built
 *     into the browser — no manual reconnect timers.
 *   - Runs on plain HTTP with no upgrade handshake, proxies cleanly, and is
 *     debuggable with a plain `curl -N`.
 */

const sseClients = new Set(); // { id, controller }
let clientSequence = 0;
let keepAliveTimer = null;

/**
 * Encode a single SSE frame.
 *
 *   event: data:changed
 *   data: {"statement":"UPDATE",...}
 *   (blank line)
 *
 * @param {string|null} eventName  optional named event
 * @param {object} payload         event payload
 * @returns {string}
 */
function encodeFrame(eventName, payload) {
  let frame = "";
  if (eventName) frame += `event: ${eventName}\n`;
  frame += `data: ${JSON.stringify(payload)}\n\n`;
  return frame;
}

/**
 * Create the streaming service.
 * @param {object} dependencies
 * @param {object} dependencies.eventBus  the shared event bus
 */
export function createStreamingService({ eventBus }) {
  function broadcastWireEvent(eventName, payload) {
    const frame = encodeFrame(eventName, { ...payload, timestamp: Date.now() });
    for (const client of sseClients) {
      try {
        client.controller.enqueue(frame);
      } catch {
        // Stream closed or errored — drop the dead client.
        sseClients.delete(client);
      }
    }
  }

  // SQL-training-ground mutations broadcast one reload signal. Only a
  // sanitized subset of the domain payload is pushed to the browsers: the full
  // statement text, the acting user, and the request provenance stay in the
  // audit trail (synchronizations) and are never broadcast to other
  // clients. The mutation scope — `affectedTables` / `schemaChanged` /
  // `allTables`, derived server-side from the statement — is safe to expose
  // (table names are already public through the schema tree) and lets a
  // client refresh only the open tabs the mutation actually touched.
  eventBus.on("data.changed", ({ payload }) => {
    broadcastWireEvent("data:changed", {
      keyword: payload.keyword,
      changes: payload.changes,
      lastInsertRowid: payload.lastInsertRowid,
      durationMs: payload.durationMs,
      mutationId: payload.mutationId ?? null,
      affectedTables: Array.isArray(payload.affectedTables) ? payload.affectedTables : [],
      schemaChanged: Boolean(payload.schemaChanged),
      allTables: Boolean(payload.allTables),
    });
  });

  /**
   * SSE route handler — register a client and return an open-ended stream.
   *
   * GET /api/events
   * Headers:
   *   Content-Type: text/event-stream
   *   Cache-Control: no-cache, no-transform
   *   Connection: keep-alive
   *   X-Accel-Buffering: no   (disables reverse-proxy buffering)
   */
  function handleStream() {
    const clientId = ++clientSequence;
    let client = null;

    const stream = new ReadableStream({
      start(controller) {
        client = { id: clientId, controller };
        sseClients.add(client);

        // Immediate welcome event so the client knows the stream is alive.
        try {
          controller.enqueue(encodeFrame("connected", { clientId, message: "Scheme SSE connected" }));
        } catch {
          sseClients.delete(client);
        }

        console.log(`[streaming] Client ${clientId} connected (${sseClients.size} total)`);
      },
      cancel() {
        if (client) sseClients.delete(client);
        console.log(`[streaming] Client ${clientId} disconnected (${sseClients.size} remaining)`);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  /**
   * Start the keep-alive heartbeat. SSE connections can be killed by idle
   * timeouts in proxies, so we send a comment frame (`: ping`) periodically.
   * Comment frames are ignored by EventSource.
   *
   * Call once at server boot.
   */
  function startKeepAlive(intervalMilliseconds = 20000) {
    if (keepAliveTimer) return;
    keepAliveTimer = setInterval(() => {
      if (sseClients.size === 0) return;
      for (const client of sseClients) {
        try {
          client.controller.enqueue(": ping\n\n");
        } catch {
          sseClients.delete(client);
        }
      }
    }, intervalMilliseconds);
  }

  /** Number of currently connected SSE clients. */
  function clientCount() {
    return sseClients.size;
  }

  return { handleStream, startKeepAlive, clientCount };
}
