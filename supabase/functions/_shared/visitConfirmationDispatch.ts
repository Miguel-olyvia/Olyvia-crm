// Passo do process-scheduled-emails que acorda a send-visit-confirmation quando ha
// confirmacoes de visita por tratar. Isolado aqui para se poder testar sem rede.
//
// Corre DEPOIS do lote de lembretes e sem o atrasar: com EdgeRuntime.waitUntil o
// pedido corre em segundo plano e a resposta sai logo; sem ele (ambientes sem
// waitUntil) espera-se pela resposta, como antes, mas ja a seguir ao lote.
// Fail-soft: nunca lanca, nem a promessa entregue ao waitUntil rejeita.

import { STALE_SENDING_MINUTES } from "./visitConfirmation.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any };

export interface DispatchDeps {
  supabase: SupabaseLike;
  /** URL completo da funcao send-visit-confirmation. */
  url: string;
  /** Cabecalho Authorization recebido pelo cron (a mesma credencial interna). */
  authorization: string;
  fetchFn?: typeof fetch;
  /** EdgeRuntime.waitUntil, quando existir. */
  waitUntil?: ((p: Promise<unknown>) => void) | null;
  now?: () => Date;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 25_000;

async function run(deps: DispatchDeps): Promise<unknown> {
  try {
    const now = (deps.now ?? (() => new Date()))();
    const nowIso = now.toISOString();
    const staleIso = new Date(now.getTime() - STALE_SENDING_MINUTES * 60_000).toISOString();
    // Por tratar = pendentes vencidas OU presas em 'sending' ha mais de STALE (a
    // limpeza da fila so corre quando a funcao e chamada).
    const { data, error } = await deps.supabase
      .from("visit_confirmation_sends")
      .select("id")
      .or(`and(status.eq.pending,next_attempt_at.lte.${nowIso}),and(status.eq.sending,claimed_at.lt.${staleIso})`)
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;

    const res = await (deps.fetchFn ?? fetch)(deps.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: deps.authorization },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    return await res.json().catch(() => ({ status: res.status }));
  } catch (err) {
    console.error("[process-scheduled-emails] visit confirmations failed (non-fatal):", err);
    return null;
  }
}

/**
 * Devolve o resumo da funcao, `null` (nada por tratar ou erro) ou 'scheduled'
 * (entregue ao waitUntil, a correr depois da resposta).
 */
export async function dispatchVisitConfirmations(deps: DispatchDeps): Promise<unknown> {
  if (typeof deps.waitUntil === "function") {
    const work = run(deps).then(() => undefined);
    deps.waitUntil(work);
    return "scheduled";
  }
  return await run(deps);
}
