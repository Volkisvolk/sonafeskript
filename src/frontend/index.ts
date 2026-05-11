import { Hono } from "hono";
import { auth, type AuthContext } from "@valentinkolb/cloud/server";
import raffleListPage from "./page";
import raffleDetailPage from "./[id]/page";
import raffleAdminListPage from "./admin";
import raffleAdminDetailPage from "./admin/[id]/page";
import raffleAdminRegDetailPage from "./admin/[id]/[regId]/page";

export const adminPages = new Hono<AuthContext>()
  .get("/", auth.requireRole("admin", auth.redirectToLogin), ...raffleAdminListPage)
  .get("/:id", auth.requireRole("admin", auth.redirectToLogin), ...raffleAdminDetailPage)
  .get("/:id/:regId", auth.requireRole("admin", auth.redirectToLogin), ...raffleAdminRegDetailPage);

export default new Hono<AuthContext>()
  .get("/", auth.requireRole("*"), ...raffleListPage)
  .get("/:id", auth.requireRole("*"), ...raffleDetailPage);
