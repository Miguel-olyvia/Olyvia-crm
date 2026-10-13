// A configuração do Workflow que o navegador lembra entre visitas (só neste navegador,
// nada vai para a base). localStorage pode falhar ou ter lixo: nesse caso vale a
// predefinição, campo a campo.
import {
  OPCOES_ORCAMENTO, OPCOES_PROPOSTA, PREDEFINICAO, copiarConfig, normalizarConfig, type ConfigWorkflow,
} from "./workflowNegocio";

export const CHAVE_WORKFLOW = "negocioMetas.workflow";
const VERSAO = 1;

function opcao<T extends string>(valor: unknown, validas: readonly T[], porDefeito: T): T {
  return typeof valor === "string" && validas.includes(valor as T) ? (valor as T) : porDefeito;
}

const booleano = (valor: unknown, porDefeito: boolean): boolean => (typeof valor === "boolean" ? valor : porDefeito);

/** Lê a configuração, campo a campo, e normaliza no fim; o que estiver estragado volta à predefinição. */
export function lerWorkflow(): ConfigWorkflow {
  try {
    const bruto: unknown = JSON.parse(window.localStorage.getItem(CHAVE_WORKFLOW) ?? "null");
    if (typeof bruto !== "object" || bruto === null) return copiarConfig(PREDEFINICAO);
    const p = bruto as Record<string, unknown>;
    if (p.versao !== VERSAO) return copiarConfig(PREDEFINICAO);
    const fases = typeof p.fases === "object" && p.fases !== null ? (p.fases as Record<string, unknown>) : {};
    return normalizarConfig({
      aoAceitarOrcamento: opcao(p.aoAceitarOrcamento, OPCOES_ORCAMENTO, PREDEFINICAO.aoAceitarOrcamento),
      aoAceitarProposta: opcao(p.aoAceitarProposta, OPCOES_PROPOSTA, PREDEFINICAO.aoAceitarProposta),
      fases: {
        proposta: booleano(fases.proposta, PREDEFINICAO.fases.proposta),
        contrato: booleano(fases.contrato, PREDEFINICAO.fases.contrato),
      },
      motivosPerda: Array.isArray(p.motivosPerda) ? p.motivosPerda : PREDEFINICAO.motivosPerda,
    }).config;
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
