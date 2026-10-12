// Cálculos puros da página "Negócio e metas". Nada aqui lê dados: recebe os
// negócios e as metas e devolve totais e percentagens, para que os números do
// ecrã nunca sejam escritos à mão.

export type FaseNegocio = "orcamento" | "proposta" | "contrato";
export type EstadoProposta = "rascunho" | "enviada" | "aceite";
export type EstadoContrato = "pendente" | "assinado";

export interface OrcamentoNegocio {
  id: string;
  valor: number;
  escolhido: boolean;
}

export interface NegocioMes {
  id: string;
  pessoa: string;
  servico: string;
  comercial: string;
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

/** A fase é a do último passo da cadeia que existe. */
export function faseDoNegocio(negocio: NegocioMes): FaseNegocio {
  if (negocio.contrato) return "contrato";
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
