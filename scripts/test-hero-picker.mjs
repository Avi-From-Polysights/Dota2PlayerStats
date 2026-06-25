import { findHeroByQuery, normalizeHeroQuery } from "../js/hero-picker.js";

const heroes = [
  { id: 1, name: "Anti-Mage" },
  { id: 39, name: "Queen of Pain" },
  { id: 53, name: "Nature's Prophet" },
  { id: 145, name: "Kez" },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(normalizeHeroQuery("  Queen   of Pain ") === "queen of pain", "normalize whitespace");
assert(
  findHeroByQuery(heroes, "Queen of Pain")?.id === 39,
  "exact match"
);
assert(
  findHeroByQuery(heroes, "queen of pain", { fuzzy: true })?.id === 39,
  "case insensitive fuzzy"
);
assert(
  findHeroByQuery(heroes, "Queen", { fuzzy: true })?.id === 39,
  "unique prefix"
);
assert(
  findHeroByQuery(heroes, "Nature\u2019s Prophet", { fuzzy: true })?.id === 53,
  "curly apostrophe"
);
assert(findHeroByQuery(heroes, "Queen") === null, "non-fuzzy partial is null");
assert(findHeroByQuery(heroes, "An") === null, "ambiguous prefix is null");

console.log("All hero-picker tests passed");
