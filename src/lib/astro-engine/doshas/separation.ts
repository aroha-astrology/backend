/**
 * Shortest angular distance between two sidereal longitudes, in degrees (0 to 180), rounded to
 * 0.01. It crosses sign edges and the 0/360 line, so two planets 2 degrees apart in different
 * signs read 2, not 28. Audit Sprint 9 (G2): shown as data next to every node conjunction; it never
 * changes whether a dosha is present (the same-house rule stays).
 */
export function separationDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.round((d > 180 ? 360 - d : d) * 100) / 100;
}
