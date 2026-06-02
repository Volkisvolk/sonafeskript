import { sql } from "bun";

/**
 * Datenbankmigrationen für die Verlosungs-App.
 *
 * Wird bei jedem Container-Start einmal idempotent ausgeführt.
 * Alle Tabellen liegen im Schema `raffle.*`.
 *
 * Tabellen:
 *   raffle.state           — Einzel-Zeilen-Tabelle für den Verlosungsstatus
 *   raffle.registrations   — Alle Anmeldungen für die Verlosung
 *   raffle.groups          — Gruppen (gemeinsam gewinnen oder verlieren)
 *   raffle.ticket_events   — Audit-Log für Bezahlung, Abholung, Anpassungen
 *   raffle.external_links  — Externe Links, die auf der Startseite angezeigt werden
 */
export const migrate = async (): Promise<void> => {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.simple();
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.simple();

  await sql`CREATE SCHEMA IF NOT EXISTS raffle`.simple();
  console.log("  ✓ raffle schema");

  // ── State (Einzel-Zeile für Verlosungsstatus) ────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS raffle.state (
      id            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      raffle_status TEXT NOT NULL DEFAULT 'open'
                    CHECK (raffle_status IN ('open', 'raffled', 'finalized')),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple();
  await sql`
    INSERT INTO raffle.state (id, raffle_status) VALUES (1, 'open')
    ON CONFLICT (id) DO NOTHING
  `.simple();
  console.log("  ✓ raffle.state table");

  // ── Groups (Gruppen) ─────────────────────────────────────────────────────
  // Gruppen werden zuerst angelegt, damit registrations.group_id darauf
  // verweisen kann.
  await sql`
    CREATE TABLE IF NOT EXISTS raffle.groups (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple();
  console.log("  ✓ raffle.groups table");

  // ── Registrations (Anmeldungen) ──────────────────────────────────────────
  // `status` = 'pending' bis zur Verlosung, dann 'won' oder 'lost'.
  // `qr_token` wird beim Gewinnen generiert und in der Mail als QR-Code geschickt.
  // `collected_by` enthält die E-Mail-Adresse der Vollmacht-Person.
  await sql`
    CREATE TABLE IF NOT EXISTS raffle.registrations (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name              TEXT NOT NULL,
      email             TEXT NOT NULL UNIQUE,
      requested_tickets INT  NOT NULL CHECK (requested_tickets IN (1, 2)),
      accepted_agb      BOOLEAN NOT NULL DEFAULT false,
      group_id          UUID REFERENCES raffle.groups(id) ON DELETE SET NULL,
      status            TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'won', 'lost')),
      won_tickets       INT,
      qr_token          TEXT UNIQUE,
      paid_at           TIMESTAMPTZ,
      collected_at      TIMESTAMPTZ,
      collected_by      TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple();
  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_email
    ON raffle.registrations(LOWER(email))
  `.simple();
  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_group
    ON raffle.registrations(group_id)
  `.simple();
  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_status
    ON raffle.registrations(status)
  `.simple();
  // GIN-Index für ähnliche Namen (Betrugsfilter mit pg_trgm)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_name_trgm
    ON raffle.registrations USING GIN (name gin_trgm_ops)
  `.simple();
  console.log("  ✓ raffle.registrations table");

  // ── Ticket Events (Audit-Log) ────────────────────────────────────────────
  // Protokolliert alle relevanten Ereignisse: Bezahlung, Abholung,
  // Anpassungen, Entfernungen. Für Nachvollziehbarkeit bei Streitigkeiten.
  await sql`
    CREATE TABLE IF NOT EXISTS raffle.ticket_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      registration_id UUID NOT NULL REFERENCES raffle.registrations(id) ON DELETE CASCADE,
      event_type      TEXT NOT NULL CHECK (event_type IN (
                        'paid', 'paid_reverted',
                        'collected', 'collected_reverted',
                        'collected_by_proxy',
                        'tickets_adjusted',
                        'removed_by_admin'
                      )),
      details         TEXT,
      performed_by    TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple();
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ticket_events_registration
    ON raffle.ticket_events(registration_id)
  `.simple();
  console.log("  ✓ raffle.ticket_events table");

  // ── External Links (Externe Links) ──────────────────────────────────────
  // Optionale Links (z.B. zur Veranstaltungsseite), die auf der Startseite
  // angezeigt werden.
  await sql`
    CREATE TABLE IF NOT EXISTS raffle.external_links (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      label      TEXT NOT NULL,
      url        TEXT NOT NULL,
      sort_order INT  NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple();
  console.log("  ✓ raffle.external_links table");

  // ── Raffles (Verlosungen) ────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS raffle.raffles (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name              TEXT NOT NULL,
      description       TEXT,
      status            TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'raffled', 'finalized')),
      ticket_contingent INT  NOT NULL DEFAULT 100,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.simple();
  console.log("  ✓ raffle.raffles table");

  await sql`
    ALTER TABLE raffle.raffles
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
  `.simple();
  // Falls created_by als TEXT existiert (ältere Instanzen): auf UUID upgraden
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'raffle' AND table_name = 'raffles'
          AND column_name = 'created_by' AND data_type = 'text'
      ) THEN
        ALTER TABLE raffle.raffles
          ALTER COLUMN created_by TYPE UUID
          USING CASE WHEN created_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     THEN created_by::uuid ELSE NULL END;
      END IF;
    END $$
  `.simple();
  console.log("  ✓ raffle.raffles created_by column");

  await sql`
    ALTER TABLE raffle.raffles
    ADD COLUMN IF NOT EXISTS allowed_email_patterns TEXT[] NOT NULL DEFAULT '{}'
  `.simple();
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'raffle' AND table_name = 'raffles' AND column_name = 'allowed_email_regex'
      ) THEN
        UPDATE raffle.raffles
        SET allowed_email_patterns = ARRAY[allowed_email_regex]
        WHERE allowed_email_regex IS NOT NULL
          AND allowed_email_regex <> ''
          AND array_length(allowed_email_patterns, 1) IS NULL;
        ALTER TABLE raffle.raffles DROP COLUMN allowed_email_regex;
      END IF;
    END $$
  `.simple();
  console.log("  ✓ raffle.raffles allowed_email_patterns column");

  // ── Per-Raffle E-Mail-Konfiguration ──────────────────────────────────────
  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS reply_to_email TEXT`.simple();
  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS win_email_subject TEXT`.simple();
  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS win_email_body TEXT`.simple();
  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS loss_email_subject TEXT`.simple();
  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS loss_email_body TEXT`.simple();
  console.log("  ✓ raffle.raffles email config columns");

  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS banner_url TEXT`.simple();
  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS banner_position TEXT NOT NULL DEFAULT '50% 50%'`.simple();
  console.log("  ✓ raffle.raffles banner_url column");

  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS faq_items TEXT NOT NULL DEFAULT '[]'`.simple();
  console.log("  ✓ raffle.raffles faq_items column");

  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS agb_text TEXT`.simple();
  console.log("  ✓ raffle.raffles agb_text column");

  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS reg_email_subject TEXT`.simple();
  await sql`ALTER TABLE raffle.raffles ADD COLUMN IF NOT EXISTS reg_email_body TEXT`.simple();
  console.log("  ✓ raffle.raffles reg_email columns");

  // ── Idempotenz-Marker für Ergebnis-Mails (Finalisierung) ─────────────────
  await sql`
    ALTER TABLE raffle.registrations
    ADD COLUMN IF NOT EXISTS result_email_sent_at TIMESTAMPTZ
  `.simple();
  console.log("  ✓ raffle.registrations result_email_sent_at column");

  // ── raffle_id auf registrations ──────────────────────────────────────────
  await sql`
    ALTER TABLE raffle.registrations
    ADD COLUMN IF NOT EXISTS raffle_id UUID REFERENCES raffle.raffles(id) ON DELETE CASCADE
  `.simple();

  // ── raffle_id auf groups ─────────────────────────────────────────────────
  await sql`
    ALTER TABLE raffle.groups
    ADD COLUMN IF NOT EXISTS raffle_id UUID REFERENCES raffle.raffles(id) ON DELETE CASCADE
  `.simple();

  // ── Backfill: Anmeldungen ohne raffle_id einer Dummy-Verlosung zuweisen ──
  const [orphan] = await sql<{ cnt: number }[]>`
    SELECT COUNT(*)::int AS cnt FROM raffle.registrations WHERE raffle_id IS NULL
  `;
  if ((orphan?.cnt ?? 0) > 0) {
    const [dummy] = await sql<{ id: string }[]>`
      INSERT INTO raffle.raffles (name, description, ticket_contingent)
      VALUES ('Standard-Verlosung', 'Automatisch erstellt (Migration)', 100)
      RETURNING id
    `;
    if (dummy) {
      await sql`
        UPDATE raffle.registrations SET raffle_id = ${dummy.id}::uuid WHERE raffle_id IS NULL
      `;
      await sql`
        UPDATE raffle.groups SET raffle_id = ${dummy.id}::uuid WHERE raffle_id IS NULL
      `;
      console.log("  ✓ backfill: Standard-Verlosung erstellt und zugewiesen");
    }
  }

  // ── Indizes ───────────────────────────────────────────────────────────────
  await sql`
    CREATE INDEX IF NOT EXISTS idx_registrations_raffle_id
    ON raffle.registrations(raffle_id)
  `.simple();
  await sql`
    CREATE INDEX IF NOT EXISTS idx_groups_raffle_id
    ON raffle.groups(raffle_id)
  `.simple();
  console.log("  ✓ raffle_id indexes");

  // ── Email-Unique: global → pro Verlosung ──────────────────────────────────
  // Die ursprüngliche globale UNIQUE-Constraint auf email erlaubt nur eine
  // Registrierung pro E-Mail über alle Verlosungen hinweg. Wir ersetzen sie
  // durch einen partiellen Unique-Index pro Verlosung.
  await sql`
    ALTER TABLE raffle.registrations DROP CONSTRAINT IF EXISTS registrations_email_key
  `.simple();
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_registrations_email_per_raffle
    ON raffle.registrations(raffle_id, LOWER(email))
  `.simple();
  console.log("  ✓ email unique per raffle");

  // ── NOT NULL auf raffle_id (nach Backfill sicher) ─────────────────────────
  // Nur ausführen wenn noch keine NOT NULL Constraint existiert, um idempotent
  // zu bleiben. Der Backfill oben stellt sicher dass keine NULLs mehr da sind.
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'raffle' AND table_name = 'registrations'
          AND column_name = 'raffle_id' AND is_nullable = 'YES'
      ) THEN
        ALTER TABLE raffle.registrations ALTER COLUMN raffle_id SET NOT NULL;
      END IF;
    END $$
  `.simple();
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'raffle' AND table_name = 'groups'
          AND column_name = 'raffle_id' AND is_nullable = 'YES'
      ) THEN
        ALTER TABLE raffle.groups ALTER COLUMN raffle_id SET NOT NULL;
      END IF;
    END $$
  `.simple();
  console.log("  ✓ raffle_id NOT NULL");

  // ── Raffle Access (Cloud Permission System) ──────────────────────────────
  // Junction table connecting raffles to auth.access entries.
  // Permissions: admin = Besitzer, write = Moderator
  await sql`
    CREATE TABLE IF NOT EXISTS raffle.raffle_access (
      raffle_id UUID NOT NULL REFERENCES raffle.raffles(id) ON DELETE CASCADE,
      access_id UUID NOT NULL REFERENCES auth.access(id) ON DELETE CASCADE,
      PRIMARY KEY (raffle_id, access_id)
    )
  `.simple();
  await sql`
    CREATE INDEX IF NOT EXISTS idx_raffle_access_raffle_id
    ON raffle.raffle_access(raffle_id)
  `.simple();
  // Bestehende Verlosungen: Ersteller als admin-Eintrag anlegen (idempotent)
  await sql`
    DO $$
    DECLARE
      r RECORD;
      aid UUID;
    BEGIN
      FOR r IN
        SELECT id, created_by FROM raffle.raffles
        WHERE created_by IS NOT NULL
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM raffle.raffle_access ra
          JOIN auth.access a ON a.id = ra.access_id
          WHERE ra.raffle_id = r.id AND a.user_id = r.created_by::uuid
        ) THEN
          INSERT INTO auth.access (user_id, group_id, authenticated_only, permission)
          VALUES (r.created_by::uuid, NULL, false, 'admin')
          RETURNING id INTO aid;
          INSERT INTO raffle.raffle_access (raffle_id, access_id) VALUES (r.id, aid);
        END IF;
      END LOOP;
    END $$
  `.simple();
  console.log("  ✓ raffle.raffle_access table");
};
