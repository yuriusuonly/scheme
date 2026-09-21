/**
 * dashboard — server-rendered main page (`/dashboard`).
 *
 * The SQL training ground — private to authenticated users. Guests are
 * redirected to `/login` server-side before any markup is rendered, so the
 * page always pre-renders a known user and the full database structure as a
 * file-browser table tree. No table tab is open by default — the tab strip
 * stays empty ("Select a table to view its rows.") until the trainee picks
 * one from the tree or runs a query. Composes the dashboard's own components
 * (topbar, workspace with the tree browser + data table + SQL editor,
 * statusbar, toasts) wrapped in the shared `container` layout. The workspace
 * splits the tree browser to the left and stacks the data table over the SQL
 * editor in the right vertical column.
 */

import { pageLayout } from "../_/helpers/html.js";
import { getRequestUser } from "../_/helpers/user.js";
import { getApplication } from "../../index.js";
import { container } from "../_/components/container/index.js";
import { topbar } from "./components/topbar/index.js";
import { workspace } from "./components/workspace/index.js";
import { statusbar } from "./components/statusbar/index.js";
import { queryEditor } from "./components/query_editor/index.js";
import { dataBrowserTree, dataBrowserTable } from "./components/data_browser/index.js";
import { offlineOverlay } from "./components/offline_overlay/index.js";
import { toasts } from "./components/toasts/index.js";

const INITIAL_QUERY = "SELECT * FROM users LIMIT 25;";

export default async function dashboardPage(context) {
  const user = getRequestUser(context.request);
  if (!user) {
    return context.redirect("/login");
  }

  const services = getApplication().services;
  const queries = services.queries;
  const schema = queries.listSchema();

  // No table is open on first paint — the statusbar mirrors the client
  // runtime's #table-count readout and shows the same empty-state label.
  const statusbarTableCount = "No table selected";

  const body = container({
    children:
      topbar({ user }) +
      workspace({
        left: dataBrowserTree({ schema, selectedTable: null }),
        rightTop: dataBrowserTable({ selectedTable: null, tableData: null }),
        rightBottom: queryEditor({ initialSql: INITIAL_QUERY }),
      }) +
      statusbar({ tableCount: statusbarTableCount }) +
      toasts() +
      offlineOverlay(),
  });

  return context.html(pageLayout({ title: "Scheme — SQL Training Ground", body }));
}