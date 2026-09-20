import { authenticateInBrowser } from "./browser-login.js";

const sessionPath = await authenticateInBrowser("piazza");
console.log(`Piazza session saved locally at ${sessionPath}`);
