// ── tool: generate the bundled reputation popularity list · owner: Ozias ──
//
// Downloads the Tranco top-1M ranking (a research-grade domain popularity list that's more
// manipulation-resistant than raw Alexa/Umbrella), keeps the top N *registered* domains, DROPS the
// user-generated-content / shared-hosting / shortener domains (which are popular but host arbitrary
// third-party pages — flooring them would wave through phishing like "evil.pages.dev"), and writes
// one registered-domain per line to server/src/services/data/reputable-domains.txt.
//
// This is a BUILD-TIME tool, not app code — run it by hand when we want to refresh the list:
//   node scripts/fetch-top-domains.mjs
// The generated .txt is committed so production needs no network + no API key at runtime. The list
// is DATA (a snapshot), refreshed occasionally, never on every deploy.
//
// The UGC/hosting denylist lives in reputation.js (NEVER_REPUTABLE) and is imported here so the
// generation-time filter and the runtime filter can never drift apart.
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { registeredDomain } from "../server/src/services/typosquat.js";
import { NEVER_REPUTABLE } from "../server/src/services/reputation.js";

const TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip";
const TOP_N = 50_000; // conservative tier — deep enough for the vendor/infra ecosystem, shallow
                      // enough to stay a tight, low-false-positive "clearly-established" set.

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, "../server/src/services/data/reputable-domains.txt");
const tmpZip = resolve(here, "../.tranco-top-1m.csv.zip");
const tmpDir = resolve(here, "../.tranco-tmp");

// Download the zip to disk (it's ~10MB — stream it rather than buffer in memory).
const download = async (url, dest) => {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Tranco download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
};

const main = async () => {
  console.log(`⤓ downloading ${TRANCO_URL} …`);
  const bytes = await download(TRANCO_URL, tmpZip);
  console.log(`  got ${(bytes / 1e6).toFixed(1)} MB`);

  // Unzip with the system `unzip` (macOS/Linux ship it) into a temp dir, then read the CSV.
  await mkdir(tmpDir, { recursive: true });
  execFileSync("unzip", ["-o", "-q", tmpZip, "-d", tmpDir]);
  const csv = await readFile(resolve(tmpDir, "top-1m.csv"), "utf8");

  // Rows are "rank,domain". Keep rank <= TOP_N, fold to the registered domain, drop UGC/hosting
  // domains, and dedup (several ranked hosts can share one registered domain).
  const kept = new Set();
  let scanned = 0, dropped = 0;
  for (const line of csv.split("\n")) {
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const rank = Number(line.slice(0, comma));
    if (!Number.isFinite(rank) || rank > TOP_N) break; // list is rank-ordered → stop at the cutoff
    scanned += 1;
    const domain = line.slice(comma + 1).trim().toLowerCase();
    const reg = registeredDomain(domain);
    if (!reg) continue;
    if (NEVER_REPUTABLE.has(reg)) { dropped += 1; continue; } // shared-hosting / shortener → never trust
    kept.add(reg);
  }

  const sorted = [...kept].sort();
  await mkdir(dirname(outFile), { recursive: true });
  const out = createWriteStream(outFile);
  for (const d of sorted) out.write(d + "\n");
  await new Promise((r) => out.end(r));

  console.log(`✓ wrote ${sorted.length} reputable registered-domains to ${outFile}`);
  console.log(`  (scanned top ${scanned}, dropped ${dropped} UGC/hosting/shortener domains)`);

  // Clean up the temp download so it never gets committed.
  await rm(tmpZip, { force: true });
  await rm(tmpDir, { recursive: true, force: true });
};

main().catch((e) => { console.error("✗ fetch-top-domains failed:", e.message); process.exit(1); });
