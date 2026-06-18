import type { PostgrestSingleResponse, PostgrestResponse } from "@supabase/supabase-js";

/**
 * Awaits a Supabase/Postgrest thenable and returns `data` typed as `T`.
 * Throws an Error (with original error attached as `cause`) when the response
 * carries a non-null `error`. Intended for mutations and SELECTs whose result
 * is required by the caller's decision flow — do NOT use on tolerant/fallback
 * queries that intentionally swallow errors.
 */
type AnyResp<T> = PostgrestSingleResponse<T> | PostgrestResponse<T>;

export async function assertNoSupabaseError<T>(
  q: PromiseLike<AnyResp<T>>,
  context?: string,
): Promise<T> {
  const { data, error } = await q;
  if (error) {
    const msg = context ? `[${context}] ${error.message}` : error.message;
    const e = new Error(msg);
    (e as any).cause = error;
    throw e;
  }
  return data as T;
}
