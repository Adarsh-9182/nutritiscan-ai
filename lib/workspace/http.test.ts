import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createLocalDatabase, type Database } from "./database";
import { sameOrigin } from "./http";
import { DEMO } from "./demo";

let db: Database;
vi.mock("./database", async (original) => ({
  ...(await original<typeof import("./database")>()),
  database: async () => db,
}));
import { GET, POST, DELETE } from "@/app/api/workspace/[...path]/route";
const origin = "http://localhost:3100";
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
  requestOrigin = origin,
) {
  const req = new NextRequest(`${origin}/api/workspace/${path}`, {
    method,
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return (method === "GET" ? GET : method === "DELETE" ? DELETE : POST)(req, {
    params: Promise.resolve({ path: path.split("/") }),
  });
}

describe("HTTP authentication and ownership boundary", () => {
  let aliceCookie: string, bobCookie: string, recordId: string;
  beforeAll(async () => {
    vi.stubEnv("APP_ORIGIN", origin);
    vi.stubEnv("HEALTH_DATA_KEY", "23".repeat(32));
    db = await createLocalDatabase();
  }, 30000);
  afterAll(async () => {
    await db.close();
    vi.unstubAllEnvs();
  });
  it("rejects absent, lookalike and cross-site origins", () => {
    for (const value of [
      "",
      "https://attacker.example",
      `${origin}.evil.example`,
    ])
      expect(
        sameOrigin(new Request(origin, { headers: { origin: value } })),
      ).toBe(false);
    expect(
      sameOrigin(
        new Request(origin, {
          headers: { origin, "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toBe(false);
    expect(sameOrigin(new Request(origin, { headers: { origin } }))).toBe(true);
  });
  it("rejects cross-site registration and unauthenticated reads", async () => {
    expect(
      (
        await request(
          "register",
          "POST",
          { username: "alice", password: "test-password-123" },
          undefined,
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
    expect((await request("state")).status).toBe(401);
  });
  it("requires adult consent and issues HttpOnly, SameSite session cookies", async () => {
    const credentials = {
      username: "alice",
      password: "test-password-123",
      name: "Synthetic Alice",
    };
    expect((await request("register", "POST", credentials)).status).toBe(400);
    const result = await request("register", "POST", {
      ...credentials,
      consent: true,
      adult: true,
    });
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toContain("HttpOnly");
    expect(result.headers.get("set-cookie")).toContain("SameSite=strict");
    aliceCookie = result.headers.get("set-cookie")!.split(";")[0];
    expect((await result.json()).recovery).toHaveLength(43);
    const bob = await request("register", "POST", {
      ...credentials,
      username: "bob",
      consent: true,
      adult: true,
    });
    bobCookie = bob.headers.get("set-cookie")!.split(";")[0];
  });
  it("validates report provenance, persists data and prevents cross-account deletion", async () => {
    expect(
      (
        await request(
          "records",
          "POST",
          { kind: "report", data: { ...DEMO.reports[0], confirmed: false } },
          aliceCookie,
        )
      ).status,
    ).toBe(400);
    const result = await request(
      "records",
      "POST",
      { kind: "report", data: DEMO.reports[0] },
      aliceCookie,
    );
    expect(result.status).toBe(201);
    recordId = (await result.json()).id;
    const alice = await request("state", "GET", undefined, aliceCookie);
    expect(alice.headers.get("cache-control")).toBe("no-store");
    expect((await alice.json()).reports[0].id).toBe(recordId);
    expect(
      (await (await request("state", "GET", undefined, bobCookie)).json())
        .reports,
    ).toEqual([]);
    expect(
      (await request("records", "DELETE", { id: recordId }, bobCookie)).status,
    ).toBe(404);
    expect(
      (
        await request(
          "records",
          "POST",
          { kind: "report", id: recordId, version: 1, data: DEMO.reports[0] },
          bobCookie,
        )
      ).status,
    ).toBe(409);
  });
  it("persists source metadata and revocation, rejects stale updates, and enforces access in the server assistant", async () => {
    const data = {
      ...DEMO.reports[0],
      assistantAccess: false,
      source: {
        method: "pdf",
        label: "synthetic.pdf",
        fingerprint: "a".repeat(64),
      },
    };
    expect(
      (
        await request(
          "records",
          "POST",
          { kind: "report", id: recordId, version: 1, data },
          aliceCookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "records",
          "POST",
          {
            kind: "report",
            id: recordId,
            version: 1,
            data: { ...data, assistantAccess: true },
          },
          aliceCookie,
        )
      ).status,
    ).toBe(409);
    const state = await (
      await request("state", "GET", undefined, aliceCookie)
    ).json();
    expect(state.reports[0]).toMatchObject({
      assistantAccess: false,
      source: data.source,
      version: 2,
    });
    const answer = await (
      await request(
        "assistant",
        "POST",
        { question: "Summarise my report" },
        aliceCookie,
      )
    ).json();
    expect(answer.text).toContain("No confirmed reports are available");
    const exported = await (
      await request("export", "GET", undefined, aliceCookie)
    ).json();
    expect(exported.reports[0].title).toBe(data.title);
  });
  it("limits request bytes and produces a private account export", async () => {
    expect(
      (
        await request(
          "assistant",
          "POST",
          { question: "x".repeat(200001) },
          aliceCookie,
        )
      ).status,
    ).toBe(413);
    const result = await request("export", "GET", undefined, aliceCookie);
    expect(result.headers.get("content-disposition")).toContain("attachment");
    expect((await result.json()).profile.name).toBe("Synthetic Alice");
  });
  it("revokes sessions on sign-out", async () => {
    expect((await request("logout", "POST", {}, aliceCookie)).status).toBe(200);
    expect((await request("state", "GET", undefined, aliceCookie)).status).toBe(
      401,
    );
    expect((await request("state", "GET", undefined, bobCookie)).status).toBe(
      200,
    );
  });
});
