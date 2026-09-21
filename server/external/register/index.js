/**
 * register — standalone account-creation page (`/register`).
 *
 * With sample-data seeding removed, this is how the first user (and every
 * subsequent user) comes to exist. Renders the `register_page` component
 * wrapped in the shared `container` layout WITHOUT the core SPA runtime
 * (modules: false). The embedded script is self-contained: it posts the new
 * credentials, stores the returned bearer token (localStorage + `scheme_token`
 * cookie), and redirects to /dashboard.
 *
 * Already-authenticated visitors are redirected straight back to /dashboard.
 */

import { pageLayout } from "../_/helpers/html.js";
import { getRequestUser } from "../_/helpers/user.js";
import { container } from "../_/components/container/index.js";
import { registerPage as registerPageComponent } from "./components/register_page/index.js";

export default async function registerPage(context) {
  const user = getRequestUser(context.request);
  if (user) return context.redirect("/dashboard");

  const body = container({ children: registerPageComponent() });
  return context.html(pageLayout({ title: "Scheme — Register", body, modules: false }));
}