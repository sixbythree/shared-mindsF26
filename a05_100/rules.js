// The rules of 100: the connection cap, what counts as engagement, and how temperature is measured.
// Shared by the Firebase store, the demo store and the interface, so all three agree.

export const MAX_CONNECTIONS = 100;
export const WINDOW_DAYS = 7;
// Staying warm means talking on at least this many of the last 7 days.
export const ENGAGED_DAYS = 3;
export const CALL_SECONDS = 5 * 60;
// After a connection disappears, neither person can reconnect for this long.
export const BLOCK_DAYS = 30;

// Two open design questions, kept as switches until they're decided.
// Heat on posts: when false, only the person who posted sees who heated it, and nobody sees a count.
export const PUBLIC_HEAT = false;
// When true, commenting on a connection's post counts as talking to them that day.
export const COMMENTS_COUNT_AS_TALKING = false;
// When true, doing an activity together (watching, reading, studying) for 5 minutes counts as a shared day, like a call.
export const ACTIVITIES_COUNT_AS_TALKING = true;

// Both people need the same idea of "today", so every day is a New York calendar day (the class is at NYU).
// Days are written as "YYYYMMDD" so they sort and work as Firestore field names.
const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

export function dayKey(date = new Date()) {
  return DAY_FORMAT.format(date).replaceAll("-", "");
}

// Day arithmetic runs on plain calendar dates (UTC midnight), so it's free of daylight-saving shifts.
function keyToDate(key) {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
}

export function addDays(key, days) {
  const date = keyToDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export function daysBetween(from, to) {
  return Math.round((keyToDate(to) - keyToDate(from)) / 86_400_000);
}

export function formatDay(key, options = { weekday: "short", month: "short", day: "numeric" }) {
  return keyToDate(key).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}

// One document per pair of people, so a connection is always two-sided.
export function pairId(a, b) {
  return [a, b].sort().join("_");
}

// A day counts only when both people took part: both sent a message, a call ran 5 minutes or more,
// or they did an activity together for 5 minutes.
// Days before the connection started count too, so every connection starts hot.
export function isMutualDay(conn, day) {
  if (day < conn.startedDay) return true;
  const both = (uids = []) => conn.members.every((uid) => uids.includes(uid));
  return both(conn.messageDays[day]) || both(conn.togetherDays?.[day]) || (conn.callDays[day] ?? 0) >= CALL_SECONDS;
}

function warmDaysEnding(conn, day) {
  let count = 0;
  for (let i = 0; i < WINDOW_DAYS; i += 1) {
    if (isMutualDay(conn, addDays(day, -i))) count += 1;
  }
  return count;
}

function lastWarmDay(conn) {
  const days = [...Object.keys(conn.messageDays), ...Object.keys(conn.callDays), ...Object.keys(conn.togetherDays ?? {})]
    .filter((day) => day >= conn.startedDay && isMutualDay(conn, day))
    .sort();
  return days.at(-1) ?? addDays(conn.startedDay, -1);
}

export function levelFor(degrees) {
  if (degrees >= 6) return "hot";
  if (degrees >= ENGAGED_DAYS) return "warm";
  return "cold";
}

// Temperature is how many of the last 7 days both people talked (0–7).
// Below 3 of 7 a connection runs cold; after 7 days with no engagement at all it disappears,
// and neither person can reconnect for 30 days.
// Letting someone go (to make room when your 100 is full) ends the connection that day, with the same 30-day wait.
export function describe(conn, today) {
  if (conn.status === "pending") return { state: "pending" };
  if (conn.endedDay) {
    return { state: "ended", endedDay: conn.endedDay, reconnectDay: addDays(conn.endedDay, BLOCK_DAYS), letGo: true };
  }

  const endsOn = addDays(lastWarmDay(conn), WINDOW_DAYS + 1);
  if (today >= endsOn) {
    return { state: "ended", endedDay: endsOn, reconnectDay: addDays(endsOn, BLOCK_DAYS) };
  }

  // Today is still in progress, so it can warm a connection but never cools it.
  const degrees = Math.max(warmDaysEnding(conn, today), warmDaysEnding(conn, addDays(today, -1)));
  const week = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    week.push({ day, warm: isMutualDay(conn, day), before: day < conn.startedDay, today: i === 0 });
  }
  return {
    state: "active",
    degrees,
    level: levelFor(degrees),
    week,
    endsOn,
    daysLeft: daysBetween(today, endsOn),
    talkedToday: isMutualDay(conn, today),
  };
}

// Cold blue through violet and magenta to hot orange (Six brand colors).
const HEAT_COLORS = ["#064AA7", "#064AA7", "#2C057D", "#6E0675", "#B0036F", "#E30069", "#F52A35", "#FF4100"];

export function heatColor(degrees) {
  return HEAT_COLORS[Math.max(0, Math.min(7, degrees))];
}
