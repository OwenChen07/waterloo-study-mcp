import { getSessionCookieHeader, type AuthService } from "./session-store.js";

const targets: Record<AuthService, { host: string; url: string }> = {
  learn: {
    host: "learn.uwaterloo.ca",
    // A small read-only endpoint used by the live provider. Its response is not retained.
    url: "https://learn.uwaterloo.ca/d2l/api/lp/1.62/enrollments/myenrollments/?orgUnitTypeId=3",
  },
  piazza: { host: "piazza.com", url: "https://piazza.com/class" },
};

export type SessionVerification = { service: AuthService; usable: boolean; reason?: string };

/** Verify that locally stored session cookies still authenticate, without reading course data. */
export async function verifySession(service: AuthService): Promise<SessionVerification> {
  const target = targets[service];
  let cookie: string;
  try {
    cookie = await getSessionCookieHeader(service, target.host);
  } catch (error) {
    return { service, usable: false, reason: error instanceof Error ? error.message : "Session could not be read." };
  }

  try {
    const response = await fetch(target.url, {
      // Piazza's browser page rejects an application/json-only Accept header.
      headers: service === "learn" ? { Accept: "application/json", Cookie: cookie } : { Cookie: cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return { service, usable: true };
    if (response.status === 401 || response.status === 403 || response.status >= 300 && response.status < 400) {
      return { service, usable: false, reason: "Session is expired or no longer authorized." };
    }
    return { service, usable: false, reason: `Service returned ${response.status}.` };
  } catch {
    return { service, usable: false, reason: "Could not reach the service to verify this session." };
  }
}
