import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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
};

const displayNames: Record<AuthService, string> = {
  learn: "Waterloo LEARN",
  piazza: "Piazza",
};

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

async function waitForUser(message: string): Promise<void> {
  const prompt = createInterface({ input, output });
  try {
    await prompt.question(message);
  } finally {
    prompt.close();
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
    await waitForUser(
      `Complete sign-in for ${displayNames[service]} in the browser, then press Enter here to save this local session. `,
    );

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
    await waitForUser(
      "Open an enrolled LEARN course, click its Piazza external-tool link, and confirm you can see the course in Piazza. Then press Enter here to save the Piazza session. ",
    );

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
