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
