import { chmod, mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type AuthService = "learn" | "piazza";

const serviceFileNames: Record<AuthService, string> = {
  learn: "learn-storage-state.json",
  piazza: "piazza-storage-state.json",
};

export function getStateDirectory(): string {
  return process.env.STUDY_MCP_STATE_DIR || join(homedir(), ".waterloo-study-mcp");
}

export function getSessionPath(service: AuthService): string {
  return join(getStateDirectory(), serviceFileNames[service]);
}

export async function prepareSessionDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
}

export async function secureSessionFile(path: string): Promise<void> {
  await prepareSessionDirectory(path);
  await chmod(path, 0o600);
}

export async function sessionExists(service: AuthService): Promise<boolean> {
  try {
    await stat(getSessionPath(service));
    return true;
  } catch {
    return false;
  }
}

type StoredCookie = {
  name?: unknown;
  value?: unknown;
  domain?: unknown;
  expires?: unknown;
};

type StoredSession = { cookies?: unknown };

function matchesHost(cookieDomain: string, host: string): boolean {
  const normalizedDomain = cookieDomain.replace(/^\./, "").toLowerCase();
  const normalizedHost = host.toLowerCase();
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

/**
 * Creates a Cookie header from the local Playwright storage state. Cookie values
 * are intentionally returned only to an outbound request, never logged.
 */
export async function getSessionCookieHeader(service: AuthService, host: string): Promise<string> {
  const path = getSessionPath(service);
  let state: StoredSession;
  try {
    state = JSON.parse(await readFile(path, "utf8")) as StoredSession;
  } catch {
    throw new Error(`No ${service} session found. Run \`npm run auth:${service}\` first.`);
  }

  if (!Array.isArray(state.cookies)) {
    throw new Error(`${service} session file is invalid. Run \`npm run auth:${service}\` again.`);
  }

  const now = Date.now() / 1000;
  const cookies = state.cookies
    .filter((cookie): cookie is StoredCookie => typeof cookie === "object" && cookie !== null)
    .filter((cookie) =>
      typeof cookie.name === "string" &&
      typeof cookie.value === "string" &&
      typeof cookie.domain === "string" &&
      matchesHost(cookie.domain, host) &&
      (typeof cookie.expires !== "number" || cookie.expires < 0 || cookie.expires > now),
    )
    .map((cookie) => `${cookie.name}=${cookie.value}`);

  if (cookies.length === 0) {
    throw new Error(`${service} session has no valid cookies for ${host}. Run \`npm run auth:${service}\` again.`);
  }

  return cookies.join("; ");
}
