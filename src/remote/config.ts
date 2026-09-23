export type RemoteFoundationConfig = {
  host: "127.0.0.1";
  port: number;
};

/**
 * The remote transport is intentionally a localhost-only mock demonstration.
 * It must not be used with the cookie-backed live provider or exposed online.
 */
export function readRemoteFoundationConfig(env = process.env): RemoteFoundationConfig {
  if (env.REMOTE_MCP_DEMO !== "1") {
    throw new Error("Set REMOTE_MCP_DEMO=1 to run the remote MCP foundation locally.");
  }
  if (env.DATA_PROVIDER !== "mock") {
    throw new Error("The remote MCP foundation only permits DATA_PROVIDER=mock. Live credentials require an approved remote OAuth design.");
  }

  const port = Number(env.REMOTE_MCP_PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("REMOTE_MCP_PORT must be an integer from 1 to 65535.");
  }
  return { host: "127.0.0.1", port };
}
