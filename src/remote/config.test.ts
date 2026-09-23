import { describe, expect, it } from "vitest";
import { readRemoteFoundationConfig } from "./config.js";

describe("remote MCP foundation configuration", () => {
  it("only permits the explicit local mock demonstration", () => {
    expect(readRemoteFoundationConfig({ REMOTE_MCP_DEMO: "1", DATA_PROVIDER: "mock", REMOTE_MCP_PORT: "4321" }))
      .toEqual({ host: "127.0.0.1", port: 4321 });
  });

  it("rejects live credentials and accidental startup", () => {
    expect(() => readRemoteFoundationConfig({ DATA_PROVIDER: "mock" })).toThrow("REMOTE_MCP_DEMO=1");
    expect(() => readRemoteFoundationConfig({ REMOTE_MCP_DEMO: "1", DATA_PROVIDER: "live" })).toThrow("only permits DATA_PROVIDER=mock");
  });
});
