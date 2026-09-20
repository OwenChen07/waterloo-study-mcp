import { afterEach, describe, expect, it, vi } from "vitest";
import { piazzaOnlyStorageState } from "./browser-login.js";
import { getSessionPath, getStateDirectory } from "./session-store.js";

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
});
