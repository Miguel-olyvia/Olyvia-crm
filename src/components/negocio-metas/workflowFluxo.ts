// O texto e as setas do diagrama do Workflow: cada passo tem uma seta de ganho e, por baixo, uma
// de perdido. Lógica pura: devolve chaves de tradução (`Texto`).
import {
  acaoDe, normalizarConfig, tx, type Celula, type ConfigWorkflow, type FaseCadeia, type NoWorkflow, type Texto,
} from "./workflowNegocio";

export interface SetaFluxo {
  id: string;
  tipo: "ganho" | "perdido";
  de: FaseCadeia;
  /** O destino da resposta; "perguntar" aponta ao nó seguinte (o rótulo diz "pergunta"); `null` só em "não faz nada". */
  para: NoWorkflow | null;
  rotulo: Texto;
  frase: Texto;
}

export interface DescricaoFluxo {
  nos: { id: FaseCadeia | "ganho"; ligado: boolean }[];
  /** Por ordem: Orçamento ganho e perdido, Proposta ganho e perdido, Contrato ganho e perdido. */
  setas: SetaFluxo[];
  /** O texto equivalente do diagrama, frase a frase. */
  frases: Texto[];
}

/** Para onde leva cada resposta (chave `célula.valor`); `null` só em "não faz nada"; "pergunta" aponta ao nó a que a resposta pode levar. */
const DESTINO: Record<string, NoWorkflow | null> = {
  "orcamentoGanho.criarProposta": "proposta",
  "orcamentoGanho.perguntar": "proposta",
  "orcamentoGanho.nada": null,
  "orcamentoGanho.fecharGanho": "ganho",
  "orcamentoPerdido.perderSeUltimo": "perdido",
  "orcamentoPerdido.manterAberto": "orcamento",
  "orcamentoPerdido.perguntar": "perdido",
  "propostaGanho.perguntarContrato": "contrato",
  "propostaGanho.criarContrato": "contrato",
  "propostaGanho.fecharSemContrato": "ganho",
  "propostaPerdido.perderNegocio": "perdido",
  "propostaPerdido.voltarOrcamento": "orcamento",
  "propostaPerdido.perguntar": "perdido",
  "contratoPerdido.perderNegocio": "perdido",
  "contratoPerdido.voltarProposta": "proposta",
  "contratoPerdido.perguntar": "perdido",
};

function seta(de: FaseCadeia, tipo: SetaFluxo["tipo"], celula: Celula | "contratoGanho", valor: string): SetaFluxo {
  const acao = acaoDe(celula, valor);
  return {
    id: `${de}.${tipo}`, tipo, de,
    para: celula === "contratoGanho" ? "ganho" : DESTINO[`${celula}.${valor}`],
    rotulo: tx(`seta.${tipo}`, { acao }),
    frase: tx(`frase.${tipo}`, { de: tx(`no.${de}`), acao }),
  };
}

/** Os nós, as setas de ganho e de perdido com rótulo, e o texto equivalente do diagrama. */
export function descreverFluxo(entrada: ConfigWorkflow): DescricaoFluxo {
  const c = normalizarConfig(entrada).config;
  const setas = [
    seta("orcamento", "ganho", "orcamentoGanho", c.orcamentoGanho),
    seta("orcamento", "perdido", "orcamentoPerdido", c.orcamentoPerdido),
    ...(c.fases.proposta ? [
      seta("proposta", "ganho", "propostaGanho", c.propostaGanho),
      seta("proposta", "perdido", "propostaPerdido", c.propostaPerdido),
    ] : []),
    ...(c.fases.contrato ? [
      seta("contrato", "ganho", "contratoGanho", "assinado"),
      seta("contrato", "perdido", "contratoPerdido", c.contratoPerdido),
    ] : []),
  ];
  return {
    nos: [
      { id: "orcamento", ligado: true }, { id: "proposta", ligado: c.fases.proposta },
      { id: "contrato", ligado: c.fases.contrato }, { id: "ganho", ligado: true },
    ],
    setas,
    frases: [
      ...setas.map((s) => s.frase),
      ...(c.fases.proposta ? [] : [tx("frase.propostaOff")]),
      ...(c.fases.contrato ? [] : [tx("frase.contratoOff")]),
      tx("frase.motivo"),
    ],
  };
}
