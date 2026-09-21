/**
 * login — standalone sign-in page (`/login`).
 *
 * The sole authentication surface. The dashboard redirects unauthenticated
 * guests here, and this page renders the `login_page` component (from this
 * route's components directory) wrapped in the shared `container` layout,
 * WITHOUT the core SPA runtime (modules: false). On this page the component's
 * embedded script is self-contained: it posts the credentials, stores the
 * bearer token (localStorage + `scheme_token` cookie), and redirects to
 * /dashboard — where the server recognises the new session via the cookie.
 *
 * Already-authenticated visitors are redirected straight back to /dashboard.
 */

import { pageLayout } from "../_/helpers/html.js";
import { getRequestUser } from "../_/helpers/user.js";
import { container } from "../_/components/container/index.js";
import { loginPage as loginPageComponent } from "./components/login_page/index.js";

export default async function loginPage(context) {
  const user = getRequestUser(context.request);
  if (user) return context.redirect("/dashboard");

  const body = container({ children: loginPageComponent() });
  return context.html(pageLayout({ title: "Scheme — Login", body, modules: false }));
}