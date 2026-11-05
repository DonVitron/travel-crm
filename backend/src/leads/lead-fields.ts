import { BadRequestException } from '@nestjs/common';

export type LeadFieldsBody = {
  customerName?: unknown;
  customerEmail?: unknown;
  customerPhone?: unknown;
  notes?: unknown;
  assignedAgentId?: unknown;
};

export type LeadFields = {
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Empty / missing optional values become null; wrong types become undefined. */
function optionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return typeof value === 'string' ? value.trim() : undefined;
}

/**
 * Validates and normalizes the customer fields shared by lead creation and
 * lead detail updates. Messages are unchanged from the original controller.
 */
export function parseLeadFields(body: LeadFieldsBody | undefined): LeadFields {
  const input = body ?? {};

  const customerName =
    typeof input.customerName === 'string' ? input.customerName.trim() : '';

  if (!customerName || customerName.length > 160) {
    throw new BadRequestException(
      'Customer name is required and must be at most 160 characters.',
    );
  }

  const rawEmail = optionalString(input.customerEmail);
  const customerEmail =
    typeof rawEmail === 'string' ? rawEmail.toLowerCase() : rawEmail;

  if (
    customerEmail === undefined ||
    (customerEmail !== null &&
      (customerEmail.length > 254 || !EMAIL_PATTERN.test(customerEmail)))
  ) {
    throw new BadRequestException('Please provide a valid email address.');
  }

  const customerPhone = optionalString(input.customerPhone);

  if (
    customerPhone === undefined ||
    (customerPhone !== null && customerPhone.length > 40)
  ) {
    throw new BadRequestException('Phone number must be at most 40 characters.');
  }

  const notes = optionalString(input.notes);

  if (notes === undefined || (notes !== null && notes.length > 5000)) {
    throw new BadRequestException(
      'Notes must be text no longer than 5000 characters.',
    );
  }

  return { customerName, customerEmail, customerPhone, notes };
}
