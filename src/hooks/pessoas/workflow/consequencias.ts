// As consequências dos seis acontecimentos (orçamento, proposta e contrato aceites ou recusados), em forma pura: a recusa do orçamento
// (negocio_workflow_config.recusa_orcamento, migration 20261226210000), a cadeia de documentos como o motor a lê (quote_stage_actions e
// proposal_stage_actions) e os parâmetros e respostas de `neg_guardar_cadeia` e `neg_guardar_recusa_orcamento`.

/** Orçamento recusado: perde o negócio se for o último documento vivo e não recusado (a omissão), ou mantém-no aberto. */
export const RECUSAS_ORCAMENTO = ["perder_se_ultimo", "manter_aberto"] as const;
export type RecusaOrcamento = (typeof RECUSAS_ORCAMENTO)[number];

/** O que se sabe hoje; `null` é «não se leu» (organização sem configuração, leitura que falhou, fase que não é única). */
export interface Consequencias {
  recusaOrcamento: RecusaOrcamento | null;
  orcamentoCriaProposta: boolean | null;
  propostaCriaContrato: boolean | null;
}

export interface Cadeia {
  orcamentoCriaProposta: boolean;
  propostaCriaContrato: boolean;
}

export interface ResultadoCadeia {
  mudou: boolean;
  /** Os valores efetivos depois de gravar; `null` se a resposta não se reconhece (quem chama relê da base). */
  depois: Cadeia | null;
}

export interface ResultadoRecusaOrcamento {
  mudou: boolean;
  depois: RecusaOrcamento | null;
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const recusaDe = (valor: unknown): RecusaOrcamento | null => RECUSAS_ORCAMENTO.find((r) => r === valor) ?? null;

/** A coluna da linha de negocio_workflow_config. Sem linha, `null`; um valor que a base não aceita não se mostra como bom: lança. */
export function lerRecusaOrcamento(linha: unknown): RecusaOrcamento | null {
  if (linha === null || linha === undefined) return null;
  const recusa = ehObjeto(linha) ? recusaDe(linha.recusa_orcamento) : null;
  if (!recusa) throw new Error("recusa do orçamento com valor desconhecido");
  return recusa;
}

/** Há uma linha ativa dessa ação nessa fase; `null` se não há fase ou as linhas não são uma lista. */
function algumaAtiva(acoes: unknown, faseId: string | null, acao: string): boolean | null {
  if (!faseId || !Array.isArray(acoes)) return null;
  return acoes.some((a) => ehObjeto(a) && a.stage_id === faseId && a.action_type === acao && a.is_active === true);
}

/** Orçamento aceite cria a proposta: linhas da organização na fase global «aceite» (não há linhas globais: organization_id é obrigatório). */
export const criaPropostaEfetivo = (acoes: unknown, faseId: string | null): boolean | null => algumaAtiva(acoes, faseId, "create_proposal");

/**
 * Proposta aceite cria o contrato: linhas da organização na fase global «accepted». Não se leem as linhas globais: não há nenhuma (lido a 21/10) e,
 * com pelo menos uma linha da organização, o motor deixa de as ler de qualquer forma. Depois de gravar, vale o que a base devolve.
 */
export const criaContratoEfetivo = (acoes: unknown, faseId: string | null): boolean | null => algumaAtiva(acoes, faseId, "create_contract");

/** Parâmetros de `neg_guardar_cadeia`, pela assinatura real da migration. */
export function paraEnvioCadeia(organizationId: string, orcamentoCriaProposta: boolean, propostaCriaContrato: boolean): Record<string, unknown> {
  return { p_organization_id: organizationId, p_orcamento_cria_proposta: orcamentoCriaProposta, p_proposta_cria_contrato: propostaCriaContrato };
}

/** Parâmetros de `neg_guardar_recusa_orcamento`. */
export function paraEnvioRecusaOrcamento(organizationId: string, valor: RecusaOrcamento): Record<string, unknown> {
  return { p_organization_id: organizationId, p_valor: valor };
}

/** Lê `{antes, depois, mudou}` de `neg_guardar_cadeia`. Só `true` conta como mudou. */
export function lerResultadoCadeia(dados: unknown): ResultadoCadeia {
  const d = ehObjeto(dados) ? dados : {};
  const depois = ehObjeto(d.depois) ? d.depois : null;
  const reconhecido = depois !== null && typeof depois.orcamento_cria_proposta === "boolean" && typeof depois.proposta_cria_contrato === "boolean";
  return {
    mudou: d.mudou === true,
    depois: reconhecido ? { orcamentoCriaProposta: depois.orcamento_cria_proposta as boolean, propostaCriaContrato: depois.proposta_cria_contrato as boolean } : null,
  };
}

/** Lê `{antes, depois, mudou}` de `neg_guardar_recusa_orcamento`. */
export function lerResultadoRecusaOrcamento(dados: unknown): ResultadoRecusaOrcamento {
  const d = ehObjeto(dados) ? dados : {};
  return { mudou: d.mudou === true, depois: ehObjeto(d.depois) ? recusaDe(d.depois.recusa_orcamento) : null };
}
