/**
 * Contact normalization used to recognise the same person across leads.
 * normalizePhone() must stay in sync with the SQL in the
 * LeadPoolAndClientDedupe migration.
 */

export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

/**
 * Keeps digits and a single leading "+". Returns null when no digits remain.
 *   "+1 (555) 010-0100" -> "+15550100100"
 *   "555 010 0100"      -> "5550100100"
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/[^0-9]/g, '');

  if (!digits) {
    return null;
  }

  return (phone.trim().startsWith('+') ? '+' : '') + digits;
}
