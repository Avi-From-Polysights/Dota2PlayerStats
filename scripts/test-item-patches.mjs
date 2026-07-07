import assert from "node:assert/strict";
import { applyItemPatches } from "../js/item-patches.js";

const items = {
  mage_slayer: {
    dname: "Mage Slayer",
    cost: 3100,
    attrib: [{ key: "bonus_damage", value: "15" }],
  },
};

const itemKeyById = new Map([[598, "mage_slayer"]]);

const meta = await applyItemPatches(items, itemKeyById);
assert.ok(meta.latestPatch?.startsWith("7.41"), `expected 7.41x patch, got ${meta.latestPatch}`);
assert.equal(items.mage_slayer.attrib.find((a) => a.key === "bonus_damage")?.value, "12");

console.log(`item-patches tests passed (patch ${meta.latestPatch}, ${meta.changeCount} changes).`);
