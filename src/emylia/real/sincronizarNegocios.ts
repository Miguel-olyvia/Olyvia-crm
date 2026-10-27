// CRM: grava os negócios que mudaram no ecrã da Emylia. Depois de cada ação compara cada negócio com a última fotografia (o que a base
// tem); o que mudou grava-se com neg_guardar_negocio (negocioBase.ts). Um negócio que ainda não existe na base (o "Novo negócio" da
// Emylia) cria-se primeiro pelo caminho do CRM: a "Nova lead" (pessoa em anew_entities + negócio por neg_criar_negocio). O número que a
// base lhe dá passa a ser o id do negócio na Emylia.
import type { SupabaseClient } from "@supabase/supabase-js";
import { tot, totaisIva, type Estado, type Negocio } from "../motor";
import { gravarNovaLead } from "@/hooks/pessoas/novaLead/gravarNovaLead";
import { resolverOrgRaiz } from "@/hooks/pessoas/novaLead/comerciaisNovaLead";
import { paraLinhas } from "./negocioReal";
import { gravarNegocio, type IdsServico } from "./negocioBase";

export interface RefNegocio { id: string; entityId: string }

/** O que conta para gravar (sem o que é só do ecrã nem o que ainda não vai para a base). */
export function marcaNegocio(d: Negocio): string {
  const { fresh, valida, atraso, obra, adendas, acesso, ...resto } = d as Negocio & Record<string, unknown>;
  void fresh; void valida; void atraso; void obra; void adendas; void acesso;
  return JSON.stringify(resto);
}
export const fotografarNegocios = (deals: readonly Negocio[]): Map<number, string> => new Map(deals.map((d) => [d.id, marcaNegocio(d)]));
export const negociosMudados = (deals: readonly Negocio[], foto: ReadonlyMap<number, string>): Negocio[] =>
  deals.filter((d) => foto.get(d.id) !== marcaNegocio(d));

/** Troca o id de um negócio da Emylia pelo número que a base deu (e tudo o que no Estado aponta para ele). */
export function renumerar(S: Estado, de: number, para: number): void {
  if (de === para) return;
  for (const d of S.deals) if (d.id === de) d.id = para;
  if (S.deal === de) S.deal = para;
  for (const c of S.clientes ?? []) if ((c as { deal?: number }).deal === de) (c as { deal?: number }).deal = para;
  S.seq = Math.max(S.seq, para + 1);
}

/** Cria a pessoa e o negócio pela "Nova lead" do CRM e devolve as referências e o número dado pela base. */
async function criarNoCrm(sb: SupabaseClient, org: string, d: Negocio): Promise<{ ref: RefNegocio; numero: number }> {
  const email = d.tel.includes("@") ? d.tel.trim() : "";
  const r = await gravarNovaLead({
    organizationId: org, rootOrganizationId: await resolverOrgRaiz(org),
    dados: { displayName: d.nome, firstName: null, lastName: null, email, telefone: email ? "" : d.tel.trim(), nif: "" },
    valores: {}, origemId: null, origemNome: "manual", campanhaId: null,
  });
  const { data, error } = await sb.from("negocios" as never).select("numero").eq("id", r.negocioId).single();
  if (error || !data) throw new Error("O negócio foi criado mas não se conseguiu ler o número.");
  return { ref: { id: r.negocioId, entityId: r.entityId }, numero: Number((data as { numero: number }).numero) };
}

export interface Sincronizacao { gravados: number; erros: string[]; avisos: string[] }

/** Grava os negócios que mudaram. Atualiza `refs` e a fotografia com o que ficou gravado. */
export async function gravarMudancas(sb: SupabaseClient, org: string, S: Estado, refs: Map<number, RefNegocio>, foto: Map<number, string>, ids: IdsServico): Promise<Sincronizacao> {
  const out: Sincronizacao = { gravados: 0, erros: [], avisos: [] };
  for (const d of negociosMudados(S.deals, foto)) {
    try {
      if (!refs.has(d.id)) {
        const antigo = d.id;
        const c = await criarNoCrm(sb, org, d);
        renumerar(S, antigo, c.numero);
        refs.set(c.numero, c.ref);
      }
      const L = paraLinhas(d);
      const atual = L.orcamentos.find((o) => o.estado !== "substituido");
      if (atual && d.orc) {
        atual.preco_final = Math.round(tot(d, S).pf * 100) / 100;
        atual.total_com_iva = Math.round(totaisIva(d, S).total * 100) / 100;
      }
      for (const a of await gravarNegocio(sb, org, refs.get(d.id)!.id, L, ids)) out.avisos.push(`${d.nome}: ${a}`);
      foto.set(d.id, marcaNegocio(d));
      out.gravados++;
    } catch (e) {
      out.erros.push(`${d.nome}: ${(e as Error).message}`);
    }
  }
  return out;
}
