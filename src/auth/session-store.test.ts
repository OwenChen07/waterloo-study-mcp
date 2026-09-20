import { afterEach, describe, expect, it, vi } from "vitest";
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
});
