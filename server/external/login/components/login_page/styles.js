/**
 * login-page — standalone sign-in page styles, local to this component.
 *
 * A centered card on the app background (a full page, not a modal overlay).
 */

export const loginPageCss = `.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}

.login-card {
  background: var(--c-surface);
  border: 1px solid var(--c-border-light);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 40px 32px;
  width: 380px;
  max-width: 90vw;
}

.login-brand {
  margin-bottom: 4px;
  font-size: 24px;
  font-weight: 700;
}

.login-subtitle {
  margin-bottom: 24px;
  font-size: 13px;
  color: var(--c-text-muted);
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--c-text-muted);
}

.form-group input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  font-family: var(--font);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-group input:focus {
  border-color: var(--c-primary);
  box-shadow: 0 0 0 3px var(--c-focus-ring);
}

.hint {
  margin-top: 14px;
  text-align: center;
  font-size: 11px;
  color: var(--c-text-muted);
}

.hint a {
  color: var(--c-primary);
  text-decoration: none;
}

.error-text {
  color: var(--c-danger);
  font-size: 12px;
  margin-bottom: 10px;
  text-align: center;
}`;