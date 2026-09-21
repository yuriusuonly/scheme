/**
 * topbar — page header.
 * Pre-renders the authenticated user's avatar initial so the initial paint
 * matches the session before the client scripts hydrate. (The online/offline
 * status indicator lives in the footer statusbar component.) The left nav
 * button (toggle table tree) delegates its click through the `button`
 * component's generic `data-action` script; the right side carries the circle
 * avatar only. This component's own script only wires the avatar → /profile
 * navigation and mirrors auth transitions (`scheme:user`) onto the avatar
 * initial.
 */

import { escapeHtml } from "../../../_/helpers/escape.js";
import { button } from "../../../_/components/button/index.js";
import { topbarCss } from "./styles.js";
import { topbarScript } from "./scripts.js";

export function topbar({ user = null } = {}) {
  const initial = user ? user.username.charAt(0).toUpperCase() : "?";

  return `
<style>
${topbarCss}
</style>
<header id="topbar">
  <div class="topbar-left">
    ${button({
      id: "button-toggle-tree",
      dataAction: "toggle-tree",
      label: "☰",
      title: "Toggle table tree",
      className: "button button-sm button-plain",
    })}
    <h1 class="logo">Scheme</h1>
    <span class="tagline">SQL Training Ground</span>
  </div>
  <div class="topbar-right">
    <button id="avatar-button" class="avatar" type="button" title="Profile" aria-label="Profile">
      ${escapeHtml(initial)}
    </button>
  </div>
</header>
<script type="module">
${topbarScript}
</script>`;
}