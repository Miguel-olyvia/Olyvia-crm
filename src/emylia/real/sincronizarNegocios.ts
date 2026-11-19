// CRM: grava os negócios que mudaram no ecrã da Emylia. Depois de cada ação compara cada negócio com a última fotografia (o que a base
// tem); o que mudou grava-se com neg_guardar_negocio (negocioBase.ts). Um negócio que ainda não existe na base (o "Novo negócio" da
// Emylia) cria-se primeiro pelo caminho do CRM: a "Nova lead" (pessoa em anew_entities + negócio por neg_criar_negocio). O número que a
// base lhe dá passa a ser o id do negócio na Emylia.
import type { SupabaseClient } from "@supabase/supabase-js";
import { congelarTotalAceite, tot, totaisIva, type Estado, type Negocio } from "../motor";
import { gravarNovaLead, NegocioNaoCriado } from "@/hooks/pessoas/novaLead/gravarNovaLead";
import { criarNegocioNovaLead, novoIdNegocio } from "@/hooks/pessoas/novaLead/criarNegocioNovaLead";
import { resolverOrgRaiz } from "@/hooks/pessoas/novaLead/comerciaisNovaLead";
import { paraLinhas } from "./negocioReal";
import { gravarNegocio, gravarObra, type IdsServico } from "./negocioBase";
import { obraVazia, paraObra } from "./obraReal";
import { canonico, novidadesDaObra, obraJunta, porNoSitio } from "./juntarObra";
import { gravarFinanceiro, novasNoFinanceiro } from "./financeiroReal";

export interface RefNegocio { id: string; entityId: string }

/** O que conta para gravar (sem o que é só do ecrã nem o que ainda não vai para a base). */
export function marcaNegocio(d: Negocio): string {
  // 4/11: moradaLead é a sugestão da «Morada da obra» lida da ficha da pessoa: só do ecrã
  const { fresh, valida, atraso, obra, acesso, moradaLead, dadosLead, ...resto } = d as Negocio & Record<string, unknown>;
  void fresh; void valida; void atraso; void obra; void acesso; void moradaLead; void dadosLead;
  return JSON.stringify(resto);
}
/** 28/10 (20261231999000): a obra grava-se à parte (obra_guardar_negocio), quando muda. A fotografia dela vive ao lado da fotografia do
 *  negócio, presa ao mesmo Map: quem chama não muda. Um negócio sem fotografia da obra compara com a obra vazia (sem plano, nada a gravar). */
const fotosObra = new WeakMap<Map<number, string>, Map<number, string>>();
// 19/11: com as chaves por ordem (canonico): a obra lida da base (jsonb) e a do ecrã comparam-se pelo conteúdo, não pela ordem das chaves
export const marcaObra = (d: Negocio): string => canonico(d.obra ?? null);
const OBRA_VAZIA = canonico(obraVazia());
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
  // 30/10: uma pessoa que já existia (escolhida em «Novo negócio») não se cria outra vez: só se cria o negócio dela (neg_criar_negocio, o mesmo
  // caminho de «outro negócio para quem já existe» da Nova lead).
  let negocioId: string, entityId: string;
  if (d.pessoaId) {
    negocioId = novoIdNegocio();
    entityId = d.pessoaId;
    await criarNegocioNovaLead({ organizationId: org, entityId, negocioId, titulo: d.nome });
  } else {
    const email = d.tel.includes("@") ? d.tel.trim() : "";
    try {
      const r = await gravarNovaLead({
        organizationId: org, rootOrganizationId: await resolverOrgRaiz(org),
        dados: { displayName: d.nome, firstName: null, lastName: null, email, telefone: email ? "" : d.tel.trim(), nif: "" },
        valores: {}, origemId: null, origemNome: "manual", campanhaId: null,
      });
      negocioId = r.negocioId; entityId = r.entityId;
    } catch (e) {
      // 5/11: a pessoa ficou criada e o negócio não: a próxima gravação só cria o negócio dela. Antes repetia a pessoa e dava email repetido.
      if (e instanceof NegocioNaoCriado) d.pessoaId = e.entityId;
      throw e;
    }
  }
  const { data, error } = await sb.from("negocios" as never).select("numero").eq("id", negocioId).single();
  if (error || !data) throw new Error("O negócio foi criado mas não se conseguiu ler o número.");
  return { ref: { id: negocioId, entityId }, numero: Number((data as { numero: number }).numero) };
}

/** F3: `reler`: houve fatura, pagamento ou anulação no servidor (a encomenda de cliente pode ter nascido ou sido cancelada): quem chama relê
 *  a organização para o ecrã ter a encomenda da base (o contrato, o número) e a ligação ao Inventário. */
export interface Sincronizacao { gravados: number; erros: string[]; avisos: string[]; reler?: boolean }

/** 19/11: as obras como estão agora na base (obra_ler_negocios: o id do negócio na base → o estado da Emylia). null: não se leu. */
export type LerObras = () => Promise<Map<string, unknown> | null>;

/**
 * 19/11 (Rúben: o técnico termina uma tarefa e isso tem de contar no Estúdio da obra, e o contrário). Junta às obras deste ecrã o que
 * outra pessoa gravou na base depois de este ecrã as ler: o «feita» do técnico, a validação do gestor, os registos e o diário. O que
 * este ecrã mudou e ainda não gravou fica (obraJunta). A fotografia passa a ser a da base: a obra só se volta a gravar se este ecrã
 * tiver mudanças suas. Devolve os negócios que mudaram, com o que mudou nas tarefas (para o aviso).
 */
export function juntarObrasDaBase(S: Estado, refs: ReadonlyMap<number, RefNegocio>, foto: Map<number, string>, lidas: ReadonlyMap<string, unknown>,
  hoje = new Date()): { d: Negocio; novidades: string[] }[] {
  const fotoObra = fotoObraDe(foto), out: { d: Negocio; novidades: string[] }[] = [];
  for (const d of S.deals) {
    const ref = refs.get(d.id);
    if (!ref || !lidas.has(ref.id) || !d.obra) continue;
    const antes = JSON.parse(fotoObra.get(d.id) ?? OBRA_VAZIA) as Negocio["obra"];
    const { obra, base } = obraJunta(antes, d.obra, lidas.get(ref.id), hoje);
    const marcaBase = canonico(base);
    if (marcaBase === canonico(antes)) continue; // ninguém gravou nada novo
    const mudou = canonico(obra) !== marcaObra(d);
    const novidades = mudou ? novidadesDaObra(d.obra, obra) : [];
    if (mudou) porNoSitio(d.obra, obra);
    fotoObra.set(d.id, marcaBase);
    if (mudou) out.push({ d, novidades });
  }
  return out;
}

/** Grava os negócios que mudaram. Atualiza `refs` e a fotografia com o que ficou gravado. Os de `soLeitura` (negócios do CRM, com
 *  documentos do CRM) nunca se gravam: a base recusa-os (NE005) e um que faltasse em `refs` criava uma lead nova. */
export async function gravarMudancas(sb: SupabaseClient, org: string, S: Estado, refs: Map<number, RefNegocio>, foto: Map<number, string>, ids: IdsServico,
  soLeitura: ReadonlySet<number> = new Set(), opcoes: { soObra?: boolean; lerObras?: LerObras } = {}): Promise<Sincronizacao> {
  const out: Sincronizacao = { gravados: 0, erros: [], avisos: [] };
  const falhados = new Set<number>(), contados = new Set<number>();
  // 19/11: antes de gravar uma obra, junta-se o que outra pessoa gravou nela entretanto (o técnico no Hoje, o gestor no Estúdio): a obra
  // grava-se inteira e um ecrã aberto há mais tempo apagava-o. Sem leitura (ou com erro), grava-se como antes.
  if (opcoes.lerObras && S.deals.some((d) => !soLeitura.has(d.id) && refs.has(d.id) && obraMudou(d, foto))) {
    try { const lidas = await opcoes.lerObras(); if (lidas) juntarObrasDaBase(S, refs, foto, lidas); }
    catch { /* grava-se como antes */ }
  }
  // 09/11 (20270111100000): quem só lê as obras (sem pessoas.view, com negocios.obra.executar) recebe o negócio reduzido e a base recusa-lhe
  // neg_guardar_negocio (CT001): só se grava a obra (obra_guardar_negocio)
  for (const d of opcoes.soObra ? [] : negociosMudados(S.deals, foto)) {
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
      if (ops.length) { out.reler = true; for (const a of await gravarFinanceiro(sb, org, refs.get(d.id)!.id, d, ops)) out.avisos.push(`${d.nome}: ${a}`); }
      // 10/11 (teste do 1026): a base substitui as respostas todas de uma vez; um ecrã aberto há mais tempo apagava o que outra pessoa
      // respondeu entretanto. Antes de gravar, junta-se o que está na base: ganha o que este ecrã mudou, o resto fica como está lá.
      if (antes && await juntarRespostasDaBase(sb, refs.get(d.id)!.id, JSON.parse(antes) as Negocio, d)) out.reler = true;
      // 10/11: na passagem ao Financeiro a obra grava-se antes do negócio (12/11: o plano nasce com a proposta aceite, por aprovar)
      if (antes && (JSON.parse(antes) as Negocio).fase < 4 && d.fase >= 4 && obraMudou(d, foto)) {
        const m = marcaObra(d);
        for (const a of await gravarObra(sb, org, refs.get(d.id)!.id, paraObra(d))) out.avisos.push(`${d.nome}: ${a}`);
        fotoObraDe(foto).set(d.id, m);
      }
      // 19/11 (auditoria): a versão aceite (ou com o contrato assinado) leva os totais congelados uma vez (congelarTotalAceite), que já não
      // se recalculam a cada gravação; as outras, os de agora. A taxa de IVA de cada linha vai sempre (a do Catálogo, quando a linha não a tem).
      const fixo = congelarTotalAceite(d, S);
      const L = paraLinhas(d, new Date(), S);
      const atual = L.orcamentos.find((o) => o.estado !== "substituido");
      if (atual && d.orc && !fixo) {
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
      // 19/11: a fotografia é a do que foi gravado (uma ação feita durante a gravação fica por gravar, e grava-se a seguir)
      const m = marcaObra(d);
      for (const a of await gravarObra(sb, org, refs.get(d.id)!.id, paraObra(d))) out.avisos.push(`${d.nome}: ${a}`);
      fotoObra.set(d.id, m);
      if (!contados.has(d.id)) out.gravados++;
    } catch (e) {
      out.erros.push(`${d.nome} (obra): ${(e as Error).message}`);
    }
  }
  return out;
}

/** 10/11: junta às respostas do negócio as que estão na base e este ecrã não mudou desde que leu o negócio (`antes`): as que outra
 *  pessoa respondeu ou mudou entretanto. As que este ecrã mudou (ou apagou) ganham. Devolve se juntou alguma. Sem ler a base, grava-se
 *  como antes. */
export async function juntarRespostasDaBase(sb: SupabaseClient, negocioId: string, antes: Pick<Negocio, "f">, d: Pick<Negocio, "f">): Promise<boolean> {
  let rows: { campo_chave: string; valor: string | null; sugerido?: boolean }[] | null = null;
  try {
    const { data, error } = await sb.from("negocio_respostas" as never).select("campo_chave, valor, sugerido").eq("negocio_id", negocioId).eq("divisao", "");
    if (error) return false;
    rows = data as unknown as { campo_chave: string; valor: string | null; sugerido?: boolean }[];
  } catch { return false; }
  return juntarRespostas(antes.f ?? {}, d.f, (rows ?? []).filter((r) => !r.sugerido)); // as sugeridas (pela IA) não são respostas
}

/** A regra da junção (sem a base, para testar). */
export function juntarRespostas(antes: Record<string, string | undefined>, f: Record<string, string | undefined>, daBase: readonly { campo_chave: string; valor: string | null }[]): boolean {
  let mudou = false;
  for (const { campo_chave: k, valor } of daBase) {
    const v = valor ?? "";
    const mexidaAqui = (f[k] ?? undefined) !== (antes[k] ?? undefined);
    if (mexidaAqui || (f[k] ?? "") === v) continue;
    f[k] = v; mudou = true;
  }
  return mudou;
}