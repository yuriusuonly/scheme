/**
 * button — generic `[data-action]` click delegation.
 *
 * Any button rendered by this component with a `data-action` attribute
 * triggers the mapped `window.SchemeApp` method. Only the first mounted
 * button script installs the delegation listener (`SchemeApp.bound.button`);
 * later copies are identical and skip.
 */

export const buttonScript = `(function () {
  var SchemeApp = window.SchemeApp;
  if (!SchemeApp || SchemeApp.bound.button) return;
  SchemeApp.bound.button = true;

  var actions = {
    "run-query": function () { SchemeApp.runQueryFromEditor(); },
    "toggle-tree": function () { SchemeApp.toggleTreePane(); },
    "logout": function () { SchemeApp.logout(); }
  };

  document.addEventListener("click", function (event) {
    var buttonElement = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
    if (!buttonElement) return;
    var handler = actions[buttonElement.getAttribute("data-action")];
    if (handler) handler();
  });
})();
`;