import { BadRequestException } from '@nestjs/common';
import { parseStaleHours } from './stale-hours.js';

describe('parseStaleHours', () => {
  it('defaults to 24', () => {
    expect(parseStaleHours(undefined)).toBe(24);
  });

  it('accepts whole numbers up to a year', () => {
    expect(parseStaleHours('1')).toBe(1);
    expect(parseStaleHours('48')).toBe(48);
    expect(parseStaleHours('8760')).toBe(8760);
  });

  it.each(['0', '-5', '1.5', 'abc', '', '8761', '99999999999999999999'])(
    'rejects %j',
    (value) => {
      expect(() => parseStaleHours(value)).toThrow(BadRequestException);
    },
  );
});
