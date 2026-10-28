// CRM: grava os negócios que mudaram no ecrã da Emylia. Depois de cada ação compara cada negócio com a última fotografia (o que a base
// tem); o que mudou grava-se com neg_guardar_negocio (negocioBase.ts). Um negócio que ainda não existe na base (o "Novo negócio" da
// Emylia) cria-se primeiro pelo caminho do CRM: a "Nova lead" (pessoa em anew_entities + negócio por neg_criar_negocio). O número que a
// base lhe dá passa a ser o id do negócio na Emylia.
import type { SupabaseClient } from "@supabase/supabase-js";
import { tot, totaisIva, type Estado, type Negocio } from "../motor";
import { gravarNovaLead } from "@/hooks/pessoas/novaLead/gravarNovaLead";
import { resolverOrgRaiz } from "@/hooks/pessoas/novaLead/comerciaisNovaLead";
import { paraLinhas } from "./negocioReal";
import { gravarNegocio, gravarObra, type IdsServico } from "./negocioBase";
import { obraVazia, paraObra } from "./obraReal";
import { gravarFinanceiro, novasNoFinanceiro } from "./financeiroReal";

export interface RefNegocio { id: string; entityId: string }

/** O que conta para gravar (sem o que é só do ecrã nem o que ainda não vai para a base). */
export function marcaNegocio(d: Negocio): string {
  const { fresh, valida, atraso, obra, acesso, ...resto } = d as Negocio & Record<string, unknown>;
  void fresh; void valida; void atraso; void obra; void acesso;
  return JSON.stringify(resto);
}
/** 28/10 (20261231999000): a obra grava-se à parte (obra_guardar_negocio), quando muda. A fotografia dela vive ao lado da fotografia do
 *  negócio, presa ao mesmo Map: quem chama não muda. Um negócio sem fotografia da obra compara com a obra vazia (sem plano, nada a gravar). */
const fotosObra = new WeakMap<Map<number, string>, Map<number, string>>();
export const marcaObra = (d: Negocio): string => JSON.stringify(d.obra ?? null);
const OBRA_VAZIA = JSON.stringify(obraVazia());
const fotoObraDe = (foto: Map<number, string>): Map<number, string> => {
  let m = fotosObra.get(foto);
  if (!m) { m = new Map(); fotosObra.set(foto, m); }
  return m;
};
export const obraMudou = (d: Negocio, foto: Map<number, string>): boolean => marcaObra(d) !== (fotoObraDe(foto).get(d.id) ?? OBRA_VAZIA);

export const fotografarNegocios = (deals: readonly Negocio[]): Map<number, string> => {
  const foto = new Map(deals.map((d) => [d.id, marcaNegocio(d)]));
  fotosObra.set(foto, new Map(deals.map((d) => [d.id, marcaObra(d)])));
  return foto;
};
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

/** Grava os negócios que mudaram. Atualiza `refs` e a fotografia com o que ficou gravado. Os de `soLeitura` (negócios do CRM, com
 *  documentos do CRM) nunca se gravam: a base recusa-os (NE005) e um que faltasse em `refs` criava uma lead nova. */
export async function gravarMudancas(sb: SupabaseClient, org: string, S: Estado, refs: Map<number, RefNegocio>, foto: Map<number, string>, ids: IdsServico,
  soLeitura: ReadonlySet<number> = new Set()): Promise<Sincronizacao> {
  const out: Sincronizacao = { gravados: 0, erros: [], avisos: [] };
  const falhados = new Set<number>(), contados = new Set<number>();
  for (const d of negociosMudados(S.deals, foto)) {
    if (soLeitura.has(d.id)) continue;
    try {
      if (!refs.has(d.id)) {
        const antigo = d.id;
        const c = await criarNoCrm(sb, org, d);
        renumerar(S, antigo, c.numero);
        refs.set(c.numero, c.ref);
      }
      // 28/10 (20261231999700): a fatura e o pagamento novos vão primeiro pelas funções do Financeiro; o que a base devolve (o recibo, a
      // chave da fatura) fica no negócio, para o JSON que se grava a seguir bater com a base
      const antes = foto.get(d.id);
      const ops = novasNoFinanceiro(antes ? (JSON.parse(antes) as Negocio) : null, d);
      if (ops.length) for (const a of await gravarFinanceiro(sb, org, refs.get(d.id)!.id, d, ops)) out.avisos.push(`${d.nome}: ${a}`);
      const L = paraLinhas(d);
      const atual = L.orcamentos.find((o) => o.estado !== "substituido");
      if (atual && d.orc) {
        atual.preco_final = Math.round(tot(d, S).pf * 100) / 100;
        atual.total_com_iva = Math.round(totaisIva(d, S).total * 100) / 100;
      }
      for (const a of await gravarNegocio(sb, org, refs.get(d.id)!.id, L, ids)) out.avisos.push(`${d.nome}: ${a}`);
      foto.set(d.id, marcaNegocio(d));
      out.gravados++; contados.add(d.id);
    } catch (e) {
      falhados.add(d.id);
      out.erros.push(`${d.nome}: ${(e as Error).message}`);
    }
  }
  // a obra (depois do negócio: um negócio novo já tem o id da base)
  const fotoObra = fotoObraDe(foto);
  for (const d of S.deals) {
    if (soLeitura.has(d.id) || falhados.has(d.id) || !refs.has(d.id) || !obraMudou(d, foto)) continue;
    try {
      for (const a of await gravarObra(sb, org, refs.get(d.id)!.id, paraObra(d))) out.avisos.push(`${d.nome}: ${a}`);
      fotoObra.set(d.id, marcaObra(d));
      if (!contados.has(d.id)) out.gravados++;
    } catch (e) {
      out.erros.push(`${d.nome} (obra): ${(e as Error).message}`);
    }
  }
  return out;
}
