/**
 * ESPELHO (mirror) dos guardas de segurança de `client-portal-action/index.ts`.
 *
 * ⚠️  ESTE FICHEIRO NÃO É IMPORTADO PELO CÓDIGO DE PRODUÇÃO.
 *     `index.ts` não o conhece. Existe apenas para os testes.
 *
 * ── Porquê um espelho em vez de extrair os helpers ──────────────────────
 * Os helpers (`resolveDocEntity`, `assertOwnership`, `consumeVerifiedOtp`,
 * `sanitizeReason`, `stripCosts`) vivem dentro do `serve()` de `index.ts`,
 * fechados sobre `supabase` e `user`. Não são importáveis.
 *
 * Extraí-los para `_shared/` daria testes da implementação verdadeira, mas
 * obrigaria a editar uma função que serve todos os clientes do portal em
 * produção, cujo deploy é manual e directo, e que hoje não tem teste nenhum
 * — ou seja, a rede de segurança teria de ser construída *depois* da
 * alteração que ela devia proteger. É exactamente a ordem errada, e é a
 * mesma decisão já tomada e documentada neste repositório para
 * `create-user/index.test.ts`, `auto-schedule/index.test.ts` e
 * `send-schedule-invite/index.test.ts` ("extracting a handler.ts here would
 * itself be a behavior-risking edit to security-sensitive code, and should
 * go through its own reviewed, test-first change rather than being smuggled
 * in as a side effect of 'just adding a test'").
 *
 * ── Como é que este espelho não diverge do original ─────────────────────
 * O corpo de cada função abaixo é uma transcrição LITERAL, carácter a
 * carácter, do corpo correspondente em `index.ts` (só muda a indentação e o
 * facto de `supabase`/`user` chegarem por parâmetro em vez de por closure —
 * daí o parâmetro chamar-se `user` e ser `{ id: string }`, para que
 * `user.id` no corpo seja texto idêntico ao do original).
 *
 * `sourceDrift.test.ts` lê os dois ficheiros em bruto e compara o texto
 * normalizado de cada bloco. Se alguém editar um destes helpers em
 * `index.ts` sem actualizar este espelho, o CI falha e obriga a olhar para
 * os testes de comportamento antes de a alteração passar. É isso que
 * impede o problema clássico do teste de contrato: divergir em silêncio da
 * implementação real.
 *
 * SE ALTERARES `index.ts`, ACTUALIZA ESTE FICHEIRO NA MESMA ALTERAÇÃO.
 *
 * Fonte: supabase/functions/client-portal-action/index.ts
 *   - resolveDocEntity      ~ linhas 95-133
 *   - assertOwnership       ~ linhas 136-160
 *   - consumeVerifiedOtp    ~ linhas 198-236
 *   - sanitizeReason        ~ linhas 246-251
 *   - SENSITIVE_LINE_COLUMNS / stripCosts ~ linhas 486-498
 */

// ── Forma mínima do cliente Supabase usada pelos helpers ────────────────
// Estrutural de propósito: os testes injectam um duplo em memória e o
// código de produção usa o cliente real do supabase-js. Assim este módulo
// não depende de `npm:@supabase/supabase-js`, que o `deno test` não
// consegue resolver neste repositório sem `node_modules`.

export interface PortalResult {
  // deno-lint-ignore no-explicit-any
  data: any;
  // deno-lint-ignore no-explicit-any
  error?: any;
}

export interface PortalQuery extends PromiseLike<PortalResult> {
  select(columns?: string): PortalQuery;
  update(patch: Record<string, unknown>): PortalQuery;
  eq(column: string, value: unknown): PortalQuery;
  is(column: string, value: unknown): PortalQuery;
  not(column: string, operator: string, value: unknown): PortalQuery;
  gte(column: string, value: unknown): PortalQuery;
  order(column: string, options?: { ascending?: boolean }): PortalQuery;
  limit(count: number): PortalQuery;
  maybeSingle(): Promise<PortalResult>;
}

export interface PortalSupabaseLike {
  from(table: string): PortalQuery;
}

/**
 * Devolve os guardas ligados a um (supabase, user) — o equivalente às
 * closures que `index.ts` cria dentro do `serve()`.
 */
export function makePortalGuards(
  supabase: PortalSupabaseLike,
  user: { id: string },
) {
  // ── Resolve (entity_id, organization_id) for a document column ──
  // Shared by assertOwnership and resolveAuthorizedPortalUserId.
  async function resolveDocEntity(
    column: "proposal_id" | "quote_id" | "contract_id",
    id: string,
  ): Promise<{ entityId: string | null; orgId: string | null }> {
    if (!id) return { entityId: null, orgId: null };
    let entityId: string | null = null;
    let orgId: string | null = null;
    if (column === "proposal_id") {
      const { data: p } = await supabase.from("proposals")
        .select("entity_id, organization_id").eq("id", id).maybeSingle();
      entityId = (p as any)?.entity_id || null;
      orgId = (p as any)?.organization_id || null;
    } else if (column === "contract_id") {
      const { data: c } = await supabase.from("client_contracts")
        .select("entity_id, organization_id").eq("id", id).maybeSingle();
      entityId = (c as any)?.entity_id || null;
      orgId = (c as any)?.organization_id || null;
    } else if (column === "quote_id") {
      const { data: q } = await supabase.from("quotes")
        .select("entity_id, organization_id, deal_id, proposal_id").eq("id", id).maybeSingle();
      entityId = (q as any)?.entity_id || null;
      orgId = (q as any)?.organization_id || null;
      // Fallback 1: via parent proposal
      if (!entityId && (q as any)?.proposal_id) {
        const { data: pp } = await supabase.from("proposals")
          .select("entity_id, organization_id").eq("id", (q as any).proposal_id).maybeSingle();
        entityId = entityId || (pp as any)?.entity_id || null;
        orgId = orgId || (pp as any)?.organization_id || null;
      }
      // Fallback 2: via deal
      if (!entityId && (q as any)?.deal_id) {
        const { data: d } = await supabase.from("deals")
          .select("entity_id, organization_id").eq("id", (q as any).deal_id).maybeSingle();
        entityId = entityId || (d as any)?.entity_id || null;
        orgId = orgId || (d as any)?.organization_id || null;
      }
    }
    return { entityId, orgId };
  }

  // ── IDOR GUARD: direct portal-user row match, with entity_id fallback ──
  async function assertOwnership(column: "proposal_id" | "quote_id" | "contract_id", id: string): Promise<boolean> {
    if (!id) return false;

    // 1) Direct match: this portal user has a row for this exact document
    const { data: direct } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq(column, id)
      .maybeSingle();
    if (direct) return true;

    // 2) Entity-scoped fallback (uses resolveDocEntity to handle quote→proposal→deal chain)
    const { entityId, orgId } = await resolveDocEntity(column, id);
    if (!entityId || !orgId) return false;

    const { data: scoped } = await supabase
      .from("client_portal_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("entity_id", entityId)
      .eq("organization_id", orgId)
      .limit(1);
    return !!(scoped && scoped.length > 0);
  }

  // ── OTP single-use guard: atomically claim a verified OTP. ──
  async function consumeVerifiedOtp(
    referenceType: "proposal" | "contract",
    referenceId: string,
    purpose: string,
  ): Promise<{ ok: boolean; otpId?: string }> {
    if (!referenceId || !purpose) return { ok: false };
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    // 1) Select the most recent eligible OTP id
    const { data: candidate } = await supabase
      .from("sms_otp_codes")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("reference_id", referenceId)
      .eq("reference_type", referenceType)
      .eq("purpose", purpose)
      .not("verified_at", "is", null)
      .is("consumed_at", null)
      .gte("verified_at", tenMinAgo)
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!candidate) return { ok: false };
    const otpId = (candidate as any).id;

    // 2) Atomically consume that specific id (guards against race within the window)
    const { data: claimed, error } = await supabase
      .from("sms_otp_codes")
      .update({ consumed_at: nowIso })
      .eq("id", otpId)
      .is("consumed_at", null)
      .gte("verified_at", tenMinAgo)
      .select("id");

    if (error || !claimed || claimed.length === 0) return { ok: false };
    return { ok: true, otpId };
  }

  return { resolveDocEntity, assertOwnership, consumeVerifiedOtp };
}

// Validate rejection reason text (10..500 chars, basic HTML strip)
export function sanitizeReason(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const stripped = text.replace(/<[^>]*>/g, "").trim();
  if (stripped.length < 10 || stripped.length > 500) return null;
  return stripped;
}

// Never leaves the server: costs and margins are internal.
export const SENSITIVE_LINE_COLUMNS = [
  "cost_price",
  "custo_mao_obra_unit",
  "custo_material_unit",
  "margem_percent",
];

export const stripCosts = (row: Record<string, unknown>) => {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!SENSITIVE_LINE_COLUMNS.includes(key)) clean[key] = value;
  }
  return clean;
};
