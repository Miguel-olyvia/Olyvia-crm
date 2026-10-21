// A configuração do fecho dos negócios de uma organização (tabela negocio_workflow_config, uma linha por organização), em forma pura: ler a linha,
// validar o prazo de reflexão, montar os parâmetros de `neg_guardar_config_negocios` e ler a resposta. Os valores são exatamente os dos CHECK da
// tabela (migration 20261226120000). O prazo de reflexão é NULO até o jurídico validar: nunca tem valor por omissão aqui.

/** Ao ganhar um negócio: converter a pessoa em cliente automaticamente (a omissão), à mão, ou não alterar. */
export const CONVERSOES_AO_GANHAR = ["automatica", "manual", "nao_alterar"] as const;
/** Proposta ou contrato recusado: perder o negócio (a omissão) ou mantê-lo aberto. */
export const RECUSAS = ["perder", "manter_aberto"] as const;
/** Cancelamento dentro do prazo de reflexão: perder o negócio (a omissão) ou mantê-lo ganho. */
export const CANCELAMENTOS = ["perder", "manter_ganho"] as const;

export type ConversaoAoGanhar = (typeof CONVERSOES_AO_GANHAR)[number];
export type Recusa = (typeof RECUSAS)[number];
export type Cancelamento = (typeof CANCELAMENTOS)[number];

export const REFLEXAO_MIN = 1;
export const REFLEXAO_MAX = 365;

export interface ConfigNegocios {
  conversaoAoGanhar: ConversaoAoGanhar;
  recusaProposta: Recusa;
  recusaContrato: Recusa;
  cancelamentoNoPrazo: Cancelamento;
  /** Dias de reflexão (1 a 365); `null` até o jurídico validar o prazo. */
  reflexaoDias: number | null;
}

/** O que a função devolve. `depois` é null quando a resposta não se reconhece: quem chama relê da base. */
export interface ResultadoGuardarConfig {
  mudou: boolean;
  depois: ConfigNegocios | null;
  /** Contratos converte a pessoa em cliente ao assinar e aqui a conversão escolhida é manual ou «não alterar». */
  avisoConversaoContratos: boolean;
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);
const entre = <T extends string>(lista: readonly T[], valor: unknown): T | null => lista.find((v) => v === valor) ?? null;
const prazoValido = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= REFLEXAO_MIN && n <= REFLEXAO_MAX;

/** Os valores da configuração se todos se reconhecem, senão `null`. */
function lerValores(d: Record<string, unknown>): ConfigNegocios | null {
  const conversaoAoGanhar = entre(CONVERSOES_AO_GANHAR, d.conversao_ao_ganhar);
  const recusaProposta = entre(RECUSAS, d.recusa_proposta);
  const recusaContrato = entre(RECUSAS, d.recusa_contrato);
  const cancelamentoNoPrazo = entre(CANCELAMENTOS, d.cancelamento_no_prazo);
  const dias = d.reflexao_dias ?? null;
  if (!conversaoAoGanhar || !recusaProposta || !recusaContrato || !cancelamentoNoPrazo || (dias !== null && !prazoValido(dias))) return null;
  return { conversaoAoGanhar, recusaProposta, recusaContrato, cancelamentoNoPrazo, reflexaoDias: dias };
}

/**
 * Lê a linha da tabela. Sem linha, a organização não tem a configuração (devolve null). Uma linha com valores que a base não aceita não se mostra
 * como se fosse boa (guardar por cima trocaria o que lá está): lança.
 */
export function lerConfig(linha: unknown): ConfigNegocios | null {
  if (linha === null || linha === undefined) return null;
  const config = ehObjeto(linha) ? lerValores(linha) : null;
  if (!config) throw new Error("configuração de negócios com valores desconhecidos");
  return config;
}

/**
 * O que se escreveu no campo do prazo de reflexão: vazio é «sem prazo» (nulo); senão um inteiro de 1 a 365, só com dígitos (nada de sinais,
 * vírgulas nem texto). Devolve o valor ou o motivo da recusa.
 */
export function validarReflexao(texto: string): { valor: number | null } | { erro: "formato" | "intervalo" } {
  const limpo = texto.trim();
  if (limpo === "") return { valor: null };
  if (!/^[0-9]+$/.test(limpo)) return { erro: "formato" };
  const n = Number(limpo);
  return prazoValido(n) ? { valor: n } : { erro: "intervalo" };
}

/** O prazo como texto de campo: vazio se não há. */
export const reflexaoEmTexto = (dias: number | null): string => (dias === null ? "" : String(dias));

/** Os parâmetros de `neg_guardar_config_negocios` (6 argumentos). */
export function paraEnvio(organizationId: string, c: ConfigNegocios): Record<string, unknown> {
  return {
    p_organization_id: organizationId,
    p_conversao_ao_ganhar: c.conversaoAoGanhar,
    p_recusa_proposta: c.recusaProposta,
    p_recusa_contrato: c.recusaContrato,
    p_cancelamento_no_prazo: c.cancelamentoNoPrazo,
    p_reflexao_dias: c.reflexaoDias,
  };
}

/** Lê o `{antes, depois, mudou, aviso_conversao_contratos}` da função. Só `true` conta como mudou e como aviso. */
export function lerResultadoConfig(dados: unknown): ResultadoGuardarConfig {
  const d = ehObjeto(dados) ? dados : {};
  return {
    mudou: d.mudou === true,
    depois: ehObjeto(d.depois) ? lerValores(d.depois) : null,
    avisoConversaoContratos: d.aviso_conversao_contratos === true,
  };
}
