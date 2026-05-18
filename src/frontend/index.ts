import { Hono } from "hono";
import { auth, type AuthContext } from "@valentinkolb/cloud/server";
import raffleListPage from "./page";
import raffleDetailPage from "./[id]/page";
import userListPage from "./user";
import userDetailPage from "./user/[id]/page";
import scannerPage from "./user/[id]/scanner";

export default new Hono<AuthContext>()
  .get("/", auth.requireRole("*"), ...raffleListPage)
  .get("/my", auth.requireRole("authenticated", auth.redirectToLogin), ...userListPage)
  .get("/my/:id/scanner", auth.requireRole("authenticated", auth.redirectToLogin), ...scannerPage)
  .get("/my/:id", auth.requireRole("authenticated", auth.redirectToLogin), ...userDetailPage)
  .get("/:id", auth.requireRole("*"), ...raffleDetailPage);
