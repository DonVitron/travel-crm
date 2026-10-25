import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PAGE_SIZE = 10;

export type PageParams = {
  page: number;
  pageSize: number;
  offset: number;
};

/**
 * Parses the `page` query parameter. Missing means page 1.
 * Throws 400 for anything that is not a positive, safe integer.
 */
export function parsePage(pageParam?: string): PageParams {
  if (pageParam !== undefined && !/^[1-9]\d*$/.test(pageParam)) {
    throw new BadRequestException('Page must be a positive integer.');
  }

  const page = pageParam === undefined ? 1 : Number(pageParam);

  if (!Number.isSafeInteger(page)) {
    throw new BadRequestException('Invalid page number.');
  }

  const pageSize = DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  if (!Number.isSafeInteger(offset)) {
    throw new BadRequestException('Invalid page number.');
  }

  return { page, pageSize, offset };
}

export function buildPage<T>(
  data: T[],
  total: number,
  { page, pageSize }: PageParams,
) {
  return {
    data,
    count: data.length,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
