import type { D1Database } from "@cloudflare/workers-types";
import { parseScore } from "../src/leaderboard.ts";
import type { RankedScore, Score } from "../src/leaderboard.ts";

interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
}
const columns = `round_id AS roundId, id, nickname, mode,
  score_tenths AS scoreTenths, received_at AS receivedAt`;
function matches(a: Score, b: Score): boolean {
  return (
    a.nickname === b.nickname &&
    a.mode === b.mode &&
    a.scoreTenths === b.scoreTenths
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
    const headers = new Headers({
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    const reply = (body: unknown, status = 200) =>
      Response.json(body, { status, headers });
    if (
      (origin && !allowed.includes(origin)) ||
      (!origin && request.method !== "GET")
    )
      return reply({ error: "origin_forbidden" }, 403);
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    if (new URL(request.url).pathname !== "/scores")
      return reply({ error: "not_found" }, 404);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "GET" && request.method !== "POST")
      return reply({ error: "method_not_allowed" }, 405);
    try {
      if (request.method === "GET") {
        const result = await env.DB.prepare(
          `SELECT ${columns} FROM scores
          ORDER BY score_tenths DESC, received_at ASC, id ASC LIMIT 50`,
        ).all<RankedScore>();
        return reply(result.results);
      }
      if (
        request.headers.get("Content-Type")?.split(";")[0].trim() !==
        "application/json"
      )
        return reply({ error: "json_required" }, 415);
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: "invalid_score" }, 400);
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024) {
          await reader.cancel();
          return reply({ error: "payload_too_large" }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let input: unknown;
      try {
        input = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        return reply({ error: "invalid_json" }, 400);
      }
      const score = parseScore(input);
      if (!score) return reply({ error: "invalid_score" }, 400);
      const existing = await env.DB.prepare(
        `SELECT ${columns} FROM scores WHERE round_id = ?`,
      )
        .bind(score.roundId)
        .first<RankedScore>();
      if (existing)
        return matches(existing, score)
          ? reply(existing)
          : reply({ error: "round_conflict" }, 409);
      // Cloudflare overwrites this header; a local client cannot choose it in production.
      const ip = request.headers.get("CF-Connecting-IP") ?? "local";
      const minute = Math.floor(Date.now() / 60000);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${minute}:${ip}`),
      );
      const bucket = Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, "0"),
      ).join("");
      const results = await env.DB.batch([
        env.DB.prepare("DELETE FROM submission_limits WHERE expires < ?").bind(
          minute,
        ),
        env.DB.prepare(
          `INSERT INTO submission_limits(bucket,count,expires) VALUES (?,1,?)
          ON CONFLICT(bucket) DO UPDATE SET count = MIN(count + 1, 21)`,
        ).bind(bucket, minute + 1),
        env.DB.prepare(
          `INSERT INTO scores(round_id,id,nickname,mode,score_tenths)
          SELECT ?,?,?,?,? WHERE (SELECT count FROM submission_limits WHERE bucket=?) <= 20
          ON CONFLICT(round_id) DO NOTHING`,
        ).bind(
          score.roundId,
          crypto.randomUUID(),
          score.nickname,
          score.mode,
          score.scoreTenths,
          bucket,
        ),
        env.DB.prepare(`DELETE FROM scores WHERE round_id NOT IN (
          SELECT round_id FROM scores
          ORDER BY score_tenths DESC, received_at ASC, id ASC LIMIT 50
        )`),
        env.DB.prepare(`SELECT ${columns} FROM scores WHERE round_id = ?`).bind(
          score.roundId,
        ),
        env.DB.prepare(
          "SELECT count FROM submission_limits WHERE bucket = ?",
        ).bind(bucket),
      ]);
      const saved = results[4].results[0] as RankedScore | undefined;
      if (
        !saved &&
        Number(
          (results[5].results[0] as { count: number } | undefined)?.count,
        ) <= 20
      )
        return reply({ stored: false });
      if (!saved) {
        headers.set(
          "Retry-After",
          String(60 - (Math.floor(Date.now() / 1000) % 60)),
        );
        return reply({ error: "rate_limited" }, 429);
      }
      if (!matches(saved, score))
        return reply({ error: "round_conflict" }, 409);
      return reply(saved, results[2].meta.changes === 1 ? 201 : 200);
    } catch {
      return reply({ error: "service_unavailable" }, 503);
    }
  },
};
