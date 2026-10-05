import { BadRequestException } from '@nestjs/common';

export const SUBSIDIARY_IDS = ['uae', 'saudi', 'india'] as const;
export type SubsidiaryId = (typeof SUBSIDIARY_IDS)[number];

const EMAIL_DOMAINS: Record<SubsidiaryId, string> = {
  uae: 'eics-uae.com',
  saudi: 'eics-sa.com',
  india: 'eics-india.com',
};

export function parseSubsidiaryId(
  value: string | null | undefined,
): SubsidiaryId | null {
  const id = String(value || '')
    .trim()
    .toLowerCase();
  return SUBSIDIARY_IDS.includes(id as SubsidiaryId)
    ? (id as SubsidiaryId)
    : null;
}

export function requireSubsidiaryId(
  value: string | null | undefined,
  field = 'subsidiaryId',
): SubsidiaryId {
  const id = parseSubsidiaryId(value);
  if (!id) {
    throw new BadRequestException(
      `${field} must be one of: ${SUBSIDIARY_IDS.join(', ')}`,
    );
  }
  return id;
}

export function regionalEmailDomain(subsidiaryId: SubsidiaryId): string {
  return EMAIL_DOMAINS[subsidiaryId] || EMAIL_DOMAINS.uae;
}

export function buildRegionalUsername(
  firstName: string,
  lastName: string,
  empId: number,
  subsidiaryId: SubsidiaryId,
  preferredEmail?: string | null,
): string {
  const trimmed = preferredEmail?.trim().toLowerCase();
  if (trimmed) return trimmed;

  const domain = regionalEmailDomain(subsidiaryId);
  const local = `${firstName}.${lastName}${empId}`
    .replace(/\s+/g, '')
    .toLowerCase();
  return `${local}@${domain}`;
}
