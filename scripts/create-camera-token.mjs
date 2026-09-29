import { createHash, randomBytes } from "node:crypto";

const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

console.log(JSON.stringify({ token, tokenHash }, null, 2));
