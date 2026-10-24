// A configuração do Workflow que o navegador lembra entre visitas (só neste navegador,
// nada vai para a base). localStorage pode falhar ou ter lixo: nesse caso vale a
// predefinição, campo a campo. A versão 1 (só "ao aceitar") migra para a 2; grava-se sempre a 2.
import {
  OPCOES_CONTRATO_PERDIDO, OPCOES_ORCAMENTO_GANHO, OPCOES_ORCAMENTO_PERDIDO, OPCOES_PROPOSTA_GANHO,
  OPCOES_PROPOSTA_PERDIDO, PREDEFINICAO, copiarConfig, normalizarConfig, type ConfigWorkflow, type EntradaConfig,
} from "./workflowNegocio";

export const CHAVE_WORKFLOW = "negocioMetas.workflow";
const VERSAO = 2;

function opcao<T extends string>(valor: unknown, validas: readonly T[], porDefeito: T): T {
  return typeof valor === "string" && validas.includes(valor as T) ? (valor as T) : porDefeito;
}

const booleano = (valor: unknown, porDefeito: boolean): boolean => (typeof valor === "boolean" ? valor : porDefeito);

/** As partes comuns às duas versões: as fases e os motivos. */
function lerBase(p: Record<string, unknown>): Pick<EntradaConfig, "fases" | "motivosPerda"> {
  const fases = typeof p.fases === "object" && p.fases !== null ? (p.fases as Record<string, unknown>) : {};
  return {
    fases: {
      proposta: booleano(fases.proposta, PREDEFINICAO.fases.proposta),
      contrato: booleano(fases.contrato, PREDEFINICAO.fases.contrato),
    },
    motivosPerda: Array.isArray(p.motivosPerda) ? p.motivosPerda : PREDEFINICAO.motivosPerda,
  };
}

/** Versão 1: "ao aceitar" passa a ser "ganho"; as células de perdido ficam no defeito. */
function migrarV1(p: Record<string, unknown>): EntradaConfig {
  return {
    ...copiarConfig(PREDEFINICAO),
    ...lerBase(p),
    orcamentoGanho: opcao(p.aoAceitarOrcamento, OPCOES_ORCAMENTO_GANHO, PREDEFINICAO.orcamentoGanho),
    propostaGanho: opcao(p.aoAceitarProposta, OPCOES_PROPOSTA_GANHO, PREDEFINICAO.propostaGanho),
  };
}

function lerV2(p: Record<string, unknown>): EntradaConfig {
  return {
    ...lerBase(p),
    orcamentoGanho: opcao(p.orcamentoGanho, OPCOES_ORCAMENTO_GANHO, PREDEFINICAO.orcamentoGanho),
    orcamentoPerdido: opcao(p.orcamentoPerdido, OPCOES_ORCAMENTO_PERDIDO, PREDEFINICAO.orcamentoPerdido),
    propostaGanho: opcao(p.propostaGanho, OPCOES_PROPOSTA_GANHO, PREDEFINICAO.propostaGanho),
    propostaPerdido: opcao(p.propostaPerdido, OPCOES_PROPOSTA_PERDIDO, PREDEFINICAO.propostaPerdido),
    contratoPerdido: opcao(p.contratoPerdido, OPCOES_CONTRATO_PERDIDO, PREDEFINICAO.contratoPerdido),
  };
}

/** Lê a configuração, campo a campo, e normaliza no fim; o que estiver estragado volta à predefinição. */
export function lerWorkflow(): ConfigWorkflow {
  try {
    const bruto: unknown = JSON.parse(window.localStorage.getItem(CHAVE_WORKFLOW) ?? "null");
    if (typeof bruto !== "object" || bruto === null) return copiarConfig(PREDEFINICAO);
    const p = bruto as Record<string, unknown>;
    if (p.versao === 1) return normalizarConfig(migrarV1(p)).config;
    if (p.versao === VERSAO) return normalizarConfig(lerV2(p)).config;
    return copiarConfig(PREDEFINICAO);
  } catch {
    return copiarConfig(PREDEFINICAO);
  }
}

export function guardarWorkflow(config: ConfigWorkflow): void {
  try {
    window.localStorage.setItem(CHAVE_WORKFLOW, JSON.stringify({ versao: VERSAO, ...config }));
  } catch {
    // sem armazenamento: a escolha vale só para esta visita
  }
}
