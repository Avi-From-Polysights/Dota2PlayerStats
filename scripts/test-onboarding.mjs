import {
  ONBOARDING_STORAGE_KEY,
  TUTORIAL_STEPS,
  isOnboardingComplete,
  markOnboardingComplete,
  resetOnboardingStorage,
} from "../js/onboarding.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const mockStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

assert("steps defined", TUTORIAL_STEPS.length >= 8);

const ids = TUTORIAL_STEPS.map((s) => s.id);
assert("unique step ids", new Set(ids).size === ids.length);

for (const step of TUTORIAL_STEPS) {
  assert(`${step.id} has title`, typeof step.title === "string" && step.title.length > 0);
  assert(`${step.id} has body`, typeof step.body === "string" && step.body.length > 0);
}

assert(
  "welcome is centered",
  TUTORIAL_STEPS[0].placement === "center" && TUTORIAL_STEPS[0].target === null
);

assert(
  "done is last centered step",
  TUTORIAL_STEPS.at(-1).id === "done" && TUTORIAL_STEPS.at(-1).placement === "center"
);

assert(
  "tools step targets guided tour accordion",
  TUTORIAL_STEPS.some((s) => s.id === "tools" && s.target === "#tutorial-tool-accordion")
);

const storage = mockStorage();
assert("incomplete by default", !isOnboardingComplete(storage));
markOnboardingComplete(storage);
assert("complete after mark", isOnboardingComplete(storage));
resetOnboardingStorage(storage);
assert("incomplete after reset", !isOnboardingComplete(storage));

assert("storage key stable", ONBOARDING_STORAGE_KEY.includes("onboarding"));

if (!ok) process.exit(1);
console.log("All onboarding tests passed.");
