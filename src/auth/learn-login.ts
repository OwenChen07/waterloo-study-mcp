import { authenticateInBrowser } from "./browser-login.js";

const sessionPath = await authenticateInBrowser("learn");
console.log(`LEARN session saved locally at ${sessionPath}`);
