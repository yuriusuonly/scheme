/**
 * profile-page — centered user profile card.
 *
 * Rendered only by the `/profile` route, wrapped in `container()`, and
 * WITHOUT the core SPA runtime. Top bar: a borderless icon back button (left,
 * plain anchor to /dashboard) + a borderless icon logout button (right) — both
 * use the shared `button` element's `button-plain` variant (no border, no
 * background) with the `labelHtml` option for the inline SVG; the logout click
 * is handled by this component's own script (the back anchor needs no JS).
 * Centre: a large circle avatar with
 * the user's initial and the full username beneath it.
 */

import { escapeHtml } from "../../../_/helpers/escape.js";
import { button } from "../../../_/components/button/index.js";
import { profilePageCss } from "./styles.js";
import { profilePageScript } from "./scripts.js";

const backIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`;

const logoutIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;

export function profilePage({ user = null } = {}) {
  const name = user ? escapeHtml(user.username) : "Unknown";
  const initial = user ? escapeHtml(user.username.charAt(0).toUpperCase()) : "?";
  const role = user && user.role ? `<p class="profile-role">${escapeHtml(user.role)}</p>` : "";

  return `
<style>
${profilePageCss}
</style>
<header id="profile-topbar" class="profile-topbar">
  <a href="/dashboard" class="button button-plain button-icon" id="back-button" title="Back to dashboard" aria-label="Back to dashboard">${backIcon}</a>
  <span class="logo">Scheme</span>
  ${button({
    id: "logout-button",
    label: "",
    labelHtml: logoutIcon,
    className: "button button-plain button-plain-danger button-icon",
    title: "Logout",
  })}
</header>
<main class="profile-page">
  <div class="profile-card">
    <div class="profile-avatar">${initial}</div>
    <h1 class="profile-name">${name}</h1>
    ${role}
  </div>
</main>
<script type="module">
${profilePageScript}
</script>`;
}