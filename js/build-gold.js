export const STARTING_GOLD_DEFAULT = 600;
export const GPM_DEFAULT = 450;
export const SELL_REFUND_RATE = 0.5;
export const GOLD_CHECKPOINT_MINUTES = [10, 20, 30, 40, 50, 60];

export function itemCost(itemKey, itemsData) {
  if (!itemKey || !itemsData?.[itemKey]) return 0;
  return Number(itemsData[itemKey].cost) || 0;
}

/** Net gold spent on timeline events up to and including `minute`. */
export function netGoldSpentUntil(timeline, itemsData, minute) {
  let spent = 0;
  for (const event of timeline ?? []) {
    if (Number(event.minute) > minute) continue;
    const cost = itemCost(event.itemKey, itemsData);
    if (event.action === "buy") spent += cost;
    else if (event.action === "sell") spent -= Math.floor(cost * SELL_REFUND_RATE);
  }
  return spent;
}

/** Passive + farm gold estimate from GPM (simplified — user-provided rate). */
export function goldAtMinute({ minute, gpm, startingGold, timeline, itemsData }) {
  const earned = Number(startingGold) + Number(gpm) * Number(minute);
  const spent = netGoldSpentUntil(timeline, itemsData, minute);
  return earned - spent;
}

export function goldCheckpointTable({ gpm, startingGold, timeline, itemsData, minutes = GOLD_CHECKPOINT_MINUTES }) {
  return minutes.map((minute) => ({
    minute,
    gold: goldAtMinute({ minute, gpm, startingGold, timeline, itemsData }),
    spent: netGoldSpentUntil(timeline, itemsData, minute),
  }));
}

export function timelineGoldDelta(event, itemsData) {
  const cost = itemCost(event.itemKey, itemsData);
  if (event.action === "buy") return -cost;
  if (event.action === "sell") return Math.floor(cost * SELL_REFUND_RATE);
  return 0;
}

export function totalTimelineNetCost(timeline, itemsData) {
  return netGoldSpentUntil(timeline, itemsData, Number.POSITIVE_INFINITY);
}
