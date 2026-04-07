// lib/schedule.ts
export interface ScheduleSlot {
  startTime: string;
  endTime: string;
  djName: string;
  showName?: string;
  timeSlot: string;
}

const PROD_GET = "https://sector.fm/api/query?query=page('home')";
const PROD_POST = "https://sector.fm/api/query?query";
const LOCAL_PROXY = "/api/query?query=" + encodeURIComponent("page('home')");
const ENDPOINTS = [LOCAL_PROXY, PROD_GET, PROD_POST] as const;

let CACHE: ScheduleSlot[] = [];
let LAST_FETCH = 0;
let SCHEDULE_DATE_NY: string | null = null;

const STALE_MS = 5 * 60 * 1000;

const LS_KEY_DATA = "sectorfm:schedule:v1";
const LS_KEY_TIME = "sectorfm:schedule:v1:time";
const LS_KEY_DATE = "sectorfm:schedule:v1:date";

try {
  const hasWindow = typeof window !== "undefined";
  const raw = hasWindow ? localStorage.getItem(LS_KEY_DATA) : null;
  const ts  = hasWindow ? localStorage.getItem(LS_KEY_TIME) : null;
  const dt  = hasWindow ? localStorage.getItem(LS_KEY_DATE) : null;
  if (raw && ts) {
    const parsed = JSON.parse(raw) as ScheduleSlot[];
    if (Array.isArray(parsed)) {
      CACHE = parsed;
      LAST_FETCH = Number(ts) || 0;
      SCHEDULE_DATE_NY = dt || null;
    }
  }
} catch {}

refreshSchedule().catch(() => {});

export function parseSchedule(): ScheduleSlot[] {
  if (Date.now() - LAST_FETCH > STALE_MS) {
    refreshSchedule().catch(() => {});
  }

  const todayNY = formatYYYYMMDD(getNowInNY());
  if (SCHEDULE_DATE_NY && SCHEDULE_DATE_NY < todayNY) {
    // schedule is in the past → act as ended
    return [];
  }
  return CACHE;
}

export function getCurrentAndNextDJ(): { current: ScheduleSlot | null; next: ScheduleSlot | null } {
  const schedule = parseSchedule();
  if (!schedule.length) return { current: null, next: null };

  const todayNY = formatYYYYMMDD(getNowInNY());

  if (SCHEDULE_DATE_NY && SCHEDULE_DATE_NY < todayNY) {
    // past schedule
    return { current: null, next: null };
  }

  if (SCHEDULE_DATE_NY && SCHEDULE_DATE_NY > todayNY) {
    // future schedule → "Up Next" is first slot
    return { current: null, next: schedule[0] ?? null };
  }

  // normal today behavior
  const now = getNowInNYMinutes();
  let current: ScheduleSlot | null = null;
  for (const slot of schedule) {
    const s = toMinutes(slot.startTime);
    const e = toMinutes(slot.endTime);
    if (now >= s && now < e) { current = slot; break; }
  }
  const next = schedule.find(s => toMinutes(s.startTime) > now) || null;
  return { current, next };
}

export function formatDJDisplay(slot: ScheduleSlot): string {
  return slot.showName && slot.showName.trim().length
    ? `${slot.showName}: ${slot.djName}`
    : slot.djName;
}

async function refreshSchedule(): Promise<void> {
  let json: any = null;

  try {
    const r = await fetch(ENDPOINTS[0], { cache: "no-store" });
    if (r.ok) json = await r.json();
  } catch {}
  if (!json) {
    try {
      const r = await fetch(ENDPOINTS[1], { cache: "no-store" });
      if (r.ok) json = await r.json();
    } catch {}
  }
  if (!json) {
    try {
      const r = await fetch(ENDPOINTS[2], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ query: "page('home')" }),
      });
      if (r.ok) json = await r.json();
    } catch {}
  }
  if (!json) { LAST_FETCH = Date.now(); return; }

  const root = json.result ?? json;
  const title = findScheduleTitle(root);
  SCHEDULE_DATE_NY = parseNYDateFromTitle(title);

  const showsMap = collectShowFields(root);
  const ORDER = [
    "show_one","show_two","show_three","show_four","show_five","show_six",
    "show_seven","show_eight","show_nine","show_ten","show_eleven","show_twelve",
  ] as const;

  const parsed: ScheduleSlot[] = [];
  for (const key of ORDER) {
    const line = showsMap[key];
    if (typeof line !== "string" || !line.trim()) continue;
    const entry = parseShowLine(line);
    if (entry) parsed.push(entry);
  }

  const todayNY = formatYYYYMMDD(getNowInNY());
  const isToday = !SCHEDULE_DATE_NY || SCHEDULE_DATE_NY === todayNY;
  let adjusted: ScheduleSlot[] = parsed;

  if (!SCHEDULE_DATE_NY || SCHEDULE_DATE_NY > todayNY) {
    // future → preserve full lineup
    adjusted = parsed.map(slot => ({ ...slot, startTime: "99:59" }));
  } else if (isToday) {
    // today → sort
    adjusted = [...parsed].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  } else {
    // past → empty
    adjusted = [];
  }

  CACHE = adjusted;
  LAST_FETCH = Date.now();

  try {
    localStorage.setItem(LS_KEY_DATA, JSON.stringify(CACHE));
    localStorage.setItem(LS_KEY_TIME, String(LAST_FETCH));
    localStorage.setItem(LS_KEY_DATE, SCHEDULE_DATE_NY ?? "");
  } catch {}

  try { window.dispatchEvent(new CustomEvent("schedule:updated")); } catch {}
}

function collectShowFields(obj: unknown, out: Record<string, string> = {}): Record<string, string> {
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (/^show_(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i.test(k)) {
      if (typeof v === "string") out[k.toLowerCase()] = v;
    } else if (v && typeof v === "object") {
      collectShowFields(v, out);
    }
  }
  return out;
}

function findScheduleTitle(obj: unknown): string | null {
  let found: string | null = null;
  if (!obj || typeof obj !== "object") return null;
  const stack: any[] = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (cur && typeof cur === "object") {
      for (const [k, v] of Object.entries(cur)) {
        if (typeof v === "string" && /title/i.test(k)) {
          if (/schedule/i.test(v)) return v;
          found = found ?? v;
        } else if (v && typeof v === "object") {
          stack.push(v);
        }
      }
    }
  }
  return found;
}

function parseNYDateFromTitle(title: string | null): string | null {
  if (!title) return null;
  const m = title.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b[^0-9]*([0-9]{1,2})(?:st|nd|rd|th)?(?:[^0-9]+([0-9]{4}))?/i);
  if (!m) return null;
  const monthName = m[1];
  const day = Number(m[2]);
  const yearFromTitle = m[3] ? Number(m[3]) : null;
  const monthIndex = [
    "january","february","march","april","may","june",
    "july","august","september","october","november","december"
  ].indexOf(monthName.toLowerCase());
  if (monthIndex < 0) return null;
  const nowNY = getNowInNY();
  let year = yearFromTitle ?? nowNY.getFullYear();
  const dateNY = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
  const yyyy = new Date(dateNY.toLocaleString("en-US", { timeZone: "America/New_York" })).getFullYear();
  return `${yyyy}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function getNowInNY(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function getNowInNYMinutes(): number {
  const d = getNowInNY();
  return d.getHours() * 60 + d.getMinutes();
}

function formatYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseShowLine(line: string): ScheduleSlot | null {
  const normalized = line.replace(/\s*-\s*/, " - ").trim();
  const m = normalized.match(/^\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*(.*)$/);
  if (!m) return null;
  const [, startTime, endTime, remainderRaw] = m;
  const remainder = (remainderRaw ?? "").trim();
  let showName = "";
  let djName = "";
  if (remainder.includes(":")) {
    const idx = remainder.indexOf(":");
    showName = remainder.slice(0, idx).trim();
    djName = remainder.slice(idx + 1).trim();
  } else {
    djName = remainder;
  }
  return {
    startTime,
    endTime,
    djName,
    showName: showName || undefined,
    timeSlot: `${startTime} - ${endTime}`,
  };
}
