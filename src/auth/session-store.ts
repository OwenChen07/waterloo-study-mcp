import { chmod, mkdir, stat } from "node:fs/promises";
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
