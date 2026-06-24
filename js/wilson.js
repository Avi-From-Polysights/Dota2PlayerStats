const Z_SCORES = {
  0.9: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

export function zForConfidence(confidence) {
  const key = Number(confidence.toFixed(2));
  return Z_SCORES[key] ?? 1.96;
}

/** Wilson score interval for a binomial proportion (returns 0–100 percentages). */
export function wilsonInterval(wins, total, confidence = 0.95) {
  if (total <= 0) {
    return { center: 0, lower: 0, upper: 0 };
  }

  const z = zForConfidence(confidence);
  const p = wins / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin =
    (z / denom) * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));

  return {
    center: center * 100,
    lower: Math.max(0, center - margin) * 100,
    upper: Math.min(1, center + margin) * 100,
  };
}

export function formatPct(value, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatCi(lower, upper, digits = 1) {
  return `${lower.toFixed(digits)}–${upper.toFixed(digits)}%`;
}
