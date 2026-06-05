import { Hono } from "hono";
import { auth, type AuthContext } from "@valentinkolb/cloud/server";
import raffleListPage from "./page";
import raffleDetailPage from "./[id]/page";
import userListPage from "./user";
import userDetailPage from "./user/[id]/page";
import registrationsPage from "./registrations/page";
import scannerPage from "./user/[id]/scanner";
import ticketPage from "./ticket/[token]/page";

export default new Hono<AuthContext>()
  .get("/", auth.requireRole("*"), ...raffleListPage)
  .get("/ticket/:token", auth.requireRole("*"), ...ticketPage)
  .get("/registrations", auth.requireRole("authenticated", auth.redirectToLogin), ...registrationsPage)
  .get("/my", auth.requireRole("authenticated", auth.redirectToLogin), ...userListPage)
  .get("/my/:id/scanner", auth.requireRole("authenticated", auth.redirectToLogin), ...scannerPage)
  .get("/my/:id", auth.requireRole("authenticated", auth.redirectToLogin), ...userDetailPage)
  .get("/:id", auth.requireRole("*"), ...raffleDetailPage);
