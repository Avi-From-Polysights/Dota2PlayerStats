import assert from "node:assert/strict";
import { formatAbilityText } from "../js/valve-text.js";

const specialValues = [
  { name: "bonus_damage", values_float: [25, 50, 75, 100] },
  { name: "duration", values_float: [3] },
];

assert.equal(
  formatAbilityText("+{s:bonus_damage} Attack Damage", specialValues, [], {}),
  "+25 / 50 / 75 / 100 Attack Damage"
);

assert.equal(
  formatAbilityText("Lasts %duration% seconds", specialValues, [], {}),
  "Lasts 3 seconds"
);

console.log("valve-text tests passed.");
