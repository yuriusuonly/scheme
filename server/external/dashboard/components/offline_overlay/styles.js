/**
 * offline_overlay — dedicated offline-mode overlay styles, local to the
 * component. The base rule deliberately does NOT declare `display` so the
 * `hidden` attribute stays authoritative; the flex layout lives only in the
 * `:not([hidden])` rule. The section covers the whole viewport (topbar,
 * workspace and statusbar), so no new action is reachable while offline.
 */

export const offlineOverlayCss = `.offline-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(16, 24, 40, 0.55);
  backdrop-filter: blur(2px);
  align-items: center;
  justify-content: center;
}

.offline-overlay[hidden] {
  display: none;
}

.offline-overlay:not([hidden]) {
  display: flex;
}

.offline-overlay-card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  padding: 28px 36px;
  max-width: 360px;
  text-align: center;
}

.offline-overlay-spinner {
  display: inline-block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--c-border-light);
  border-top-color: var(--c-primary);
  animation: offline-overlay-spin 0.8s linear infinite;
  margin-bottom: 12px;
}

.offline-overlay-card h2 {
  margin: 0 0 6px;
  font-size: 16px;
  color: var(--c-text);
}

.offline-overlay-card p {
  margin: 0;
  font-size: 12px;
  color: var(--c-text-muted);
}

.offline-overlay-pending {
  margin-top: 8px;
  font-weight: 600;
  color: var(--c-primary);
}

@keyframes offline-overlay-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}`;