import {
  recordStratzRequest,
  resetStratzQuotaLedger,
  stratzWaitMsBeforeRequest,
  STRATZ_LIMIT_PER_SECOND,
} from "../js/stratz-rate-limit.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

resetStratzQuotaLedger();
const t0 = 1_000_000;
for (let i = 0; i < 5; i += 1) {
  recordStratzRequest(t0);
  assert(stratzWaitMsBeforeRequest(t0) === 0, `slot ${i} should be free`);
}

recordStratzRequest(t0);
assert(stratzWaitMsBeforeRequest(t0) > 0, "7th request in 1s window should wait");

resetStratzQuotaLedger();
console.log(`OK: STRATZ limit ${STRATZ_LIMIT_PER_SECOND}/s with headroom`);
console.log("STRATZ rate-limit tests passed");
