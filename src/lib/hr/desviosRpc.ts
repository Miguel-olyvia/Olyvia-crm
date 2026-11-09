/**
 * As chamadas as RPCs de desvios, sem React: servem os hooks (configuracao, fila, validacao), o relatorio de assiduidade e o
 * fecho da folha. Lancam o erro da base tal como veio; quem chama decide se e uma recusa, um defeito ou «indisponivel».
 * O cliente da base so se carrega quando se vai mesmo chamar uma RPC (o prototipo de RH nao pode importa-lo ao carregar).
 */
import type { LinhaDesvio } from "@/lib/hr/desviosBase";
import type { VersaoMargem } from "@/lib/hr/desviosRelatorio";
import { diasDoIntervalo, hojeLisboa, planoDeDeteccao } from "@/lib/hr/horasExtraBase";

async function rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }> {
  const { hrRpc } = await import("@/lib/hr/hrDb");
  return hrRpc(fn, args);
}

export interface MargemLida {
  /** A versao em vigor hoje; `null` = sem margem (desligado). */
  emVigor: VersaoMargem | null;
  /** Todas, incluindo as substituidas, da mais recente para a mais antiga. */
  versoes: VersaoMargem[];
}

const numeroOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function versaoDaLinha(l: Record<string, unknown>): VersaoMargem {
  return {
    id: String(l.id),
    margem_min: numeroOuNull(l.margem_min),
    valido_de: String(l.valido_de),
    valido_ate: l.valido_ate ? String(l.valido_ate) : null,
    substituida_em: l.substituida_em ? String(l.substituida_em) : null,
    created_at: l.created_at ? String(l.created_at) : undefined,
  };
}

/** `rpc_hr_desvios_config_ler`: a margem em vigor e o historico. */
export async function lerMargem(organizationId: string): Promise<MargemLida> {
  const { data, error } = await rpc("rpc_hr_desvios_config_ler", { p_organization_id: organizationId });
  if (error) throw error;
  const versoes = (Array.isArray(data?.versoes) ? data.versoes : []).map((l: Record<string, unknown>) => versaoDaLinha(l));
  return { emVigor: data?.em_vigor ? versaoDaLinha(data.em_vigor) : null, versoes };
}

const VALIDADE_CACHE_MARGEM_MS = 30_000;
const cacheDaMargem = new Map<string, { lidaEm: number; leitura: Promise<MargemLida> }>();

/**
 * A margem da organizacao, lida UMA vez para todas as instancias do relatorio (o processamento monta uma por pessoa): uma leitura
 * por organizacao, partilhada durante 30 s. Uma leitura que falha nao fica guardada. Gravar uma margem limpa-a.
 */
export function lerMargemPartilhada(organizationId: string): Promise<MargemLida> {
  const guardada = cacheDaMargem.get(organizationId);
  if (guardada && Date.now() - guardada.lidaEm < VALIDADE_CACHE_MARGEM_MS) return guardada.leitura;
  const leitura = lerMargem(organizationId);
  cacheDaMargem.set(organizationId, { lidaEm: Date.now(), leitura });
  leitura.catch(() => {
    if (cacheDaMargem.get(organizationId)?.leitura === leitura) cacheDaMargem.delete(organizationId);
  });
  return leitura;
}

/** Esquece a margem partilhada (de uma organizacao, ou de todas). */
export function limparMargemPartilhada(organizationId?: string): void {
  if (organizationId) cacheDaMargem.delete(organizationId);
  else cacheDaMargem.clear();
}
/** `rpc_hr_desvios_config_guardar`: `margemMin` `null` = «sem margem» (desligado). */
export async function guardarMargem(organizationId: string, validoDe: string, margemMin: number | null): Promise<string> {
  const { data, error } = await rpc("rpc_hr_desvios_config_guardar", {
    p_organization_id: organizationId,
    p_valido_de: validoDe,
    p_margem_min: margemMin,
  });
  if (error) throw error;
  // A margem mudou: a leitura partilhada ja nao vale.
  limparMargemPartilhada(organizationId);
  return String(data);
}

export interface FiltroDesvios {
  /** `null` = todos os estados. */
  estado?: "a_validar" | "validado" | "substituido" | null;
  de?: string | null;
  ate?: string | null;
  pessoaId?: string | null;
}

/** `rpc_hr_desvios_listar`. A leitura dos desvios e SO por esta RPC. */
export async function listarDesvios(organizationId: string, filtro: FiltroDesvios = {}): Promise<LinhaDesvio[]> {
  const { data, error } = await rpc("rpc_hr_desvios_listar", {
    p_organization_id: organizationId,
    p_estado: filtro.estado === undefined ? "a_validar" : filtro.estado,
    p_data_de: filtro.de ?? null,
    p_data_ate: filtro.ate ?? null,
    p_pessoa_id: filtro.pessoaId ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as LinhaDesvio[];
}

export interface ResumoDeteccaoDesvios {
  diasVistos: number;
  comDesvio: number;
  substituidos: number;
  criados: number;
}

export const RESUMO_DESVIOS_VAZIO: ResumoDeteccaoDesvios = { diasVistos: 0, comDesvio: 0, substituidos: 0, criados: 0 };

export const somarResumosDesvios = (a: ResumoDeteccaoDesvios, b: ResumoDeteccaoDesvios): ResumoDeteccaoDesvios => ({
  diasVistos: a.diasVistos + b.diasVistos,
  comDesvio: a.comDesvio + b.comDesvio,
  substituidos: a.substituidos + b.substituidos,
  criados: a.criados + b.criados,
});

export const resumoDaRespostaDesvios = (d: Record<string, unknown> | null | undefined): ResumoDeteccaoDesvios => ({
  diasVistos: Number(d?.dias_vistos ?? 0),
  comDesvio: Number(d?.com_desvio ?? 0),
  substituidos: Number(d?.substituidos ?? 0),
  criados: Number(d?.criados ?? 0),
});

/**
 * `rpc_hr_desvios_detetar` sobre `[de, ate]`, partido segundo os tectos da base (31 dias para a organizacao, 62 para uma
 * pessoa). O fim nunca passa de hoje (a base recusa um intervalo que comeca depois de hoje, por isso esse caso nem se pede).
 * Para no primeiro erro e lanca-o: as janelas ja feitas ficam feitas na base.
 */
export async function detetarDesvios(
  organizationId: string,
  de: string,
  ate: string,
  pessoaId: string | null = null,
  hoje: string = hojeLisboa(),
): Promise<ResumoDeteccaoDesvios> {
  const fim = ate > hoje ? hoje : ate;
  if (diasDoIntervalo(de, fim) === 0) return RESUMO_DESVIOS_VAZIO;
  const plano = planoDeDeteccao(de, fim, pessoaId);
  let total = RESUMO_DESVIOS_VAZIO;
  for (const janela of plano.janelas) {
    const { data, error } = await rpc("rpc_hr_desvios_detetar", {
      p_organization_id: organizationId,
      p_data_de: janela.de,
      p_data_ate: janela.ate,
      p_pessoa_id: pessoaId,
    });
    if (error) throw error;
    total = somarResumosDesvios(total, resumoDaRespostaDesvios(data));
  }
  return total;
}

export interface ResultadoValidacao {
  id: string;
  pessoaId: string;
  data: string;
  decisao: "normal" | "hora_extra" | "aceitar_desvio";
  contadoMin: number;
  extraMin: number;
}

/** `rpc_hr_desvio_validar`. */
export async function validarDesvio(
  desvioId: string,
  decisao: "normal" | "hora_extra" | "aceitar_desvio",
  motivo: string | null,
): Promise<ResultadoValidacao> {
  const { data, error } = await rpc("rpc_hr_desvio_validar", { p_desvio_id: desvioId, p_decisao: decisao, p_motivo: motivo });
  if (error) throw error;
  return {
    id: String(data?.id),
    pessoaId: String(data?.pessoa_id),
    data: String(data?.data),
    decisao: data?.decisao,
    contadoMin: Number(data?.contado_min ?? 0),
    extraMin: Number(data?.extra_min ?? 0),
  };
}

/**
 * `rpc_hr_desvios_assinaturas(p_periodo_id)`: a assinatura dos desvios de cada pessoa neste periodo. Chama-se IMEDIATAMENTE
 * antes de calcular o resultado e cada assinatura segue no campo `desvios_assinatura` do resultado dessa pessoa; a base recusa o
 * fecho se houve decisoes entretanto (`processamento_fechar_desvios_desactualizados`). Pessoa sem linha = sem assinatura.
 */
export async function lerAssinaturasDeDesvios(periodoId: string): Promise<Map<string, string>> {
  const { data, error } = await rpc("rpc_hr_desvios_assinaturas", { p_periodo_id: periodoId });
  if (error) throw error;
  const mapa = new Map<string, string>();
  for (const linha of (Array.isArray(data) ? data : []) as Array<{ pessoa_id?: string; assinatura?: string | null }>) {
    if (linha.pessoa_id && linha.assinatura) mapa.set(linha.pessoa_id, linha.assinatura);
  }
  return mapa;
}
