/**
 * @module internal/services/health
 * Health microservice — uptime reporting for `/api/health`.
 */

/**
 * Create the health service.
 */
export function createHealthService() {
  function report() {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  return { report };
}