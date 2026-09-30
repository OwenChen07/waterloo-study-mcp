import { authenticateInBrowser } from "./browser-login.js";

const sessionPath = await authenticateInBrowser("marmoset");
console.log(`Marmoset session saved locally at ${sessionPath}`);
