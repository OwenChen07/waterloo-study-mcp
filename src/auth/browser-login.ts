import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import {
  getSessionPath,
  prepareSessionDirectory,
  secureSessionFile,
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
    const prompt = createInterface({ input, output });
    try {
      await prompt.question(
        `Complete sign-in for ${displayNames[service]} in the browser, then press Enter here to save this local session. `,
      );
    } finally {
      prompt.close();
    }

    const sessionPath = getSessionPath(service);
    await prepareSessionDirectory(sessionPath);
    await context.storageState({ path: sessionPath });
    await secureSessionFile(sessionPath);
    return sessionPath;
  } finally {
    await browser.close();
  }
}
