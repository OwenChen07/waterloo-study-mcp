import { getSessionPath, sessionExists } from "./session-store.js";

for (const service of ["learn", "piazza"] as const) {
  const status = (await sessionExists(service)) ? "session found" : "not signed in";
  console.log(`${service}: ${status} (${getSessionPath(service)})`);
}
