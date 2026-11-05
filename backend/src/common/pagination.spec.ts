import { BadRequestException } from '@nestjs/common';
import { buildPage, parsePage } from './pagination.js';

describe('parsePage', () => {
  it('defaults to page 1', () => {
    expect(parsePage(undefined)).toEqual({ page: 1, pageSize: 10, offset: 0 });
  });

  it('computes the offset', () => {
    expect(parsePage('3')).toEqual({ page: 3, pageSize: 10, offset: 20 });
  });

  it.each(['0', '-1', '1.5', 'abc', '', '01', '1e3'])(
    'rejects %j',
    (value) => {
      expect(() => parsePage(value)).toThrow(BadRequestException);
    },
  );

  it('rejects numbers beyond the safe integer range', () => {
    expect(() => parsePage('9007199254740993')).toThrow(BadRequestException);
  });
});

describe('buildPage', () => {
  it('returns totals and page count', () => {
    const result = buildPage([1, 2, 3], 25, { page: 2, pageSize: 10, offset: 10 });
    expect(result).toEqual({
      data: [1, 2, 3],
      count: 3,
      total: 25,
      page: 2,
      pageSize: 10,
      totalPages: 3,
    });
  });
});
