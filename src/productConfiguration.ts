import { api } from './api';

export type ConfigurationAttempt = Readonly<{productId: number; body: string; key: string}>;

/** Called only by an explicit save/retry. A negative lookup keeps the exact original request. */
export async function resolveProductSave(attempt: ConfigurationAttempt, token: string, uncertain: boolean): Promise<boolean> {
  if (uncertain) {
    const result = await api<{operation: {id: number} | null}>(`/products/${attempt.productId}/configuration/operation?key=${encodeURIComponent(attempt.key)}`, token, {cache: 'reload'});
    if (result.operation) return true;
  }
  await api(`/products/${attempt.productId}/configuration`, token, {method: 'PUT', body: attempt.body});
  return false;
}
