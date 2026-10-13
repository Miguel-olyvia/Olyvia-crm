// Lógica pura da aba "Workflow" de "Negócio e metas": a configuração de exemplo, as
// regras que a mantêm coerente, o texto equivalente do diagrama e a simulação de
// "aceitar". Nada aqui lê nem grava dados: devolve só chaves de tradução (`Texto`),
// que os componentes passam por `t()`.
import { faseDoNegocio, type NegocioMes } from "./negocioMetas";

export type AoAceitarOrcamento = "criarProposta" | "perguntar" | "nada" | "fecharGanho";
export type AoAceitarProposta = "perguntarContrato" | "criarContrato" | "fecharSemContrato";
export type NoWorkflow = "orcamento" | "proposta" | "contrato" | "ganho";
export type EventoAceite = "aceitarOrcamento" | "aceitarProposta";

export interface ConfigWorkflow {
  aoAceitarOrcamento: AoAceitarOrcamento;
  aoAceitarProposta: AoAceitarProposta;
  /** O Orçamento está sempre ligado, por isso não é um campo. */
  fases: { proposta: boolean; contrato: boolean };
  motivosPerda: string[];
}

/** Uma chave de tradução e os seus parâmetros: o texto sai sempre de `t()`. */
export interface Texto {
  chave: string;
  params?: Record<string, string | number>;
}

export const OPCOES_ORCAMENTO: readonly AoAceitarOrcamento[] = ["criarProposta", "perguntar", "nada", "fecharGanho"];
export const OPCOES_PROPOSTA: readonly AoAceitarProposta[] = ["perguntarContrato", "criarContrato", "fecharSemContrato"];
export const MAX_MOTIVOS = 8;
export const MAX_CARACTERES_MOTIVO = 40;

const PREFIXO = "businessGoals.workflow.";
export const tx = (sufixo: string, params?: Record<string, string | number>): Texto => ({ chave: PREFIXO + sufixo, params });

export type Traduzir = (chave: string, params?: Record<string, string | number>) => string;
export const traduzir = (t: Traduzir, texto: Texto): string => t(texto.chave, texto.params);

/** Dados de exemplo editáveis: ficam em português nas duas línguas (a ajuda da lista F di-lo). */
export const MOTIVOS_PREDEFINIDOS: readonly string[] = ["Preço", "Concorrência", "Sem resposta", "Adiou", "Outro"];

export const PREDEFINICAO: ConfigWorkflow = {
  aoAceitarOrcamento: "criarProposta",
  aoAceitarProposta: "perguntarContrato",
  fases: { proposta: true, contrato: true },
  motivosPerda: [...MOTIVOS_PREDEFINIDOS],
};

/** Uma configuração por validar: os motivos podem vir de fora (armazenamento), por isso são `unknown`. */
export type EntradaConfig = Omit<ConfigWorkflow, "motivosPerda"> & { motivosPerda: readonly unknown[] };

/** Uma cópia independente, para que quem a recebe nunca altere a predefinição partilhada. */
export const copiarConfig = (c: ConfigWorkflow): ConfigWorkflow => ({
  ...c, fases: { ...c.fases }, motivosPerda: [...c.motivosPerda],
});

export interface ResultadoNormalizacao {
  config: ConfigWorkflow;
  /** "Alterámos X porque Y", um por regra aplicada. */
  avisos: Texto[];
}

function normalizarMotivos(entrada: readonly unknown[]): { motivos: string[]; avisos: Texto[] } {
  const vistos = new Set<string>();
  const motivos: string[] = [];
  const flags = { cortado: false, repetido: false, excesso: false };
  for (const bruto of entrada) {
    if (typeof bruto !== "string" || bruto.trim() === "") continue;
    let motivo = bruto.trim();
    if (motivo.length > MAX_CARACTERES_MOTIVO) {
      motivo = motivo.slice(0, MAX_CARACTERES_MOTIVO).trim();
      flags.cortado = true;
    }
    const chave = motivo.toLowerCase();
    if (vistos.has(chave)) flags.repetido = true;
    else if (motivos.length >= MAX_MOTIVOS) flags.excesso = true;
    else { vistos.add(chave); motivos.push(motivo); }
  }
  const avisos: Texto[] = [];
  if (flags.cortado) avisos.push(tx("aviso.motivosCortados", { max: MAX_CARACTERES_MOTIVO }));
  if (flags.repetido) avisos.push(tx("aviso.motivosRepetidos"));
  if (flags.excesso) avisos.push(tx("aviso.motivosExcesso", { max: MAX_MOTIVOS }));
  if (motivos.length > 0) return { motivos, avisos };
  return { motivos: [...MOTIVOS_PREDEFINIDOS], avisos: [tx("aviso.motivosVazios")] };
}

/**
 * Mantém a configuração coerente (aplica-se ao mudar e ao ler): sem Proposta não há Contrato,
 * e as respostas de "ao aceitar" só admitem o que existe. Devolve uma cópia e os avisos.
 */
export function normalizarConfig(entrada: EntradaConfig): ResultadoNormalizacao {
  const avisos: Texto[] = [];
  const proposta = entrada.fases.proposta;
  const contrato = proposta && entrada.fases.contrato;
  if (contrato !== entrada.fases.contrato) avisos.push(tx("aviso.contratoPorProposta"));
  let aoAceitarOrcamento = entrada.aoAceitarOrcamento;
  if (!proposta && aoAceitarOrcamento !== "fecharGanho") {
    aoAceitarOrcamento = "fecharGanho";
    avisos.push(tx("aviso.orcamentoPorProposta"));
  }
  let aoAceitarProposta = entrada.aoAceitarProposta;
  if (!contrato && aoAceitarProposta !== "fecharSemContrato") {
    aoAceitarProposta = "fecharSemContrato";
    avisos.push(tx("aviso.propostaPorContrato"));
  }
  const m = normalizarMotivos(entrada.motivosPerda);
  return {
    config: { aoAceitarOrcamento, aoAceitarProposta, fases: { proposta, contrato }, motivosPerda: m.motivos },
    avisos: [...avisos, ...m.avisos],
  };
}

export interface OpcoesAdmitidas {
  /** `null` = admitida; um `Texto` = indisponível, com o motivo. */
  orcamento: Record<AoAceitarOrcamento, Texto | null>;
  proposta: Record<AoAceitarProposta, Texto | null>;
  contrato: Texto | null;
}

/** O que a configuração admite, para mostrar as opções inválidas desativadas e com o motivo escrito. */
export function opcoesAdmitidas(c: ConfigWorkflow): OpcoesAdmitidas {
  const semProposta = c.fases.proposta ? null : tx("indisponivel.propostaDesligada");
  const semContrato = c.fases.proposta && c.fases.contrato ? null : tx("indisponivel.contratoDesligado");
  return {
    orcamento: { criarProposta: semProposta, perguntar: semProposta, nada: semProposta, fecharGanho: null },
    proposta: { perguntarContrato: semContrato, criarContrato: semContrato, fecharSemContrato: null },
    contrato: semProposta,
  };
}

/** Valida um motivo novo antes de entrar na lista; `null` = válido. */
export function validarMotivo(texto: string, existentes: readonly string[]): Texto | null {
  const motivo = texto.trim();
  if (existentes.length >= MAX_MOTIVOS) return tx("motivo.cheio", { max: MAX_MOTIVOS });
  if (motivo === "") return tx("motivo.vazio");
  if (motivo.length > MAX_CARACTERES_MOTIVO) return tx("motivo.longo", { max: MAX_CARACTERES_MOTIVO });
  if (existentes.some((e) => e.trim().toLowerCase() === motivo.toLowerCase())) return tx("motivo.repetido");
  return null;
}

export interface SetaFluxo {
  id: string;
  de: NoWorkflow;
  para: NoWorkflow;
  rotulo: Texto;
  frase: Texto;
}

export interface DescricaoFluxo {
  nos: { id: NoWorkflow; ligado: boolean }[];
  setas: SetaFluxo[];
  /** O texto equivalente do diagrama, frase a frase. */
  frases: Texto[];
}

const SETA_ORCAMENTO: Record<AoAceitarOrcamento, string> = {
  criarProposta: "orcCriar", perguntar: "orcPerguntar", nada: "orcNada", fecharGanho: "orcGanho",
};
const SETA_PROPOSTA: Record<AoAceitarProposta, string> = {
  perguntarContrato: "propPerguntar", criarContrato: "propCriar", fecharSemContrato: "propSemContrato",
};

const seta = (de: NoWorkflow, para: NoWorkflow, id: string): SetaFluxo => ({
  id, de, para, rotulo: tx(`seta.${id}`), frase: tx(`frase.${id}`),
});

/** Os nós, as setas com rótulo e o texto equivalente do diagrama. */
export function descreverFluxo(entrada: ConfigWorkflow): DescricaoFluxo {
  const { aoAceitarOrcamento: a, aoAceitarProposta: b, fases } = normalizarConfig(entrada).config;
  const setas = [seta("orcamento", a === "fecharGanho" ? "ganho" : "proposta", SETA_ORCAMENTO[a])];
  if (fases.proposta) setas.push(seta("proposta", b === "fecharSemContrato" ? "ganho" : "contrato", SETA_PROPOSTA[b]));
  if (fases.contrato) setas.push(seta("contrato", "ganho", "contratoGanho"));
  return {
    nos: [
      { id: "orcamento", ligado: true }, { id: "proposta", ligado: fases.proposta },
      { id: "contrato", ligado: fases.contrato }, { id: "ganho", ligado: true },
    ],
    setas,
    frases: [
      ...setas.map((s) => s.frase),
      ...(fases.proposta ? [] : [tx("frase.propostaOff")]),
      ...(fases.contrato ? [] : [tx("frase.contratoOff")]),
      tx("frase.perdido"),
    ],
  };
}

export type Simulacao =
  | { tipo: "resultado"; resultado: Texto; proximo: NoWorkflow | null; ganhoSemContrato: boolean }
  | { tipo: "nao-aplicavel"; motivo: Texto };

const naoAplicavel = (sufixo: string): Simulacao => ({ tipo: "nao-aplicavel", motivo: tx(`sim.na.${sufixo}`) });
const resultado = (opcao: string, proximo: NoWorkflow | null): Simulacao => ({
  tipo: "resultado", resultado: tx(`sim.res.${opcao}`), proximo, ganhoSemContrato: proximo === "ganho",
});

function simularOrcamento(c: ConfigWorkflow, n: NegocioMes): Simulacao {
  if (faseDoNegocio(n) !== "orcamento") return naoAplicavel("jaPassou");
  if (!n.orcamentos.some((o) => o.escolhido)) return naoAplicavel("semEscolhido");
  const a = c.aoAceitarOrcamento;
  return resultado(a, a === "fecharGanho" ? "ganho" : a === "nada" ? null : "proposta");
}

function simularProposta(c: ConfigWorkflow, n: NegocioMes): Simulacao {
  if (!c.fases.proposta) return naoAplicavel("faseDesligada");
  if (!n.proposta) return naoAplicavel("semProposta");
  if (n.contrato) return naoAplicavel("jaPassou");
  if (n.proposta.estado === "aceite") return naoAplicavel("jaAceite");
  if (n.proposta.estado === "rascunho") return naoAplicavel("rascunho");
  const b = c.aoAceitarProposta;
  return resultado(b, b === "fecharSemContrato" ? "ganho" : "contrato");
}

/** O que aconteceria ao aceitar. Só calcula: nunca altera o negócio nem a configuração. */
export function simularAceite(entrada: ConfigWorkflow, evento: EventoAceite, negocio: NegocioMes): Simulacao {
  const c = normalizarConfig(entrada).config;
  return evento === "aceitarOrcamento" ? simularOrcamento(c, negocio) : simularProposta(c, negocio);
}

/** "Ao aceitar: ..." só quando há um passo pendente (o mesmo critério do simulador); `null` nos outros. */
export function textoAoAceitar(entrada: ConfigWorkflow, negocio: NegocioMes): Texto | null {
  const c = normalizarConfig(entrada).config;
  const fase = faseDoNegocio(negocio);
  if (fase !== "orcamento" && fase !== "proposta") return null;
  const evento: EventoAceite = fase === "orcamento" ? "aceitarOrcamento" : "aceitarProposta";
  if (simularAceite(c, evento, negocio).tipo !== "resultado") return null;
  return tx(`aoAceitar.${fase === "orcamento" ? c.aoAceitarOrcamento : c.aoAceitarProposta}`);
}
