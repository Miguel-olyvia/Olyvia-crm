/**
 * As chamadas as RPCs da configuracao dos subsidios de ferias e de Natal (`rpc_hr_subsidios_config_ler` e `_guardar`, migration
 * 20270112700000), sem React. Lancam o erro da base tal como veio; quem chama decide se e uma recusa, um defeito ou «indisponivel»
 * (migration por aplicar). O cliente da base so se carrega quando se vai mesmo chamar uma RPC (o prototipo de RH nao o pode importar
 * ao carregar).
 */
import type { SubsidiosConfig } from "@/lib/hr/subsidiosExtra";
import { contagemIndisponivel } from "@/lib/hr/horasExtraContagemRpc";

async function rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }> {
  const { hrRpc } = await import("@/lib/hr/hrDb");
  return hrRpc(fn, args);
}

/** As omissoes da configuracao: o de ferias paga-se em junho e o de Natal em novembro. */
export const FERIAS_MES_OMISSAO = 6;
export const NATAL_MES_OMISSAO = 11;

/** A configuracao como a base a devolve. */
export interface SubsidiosConfigLida extends SubsidiosConfig {
  /** Falso: a organizacao ainda nunca guardou configuracao (vale a omissao: desligada). */
  temConfig: boolean;
  /** O inicio da primeira folha fechada da organizacao; `null` = nao ha folhas fechadas. */
  folhasFechadasDesde: string | null;
  /** O fim da folha fechada mais recente; `null` = nao ha. */
  ultimaFolhaFechadaAte: string | null;
}

const dataOuNull = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const mesOuOmissao = (v: unknown, omissao: number): number => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12 ? v : omissao);

/** Um mes valido (inteiro de 1 a 12). */
export const mesValido = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12;

/** A RPC ainda nao existe na base (migration por aplicar): nao e um defeito. */
export const subsidiosConfigIndisponivel = contagemIndisponivel;

/** Recusa por permissao (42501, PGRST301, 401, 403, ou «permission denied»): nao e um defeito, e o utilizador nao pode ler/escrever. */
export function subsidiosConfigRecusada(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (typeof code === "string" && ["42501", "PGRST301", "401", "403"].includes(code)) return true;
  return typeof message === "string" && /permission denied|insufficient_privilege/i.test(message);
}

/**
 * `rpc_hr_subsidios_config_ler(p_organization_id)` -> `{tem_config, ativo_desde, ferias_mes, natal_mes, folhas_fechadas_desde,
 * ultima_folha_fechada_ate}`. Sem configuracao guardada vale desligada (`ativoDesde` null), junho e novembro. Lanca o erro da base.
 */
export async function lerSubsidiosConfig(organizationId: string): Promise<SubsidiosConfigLida> {
  const { data, error } = await rpc("rpc_hr_subsidios_config_ler", { p_organization_id: organizationId });
  if (error) throw error;
  const temConfig = data?.tem_config === true;
  return {
    temConfig,
    // Sem configuracao guardada nunca esta ligada, mesmo que a resposta traga uma data.
    ativoDesde: temConfig ? dataOuNull(data?.ativo_desde) : null,
    feriasMes: mesOuOmissao(data?.ferias_mes, FERIAS_MES_OMISSAO),
    natalMes: mesOuOmissao(data?.natal_mes, NATAL_MES_OMISSAO),
    folhasFechadasDesde: dataOuNull(data?.folhas_fechadas_desde),
    ultimaFolhaFechadaAte: dataOuNull(data?.ultima_folha_fechada_ate),
  };
}

/** `rpc_hr_subsidios_config_guardar(p_organization_id, p_ativo_desde, p_ferias_mes, p_natal_mes)`: `null` em `ativoDesde` desliga. Lanca o erro da base. */
export async function guardarSubsidiosConfig(
  organizationId: string,
  config: SubsidiosConfig,
): Promise<{ alterada: boolean; ativoDesde: string | null; feriasMes: number; natalMes: number }> {
  const { data, error } = await rpc("rpc_hr_subsidios_config_guardar", {
    p_organization_id: organizationId,
    p_ativo_desde: config.ativoDesde,
    p_ferias_mes: config.feriasMes,
    p_natal_mes: config.natalMes,
  });
  if (error) throw error;
  return {
    alterada: data?.alterada === true,
    ativoDesde: dataOuNull(data?.ativo_desde),
    feriasMes: mesOuOmissao(data?.ferias_mes, config.feriasMes),
    natalMes: mesOuOmissao(data?.natal_mes, config.natalMes),
  };
}

/**
 * O que `rpc_hr_subsidios_assinatura(p_periodo_id)` diz de UM periodo: se o pagamento esta ligado para a folha (`aplica`), a
 * configuracao em vigor, que subsidios o periodo paga e a assinatura dessa configuracao (md5; `null` com `aplica` falso). O fecho exige
 * em CADA resultado a assinatura da configuracao com que o calculo foi feito: por isso esta leitura guarda-se JUNTO com o calculo.
 */
export interface SubsidiosAssinaturaLida {
  aplica: boolean;
  ano: number | null;
  mes: number | null;
  ativoDesde: string | null;
  feriasMes: number;
  natalMes: number;
  /** O periodo paga o subsidio de ferias / o de Natal (a base decide o mes; so e verdadeiro com `aplica`). */
  pagaFerias: boolean;
  pagaNatal: boolean;
  assinatura: string | null;
}

/** A resposta da RPC nao e a que o contrato promete (nao e um objecto, ou liga o pagamento sem assinatura): nao se usa. */
export const ERRO_SUBSIDIOS_ASSINATURA_INVALIDA = "subsidios_assinatura_resposta_invalida";

/** `rpc_hr_subsidios_assinatura(p_periodo_id)`. Lanca o erro da base, ou `ERRO_SUBSIDIOS_ASSINATURA_INVALIDA` se a resposta nao serve. */
export async function lerSubsidiosAssinatura(periodoId: string): Promise<SubsidiosAssinaturaLida> {
  const { data, error } = await rpc("rpc_hr_subsidios_assinatura", { p_periodo_id: periodoId });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(ERRO_SUBSIDIOS_ASSINATURA_INVALIDA);
  const aplica = data.aplica === true;
  const assinatura = aplica && typeof data.assinatura === "string" && data.assinatura !== "" ? data.assinatura : null;
  // Pagamento ligado sem assinatura: o fecho recusaria sempre, e enviar um resultado sem ela nunca e uma opcao.
  if (aplica && assinatura === null) throw new Error(ERRO_SUBSIDIOS_ASSINATURA_INVALIDA);
  return {
    aplica,
    ano: Number.isInteger(data.ano) ? data.ano : null,
    mes: mesValido(data.mes) ? data.mes : null,
    ativoDesde: aplica ? dataOuNull(data.ativo_desde) : null,
    feriasMes: mesOuOmissao(data.ferias_mes, FERIAS_MES_OMISSAO),
    natalMes: mesOuOmissao(data.natal_mes, NATAL_MES_OMISSAO),
    pagaFerias: aplica && data.paga_ferias === true,
    pagaNatal: aplica && data.paga_natal === true,
    assinatura,
  };
}
