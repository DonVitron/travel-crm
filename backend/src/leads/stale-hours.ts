import { BadRequestException } from '@nestjs/common';

export const DEFAULT_STALE_HOURS = 24;
const MAX_STALE_HOURS = 24 * 365;

/** Parses the `hours` query parameter for the stale-leads report. */
export function parseStaleHours(hoursParam?: string): number {
  if (hoursParam === undefined) {
    return DEFAULT_STALE_HOURS;
  }

  const hours = /^[1-9]\d*$/.test(hoursParam) ? Number(hoursParam) : NaN;

  if (!Number.isSafeInteger(hours) || hours > MAX_STALE_HOURS) {
    throw new BadRequestException(
      `Hours must be a whole number between 1 and ${MAX_STALE_HOURS}.`,
    );
  }

  return hours;
}
