/**
 * The view-only /home preview cookie a homepage signup gets. It must
 * round-trip, expire, and refuse a hand-edited username or signature.
 */
import { HOME_PREVIEW_TTL_MS, homePreviewToken, readHomePreview } from "../src/lib/auth/home-preview";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

const key = "test-secret";
const now = 1_800_000_000_000;
const t = homePreviewToken("izzydabomb", now, key)!;
check("token is issued", typeof t === "string" && t.split(".").length === 3);
check("round-trips", readHomePreview(t, now + 1000, key) === "izzydabomb");
check("expires after the TTL", readHomePreview(t, now + HOME_PREVIEW_TTL_MS + 1, key) === null);
check("wrong key refused", readHomePreview(t, now, "other") === null);
const [, exp, mac] = t.split(".");
const swapped = `${Buffer.from("someoneelse").toString("base64url")}.${exp}.${mac}`;
check("edited username refused", readHomePreview(swapped, now, key) === null);
const [u] = t.split(".");
check("edited expiry refused", readHomePreview(`${u}.${Number(exp) + 9e9}.${mac}`, now, key) === null);
check("garbage refused", readHomePreview("x.y", now, key) === null && readHomePreview(undefined, now, key) === null);
check("no secret: no token", homePreviewToken("izzydabomb", now, null) === null);
const odd = homePreviewToken("bad name<script>", now, key)!;
check("unsafe username refused on read", readHomePreview(odd, now, key) === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
