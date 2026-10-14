// Cálculos puros da página "Negócio e metas". Nada aqui lê dados: recebe os
// negócios e as metas e devolve totais e percentagens, para que os números do
// ecrã nunca sejam escritos à mão.

export type FaseNegocio = "orcamento" | "proposta" | "contrato" | "ganho";
export type EstadoProposta = "rascunho" | "enviada" | "aceite";
export type EstadoContrato = "pendente" | "assinado";

export interface OrcamentoNegocio {
  id: string;
  valor: number;
  escolhido: boolean;
}

/** Os dados de contacto escritos ao criar um negócio (todos opcionais; texto vazio quando não há). */
export interface DadosContactoNegocio {
  email: string;
  morada: string;
  distrito: string;
  nif: string;
  empresa: string;
  nifEmpresa: string;
}

/** Uma linha do levantamento, já em texto (o que se escolheu no formulário, na língua em que foi criado). */
export interface LinhaLevantamento {
  divisao: string;
  trabalho: string;
  medida: number;
  /** "m²", "m" ou "un". */
  unidade: string;
  observacoes: string;
}

export type EstadoLevantamento = "porFazer" | "feito";

/** O levantamento escrito ao criar um negócio (só exemplo, em memória). */
export interface LevantamentoNegocio {
  /** AAAA-MM-DD. */
  data: string;
  feitoPor: string;
  estado: EstadoLevantamento;
  linhas: LinhaLevantamento[];
  observacoes: string;
}

/** Uma pergunta de escolha rápida e a opção escolhida, já em texto (na língua em que se criou o negócio). */
export interface RespostaNegocio {
  pergunta: string;
  resposta: string;
}

/** A morada da obra (do negócio, não da pessoa), tal como foi escrita. */
export interface MoradaObraNegocio {
  rua: string;
  codigoPostal: string;
  localidade: string;
  andar: string;
}

/** Uma secção da Visita com o que se respondeu nela. */
export interface SeccaoVisitaNegocio {
  titulo: string;
  respostas: RespostaNegocio[];
}

export interface NegocioMes {
  id: string;
  /** A pessoa (lead/cliente) a que o negócio pertence; serve para a abrir. */
  pessoaId: string;
  pessoa: string;
  servico: string;
  comercial: string;
  /** Dias desde que o negócio entrou. */
  dias: number;
  /** Dias parado em Orçamento ou Proposta; `null` nas outras fases. */
  parado: number | null;
  /** Prazo do próximo passo (AAAA-MM-DD); `null` sem prazo. Estar em atraso deriva daqui (ver `saudeNegocio.ts`). */
  proximoPrazo: string | null;
  contacto: { telefone: string | null; email: string | null };
  /** Só nos negócios criados em "Novo negócio": o contacto tal como foi escrito no formulário. */
  dadosContacto?: DadosContactoNegocio;
  /** Só nos negócios criados em "Novo negócio", e só se se escreveu alguma coisa na aba Levantamento. */
  levantamento?: LevantamentoNegocio;
  /** Só nos negócios criados em "Novo negócio", e só se se respondeu a alguma pergunta da aba Qualificação. */
  qualificacao?: RespostaNegocio[];
  /** Só nos negócios criados em "Novo negócio", e só se se escreveu alguma coisa na Morada da obra. */
  moradaObra?: MoradaObraNegocio;
  /** Só nos negócios criados em "Novo negócio", e só se se respondeu a alguma pergunta da aba Visita. */
  visita?: SeccaoVisitaNegocio[];
  orcamentos: OrcamentoNegocio[];
  proposta: { estado: EstadoProposta } | null;
  contrato: { estado: EstadoContrato } | null;
}

export interface MetaComercial {
  comercial: string;
  meta: number;
}

export interface MetasMes {
  valor: number;
  negociosGanhos: number;
  /** Percentagem (0-100) de negócios do mês que terminam ganhos. */
  conversao: number;
  propostasEnviadas: number;
}

export interface MesEvolucao {
  /** Mês no formato AAAA-MM. */
  mes: string;
  meta: number;
  ganho: number;
}

export interface ProgressoMeta {
  atual: number;
  meta: number;
  /** Percentagem arredondada, sem limite superior (pode passar de 100). */
  percentagem: number;
}

export interface TotaisComercial extends ProgressoMeta {
  comercial: string;
}

export interface DadosNegocioMetas {
  mesAtual: string;
  metasMes: MetasMes;
  metasComerciais: MetaComercial[];
  negocios: NegocioMes[];
  evolucaoAnterior: MesEvolucao[];
}

/** Percentagem inteira de `valor` sobre `meta`; 0 quando a meta é 0 ou inválida. */
export function percentagem(valor: number, meta: number): number {
  if (!Number.isFinite(valor) || !Number.isFinite(meta) || meta <= 0) return 0;
  return Math.round((valor / meta) * 100);
}

/** Percentagem para a barra: nunca abaixo de 0 nem acima de 100. */
export function percentagemBarra(valor: number, meta: number): number {
  return Math.min(100, Math.max(0, percentagem(valor, meta)));
}

/** O valor do negócio é o do orçamento escolhido; sem escolha, é 0. */
export function valorDoNegocio(negocio: NegocioMes): number {
  return negocio.orcamentos.find((o) => o.escolhido)?.valor ?? 0;
}

/** A fase é a do último passo da cadeia; contrato assinado passa a Ganho. */
export function faseDoNegocio(negocio: NegocioMes): FaseNegocio {
  if (negocio.contrato) return negocio.contrato.estado === "assinado" ? "ganho" : "contrato";
  if (negocio.proposta) return "proposta";
  return "orcamento";
}

/** Ganho = contrato assinado. */
export function isNegocioGanho(negocio: NegocioMes): boolean {
  return negocio.contrato?.estado === "assinado";
}

/** Proposta enviada = existe e já saiu de rascunho. */
export function isPropostaEnviada(negocio: NegocioMes): boolean {
  return negocio.proposta !== null && negocio.proposta.estado !== "rascunho";
}

export function valorGanho(negocios: readonly NegocioMes[]): number {
  return negocios.filter(isNegocioGanho).reduce((soma, n) => soma + valorDoNegocio(n), 0);
}

export function contarGanhos(negocios: readonly NegocioMes[]): number {
  return negocios.filter(isNegocioGanho).length;
}

export function contarPropostasEnviadas(negocios: readonly NegocioMes[]): number {
  return negocios.filter(isPropostaEnviada).length;
}

/** Conversão: negócios ganhos sobre negócios do mês, em percentagem inteira. */
export function conversao(negocios: readonly NegocioMes[]): number {
  return percentagem(contarGanhos(negocios), negocios.length);
}

export function totaisPorComercial(
  negocios: readonly NegocioMes[],
  metas: readonly MetaComercial[],
): TotaisComercial[] {
  return metas.map(({ comercial, meta }) => {
    const atual = valorGanho(negocios.filter((n) => n.comercial === comercial));
    return { comercial, atual, meta, percentagem: percentagem(atual, meta) };
  });
}

export type ChaveCartao = "valor" | "negocios" | "conversao" | "propostas";

export interface CartaoMeta extends ProgressoMeta {
  chave: ChaveCartao;
  /** Formato com que o ecrã mostra `atual` e `meta`. */
  unidade: "euro" | "contagem" | "percentagem";
}

export function cartoesDoMes(negocios: readonly NegocioMes[], metas: MetasMes): CartaoMeta[] {
  const montar = (
    chave: ChaveCartao,
    unidade: CartaoMeta["unidade"],
    atual: number,
    meta: number,
  ): CartaoMeta => ({ chave, unidade, atual, meta, percentagem: percentagem(atual, meta) });
  return [
    montar("valor", "euro", valorGanho(negocios), metas.valor),
    montar("negocios", "contagem", contarGanhos(negocios), metas.negociosGanhos),
    montar("conversao", "percentagem", conversao(negocios), metas.conversao),
    montar("propostas", "contagem", contarPropostasEnviadas(negocios), metas.propostasEnviadas),
  ];
}

/** Evolução: meses anteriores fixos + o mês atual calculado a partir dos negócios. */
export function evolucaoMensal(dados: DadosNegocioMetas): MesEvolucao[] {
  return [
    ...dados.evolucaoAnterior,
    { mes: dados.mesAtual, meta: dados.metasMes.valor, ganho: valorGanho(dados.negocios) },
  ];
}

/** Lista o que não bate certo nos dados de exemplo; vazia quando tudo é coerente. */
export function verificarCoerencia(dados: DadosNegocioMetas): string[] {
  const problemas: string[] = [];
  const somaMetas = dados.metasComerciais.reduce((s, m) => s + m.meta, 0);
  if (somaMetas !== dados.metasMes.valor) {
    problemas.push(`metas por comercial (${somaMetas}) != meta do mês (${dados.metasMes.valor})`);
  }
  const nomes = new Set(dados.metasComerciais.map((m) => m.comercial));
  for (const n of dados.negocios) {
    if (!nomes.has(n.comercial)) problemas.push(`negócio ${n.id}: comercial sem meta`);
    if (n.orcamentos.filter((o) => o.escolhido).length > 1) {
      problemas.push(`negócio ${n.id}: mais de um orçamento escolhido`);
    }
    if (n.proposta && !n.orcamentos.some((o) => o.escolhido)) {
      problemas.push(`negócio ${n.id}: proposta sem orçamento escolhido`);
    }
    if (n.contrato && !n.proposta) problemas.push(`negócio ${n.id}: contrato sem proposta`);
  }
  const somaComerciais = totaisPorComercial(dados.negocios, dados.metasComerciais)
    .reduce((s, t) => s + t.atual, 0);
  if (somaComerciais !== valorGanho(dados.negocios)) {
    problemas.push("soma por comercial != valor ganho do mês");
  }
  return problemas;
}
