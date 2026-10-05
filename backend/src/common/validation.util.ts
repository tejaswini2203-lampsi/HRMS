import { BadRequestException } from '@nestjs/common';

export function parsePositiveInt(value: unknown, fieldName: string): number {
  const num =
    typeof value === 'number' ? value : Number(String(value ?? '').trim());

  if (!Number.isInteger(num) || num <= 0) {
    throw new BadRequestException(`Invalid ${fieldName}`);
  }

  return num;
}

export function requireNonEmptyString(
  value: unknown,
  fieldName: string,
  maxLength?: number,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  const trimmed = value.trim();
  if (maxLength !== undefined && trimmed.length > maxLength) {
    throw new BadRequestException(
      `${fieldName} must be at most ${maxLength} characters`,
    );
  }

  return trimmed;
}

export function optionalString(
  value: unknown,
  fieldName: string,
  maxLength?: number,
): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();
  if (maxLength !== undefined && trimmed.length > maxLength) {
    throw new BadRequestException(
      `${fieldName} must be at most ${maxLength} characters`,
    );
  }

  return trimmed;
}

export function requireDateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new BadRequestException(
      `${fieldName} must be a valid date in YYYY-MM-DD format`,
    );
  }

  const date = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${fieldName} must be a valid date`);
  }

  return trimmed;
}

export function optionalDateString(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return requireDateString(value, fieldName);
}

export function optionalPositiveInt(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return parsePositiveInt(value, fieldName);
}

export function daysUntil(dateString: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateString}T00:00:00`);
  const diffMs = target.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function optionalEmail(
  value: unknown,
  fieldName = 'email',
): string | null {
  const email = optionalString(value, fieldName, 255);
  if (email === null) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException(`${fieldName} must be a valid email address`);
  }
  return email;
}

export function requireLeaveDayType(value: unknown): 'FULL' | 'HALF' {
  const raw = requireNonEmptyString(value, 'leaveDayType', 20).toUpperCase();
  const normalized =
    raw === 'FULL DAY' || raw === 'FULL'
      ? 'FULL'
      : raw === 'HALF DAY' || raw === 'HALF'
        ? 'HALF'
        : null;
  if (!normalized) {
    throw new BadRequestException('leaveDayType must be FULL or HALF');
  }
  return normalized;
}

export function optionalLeaveDayType(
  value: unknown,
): 'FULL' | 'HALF' | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return requireLeaveDayType(value);
}
