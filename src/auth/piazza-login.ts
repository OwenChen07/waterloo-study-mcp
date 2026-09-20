import { authenticatePiazzaThroughLearn } from "./browser-login.js";

const sessionPath = await authenticatePiazzaThroughLearn();
console.log(`Piazza session saved locally at ${sessionPath}`);
