/**
 * topbar — navigation + auth-transition wiring.
 *
 * The avatar button navigates to /profile. `scheme:user` bus events
 * (login/logout) update the avatar's initial. The tree-toggle button click
 * is handled generically by the `button` component's `data-action` script.
 */

export const topbarScript = `(function () {
  var SchemeApp = window.SchemeApp;
  if (!SchemeApp || SchemeApp.bound.topbar) return;
  SchemeApp.bound.topbar = true;

  var avatar = document.getElementById("avatar-button");

  if (avatar) {
    avatar.addEventListener("click", function () {
      window.location.href = "/profile";
    });
  }

  SchemeApp.bus.on("scheme:user", function (user) {
    if (!avatar) return;
    var initial = "?";
    if (user && user.username && user.username.charAt(0)) {
      initial = user.username.charAt(0).toUpperCase();
    }
    avatar.textContent = initial;
  });
})();
`;