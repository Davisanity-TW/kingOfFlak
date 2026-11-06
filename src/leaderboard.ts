import { parseNickname } from "./nickname.ts";

export type Score = Readonly<{
  roundId: string;
  nickname: string;
  mode: "pc" | "mb";
  scoreTenths: number;
}>;
export type RankedScore = Score & {
  id: string;
  receivedAt: string;
};

export function toScoreTenths(seconds: number): number {
  const value = Math.round(seconds * 10);
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(value))
    throw new RangeError("Invalid survival time");
  return value;
}

export function parseScore(value: unknown): Score | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const score = value as Record<string, unknown>;
  if (
    Object.keys(score).sort().join(",") !==
      "mode,nickname,roundId,scoreTenths" ||
    typeof score.roundId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      score.roundId,
    ) ||
    (score.mode !== "pc" && score.mode !== "mb") ||
    typeof score.scoreTenths !== "number" ||
    !Number.isSafeInteger(score.scoreTenths) ||
    score.scoreTenths < 0
  )
    return null;
  const nickname = parseNickname(score.nickname);
  return nickname === null
    ? null
    : Object.freeze({
        roundId: score.roundId.toLowerCase(),
        nickname,
        mode: score.mode,
        scoreTenths: score.scoreTenths,
      });
}

export async function submitScore(
  score: Score,
  base: string,
): Promise<RankedScore> {
  const response = await fetch(`${base.replace(/\/$/, "")}/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(score),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(`Score submission failed: ${response.status}`);
  return response.json();
}

export async function readLeaderboard(base: string): Promise<RankedScore[]> {
  const response = await fetch(`${base.replace(/\/$/, "")}/scores`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(`Leaderboard unavailable: ${response.status}`);
  return response.json();
}
