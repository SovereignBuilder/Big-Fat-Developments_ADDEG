import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const srcDir = resolve(__dirname, "../src/dashboard/client");
const destDir = resolve(__dirname, "../dist/dashboard/client");
const iconSrc = resolve(__dirname, "../dev_diary_app.ico");
const iconDestDir = resolve(__dirname, "../dist/electron");
const iconDest = resolve(iconDestDir, "icon.ico");

console.log(`Copying assets from ${srcDir} to ${destDir}...`);

try {
  await cp(srcDir, destDir, { recursive: true });
  await mkdir(iconDestDir, { recursive: true });
  await cp(iconSrc, iconDest);
  console.log("Assets copied successfully.");
} catch (err) {
  console.error("Error copying assets:", err);
  process.exit(1);
}
