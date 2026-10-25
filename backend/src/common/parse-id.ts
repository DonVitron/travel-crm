import { BadRequestException } from '@nestjs/common';

/** Validates a positive integer id given as a string and returns it unchanged. */
export function parseLeadId(id: string): string {
  if (!/^[1-9]\d*$/.test(id)) {
    throw new BadRequestException('Invalid lead ID.');
  }
  return id;
}

/** Validates a client id and returns it as a safe integer. */
export function parseClientId(id: string): number {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new BadRequestException('Invalid client ID.');
  }
  return Number(id);
}
