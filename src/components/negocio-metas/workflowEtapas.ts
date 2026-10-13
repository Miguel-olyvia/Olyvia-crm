// As etapas de cada fase (só leitura) e as ações que o Workflow põe em cada uma,
// derivadas das respostas de "ao aceitar". Lógica pura: devolve chaves de tradução.
import { normalizarConfig, tx, type ConfigWorkflow, type Texto } from "./workflowNegocio";

export type FaseConfiguravel = "orcamento" | "proposta" | "contrato";
export type EstadoAcao = "existe" | "novo" | "confirmar";

export const ETAPAS_POR_FASE: readonly { fase: FaseConfiguravel; etapas: readonly string[] }[] = [
  { fase: "orcamento", etapas: ["rascunho", "enviado", "aceite"] },
  { fase: "proposta", etapas: ["rascunho", "enviada", "aceite"] },
  { fase: "contrato", etapas: ["rascunho", "enviado", "assinado", "cancelado"] },
];

export interface AcaoEtapa {
  fase: FaseConfiguravel;
  etapa: string;
  acao: Texto;
  estado: EstadoAcao;
  /** Ajuda de uma linha. */
  ajuda: Texto;
}

/** O estado de cada ação: o que a aplicação já faz, o que é novo e o que está por confirmar. */
const ESTADO: Record<string, EstadoAcao> = {
  criarProposta: "novo", perguntar: "novo", nada: "existe", fecharGanho: "confirmar",
  perguntarContrato: "novo", criarContrato: "novo", fecharSemContrato: "confirmar",
  registaEnvio: "existe", contaGanho: "existe", perdidoMotivo: "confirmar",
};

const acao = (fase: FaseConfiguravel, etapa: string, id: string): AcaoEtapa => ({
  fase, etapa, estado: ESTADO[id], acao: tx(`acao.${id}`), ajuda: tx(`ajuda.${id}`),
});

/** As ações por etapa; as fases desligadas não têm ações. */
export function acoesPorEtapa(entrada: ConfigWorkflow): AcaoEtapa[] {
  const c = normalizarConfig(entrada).config;
  const lista = [acao("orcamento", "enviado", "registaEnvio"), acao("orcamento", "aceite", c.aoAceitarOrcamento)];
  if (c.fases.proposta) {
    lista.push(acao("proposta", "enviada", "registaEnvio"), acao("proposta", "aceite", c.aoAceitarProposta));
  }
  if (c.fases.contrato) {
    lista.push(acao("contrato", "assinado", "contaGanho"), acao("contrato", "cancelado", "perdidoMotivo"));
  }
  return lista;
}
