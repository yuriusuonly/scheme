/**
 * login-page — sign-in form behaviour (self-contained).
 *
 * The /login page is served WITHOUT the core SPA runtime, so this script is
 * fully standalone: it posts the credentials directly to
 * /api/authentication/login, stores the bearer token in both localStorage
 * (client sessions) and the `scheme_token` cookie (so server-rendered pages
 * recognise the session immediately), and redirects to /dashboard.
 */

export const loginPageScript = `(function () {
  var form = document.getElementById("login-form");
  var errorEl = document.getElementById("login-error");
  if (!form || !errorEl) return;

  function setSessionCookie(token, expiresAt) {
    var maxAge = 86400;
    if (expiresAt) {
      var seconds = Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000);
      if (seconds > 0) maxAge = seconds;
    }
    document.cookie = "scheme_token=" + encodeURIComponent(token) +
      "; path=/; max-age=" + maxAge + "; SameSite=Lax";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    errorEl.style.display = "none";
    var user = document.getElementById("login-user").value;
    var pass = document.getElementById("login-pass").value;
    try {
      var response = await fetch("/api/authentication/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      window.localStorage.setItem("scheme_token", data.token);
      setSessionCookie(data.token, data.expiresAt);
      window.location.href = "/dashboard";
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = "block";
    }
  });
})();
`;