import { randomUUID } from 'crypto';

export function makeId(): string {
  return randomUUID();
}

export function nextEmployeeCode(existingCodes: string[]): string {
  if (existingCodes.length === 0) return 'EMP0001';
  const numericParts = existingCodes
    .map((code) => Number(String(code).replace('EMP', '')) || 0)
    .sort((a, b) => b - a);
  const max = numericParts[0] || 0;
  return `EMP${String(max + 1).padStart(4, '0')}`;
}
