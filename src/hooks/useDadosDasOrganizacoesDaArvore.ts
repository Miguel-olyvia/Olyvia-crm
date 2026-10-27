/**
 * O NIF, a morada e a organizacao-mae de cada organizacao da arvore da organizacao activa (ela e as descendentes em
 * `anew_hierarchy`), para a pagina «Organizacao» do RH. Le as mesmas fontes que `useOrgHeaderData` usa para a organizacao
 * activa, mas para todas de uma vez:
 *  - NIF: `anew_organizations.metadata` (`vat` ou `nif`). O NIF da entidade fiscal (`anew_entity_fiscal_entities`) so se
 *    le pelo servico de revelacao, um pedido por entidade: esse caminho fica de fora, e uma organizacao que so o tenha ali
 *    aparece sem NIF (nunca um valor inventado).
 *  - morada: `anew_org_addresses` (a fiscal primeiro, so as vigentes) + `anew_addresses`.
 *  - organizacao-mae: `anew_hierarchy` (`child_org_id` -> `parent_org_id`).
 *
 * Um pedido que falhe sobe em `error` (a pagina avisa); os campos em falta ficam vazios, e uma recusa de leitura da
 * RLS devolve linhas a menos, sem erro, o que tambem se traduz em campos vazios.
 */
import { useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { useDescendantOrgIds } from "@/hooks/useDescendantOrgIds";
import { selectInBatchesOrThrow } from "@/hooks/useEntityIdentity";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

export interface DadosDaOrganizacao {
  id: string;
  /** Vazio = a base nao tem NIF para esta organizacao. */
  nif: string;
  /** Vazio = a base nao tem morada para esta organizacao. */
  morada: string;
  /** A organizacao-mae dentro da arvore; `null` = e a raiz (ou a mae esta fora da arvore). */
  paiId: string | null;
}

interface MoradaLida {
  street?: string | null;
  number?: string | null;
  postal_code?: string | null;
  city?: string | null;
}

/** A morada numa linha, como o cabecalho dos contratos a escreve. */
export function juntarMorada(a: MoradaLida | null | undefined): string {
  if (!a || typeof a !== "object") return "";
  return [a.street, a.number, a.postal_code, a.city]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean)
    .join(", ");
}

/** O NIF escrito nos metadados da organizacao (`vat` ou `nif`), aparado. */
export function nifDosMetadados(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const m = metadata as { vat?: unknown; nif?: unknown };
  const valor = m.vat || m.nif;
  return valor == null ? "" : String(valor).trim();
}

interface LinhaOrg {
  id: string;
  metadata: unknown;
}
interface LinhaHierarquia {
  child_org_id: string;
  parent_org_id: string | null;
}
interface LinhaMorada {
  org_id: string;
  is_fiscal: boolean | null;
  anew_addresses: MoradaLida | MoradaLida[] | null;
}

/** Junta as tres leituras. Puro, para se poder testar sem base. */
export function montarDadosDasOrganizacoes(
  ids: readonly string[],
  orgs: readonly LinhaOrg[],
  hierarquia: readonly LinhaHierarquia[],
  moradas: readonly LinhaMorada[],
): Map<string, DadosDaOrganizacao> {
  const naArvore = new Set(ids);
  const nifs = new Map(orgs.map((o) => [o.id, nifDosMetadados(o.metadata)]));
  const paiDe = new Map<string, string>();
  for (const h of hierarquia) {
    if (h.parent_org_id && naArvore.has(h.parent_org_id)) paiDe.set(h.child_org_id, h.parent_org_id);
  }
  // A fiscal primeiro; entre iguais, a primeira que veio.
  const moradaDe = new Map<string, { fiscal: boolean; texto: string }>();
  for (const m of moradas) {
    const endereco = Array.isArray(m.anew_addresses) ? m.anew_addresses[0] : m.anew_addresses;
    const texto = juntarMorada(endereco);
    if (!texto) continue;
    const fiscal = m.is_fiscal === true;
    const atual = moradaDe.get(m.org_id);
    if (!atual || (fiscal && !atual.fiscal)) moradaDe.set(m.org_id, { fiscal, texto });
  }
  return new Map(
    ids.map((id) => [id, { id, nif: nifs.get(id) ?? "", morada: moradaDe.get(id)?.texto ?? "", paiId: paiDe.get(id) ?? null }]),
  );
}

export function useDadosDasOrganizacoesDaArvore() {
  const { activeCompany } = useCompany();
  const { orgIds, loading: idsA } = useDescendantOrgIds();
  const [dados, setDados] = useState<Map<string, DadosDaOrganizacao>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCompany?.id || (!idsA && orgIds.length === 0)) {
      setDados(new Map());
      setError(null);
      setLoading(false);
      return;
    }
    if (idsA) {
      setLoading(true);
      return;
    }

    let cancelado = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const [orgs, hierarquia, moradas] = await Promise.all([
          selectInBatchesOrThrow<LinhaOrg>(orgIds, (lote) =>
            (supabase as any).from("anew_organizations").select("id, metadata").in("id", lote),
          ),
          selectInBatchesOrThrow<LinhaHierarquia>(orgIds, (lote) =>
            (supabase as any).from("anew_hierarchy").select("child_org_id, parent_org_id").in("child_org_id", lote),
          ),
          selectInBatchesOrThrow<LinhaMorada>(orgIds, (lote) =>
            (supabase as any)
              .from("anew_org_addresses")
              .select("org_id, is_fiscal, anew_addresses(street, number, postal_code, city)")
              .in("org_id", lote)
              .is("valid_to", null)
              .order("is_fiscal", { ascending: false }),
          ),
        ]);
        if (cancelado) return;
        setDados(montarDadosDasOrganizacoes(orgIds, orgs, hierarquia, moradas));
      } catch (e) {
        if (cancelado) return;
        captureFlowError(e, "hr-colocacao-organograma-load");
        setDados(new Map());
        setError(await getFriendlyErrorMessage(e));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [activeCompany?.id, orgIds, idsA]);

  return { dados, loading, error };
}
