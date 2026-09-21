/**
 * register-page — account-creation form behaviour (self-contained).
 *
 * The /register page is served WITHOUT the core SPA runtime, so this script is
 * fully standalone: it validates the client-side rules, posts the new
 * credentials to /api/authentication/register, stores the returned bearer
 * token in both localStorage (client sessions) and the `scheme_token` cookie
 * (so server-rendered pages recognise the session immediately), and redirects
 * to /dashboard. The service signs the new account in right away, so no
 * separate login step is needed.
 */

export const registerPageScript = `(function () {
  var form = document.getElementById("register-form");
  var errorEl = document.getElementById("register-error");
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
    var user = document.getElementById("register-user").value.trim();
    var pass = document.getElementById("register-pass").value;
    var confirm = document.getElementById("register-pass-confirm").value;
    if (pass !== confirm) {
      errorEl.textContent = "Passwords do not match";
      errorEl.style.display = "block";
      return;
    }
    if (user.length < 3 || user.length > 32) {
      errorEl.textContent = "Username must be 3-32 characters";
      errorEl.style.display = "block";
      return;
    }
    if (pass.length < 8) {
      errorEl.textContent = "Password must be at least 8 characters";
      errorEl.style.display = "block";
      return;
    }
    try {
      var response = await fetch("/api/authentication/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || "Registration failed");
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