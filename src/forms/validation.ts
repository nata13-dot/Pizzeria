import { money } from '../money';

// One decimal separator, no thousands separators, exponent notation or partial parsing.
export function decimalInput(value: string): number {
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return NaN;
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}
export function moneyInput(value: string): number {
  if (!Number.isFinite(decimalInput(value)) || decimalInput(value) < 0) return NaN;
  try { return money(value.trim().replace(',', '.')); } catch { return NaN; }
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function validLocalDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && validDate(value.slice(0,10));
}
export function required(value: string, label: string): string {
  return value.trim() ? '' : `Ingresa ${label}.`;
}
export function emailError(value: string): string {
  return !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? '' : 'Ingresa un correo como nombre@dominio.com.';
}
export type FieldErrors = Record<string, string>;
export function validationFields(error: unknown, labels: Record<string,string>): FieldErrors {
  if (!error || typeof error !== 'object' || !('status' in error) || error.status !== 422 || !('errors' in error) || !error.errors || typeof error.errors !== 'object') return {};
  const keys = Object.keys(error.errors);
  return Object.fromEntries(Object.entries(labels).filter(([key])=>keys.some(field=>field===key || (field.startsWith(`${key}.`) && !labels[field]))).map(([key,label])=>[key,`Revisa ${label}; el valor no fue aceptado. Corrígelo antes de guardar.`]));
}
export function operationError(error: unknown, action: string, uncertain = false): string {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  // Diagnostic metadata only: never log a response, SQL, contact data or tokens.
  console.warn('No se completó una operación', { action, status });
  if(status === 401)return 'Tu sesión venció. Inicia sesión nuevamente.';
  if(status === 403)return 'No tienes permiso para esta acción. Solicita ayuda a un administrador.';
  if(status === 422)return `No pudimos ${action}. Revisa los campos indicados y las opciones seleccionadas.`;
  if(status === 409)return `No pudimos ${action} porque los datos cambiaron. Revisa su estado actual antes de continuar.`;
  return uncertain ? `No pudimos confirmar el resultado al ${action}. Revisa el registro antes de repetir la acción.` : `No pudimos ${action}. Revisa tu conexión e intenta nuevamente.`;
}
