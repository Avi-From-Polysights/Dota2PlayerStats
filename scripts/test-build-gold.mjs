import assert from "node:assert/strict";
import { goldAtMinute, netGoldSpentUntil, SELL_REFUND_RATE } from "../js/build-gold.js";
import { addTimelineEvent, createEmptyBuild } from "../js/build-model.js";

const items = { power_treads: { cost: 1400 } };
let build = createEmptyBuild({ heroId: 1 });
addTimelineEvent(build, { minute: 5, action: "buy", itemKey: "power_treads" });
addTimelineEvent(build, { minute: 15, action: "sell", itemKey: "power_treads" });

assert.equal(netGoldSpentUntil(build.itemTimeline, items, 20), 1400 - Math.floor(1400 * SELL_REFUND_RATE));
assert.equal(goldAtMinute({ minute: 10, gpm: 500, startingGold: 600, timeline: build.itemTimeline, itemsData: items }), 600 + 5000 - 1400);

console.log("build-gold tests passed.");
