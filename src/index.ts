import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MockStudyProvider } from "./providers/mock-study-provider.js";
import { LiveStudyProvider } from "./providers/live-study-provider.js";
import { createStudyServer } from "./server.js";

const providerMode = process.env.DATA_PROVIDER ?? "mock";
if (providerMode !== "mock" && providerMode !== "live") {
  throw new Error(`Unsupported DATA_PROVIDER: ${providerMode}. Use \"mock\" or \"live\".`);
}

const provider = providerMode === "live" ? new LiveStudyProvider() : new MockStudyProvider();
const server = createStudyServer(provider);
await server.connect(new StdioServerTransport());
