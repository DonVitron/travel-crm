import { BadRequestException } from '@nestjs/common';
import { parseLeadFields } from './lead-fields.js';

describe('parseLeadFields', () => {
  it('trims and normalizes valid input', () => {
    expect(
      parseLeadFields({
        customerName: '  Ana Pop ',
        customerEmail: ' ANA@Example.COM ',
        customerPhone: ' +1 555 0100 ',
        notes: ' prefers morning flights ',
      }),
    ).toEqual({
      customerName: 'Ana Pop',
      customerEmail: 'ana@example.com',
      customerPhone: '+1 555 0100',
      notes: 'prefers morning flights',
    });
  });

  it('turns empty optional fields into null', () => {
    expect(
      parseLeadFields({
        customerName: 'Ana',
        customerEmail: '',
        customerPhone: null,
      }),
    ).toEqual({
      customerName: 'Ana',
      customerEmail: null,
      customerPhone: null,
      notes: null,
    });
  });

  it('requires a name', () => {
    expect(() => parseLeadFields({})).toThrow(BadRequestException);
    expect(() => parseLeadFields(undefined)).toThrow(BadRequestException);
    expect(() => parseLeadFields({ customerName: '   ' })).toThrow(
      BadRequestException,
    );
  });

  it('enforces length limits', () => {
    const name = 'a'.repeat(161);
    expect(() => parseLeadFields({ customerName: name })).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseLeadFields({ customerName: 'Ana', customerPhone: '1'.repeat(41) }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseLeadFields({ customerName: 'Ana', notes: 'x'.repeat(5001) }),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid emails and wrong types', () => {
    expect(() =>
      parseLeadFields({ customerName: 'Ana', customerEmail: 'not-an-email' }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseLeadFields({ customerName: 'Ana', customerEmail: 42 }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseLeadFields({ customerName: 'Ana', notes: { a: 1 } }),
    ).toThrow(BadRequestException);
  });
});
