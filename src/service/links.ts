import { sql } from "bun";
import type { MutationResult } from "@valentinkolb/cloud/contracts";
import type { ExternalLink, CreateLink, UpdateLink } from "@/contracts";

type DbLink = {
  id: string;
  label: string;
  url: string;
  sort_order: number;
};

const mapLink = (row: DbLink): ExternalLink => ({
  id: row.id,
  label: row.label,
  url: row.url,
  sortOrder: row.sort_order,
});

export const listAll = async (): Promise<ExternalLink[]> => {
  const rows = await sql<DbLink[]>`
    SELECT id, label, url, sort_order FROM raffle.external_links ORDER BY sort_order ASC, id ASC
  `;
  return rows.map(mapLink);
};

export const create = async (data: CreateLink): Promise<MutationResult<ExternalLink>> => {
  const maxOrder = await sql<{ max: number | null }[]>`
    SELECT MAX(sort_order) AS max FROM raffle.external_links
  `;
  const sortOrder = data.sortOrder ?? (maxOrder[0]?.max ?? 0) + 1;

  const [row] = await sql<DbLink[]>`
    INSERT INTO raffle.external_links (label, url, sort_order)
    VALUES (${data.label}, ${data.url}, ${sortOrder})
    RETURNING id, label, url, sort_order
  `;
  if (!row) return { ok: false, error: "Link konnte nicht erstellt werden.", status: 500 };
  return { ok: true, data: mapLink(row) };
};

export const update = async (params: {
  id: string;
  data: UpdateLink;
}): Promise<MutationResult<ExternalLink>> => {
  const [existing] = await sql<DbLink[]>`
    SELECT id, label, url, sort_order FROM raffle.external_links WHERE id = ${params.id}::uuid
  `;
  if (!existing) return { ok: false, error: "Link nicht gefunden.", status: 404 };

  const label = params.data.label ?? existing.label;
  const url = params.data.url ?? existing.url;
  const sortOrder = params.data.sortOrder ?? existing.sort_order;

  const [row] = await sql<DbLink[]>`
    UPDATE raffle.external_links
    SET label = ${label}, url = ${url}, sort_order = ${sortOrder}
    WHERE id = ${params.id}::uuid
    RETURNING id, label, url, sort_order
  `;
  if (!row) return { ok: false, error: "Aktualisierung fehlgeschlagen.", status: 500 };
  return { ok: true, data: mapLink(row) };
};

export const remove = async (params: { id: string }): Promise<MutationResult<void>> => {
  const result = await sql`DELETE FROM raffle.external_links WHERE id = ${params.id}::uuid`;
  if (result.count === 0) return { ok: false, error: "Link nicht gefunden.", status: 404 };
  return { ok: true, data: undefined };
};
