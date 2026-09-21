/**
 * register-page — standalone account-creation page.
 *
 * Rendered as a centered card on the app background (a full page, not a modal
 * overlay). Served only by the `/register` route, wrapped in `container()`,
 * and without the core SPA runtime — the embedded script is self-contained:
 * it posts the new credentials to /api/authentication/register, stores the
 * returned bearer token, and redirects to /dashboard. Existing users can hop
 * to /login from the footer hint.
 */

import { button } from "../../../_/components/button/index.js";
import { registerPageCss } from "./styles.js";
import { registerPageScript } from "./scripts.js";

export function registerPage() {
  return `
<style>
${registerPageCss}
</style>
<main id="register-page" class="register-page">
  <div class="register-card">
    <h1 class="register-brand">Scheme</h1>
    <p class="register-subtitle">SQL Training Ground — Create your account</p>
    <form id="register-form">
      <div class="form-group">
        <label for="register-user">Username</label>
        <input id="register-user" type="text" required minlength="3" maxlength="32"
          autocomplete="username" placeholder="3-32 characters" />
      </div>
      <div class="form-group">
        <label for="register-pass">Password</label>
        <input id="register-pass" type="password" required minlength="8"
          autocomplete="new-password" placeholder="At least 8 characters" />
      </div>
      <div class="form-group">
        <label for="register-pass-confirm">Confirm password</label>
        <input id="register-pass-confirm" type="password" required minlength="8"
          autocomplete="new-password" placeholder="Repeat your password" />
      </div>
      <div id="register-error" class="error-text" style="display:none;"></div>
      ${button({ type: "submit", label: "Create Account", className: "button button-primary button-block" })}
    </form>
    <p class="hint">Already have an account? <a href="/login">Sign in</a></p>
  </div>
</main>
<script type="module">
${registerPageScript}
</script>`;
}