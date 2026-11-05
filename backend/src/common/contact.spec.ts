import { normalizeEmail, normalizePhone } from './contact.js';

describe('normalizePhone', () => {
  it.each([
    ['+1 (555) 010-0100', '+15550100100'],
    ['555 010 0100', '5550100100'],
    ['  +373 69 123 456 ', '+37369123456'],
    ['tel: 555-0100', '5550100'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   ', '+', 'n/a'])('%j -> null', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('keeps a + only when it leads', () => {
    expect(normalizePhone('555+0100')).toBe('5550100');
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com');
  });

  it.each([null, undefined, '', '  '])('%j -> null', (input) => {
    expect(normalizeEmail(input)).toBeNull();
  });
});
