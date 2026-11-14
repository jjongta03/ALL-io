export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function seoulDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function seoulMorning(date: string): Date {
  return new Date(`${date}T09:00:00+09:00`);
}
export function reminderSchedule(deadline: string, now: Date) {
  return [7, 3]
    .map((days) => ({ type: `D-${days}`, scheduledAt: seoulMorning(addDays(deadline, -days)) }))
    .filter((r) => r.scheduledAt.getTime() > now.getTime());
}
