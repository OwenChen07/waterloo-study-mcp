import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { MockStudyProvider } from "../providers/mock-study-provider.js";
import { createStudyServer } from "../server.js";
import { readRemoteFoundationConfig } from "./config.js";

const config = readRemoteFoundationConfig();
const app = createMcpExpressApp({ host: config.host });
const transports = new Map<string, StreamableHTTPServerTransport>();

type RemoteRequest = IncomingMessage & { body: unknown };

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(body);
}

app.post("/mcp", async (request: RemoteRequest, response: ServerResponse) => {
  try {
    const sessionId = request.headers["mcp-session-id"];
    const existing = typeof sessionId === "string" ? transports.get(sessionId) : undefined;
    if (existing) {
      await existing.handleRequest(request, response, request.body);
      return;
    }
    if (!isInitializeRequest(request.body)) {
      sendJson(response, 400, { jsonrpc: "2.0", error: { code: -32000, message: "Missing or invalid MCP session." }, id: null });
      return;
    }

    let transport: StreamableHTTPServerTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { transports.set(id, transport); },
    });
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) transports.delete(id);
    };
    await createStudyServer(new MockStudyProvider()).connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch {
    if (!response.headersSent) {
      sendJson(response, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error." }, id: null });
    }
  }
});

app.get("/mcp", async (request: RemoteRequest, response: ServerResponse) => {
  const sessionId = request.headers["mcp-session-id"];
  const transport = typeof sessionId === "string" ? transports.get(sessionId) : undefined;
  if (!transport) {
    sendText(response, 400, "Missing or invalid MCP session.");
    return;
  }
  await transport.handleRequest(request, response);
});

app.delete("/mcp", async (request: RemoteRequest, response: ServerResponse) => {
  const sessionId = request.headers["mcp-session-id"];
  const transport = typeof sessionId === "string" ? transports.get(sessionId) : undefined;
  if (!transport) {
    sendText(response, 400, "Missing or invalid MCP session.");
    return;
  }
  await transport.handleRequest(request, response);
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Local Streamable HTTP MCP demo listening at http://${config.host}:${config.port}/mcp`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close());
}
