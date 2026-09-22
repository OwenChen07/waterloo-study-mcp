import { getSessionPath } from "./session-store.js";
import { verifySession } from "./verify-session.js";

for (const service of ["learn", "piazza"] as const) {
  const result = await verifySession(service);
  const status = result.usable ? "session verified" : "not signed in or expired";
  console.log(`${service}: ${status} (${getSessionPath(service)})${result.reason ? ` — ${result.reason}` : ""}`);
}
