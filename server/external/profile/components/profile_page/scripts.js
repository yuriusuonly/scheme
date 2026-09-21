/**
 * profile-page — self-contained logout behaviour.
 *
 * The /profile page is served WITHOUT the core SPA runtime, so this script is
 * fully standalone: it invalidates the session on the server
 * (POST /api/authentication/logout with the bearer token), clears the token
 * from both localStorage and the `scheme_token` cookie, and redirects to
 * /login. The back button is a plain anchor and needs no JS.
 */

export const profilePageScript = `(function () {
  var logoutButton = document.getElementById("logout-button");
  if (!logoutButton) return;

  logoutButton.addEventListener("click", async function () {
    if (logoutButton.disabled) return;
    logoutButton.disabled = true;
    try {
      var token = window.localStorage.getItem("scheme_token");
      if (token) {
        await fetch("/api/authentication/logout", {
          method: "POST",
          headers: { "Authorization": "Bearer " + token }
        });
      }
    } catch (ignored) { /* best-effort server invalidation */ }
    window.localStorage.removeItem("scheme_token");
    document.cookie = "scheme_token=; path=/; max-age=0; SameSite=Lax";
    window.location.href = "/login";
  });
})();
`;