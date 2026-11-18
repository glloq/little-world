/** Pure game-time ferry timetable; no timers, renderer, network or wall clock. */
export type PortLevel = 0 | 1 | 2 | 3 | 4;
export interface FerryCall { id: string; arrivalMinute: number; departureMinute: number | null; }
export interface FerryStatus { present: boolean; level: PortLevel; call: FerryCall | null; nextArrivalMinute: number | null; minutesUntilDeparture: number | null; }
export type FerryEvent = { id: string; kind: 'arrived' | 'departure-warning' | 'departed'; gameMinute: number };
const DAY = 1440;
const WEEK = DAY * 7;
const windows: Record<PortLevel, readonly { days: readonly number[]; start: number; end: number }[]> = {
  0: [{ days: [0], start: 0, end: DAY }], // one full day per game week, no dock
  1: [{ days: [0, 3, 5], start: 9 * 60, end: 18 * 60 }],
  2: [{ days: [0, 1, 2, 3, 4, 5, 6], start: 8 * 60, end: 20 * 60 }],
  3: [{ days: [0, 1, 2, 3, 4, 5, 6], start: 6 * 60, end: DAY }],
  4: [],
};
export function worldGameMinute(elapsedSeconds: number, dayLengthSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || !Number.isFinite(dayLengthSeconds) || dayLengthSeconds <= 0) throw new Error('Horloge de navette invalide');
  return Math.floor(elapsedSeconds / dayLengthSeconds * DAY);
}
function assertLevel(level: number): asserts level is PortLevel {
  if (!Number.isInteger(level) || level < 0 || level > 4) throw new Error('Niveau de port invalide');
}
/** Stateless schedule for a rolling game week. */
export function callsForWeek(level: PortLevel, weekIndex: number, dockId = 'ferry'): FerryCall[] {
  assertLevel(level);
  if (!Number.isSafeInteger(weekIndex) || weekIndex < 0) throw new Error('Semaine invalide');
  if (level === 4) return [];
  return windows[level].flatMap((w, index) => w.days.map(day => {
    const arrivalMinute = weekIndex * WEEK + day * DAY + w.start;
    return { id: dockId + ':' + weekIndex + ':' + day + ':' + index, arrivalMinute, departureMinute: weekIndex * WEEK + day * DAY + w.end };
  })).sort((a, b) => a.arrivalMinute - b.arrivalMinute);
}
export function ferryStatus(gameMinute: number, level: PortLevel, dockId = 'ferry'): FerryStatus {
  assertLevel(level);
  if (!Number.isSafeInteger(gameMinute) || gameMinute < 0) throw new Error('Temps de navette invalide');
  if (level === 4) return { present: true, level, call: { id: dockId + ':permanent', arrivalMinute: 0, departureMinute: null }, nextArrivalMinute: 0, minutesUntilDeparture: null };
  const week = Math.floor(gameMinute / WEEK);
  const calls = [...callsForWeek(level, week, dockId), ...callsForWeek(level, week + 1, dockId)];
  const active = calls.find(c => c.arrivalMinute <= gameMinute && gameMinute < c.departureMinute!) ?? null;
  const next = calls.find(c => c.arrivalMinute > gameMinute);
  return { present: !!active, level, call: active, nextArrivalMinute: next?.arrivalMinute ?? null, minutesUntilDeparture: active ? active.departureMinute! - gameMinute : null };
}
/** Game-time events: only newly crossed boundaries, never replay past bells on reconnect. */
export function ferryEventsBetween(fromMinute: number, toMinute: number, level: PortLevel, dockId = 'ferry'): FerryEvent[] {
  if (!Number.isSafeInteger(fromMinute) || !Number.isSafeInteger(toMinute) || fromMinute < 0 || toMinute < fromMinute) throw new Error('Intervalle de navette invalide');
  if (fromMinute === toMinute || level === 4) return [];
  assertLevel(level);
  // If a long absence was skipped, do not replay historical bells or scan unbounded weeks.
  if (toMinute - fromMinute > WEEK) return [];
  const firstWeek = Math.floor(fromMinute / WEEK), lastWeek = Math.floor(toMinute / WEEK);
  const events: FerryEvent[] = [];
  for (let week = firstWeek; week <= lastWeek; week++) for (const c of callsForWeek(level, week, dockId)) {
    for (const [kind, at] of [['arrived', c.arrivalMinute], ['departure-warning', c.departureMinute! - 5], ['departed', c.departureMinute!]] as const) {
      if (at > fromMinute && at <= toMinute) events.push({ id: c.id + ':' + kind, kind, gameMinute: at });
    }
  }
  return events.sort((a, b) => a.gameMinute - b.gameMinute);
}
