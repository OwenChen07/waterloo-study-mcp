import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MockStudyProvider } from "./providers/mock-study-provider.js";
import { createStudyServer } from "./server.js";

const providerMode = process.env.DATA_PROVIDER ?? "mock";
if (providerMode !== "mock") {
  throw new Error(`Unsupported DATA_PROVIDER: ${providerMode}. Only \"mock\" is available.`);
}

const server = createStudyServer(new MockStudyProvider());
await server.connect(new StdioServerTransport());
