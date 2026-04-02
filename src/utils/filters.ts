const EXCLUDED_PATTERNS = [
  /^xExpenses/i,
  /^z - Time Management$/i,
  /^Client$/i,
];

export function isExcludedClient(name: string): boolean {
  return EXCLUDED_PATTERNS.some((p) => p.test(name));
}

export function isDueDiligenceProject(projectName: string): boolean {
  const lower = projectName.toLowerCase();
  return lower.includes("deals") || lower.includes("diligence");
}

export function isDueDiligenceEntry(notes: string): boolean {
  return notes.trim().toLowerCase().startsWith("project ");
}

export function parseDealName(notes: string): string | null {
  const trimmed = notes.trim();
  if (!trimmed.toLowerCase().startsWith("project ")) return null;
  const afterProject = trimmed.substring(8);
  const dashIndex = afterProject.indexOf(" - ");
  return dashIndex >= 0 ? afterProject.substring(0, dashIndex).trim() : afterProject.trim();
}

export function daysAgo(daysBack: number, referenceDate: string): string {
  const ref = new Date(referenceDate + "T00:00:00Z");
  ref.setUTCDate(ref.getUTCDate() - daysBack + 1);
  return ref.toISOString().split("T")[0];
}

export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}
