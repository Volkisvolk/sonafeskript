import { sql } from "bun";
import type { RaffleStatus } from "@/contracts";

export const getStatus = async (): Promise<RaffleStatus> => {
  const [row] = await sql<{ raffle_status: string }[]>`
    SELECT raffle_status FROM raffle.state WHERE id = 1
  `;
  return (row?.raffle_status ?? "open") as RaffleStatus;
};

export const setStatus = async (status: RaffleStatus): Promise<void> => {
  await sql`
    UPDATE raffle.state
    SET raffle_status = ${status}, updated_at = now()
    WHERE id = 1
  `;
};
