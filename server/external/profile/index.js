/**
 * profile — logged-in user page (`/profile`).
 *
 * Renders the logged-in user's basic profile (centered circle avatar + name)
 * wrapped in the shared `container` layout WITHOUT the core SPA runtime. The
 * top bar offers a back button (→ /dashboard) and a self-contained logout
 * button (top-bar right) — there is no SchemeApp on this page, so logout is
 * handled directly by the component's own script (server invalidation,
 * localStorage + cookie clearance, redirect to /login).
 *
 * Private, like the dashboard: guests are redirected to `/login` server-side
 * before any markup is rendered, and the top bar carries the known user.
 */

import { pageLayout } from "../_/helpers/html.js";
import { getRequestUser } from "../_/helpers/user.js";
import { container } from "../_/components/container/index.js";
import { profilePage as profilePageComponent } from "./components/profile_page/index.js";

export default async function profilePage(context) {
  const user = getRequestUser(context.request);
  if (!user) {
    return context.redirect("/login");
  }

  const body = container({ children: profilePageComponent({ user }) });
  return context.html(pageLayout({ title: "Scheme — Profile", body, modules: false }));
}