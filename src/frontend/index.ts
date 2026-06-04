import { Hono } from "hono";
import { auth, type AuthContext } from "@valentinkolb/cloud/server";
import raffleListPage from "./page";
import raffleDetailPage from "./[id]/page";
import userListPage from "./user";
import userDetailPage from "./user/[id]/page";
import scannerPage from "./user/[id]/scanner";
import confirmPage from "./confirm/[token]/page";
import ticketPage from "./ticket/[token]/page";

export default new Hono<AuthContext>()
  .get("/", auth.requireRole("*"), ...raffleListPage)
  .get("/confirm/:token", auth.requireRole("*"), ...confirmPage)
  .get("/ticket/:token", auth.requireRole("*"), ...ticketPage)
  .get("/my", auth.requireRole("authenticated", auth.redirectToLogin), ...userListPage)
  .get("/my/:id/scanner", auth.requireRole("authenticated", auth.redirectToLogin), ...scannerPage)
  .get("/my/:id", auth.requireRole("authenticated", auth.redirectToLogin), ...userDetailPage)
  .get("/:id", auth.requireRole("*"), ...raffleDetailPage);
