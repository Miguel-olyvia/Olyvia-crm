/**
 * As chamadas as RPCs das horas extra APROVADAS (migrations 20270110900000 e 20270110910000), sem React. Lancam o erro da base
 * tal como veio; quem chama decide se e uma recusa, um defeito ou «indisponivel» (migration por aplicar).
 * O cliente da base so se carrega quando se vai mesmo chamar uma RPC (o prototipo de RH nao pode importa-lo ao carregar).
 */
import type { HorasExtraDoPeriodo, LinhaHoraExtraPeriodo } from "@/lib/hr/horasExtraRelatorio";

async function rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }> {
  const { hrRpc } = await import("@/lib/hr/hrDb");
  return hrRpc(fn, args);
}

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function linhaDoPeriodo(l: Record<string, unknown>): LinhaHoraExtraPeriodo {
  return {
    id: String(l.id),
    data: String(l.data),
    origem: String(l.origem),
    estado: String(l.estado),
    minutos: numero(l.minutos),
    nocturno_min: numero(l.nocturno_min),
    tipo_registo: typeof l.tipo_registo === "string" ? l.tipo_registo : null,
  };
}

/**
 * `rpc_hr_horas_extra_do_periodo(p_organization_id, p_pessoa_id, p_de, p_ate)`: o interruptor da organizacao
 * (`aprovacao_desde`), TODAS as linhas da pessoa no periodo (pendente, confirmada, rejeitada) e a assinatura (md5; `null` sem
 * linhas) que o fecho confere. Ate 62 dias.
 */
export async function lerHorasExtraDoPeriodo(
  organizationId: string,
  pessoaId: string,
  de: string,
  ate: string,
): Promise<HorasExtraDoPeriodo> {
  const { data, error } = await rpc("rpc_hr_horas_extra_do_periodo", {
    p_organization_id: organizationId,
    p_pessoa_id: pessoaId,
    p_de: de,
    p_ate: ate,
  });
  if (error) throw error;
  const linhas = (Array.isArray(data?.linhas) ? data.linhas : []) as Array<Record<string, unknown>>;
  return {
    aprovacaoDesde: data?.aprovacao_desde ? String(data.aprovacao_desde) : null,
    linhas: linhas.map(linhaDoPeriodo),
    assinatura: typeof data?.assinatura === "string" && data.assinatura !== "" ? data.assinatura : null,
  };
}

/**
 * `rpc_hr_horas_extra_assinaturas(p_periodo_id)`: a assinatura das horas extra de cada pessoa neste periodo. Chama-se
 * IMEDIATAMENTE antes de calcular o resultado e cada assinatura segue em `horas_extra_assinatura`; a base recusa o fecho se as
 * horas extra mudaram entretanto. Pessoa sem linha = sem assinatura (o cliente envia `null`).
 */
export async function lerAssinaturasDeHorasExtra(periodoId: string): Promise<Map<string, string>> {
  const { data, error } = await rpc("rpc_hr_horas_extra_assinaturas", { p_periodo_id: periodoId });
  if (error) throw error;
  const mapa = new Map<string, string>();
  for (const linha of (Array.isArray(data) ? data : []) as Array<{ pessoa_id?: string; assinatura?: string | null }>) {
    if (linha.pessoa_id && linha.assinatura) mapa.set(linha.pessoa_id, linha.assinatura);
  }
  return mapa;
}

/** O interruptor da contagem das horas extra aprovadas, como a base o devolve. */
export interface ContagemHorasExtra {
  /** A partir de que dia so contam as horas extra confirmadas; `null` = desligado (tudo como antes). */
  aprovacaoDesde: string | null;
  /** O inicio da primeira folha fechada da organizacao; `null` = nao ha folhas fechadas. */
  folhasFechadasDesde: string | null;
  /** O fim (`data_fim`) da folha fechada mais recente, independente do interruptor; `null` = nao ha, ou a base ainda nao o devolve. */
  ultimaFolhaFechadaAte: string | null;
  /** Falso: a organizacao ainda nunca guardou configuracao de horas extra (vale a omissao: desligado). */
  temConfig: boolean;
}

const dataOuNull = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/**
 * Verdadeiro quando a base ainda nao tem a RPC (migration por aplicar): o PostgREST responde PGRST202 (nao ha funcao com esse
 * nome e argumentos) ou o Postgres 42883. Nao e um defeito: o ecra diz «ainda nao disponivel».
 */
export function contagemIndisponivel(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (code === "PGRST202" || code === "42883") return true;
  return typeof message === "string" && /could not find the function|function .* does not exist/i.test(message);
}

/** `rpc_hr_horas_extra_contagem_ler(p_organization_id)` -> `{aprovacao_desde, folhas_fechadas_desde, ultima_folha_fechada_ate, tem_config}` (a chave nova pode faltar: vira `null`). Lanca o erro da base. */
export async function lerContagemHorasExtra(organizationId: string): Promise<ContagemHorasExtra> {
  const { data, error } = await rpc("rpc_hr_horas_extra_contagem_ler", { p_organization_id: organizationId });
  if (error) throw error;
  return {
    aprovacaoDesde: dataOuNull(data?.aprovacao_desde),
    folhasFechadasDesde: dataOuNull(data?.folhas_fechadas_desde),
    ultimaFolhaFechadaAte: dataOuNull(data?.ultima_folha_fechada_ate),
    temConfig: data?.tem_config === true,
  };
}

/** `rpc_hr_horas_extra_contagem_guardar(p_organization_id, p_desde)`: `null` desliga. HRA87 = ha folha fechada. Lanca o erro da base. */
export async function guardarContagemHorasExtra(
  organizationId: string,
  desde: string | null,
): Promise<{ aprovacaoDesde: string | null; alterada: boolean }> {
  const { data, error } = await rpc("rpc_hr_horas_extra_contagem_guardar", { p_organization_id: organizationId, p_desde: desde });
  if (error) throw error;
  return { aprovacaoDesde: dataOuNull(data?.aprovacao_desde), alterada: data?.alterada === true };
}