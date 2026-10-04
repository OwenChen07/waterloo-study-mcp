import { writeFile } from "node:fs/promises";
import { chromium, type BrowserContext } from "playwright";
import {
  getSessionPath,
  prepareSessionDirectory,
  secureSessionFile,
  sessionExists,
  type AuthService,
} from "./session-store.js";

const loginUrls: Record<AuthService, string> = {
  learn: "https://learn.uwaterloo.ca/",
  piazza: "https://piazza.com/",
  marmoset: "https://marmoset.student.cs.uwaterloo.ca/",
};

const displayNames: Record<AuthService, string> = {
  learn: "Waterloo LEARN",
  piazza: "Piazza",
  marmoset: "Marmoset",
};

const LEARN_ENROLLMENTS_URL = "https://learn.uwaterloo.ca/d2l/api/lp/1.62/enrollments/myenrollments/?orgUnitTypeId=3";
const PIAZZA_CLASS_URL = "https://piazza.com/class";
const MARMOSET_URL = "https://marmoset.student.cs.uwaterloo.ca/";
const MARMOSET_COURSES_URL = "https://marmoset.student.cs.uwaterloo.ca/view/index.jsp";
const AUTH_TIMEOUT_MS = 15 * 60_000;
const AUTH_POLL_INTERVAL_MS = 1_000;

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export async function waitForCondition(
  check: () => Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? AUTH_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? AUTH_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Sign-in was not detected before the 15-minute timeout. Leave the browser open, complete the sign-in, and try again.");
}

async function hasLearnSession(context: BrowserContext): Promise<boolean> {
  try {
    const response = await context.request.get(LEARN_ENROLLMENTS_URL, { maxRedirects: 0, timeout: 5_000 });
    return response.ok() && (response.headers()["content-type"] ?? "").includes("json");
  } catch {
    return false;
  }
}

async function hasPiazzaSession(context: BrowserContext): Promise<boolean> {
  try {
    const response = await context.request.get(PIAZZA_CLASS_URL, { maxRedirects: 0, timeout: 5_000 });
    return response.ok() && /<meta[^>]+name=["']csrf_token["']/i.test(await response.text());
  } catch {
    return false;
  }
}

async function hasMarmosetSession(context: BrowserContext): Promise<boolean> {
  try {
    const response = await context.request.get(MARMOSET_COURSES_URL, { maxRedirects: 0, timeout: 5_000 });
    if (!response.ok()) return false;
    const cookies = await context.cookies(MARMOSET_URL);
    const hasSessionCookie = cookies.some((cookie) => cookie.domain.includes("marmoset.student.cs.uwaterloo.ca"));
    // /view/index.jsp is reached only after clicking "as"; it shows a Logout link once fully signed in.
    return hasSessionCookie && /<a\b[^>]*>\s*log\s*out\s*<|<a\b[^>]*\bhref=["'][^"']*logout/i.test(await response.text());
  } catch {
    return false;
  }
}

export function piazzaOnlyStorageState(state: StorageState): StorageState {
  return {
    cookies: state.cookies.filter((cookie) => cookie.domain === "piazza.com" || cookie.domain.endsWith(".piazza.com")),
    origins: state.origins.filter(({ origin }) => new URL(origin).hostname === "piazza.com" || new URL(origin).hostname.endsWith(".piazza.com")),
  };
}

/**
 * Opens a real browser on the user's computer. The user completes any login
 * and MFA there; this program never reads a password or Duo approval code.
 */
export async function authenticateInBrowser(service: AuthService): Promise<string> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(loginUrls[service], { waitUntil: "domcontentloaded" });
    console.log(`Complete sign-in for ${displayNames[service]} in the browser. The local session will save automatically when sign-in is detected.`);
    await waitForCondition(() => {
      if (service === "learn") return hasLearnSession(context);
      if (service === "piazza") return hasPiazzaSession(context);
      return hasMarmosetSession(context);
    });

    const sessionPath = getSessionPath(service);
    await prepareSessionDirectory(sessionPath);
    await context.storageState({ path: sessionPath });
    await secureSessionFile(sessionPath);
    return sessionPath;
  } finally {
    await browser.close();
  }
}

/**
 * Waterloo Piazza accounts are normally provisioned through a signed LTI launch
 * from a course in LEARN, not Piazza's generic login page. Reuse the local
 * LEARN browser session so the user can make that launch in a visible browser.
 */
export async function authenticatePiazzaThroughLearn(): Promise<string> {
  if (!(await sessionExists("learn"))) {
    throw new Error("No LEARN session found. Run `npm run auth:learn` first.");
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: getSessionPath("learn") });
  const page = await context.newPage();

  try {
    await page.goto(loginUrls.learn, { waitUntil: "domcontentloaded" });
    console.log("Open an enrolled LEARN course, click its Piazza external-tool link, and confirm you can see the course in Piazza. The local Piazza session will save automatically when detected.");
    await waitForCondition(() => hasPiazzaSession(context));

    const piazzaState = piazzaOnlyStorageState(await context.storageState());
    if (piazzaState.cookies.length === 0) {
      throw new Error(
        "No Piazza session was found. Open a course's Piazza link in LEARN, confirm it loads Piazza, and try again.",
      );
    }

    const sessionPath = getSessionPath("piazza");
    await prepareSessionDirectory(sessionPath);
    await writeFile(sessionPath, JSON.stringify(piazzaState), { encoding: "utf8", mode: 0o600 });
    await secureSessionFile(sessionPath);
    return sessionPath;
  } finally {
    await browser.close();
  }
}
