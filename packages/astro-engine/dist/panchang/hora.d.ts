import type { Hora } from '@jyotish-ai/shared';
/**
 * Calculate the current planetary hora.
 *
 * The day is divided into 24 horas (not necessarily 60 minutes each).
 * Day horas: sunrise to sunset divided into 12 equal parts.
 * Night horas: sunset to next sunrise divided into 12 equal parts.
 * The first hora of the day belongs to the weekday lord, then cycles
 * through the Chaldean order.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param currentTime - Current time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, ..., 6=Saturday)
 * @returns Hora object with ruling planet, time range, and auspiciousness
 */
export declare function calculateHora(sunrise: string, currentTime: string, dayOfWeek: number): Hora;
//# sourceMappingURL=hora.d.ts.map