/** Day shift: 2:01 AM through 3:20 PM (local time). */
export const DAY_SHIFT_START_MINUTES = 2 * 60 + 1;
/** Day shift ends at 3:20 PM. */
export const DAY_SHIFT_END_MINUTES = 15 * 60 + 20;

export const SHIFT_LABELS = {
  day: "Day shift",
  swing: "Swing shift",
};

export const SHIFT_HOURS = {
  day: "2:01 AM – 3:20 PM",
  swing: "3:21 PM – 2:00 AM",
};

/**
 * @param {string|Date|null|undefined} ts
 * @returns {'day'|'swing'|null}
 */
export function getShiftFromTimestamp(ts) {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (
    minutes >= DAY_SHIFT_START_MINUTES &&
    minutes <= DAY_SHIFT_END_MINUTES
  ) {
    return "day";
  }
  return "swing";
}

/**
 * @param {string|Date|null|undefined} ts
 * @param {'day'|'swing'|null|undefined} shift
 */
export function logMatchesShift(ts, shift) {
  if (!shift) return true;
  return getShiftFromTimestamp(ts) === shift;
}
