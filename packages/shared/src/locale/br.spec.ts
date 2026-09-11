import { describe, expect, it } from 'vitest';
import {
  addressSchema,
  brazilianStates,
  cnpjSchema,
  cpfSchema,
  isValidCnpj,
  isValidCpf,
  isValidTaxId,
  onlyDigits,
  phoneSchema,
  pixKeyTypeSchema,
  postalCodeSchema,
  stateSchema,
  taxIdSchema,
} from './br';

const CPF = '52998224725';
const CNPJ = '11222333000181';

describe('onlyDigits', () => {
  it('keeps digits and drops everything else', () => {
    expect(onlyDigits('529.982.247-25')).toBe(CPF);
    expect(onlyDigits('11.222.333/0001-81')).toBe(CNPJ);
    expect(onlyDigits('no digits here')).toBe('');
  });
});

describe('isValidCpf', () => {
  it('accepts a CPF with correct check digits, masked or not', () => {
    expect(isValidCpf(CPF)).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('rejects wrong check digits and wrong lengths', () => {
    expect(isValidCpf('52998224726')).toBe(false);
    expect(isValidCpf('52998224735')).toBe(false);
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });

  /** Repeated sequences satisfy the mod-11 arithmetic, so they need their own guard. */
  it('rejects repeated digit sequences', () => {
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
  });

  it('covers the rest === 10 branch of the check digit', () => {
    // 111.444.777-35 is the canonical CPF whose first partial sum lands on 10.
    expect(isValidCpf('11144477735')).toBe(true);
  });
});

describe('isValidCnpj', () => {
  it('accepts a CNPJ with correct check digits, masked or not', () => {
    expect(isValidCnpj(CNPJ)).toBe(true);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('rejects wrong check digits and wrong lengths', () => {
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('11222333000191')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
  });

  it('rejects repeated digit sequences', () => {
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('99999999999999')).toBe(false);
  });
});

describe('isValidTaxId', () => {
  it('dispatches by digit count', () => {
    expect(isValidTaxId(CPF)).toBe(true);
    expect(isValidTaxId(CNPJ)).toBe(true);
    expect(isValidTaxId('529.982.247-25')).toBe(true);
  });

  it('rejects anything that is neither 11 nor 14 digits', () => {
    expect(isValidTaxId('123')).toBe(false);
    expect(isValidTaxId('529982247250')).toBe(false);
    expect(isValidTaxId('')).toBe(false);
  });
});

describe('document schemas', () => {
  /** The transform is the contract: what reaches the database is digits only. */
  it('strips the mask before validating and stores digits only', () => {
    expect(cpfSchema.parse('529.982.247-25')).toBe(CPF);
    expect(cnpjSchema.parse('11.222.333/0001-81')).toBe(CNPJ);
    expect(taxIdSchema.parse('529.982.247-25')).toBe(CPF);
    expect(taxIdSchema.parse('11.222.333/0001-81')).toBe(CNPJ);
  });

  it('rejects invalid documents', () => {
    expect(cpfSchema.safeParse('111.111.111-11').success).toBe(false);
    expect(cnpjSchema.safeParse('11.222.333/0001-82').success).toBe(false);
    expect(taxIdSchema.safeParse('123').success).toBe(false);
  });
});

describe('postalCodeSchema', () => {
  it('accepts 8 digits, masked or not', () => {
    expect(postalCodeSchema.parse('01310-100')).toBe('01310100');
    expect(postalCodeSchema.parse('01310100')).toBe('01310100');
  });

  it('rejects any other length', () => {
    expect(postalCodeSchema.safeParse('0131010').success).toBe(false);
    expect(postalCodeSchema.safeParse('013101000').success).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('accepts landline (10) and mobile (11) digits', () => {
    expect(phoneSchema.parse('(11) 3456-7890')).toBe('1134567890');
    expect(phoneSchema.parse('(11) 98765-4321')).toBe('11987654321');
  });

  it('rejects numbers without an area code or too long', () => {
    expect(phoneSchema.safeParse('34567890').success).toBe(false);
    expect(phoneSchema.safeParse('119876543210').success).toBe(false);
  });
});

describe('states and pix keys', () => {
  it('lists the 27 federative units', () => {
    expect(brazilianStates).toHaveLength(27);
    expect(stateSchema.parse('SP')).toBe('SP');
    expect(stateSchema.safeParse('XX').success).toBe(false);
  });

  it('accepts only the known pix key kinds', () => {
    expect(pixKeyTypeSchema.parse('RANDOM')).toBe('RANDOM');
    expect(pixKeyTypeSchema.safeParse('IBAN').success).toBe(false);
  });
});

describe('addressSchema', () => {
  it('normalises the postal code and defaults the country to BR', () => {
    const parsed = addressSchema.parse({
      postalCode: '01310-100',
      street: 'Av. Paulista',
      number: '1000',
      city: 'São Paulo',
      state: 'SP',
    });

    expect(parsed.postalCode).toBe('01310100');
    expect(parsed.country).toBe('BR');
    expect(parsed.complement).toBeUndefined();
  });

  it('rejects an unknown state or a missing street', () => {
    const base = { postalCode: '01310100', street: 'Av. Paulista', city: 'São Paulo' };
    expect(addressSchema.safeParse({ ...base, state: 'XX' }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, street: '', state: 'SP' }).success).toBe(false);
  });
});
