import { loadHeroes } from "../js/api.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const heroes = await loadHeroes();
assert("hero list loads", heroes.length > 100);
assert("has Kez", heroes.some((h) => h.name === "Kez"));
assert("sorted", heroes[0].name.localeCompare(heroes[1].name) <= 0);

if (!ok) process.exit(1);
console.log("Hero load tests passed");
