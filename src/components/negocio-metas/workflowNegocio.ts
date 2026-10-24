// Lógica pura da aba "Workflow" de "Negócio e metas" (v2): a configuração de exemplo, as
// regras que a mantêm coerente e as opções que ela admite. A descrição do diagrama está em
// `workflowFluxo.ts` e a simulação em `workflowSimulacao.ts`. Nada aqui lê nem grava dados:
// devolve só chaves de tradução (`Texto`), que os componentes passam por `t()`.

/** O que acontece quando o orçamento é ganho (aceite). A primeira opção de cada lista é o defeito. */
export type OrcamentoGanho = "criarProposta" | "perguntar" | "nada" | "fecharGanho";
/** O que acontece quando um orçamento é perdido (recusado). */
export type OrcamentoPerdido = "perderSeUltimo" | "manterAberto" | "perguntar";
export type PropostaGanho = "perguntarContrato" | "criarContrato" | "fecharSemContrato";
export type PropostaPerdido = "perderNegocio" | "voltarOrcamento" | "perguntar";
export type ContratoPerdido = "perderNegocio" | "voltarProposta" | "perguntar";

/** Os passos da cadeia; o Orçamento está sempre ligado. */
export type FaseCadeia = "orcamento" | "proposta" | "contrato";
/** Os nós do diagrama; "perdido" só aparece como destino de uma seta, nunca como nó. */
export type NoWorkflow = FaseCadeia | "ganho" | "perdido";

/** Cada célula da matriz Ganho / Perdido. */
export type Celula = "orcamentoGanho" | "orcamentoPerdido" | "propostaGanho" | "propostaPerdido" | "contratoPerdido";

export interface ConfigWorkflow {
  /** O Orçamento está sempre ligado, por isso não é um campo. */
  fases: { proposta: boolean; contrato: boolean };
  orcamentoGanho: OrcamentoGanho;
  orcamentoPerdido: OrcamentoPerdido;
  propostaGanho: PropostaGanho;
  propostaPerdido: PropostaPerdido;
  contratoPerdido: ContratoPerdido;
  motivosPerda: string[];
}

/** Um parâmetro pode ser outro texto (traduzido à parte): o texto sai sempre de `t()`. */
export type ParamTexto = string | number | Texto;

/** Uma chave de tradução e os seus parâmetros. */
export interface Texto {
  chave: string;
  params?: Record<string, ParamTexto>;
}

export const OPCOES_ORCAMENTO_GANHO: readonly OrcamentoGanho[] = ["criarProposta", "perguntar", "nada", "fecharGanho"];
export const OPCOES_ORCAMENTO_PERDIDO: readonly OrcamentoPerdido[] = ["perderSeUltimo", "manterAberto", "perguntar"];
export const OPCOES_PROPOSTA_GANHO: readonly PropostaGanho[] = ["perguntarContrato", "criarContrato", "fecharSemContrato"];
export const OPCOES_PROPOSTA_PERDIDO: readonly PropostaPerdido[] = ["perderNegocio", "voltarOrcamento", "perguntar"];
export const OPCOES_CONTRATO_PERDIDO: readonly ContratoPerdido[] = ["perderNegocio", "voltarProposta", "perguntar"];
export const MAX_MOTIVOS = 8;
export const MAX_CARACTERES_MOTIVO = 40;

const PREFIXO = "businessGoals.workflow.";
export const tx = (sufixo: string, params?: Record<string, ParamTexto>): Texto => ({ chave: PREFIXO + sufixo, params });

export type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

/** Traduz um texto, incluindo os parâmetros que são, eles próprios, textos. */
export function traduzir(t: Traduzir, texto: Texto): string {
  if (!texto.params) return t(texto.chave);
  const params = Object.fromEntries(
    Object.entries(texto.params).map(([k, v]) => [k, typeof v === "object" ? traduzir(t, v) : v]),
  );
  return t(texto.chave, params);
}

/** A ação de uma célula, em minúsculas e sem ponto final ("cria a proposta"), para entrar numa frase. */
export const acaoDe = (celula: Celula | "contratoGanho", valor: string): Texto => tx(`passo.${celula}.${valor}`);

/** Dados de exemplo editáveis: ficam em português nas duas línguas (a ajuda da lista F di-lo). */
export const MOTIVOS_PREDEFINIDOS: readonly string[] = ["Preço", "Concorrência", "Sem resposta", "Adiou", "Outro"];

export const PREDEFINICAO: ConfigWorkflow = {
  fases: { proposta: true, contrato: true },
  orcamentoGanho: "criarProposta",
  orcamentoPerdido: "perderSeUltimo",
  propostaGanho: "perguntarContrato",
  propostaPerdido: "perderNegocio",
  contratoPerdido: "perderNegocio",
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

type Celulas = Omit<ConfigWorkflow, "fases" | "motivosPerda">;

/** Aplica as regras de C às células: o que fica escondido volta ao defeito e o que fica visível só admite o que existe. */
function normalizarCelulas(entrada: Celulas, proposta: boolean, contrato: boolean): { celulas: Celulas; avisos: Texto[] } {
  const c: Celulas = { ...entrada };
  const avisos: Texto[] = [];
  if (!proposta && c.orcamentoGanho !== "fecharGanho") {
    c.orcamentoGanho = "fecharGanho";
    avisos.push(tx("aviso.orcamentoPorProposta"));
  }
  if (!proposta) {
    if (c.propostaGanho !== PREDEFINICAO.propostaGanho || c.propostaPerdido !== PREDEFINICAO.propostaPerdido) {
      avisos.push(tx("aviso.propostaOculta"));
    }
    c.propostaGanho = PREDEFINICAO.propostaGanho;
    c.propostaPerdido = PREDEFINICAO.propostaPerdido;
  } else if (!contrato && c.propostaGanho !== "fecharSemContrato") {
    c.propostaGanho = "fecharSemContrato";
    avisos.push(tx("aviso.propostaPorContrato"));
  }
  if (!contrato) {
    if (c.contratoPerdido !== PREDEFINICAO.contratoPerdido) avisos.push(tx("aviso.contratoOculto"));
    c.contratoPerdido = PREDEFINICAO.contratoPerdido;
  }
  return { celulas: c, avisos };
}

/**
 * Mantém a configuração coerente (aplica-se ao mudar e ao ler): sem Proposta não há Contrato,
 * uma linha escondida volta ao defeito e as respostas só admitem o que existe. Devolve uma cópia e os avisos.
 */
export function normalizarConfig(entrada: EntradaConfig): ResultadoNormalizacao {
  const proposta = entrada.fases.proposta;
  const contrato = proposta && entrada.fases.contrato;
  const avisos: Texto[] = contrato !== entrada.fases.contrato ? [tx("aviso.contratoPorProposta")] : [];
  const { celulas, avisos: avisosCelulas } = normalizarCelulas(entrada, proposta, contrato);
  const m = normalizarMotivos(entrada.motivosPerda);
  return {
    config: { ...celulas, fases: { proposta, contrato }, motivosPerda: m.motivos },
    avisos: [...avisos, ...avisosCelulas, ...m.avisos],
  };
}

/**
 * Os avisos de ligar ou desligar uma fase em «Fases em uso»: dizem sempre que as respostas dessa fase deixaram de aparecer (ou
 * voltaram a aparecer), mesmo que nenhum valor mude. Compara o que a pessoa pediu com o que havia.
 */
export function avisosDeFases(antes: ConfigWorkflow["fases"], depois: ConfigWorkflow["fases"]): Texto[] {
  const avisos: Texto[] = [];
  for (const fase of ["proposta", "contrato"] as const) {
    if (antes[fase] !== depois[fase]) avisos.push(tx(`aviso.${fase}${depois[fase] ? "Ligad" : "Desligad"}${fase === "proposta" ? "a" : "o"}`));
  }
  return avisos;
}

export interface OpcoesAdmitidas {
  /** Por valor: `null` = admitido; um `Texto` = indisponível, com o motivo. */
  orcamentoGanho: Record<OrcamentoGanho, Texto | null>;
  orcamentoPerdido: Record<OrcamentoPerdido, Texto | null>;
  propostaGanho: Record<PropostaGanho, Texto | null>;
  propostaPerdido: Record<PropostaPerdido, Texto | null>;
  contratoPerdido: Record<ContratoPerdido, Texto | null>;
  /** As linhas da matriz que se mostram: uma fase desligada esconde a sua linha. */
  linhas: { proposta: boolean; contrato: boolean };
  /** `null` = o Contrato pode ligar-se; um `Texto` = não pode (a Proposta está desligada). */
  contratoLigavel: Texto | null;
}

const todas = <T extends string>(valores: readonly T[], motivo: Texto | null = null): Record<T, Texto | null> =>
  Object.fromEntries(valores.map((v) => [v, motivo])) as Record<T, Texto | null>;

/** O que a configuração admite, para mostrar as opções inválidas desativadas e com o motivo escrito. */
export function opcoesAdmitidas(c: ConfigWorkflow): OpcoesAdmitidas {
  const semProposta = c.fases.proposta ? null : tx("indisponivel.propostaDesligada");
  const semContrato = c.fases.proposta && c.fases.contrato ? null : tx("indisponivel.contratoDesligado");
  return {
    orcamentoGanho: { ...todas(OPCOES_ORCAMENTO_GANHO, semProposta), fecharGanho: null },
    orcamentoPerdido: todas(OPCOES_ORCAMENTO_PERDIDO),
    propostaGanho: { ...todas(OPCOES_PROPOSTA_GANHO, semContrato), fecharSemContrato: null },
    propostaPerdido: todas(OPCOES_PROPOSTA_PERDIDO),
    contratoPerdido: todas(OPCOES_CONTRATO_PERDIDO),
    linhas: { proposta: c.fases.proposta, contrato: c.fases.proposta && c.fases.contrato },
    contratoLigavel: semProposta,
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

/** Primeira letra em maiúscula: a ação de uma célula serve de rótulo de opção. */
export const capitalizar = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);
