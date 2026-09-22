import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { piazzaOnlyStorageState } from "./browser-login.js";
import { getSessionCookieHeader, getSessionPath, getStateDirectory } from "./session-store.js";
import { verifySession } from "./verify-session.js";

const originalStateDir = process.env.STUDY_MCP_STATE_DIR;

afterEach(() => {
  if (originalStateDir === undefined) {
    delete process.env.STUDY_MCP_STATE_DIR;
  } else {
    process.env.STUDY_MCP_STATE_DIR = originalStateDir;
  }
  vi.unstubAllEnvs();
});

describe("session-store", () => {
  it("uses an explicitly configured private state directory", () => {
    vi.stubEnv("STUDY_MCP_STATE_DIR", "/private/example-state");

    expect(getStateDirectory()).toBe("/private/example-state");
    expect(getSessionPath("learn")).toBe("/private/example-state/learn-storage-state.json");
    expect(getSessionPath("piazza")).toBe("/private/example-state/piazza-storage-state.json");
  });

  it("does not copy LEARN session data into the saved Piazza session", () => {
    const state = piazzaOnlyStorageState({
      cookies: [
        { name: "learn", value: "private", domain: "learn.uwaterloo.ca", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" },
        { name: "piazza", value: "private", domain: ".piazza.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" },
      ],
      origins: [
        { origin: "https://learn.uwaterloo.ca", localStorage: [] },
        { origin: "https://piazza.com", localStorage: [] },
      ],
    });

    expect(state.cookies.map((cookie) => cookie.name)).toEqual(["piazza"]);
    expect(state.origins.map((origin) => origin.origin)).toEqual(["https://piazza.com"]);
  });

  it("sends only unexpired cookies that apply to the requested host", async () => {
    const directory = await mkdtemp(join(tmpdir(), "waterloo-study-mcp-"));
    vi.stubEnv("STUDY_MCP_STATE_DIR", directory);
    try {
      await writeFile(getSessionPath("learn"), JSON.stringify({
        cookies: [
          { name: "session", value: "keep-private", domain: "learn.uwaterloo.ca", expires: -1 },
          { name: "expired", value: "old", domain: "learn.uwaterloo.ca", expires: 1 },
          { name: "other", value: "nope", domain: "piazza.com", expires: -1 },
        ],
      }));

      await expect(getSessionCookieHeader("learn", "learn.uwaterloo.ca")).resolves.toBe("session=keep-private");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reports an expired or rejected session instead of treating its file as usable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "waterloo-study-mcp-"));
    vi.stubEnv("STUDY_MCP_STATE_DIR", directory);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 302 }));
    try {
      await writeFile(getSessionPath("learn"), JSON.stringify({
        cookies: [{ name: "session", value: "keep-private", domain: "learn.uwaterloo.ca", expires: -1 }],
      }));
      await expect(verifySession("learn")).resolves.toEqual({
        service: "learn", usable: false, reason: "Session is expired or no longer authorized.",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      fetchMock.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
