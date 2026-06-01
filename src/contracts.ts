import { z } from "zod";

const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

// ── Raffle State ─────────────────────────────────────────────────────────────

export const RaffleStatusSchema = z.enum(["open", "raffled", "finalized"]);
export type RaffleStatus = z.infer<typeof RaffleStatusSchema>;

// ── Registration ─────────────────────────────────────────────────────────────

export const RegistrationSchema = z.object({
  id: Uuid.describe("Registrierungs-UUID"),
  name: z.string().describe("Vollständiger Name"),
  email: z.string().describe("E-Mail-Adresse"),
  requestedTickets: z.number().int().describe("Gewünschte Karten (1 oder 2)"),
  acceptedAgb: z.boolean().describe("AGB akzeptiert"),
  groupId: Uuid.nullable().describe("Gruppen-UUID oder null"),
  groupName: z.string().nullable().describe("Gruppenname oder null"),
  groupInviteCode: z.string().nullable().describe("Einladungscode der Gruppe"),
  status: z
    .enum(["pending", "won", "lost"])
    .describe("Status: ausstehend / gewonnen / verloren"),
  wonTickets: z.number().int().nullable().describe("Tatsächlich gewonnene Karten"),
  qrToken: z.string().nullable().describe("Eindeutiger QR-Code-Token"),
  paidAt: z.string().nullable().describe("Zeitpunkt der Bezahlung (ISO)"),
  collectedAt: z.string().nullable().describe("Zeitpunkt der Abholung (ISO)"),
  collectedBy: z.string().nullable().describe("Abgeholt von (E-Mail bei Vollmacht)"),
  createdAt: z.string().describe("Anmeldezeitpunkt (ISO)"),
});
export type Registration = z.infer<typeof RegistrationSchema>;

export const RegisterSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200, "Name ist zu lang"),
  email: z
    .string()
    .email("Bitte gib eine gültige E-Mail-Adresse ein")
    .max(300, "E-Mail-Adresse ist zu lang"),
  requestedTickets: z
    .number()
    .int()
    .min(1, "Mindestens 1 Karte")
    .max(2, "Maximal 2 Karten"),
  acceptedAgb: z.boolean().refine((val) => val === true, {
    message: "Du musst die Teilnahmebedingungen akzeptieren",
  }),
  createGroupName: z.string().min(1).max(100).optional(),
  joinGroupCode: z.string().optional(),
});
export type Register = z.infer<typeof RegisterSchema>;

export const UpdateRegistrationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(300).optional(),
  requestedTickets: z.number().int().min(1).max(2).optional(),
});
export type UpdateRegistration = z.infer<typeof UpdateRegistrationSchema>;

export const RegisterResponseSchema = z.object({
  message: z.string(),
  registrationId: z.string(),
  inviteCode: z.string().optional(),
});

// ── Groups ───────────────────────────────────────────────────────────────────

export const GroupSchema = z.object({
  id: Uuid,
  name: z.string(),
  inviteCode: z.string(),
  memberCount: z.number().int(),
  totalRequestedTickets: z.number().int(),
  createdAt: z.string(),
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupPublicSchema = z.object({
  id: Uuid,
  name: z.string(),
  memberCount: z.number().int(),
  maxGroupSize: z.number().int(),
});

// ── Ticket Events ────────────────────────────────────────────────────────────

export const TicketEventSchema = z.object({
  id: Uuid,
  registrationId: Uuid,
  eventType: z.enum([
    "paid",
    "paid_reverted",
    "collected",
    "collected_reverted",
    "collected_by_proxy",
    "tickets_adjusted",
    "removed_by_admin",
  ]),
  details: z.string().nullable(),
  performedBy: z.string().nullable(),
  createdAt: z.string(),
});
export type TicketEvent = z.infer<typeof TicketEventSchema>;

// ── External Links ───────────────────────────────────────────────────────────

export const ExternalLinkSchema = z.object({
  id: Uuid,
  label: z.string(),
  url: z.string(),
  sortOrder: z.number().int(),
});
export type ExternalLink = z.infer<typeof ExternalLinkSchema>;

const safeUrl = (errorMsg?: string) =>
  z.string().superRefine((val, ctx) => {
    let url: URL;
    try { url = new URL(val); } catch {
      ctx.addIssue({ code: "custom", message: errorMsg ?? "Bitte gib eine gültige URL ein." });
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      ctx.addIssue({ code: "custom", message: "Nur http:// und https:// URLs sind erlaubt." });
    }
  });

export const CreateLinkSchema = z.object({
  label: z.string().min(1, "Bezeichnung ist erforderlich").max(100),
  url: safeUrl("Bitte gib eine gültige URL ein"),
  sortOrder: z.number().int().optional(),
});
export type CreateLink = z.infer<typeof CreateLinkSchema>;

export const UpdateLinkSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  url: safeUrl().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateLink = z.infer<typeof UpdateLinkSchema>;

// ── Raffle Item (Multi-Raffle) ────────────────────────────────────────────────

export const RaffleItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: RaffleStatusSchema,
  ticketContingent: z.number(),
  registrationCount: z.number(),
  totalRequestedTickets: z.number(),
  createdAt: z.string(),
  createdBy: z.string().uuid().nullable(),
  allowedEmailPatterns: z.array(z.string()),
  replyToEmail: z.string().nullable(),
  winEmailSubject: z.string().nullable(),
  winEmailBody: z.string().nullable(),
  lossEmailSubject: z.string().nullable(),
  lossEmailBody: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  bannerPosition: z.string(),
  faqItems: z.array(z.object({ q: z.string(), a: z.string() })),
  agbText: z.string().nullable(),
  regEmailSubject: z.string().nullable(),
  regEmailBody: z.string().nullable(),
});
export type RaffleItem = z.infer<typeof RaffleItemSchema>;

export const CreateRaffleSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  description: z.string().optional(),
  ticketContingent: z.number().int().positive().default(100),
});
export type CreateRaffle = z.infer<typeof CreateRaffleSchema>;

export const UpdateRaffleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  ticketContingent: z.number().int().positive().optional(),
  allowedEmailPatterns: z.array(z.string().max(200)).optional(),
  replyToEmail: z.string().nullable().optional(),
  winEmailSubject: z.string().nullable().optional(),
  winEmailBody: z.string().nullable().optional(),
  lossEmailSubject: z.string().nullable().optional(),
  lossEmailBody: z.string().nullable().optional(),
  bannerUrl: z.string().nullable().optional(),
  bannerPosition: z.string().optional(),
  faqItems: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })).optional(),
  agbText: z.string().nullable().optional(),
  regEmailSubject: z.string().nullable().optional(),
  regEmailBody: z.string().nullable().optional(),
});
export type UpdateRaffle = z.infer<typeof UpdateRaffleSchema>;

// ── Admin Actions ────────────────────────────────────────────────────────────

export const AdjustTicketsSchema = z.object({
  wonTickets: z.number().int().min(1, "Mindestens 1 Karte").max(10),
});
export type AdjustTickets = z.infer<typeof AdjustTicketsSchema>;

export const ProxyCollectSchema = z.object({
  collectedByEmail: z
    .string()
    .email("Bitte gib eine gültige E-Mail-Adresse ein"),
});
export type ProxyCollect = z.infer<typeof ProxyCollectSchema>;

export const RemoveWithReasonSchema = z.object({
  reason: z.string().min(1, "Bitte gib einen Grund an").max(500),
  sendEmail: z.boolean().optional().default(false),
});
export type RemoveWithReason = z.infer<typeof RemoveWithReasonSchema>;

// ── Public Stats ─────────────────────────────────────────────────────────────

export const RaffleStatsSchema = z.object({
  status: RaffleStatusSchema,
  ticketContingent: z.number().int(),
  totalRequestedTickets: z.number().int(),
  totalRegistrations: z.number().int(),
  totalCollected: z.number().int(),
});
export type RaffleStats = z.infer<typeof RaffleStatsSchema>;

// ── Similar Name Pair (fraud filter) ─────────────────────────────────────────

export const SimilarNamePairSchema = z.object({
  a: z.object({ id: Uuid, name: z.string(), email: z.string() }),
  b: z.object({ id: Uuid, name: z.string(), email: z.string() }),
  similarity: z.number(),
});
export type SimilarNamePair = z.infer<typeof SimilarNamePairSchema>;

// ── Admin Registration (includes events) ─────────────────────────────────────

export const AdminRegistrationSchema = RegistrationSchema.extend({
  ticketEvents: z.array(TicketEventSchema).optional(),
});
export type AdminRegistration = z.infer<typeof AdminRegistrationSchema>;

// ── Raffle Members ───────────────────────────────────────────────────────────

export const RaffleMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "moderator"]),
  displayName: z.string().nullable(),
  mail: z.string().nullable(),
  addedAt: z.string(),
});
export type RaffleMember = z.infer<typeof RaffleMemberSchema>;

export const AddMemberSchema = z.object({
  email: z.string().email("Bitte gib eine gültige E-Mail-Adresse ein"),
  role: z.enum(["owner", "moderator"]).default("moderator"),
});
export type AddMember = z.infer<typeof AddMemberSchema>;

// ── Access / Permissions ──────────────────────────────────────────────────────

const PermissionLevelSchema = z.enum(["read", "write", "admin"]);

const PrincipalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userId: z.string().uuid() }),
  z.object({ type: z.literal("group"), groupId: z.string().uuid() }),
  z.object({ type: z.literal("authenticated") }),
]);

export const GrantAccessSchema = z.object({
  principal: PrincipalSchema,
  permission: PermissionLevelSchema,
});
export type GrantAccess = z.infer<typeof GrantAccessSchema>;

export const UpdateAccessSchema = z.object({
  permission: PermissionLevelSchema,
});
export type UpdateAccess = z.infer<typeof UpdateAccessSchema>;

// ── Standard envelopes ───────────────────────────────────────────────────────

export const ErrorResponseSchema = z.object({
  error: z.boolean(),
  message: z.string(),
});

export const MessageResponseSchema = z.object({
  message: z.string(),
});
