import { access, rm } from "node:fs/promises";
import path from "node:path";

const nextDevDir = path.join(process.cwd(), ".next", "dev");

async function main() {
  try {
    await access(nextDevDir);
  } catch {
    return;
  }

  await rm(nextDevDir, { recursive: true, force: true });
  console.log("Cleared .next/dev before next dev startup");
}

await main();
