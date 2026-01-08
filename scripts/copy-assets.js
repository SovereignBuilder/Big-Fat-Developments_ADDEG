import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const srcDir = resolve(__dirname, "../src/dashboard/client");
const destDir = resolve(__dirname, "../dist/dashboard/client");

console.log(`Copying assets from ${srcDir} to ${destDir}...`);

try {
  await cp(srcDir, destDir, { recursive: true });
  console.log("Assets copied successfully.");
} catch (err) {
  console.error("Error copying assets:", err);
  process.exit(1);
}
