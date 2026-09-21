/**
 * login-page — standalone sign-in page.
 *
 * Rendered as a centered card on the app background (a full page, not a modal
 * overlay). Served only by the `/login` route, wrapped in `container()`, and
 * without the core SPA runtime — the embedded script is self-contained: it
 * posts the credentials, stores the bearer token, and redirects to
 * /dashboard. The dashboard redirects unauthenticated guests here, so this
 * component is the sole authentication surface.
 */

import { button } from "../../../_/components/button/index.js";
import { loginPageCss } from "./styles.js";
import { loginPageScript } from "./scripts.js";

export function loginPage() {
  return `
<style>
${loginPageCss}
</style>
<main id="login-page" class="login-page">
  <div class="login-card">
    <h1 class="login-brand">Scheme</h1>
    <p class="login-subtitle">SQL Training Ground — Sign in to continue</p>
    <form id="login-form">
      <div class="form-group">
        <label for="login-user">Username</label>
        <input id="login-user" type="text" required autocomplete="username" />
      </div>
      <div class="form-group">
        <label for="login-pass">Password</label>
        <input id="login-pass" type="password" required autocomplete="current-password" />
      </div>
      <div id="login-error" class="error-text" style="display:none;"></div>
      ${button({ type: "submit", label: "Sign In", className: "button button-primary button-block" })}
    </form>
    <p class="hint">New here? <a href="/register">Create an account</a></p>
  </div>
</main>
<script type="module">
${loginPageScript}
</script>`;
}