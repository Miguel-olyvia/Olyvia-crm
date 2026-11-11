/**
 * As contas do custo de uma pessoa num mes, PASSO A PASSO e sem React: cada linha leva a sua chave (o ecra traduz o rotulo),
 * a formula em texto e o valor. A soma das parcelas bate sempre com o total.
 *
 * Regras (decididas com o utilizador):
 *  - TSU = a taxa da entidade empregadora em Portugal, FIXA (`TSU_EMPREGADOR_PCT`); so a «taxa desta pessoa» a substitui
 *    (regimes de taxa reduzida). Incide SO sobre o salario base e os subsidios (duodecimos, alimentacao, ferias e Natal), menos o
 *    desconto de faltas; ficam fora horas extra, IHT, quilometros, ajudas de custo e valores manuais (decisao do utilizador).
 *  - O seguro de acidentes e uma percentagem POR CARGO e incide so sobre o SALARIO BASE mensal (sem duodecimos, IHT, km nem ajudas).
 *  - Nada se inventa: so se decompoe o que o processamento devolveu; o que ele nao explica fica em «Outras componentes».
 */
import type { DetalheFaltas, DetalheSubsidio, DetalheSubsidiosFeriasNatal } from "@/lib/hr/processamentoTotais";
import { arredondar } from "./custo";

/** A TSU da entidade empregadora (Portugal), em percentagem. Constante: nao se edita no ecra. */
export const TSU_EMPREGADOR_PCT = 23.75;

export type ChaveConta =
  | "salarioBase"
  | "duodecimos"
  | "subsidioAlimentacao"
  | "subsidioAlimentacaoDia"
  | "subsidioAlimentacaoHora"
  | "horasExtra"
  | "faltas"
  | "iht"
  | "km"
  | "ajudas"
  | "subsidioFerias"
  | "subsidioNatal"
  | "manuais"
  | "outras"
  | "arredondamento"
  | "limiteFaltas"
  | "retribuicao"
  | "tsu"
  | "seguro"
  | "equipamentos"
  | "total";

export type NotaConta = "semSeguro" | "cargoDesconhecido" | "taxaDaPessoa" | "faltasExcedem";

export interface LinhaConta {
  chave: ChaveConta;
  /** `parcela` soma ao total; `subtotal` (a retribuicao do mes) so resume as parcelas de cima; `total` fecha. */
  tipo: "parcela" | "subtotal" | "total";
  valor: number;
  /** A conta em texto («23,75 % × 1 741,83 € = 413,70 €»); vazio quando a linha nao tem conta. */
  formula: string;
  /** O valor assenta numa estimativa pelo salario do cargo. */
  estimado?: true;
  nota?: NotaConta;
  /** Parametros do rotulo da linha (o ecra traduz o rotulo com eles): o limite do subsidio, em horas, vem da regra. */
  rotuloParams?: Record<string, string>;
  /** Os dias (AAAA-MM-DD, por ordem) que originaram o valor; ausente = nao se sabe (mes fechado: o detalhe nao esta gravado). */
  dias?: string[];
}

/** O que o processamento devolveu, na parte de que as contas precisam (`ResultadoProcessamentoPessoa` serve). */
export interface ResultadoParaContas {
  baseMes: number | null;
  divisorDuodecimos: number | null;
  linhasAutomaticas: ReadonlyArray<{ origem: string | null; valor: number }>;
  linhasRegra: ReadonlyArray<{ tipo: string; faixa: number | null; quantidade: number | null; valor: number }>;
  descontoFaltas: number;
  subsidioAlimentacao: number;
  /** Subsidio de ferias e de Natal pagos neste mes; ausentes (um gravado antigo) = 0. */
  subsidioFerias?: number;
  subsidioNatal?: number;
  /** A conta por tras dos subsidios de ferias e de Natal; so o processamento vivo a traz. */
  subsidiosDetalhe?: DetalheSubsidiosFeriasNatal;
  /** Os dias e as horas por tras do subsidio e das faltas; so o processamento vivo os traz (o fecho nao os grava). */
  subsidioDetalhe?: DetalheSubsidio;
  faltasDetalhe?: DetalheFaltas;
}

export interface QuantidadeEValor {
  quantidade: number;
  valor: number;
  /** Todas as linhas do tipo tem o mesmo preco unitario (ate 4 casas): so entao «preco × quantidade» e uma conta honesta. Ausente = nao se sabe (conta-se pelo valor). */
  precoUnico?: boolean;
}

/** A retribuicao do mes separada em partes. `null` em iht/km/ajudas = a pessoa nao tem direito (o processamento nao devolveu a linha). */
export interface DecomposicaoRetribuicao {
  /** A retribuicao mensal equivalente: sem duodecimos nem nada acrescentado. */
  salarioBase: number;
  /** O divisor dos duodecimos (14 = sem duodecimos, 12 = subsidios pagos por mes). */
  divisor: number;
  duodecimos: number;
  subsidioAlimentacao: number;
  /** Subsidio de ferias e de Natal pagos neste mes (0 = nao se pagam). */
  subsidioFerias?: number;
  subsidioNatal?: number;
  subsidiosDetalhe?: DetalheSubsidiosFeriasNatal;
  /** Horas extra, feriados e descansos trabalhados (codigos automaticos) e noturnas. */
  horasExtra: number;
  descontoFaltas: number;
  iht: number | null;
  km: QuantidadeEValor | null;
  ajudas: QuantidadeEValor | null;
  /** Os dias e as horas por tras do subsidio e das faltas; ausentes quando o resultado nao os traz (mes fechado). */
  subsidioDetalhe?: DetalheSubsidio;
  faltasDetalhe?: DetalheFaltas;
}

const soma = (valores: readonly number[]): number => arredondar(valores.reduce((s, v) => s + v, 0));

function dosTipo(linhas: ResultadoParaContas["linhasRegra"], tipo: string): QuantidadeEValor | null {
  const doTipo = linhas.filter((l) => l.tipo === tipo);
  if (doTipo.length === 0) return null;
  const precos = new Set(doTipo.map((l) => (l.quantidade !== null && l.quantidade > 0 ? (l.valor / l.quantidade).toFixed(4) : "")));
  return { quantidade: doTipo.reduce((s, l) => s + (l.quantidade ?? 0), 0), valor: soma(doTipo.map((l) => l.valor)), precoUnico: precos.size === 1 && !precos.has("") };
}

/** Separa o resultado do processamento (vivo ou gravado no fecho) nas partes da retribuicao; `null` sem base do mes. */
export function decomposicaoDoResultado(r: ResultadoParaContas): DecomposicaoRetribuicao | null {
  if (r.baseMes === null || r.divisorDuodecimos === null || r.divisorDuodecimos <= 0) return null;
  const salarioBase = arredondar((r.baseMes * r.divisorDuodecimos) / 14);
  const noturnas = r.linhasRegra.filter((l) => l.tipo === "noturnas").map((l) => l.valor);
  const codigos = r.linhasAutomaticas.filter((l) => l.origem !== null).map((l) => l.valor);
  return {
    salarioBase,
    divisor: r.divisorDuodecimos,
    duodecimos: arredondar(arredondar(r.baseMes) - salarioBase),
    subsidioAlimentacao: r.subsidioAlimentacao,
    subsidioFerias: r.subsidioFerias ?? 0,
    subsidioNatal: r.subsidioNatal ?? 0,
    horasExtra: soma([...codigos, ...noturnas]),
    descontoFaltas: r.descontoFaltas,
    iht: dosTipo(r.linhasRegra, "iht")?.valor ?? null,
    km: dosTipo(r.linhasRegra, "km"),
    ajudas: dosTipo(r.linhasRegra, "ajudas"),
    ...(r.subsidiosDetalhe ? { subsidiosDetalhe: r.subsidiosDetalhe } : {}),
    ...(r.subsidioDetalhe ? { subsidioDetalhe: r.subsidioDetalhe } : {}),
    ...(r.faltasDetalhe ? { faltasDetalhe: r.faltasDetalhe } : {}),
  };
}

export interface EntradaContas {
  /** A retribuicao do mes SEM os lancamentos manuais; `null` = sem retribuicao registada. */
  retribuicaoMes: number | null;
  /** Sem decomposicao (estimativa pelo cargo) a retribuicao conta toda como salario base. */
  decomposicao: DecomposicaoRetribuicao | null;
  estimado: boolean;
  /** Os lancamentos manuais do mes (premios, valores negociados): entram na retribuicao mas nao na base da TSU. */
  manuais: number;
  /** O que os equipamentos custam no mes. */
  equipamentos: number;
  /** A taxa da TSU a aplicar: `TSU_EMPREGADOR_PCT` ou a taxa desta pessoa. */
  taxaPct: number;
  taxaDaPessoa: boolean;
  /** O seguro do CARGO em %; `null` ou 0 = sem seguro. */
  seguroPct: number | null;
  /** Nao se sabe o cargo (pessoa que so existe no gravado do fecho): o seguro nao entra e a linha di-lo, em vez de «sem seguro». */
  seguroDesconhecido?: boolean;
}

export interface OpcoesContas {
  lingua?: "pt" | "en";
  rotuloDias?: string;
  /** «dia» / «day»: o singular de `rotuloDias`, para «1 dia». */
  rotuloDia?: string;
  /** «calculado dia a dia» / «calculated day by day»: acompanha o subsidio pela hora quando a conta total nao o reproduz ao centimo. */
  rotuloDiaADia?: string;
  /** «de falta» / «of absence»: «10 h de falta (2 dias) × ...». */
  rotuloDeFalta?: string;
  /** «subsídios» / «allowances»: a palavra da formula dos duodecimos. */
  rotuloSubsidios?: string;
  /** «calculado pelo processamento»: acompanha o valor quando preco × quantidade (ou pct × base) nao o reproduz ao centimo. */
  rotuloCalculado?: string;
  /** «a parte que não vai em duodécimos»: a formula dos subsidios de ferias e de Natal. */
  rotuloParteSemDuodecimos?: string;
}

export interface ContasDoMes {
  linhas: LinhaConta[];
  /** A retribuicao do mes com os manuais. `null` = sem retribuicao. */
  bruto: number | null;
  /** A base da TSU: salario base + subsidios - faltas (sem horas extra, IHT, km, ajudas nem manuais). */
  baseTsu: number;
  tsu: number;
  seguro: number;
  salarioBase: number | null;
  /** O que o km e as ajudas valem (ficam fora da base da TSU, tal como as horas extra, o IHT e os manuais). */
  kmEAjudas: number;
  total: number | null;
}

const centimos = (v: number): number => Math.round((v + Number.EPSILON) * 100);
const emEuros = (c: number): number => c / 100;
/** Diferenca de arredondamento (menos de cinco cêntimos) que vai para a linha «Arredondamento», sem mexer no salario base. */
const TOLERANCIA_CENTIMOS = 5;

function formatador(lingua: "pt" | "en") {
  const [milhares, decimal] = lingua === "pt" ? ["\u00a0", ","] : [",", "."];
  const numero = (v: number, min = 2, max = 2): string => {
    const [inteiro, resto = ""] = Math.abs(v).toFixed(max).split(".");
    let dec = resto;
    while (dec.length > min && dec.endsWith("0")) dec = dec.slice(0, -1);
    const grupos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, milhares);
    return `${v < 0 ? "-" : ""}${grupos}${dec ? decimal + dec : ""}`;
  };
  return {
    numero,
    eur: (v: number) => `${numero(v)}\u00a0€`,
    pct: (v: number) => `${numero(v, 0, 2)}\u00a0%`,
  };
}

const SEM_CONTAS: ContasDoMes = { linhas: [], bruto: null, baseTsu: 0, tsu: 0, seguro: 0, salarioBase: null, kmEAjudas: 0, total: null };

export function contasDoMes(e: EntradaContas, opcoes: OpcoesContas = {}): ContasDoMes {
  if (e.retribuicaoMes === null) return SEM_CONTAS;
  const { numero, eur, pct } = formatador(opcoes.lingua ?? "pt");
  const dias = opcoes.rotuloDias ?? "dias";
  const rotuloDia = opcoes.rotuloDia ?? "dia";
  const rotuloDiaADia = opcoes.rotuloDiaADia ?? "calculado dia a dia";
  const rotuloDeFalta = opcoes.rotuloDeFalta ?? "de falta";
  const rotuloSubsidios = opcoes.rotuloSubsidios ?? "subsídios";
  const rotuloCalculado = opcoes.rotuloCalculado ?? "calculado pelo processamento";
  const rotuloParteSemDuodecimos = opcoes.rotuloParteSemDuodecimos ?? "a parte que não vai em duodécimos";
  const d = e.decomposicao;
  const marca = e.estimado ? ({ estimado: true } as const) : {};
  const parcela = (chave: ChaveConta, valor: number, formula = "", nota?: NotaConta, comMarca = true): LinhaConta => ({ chave, tipo: "parcela", valor, formula, ...(comMarca ? marca : {}), ...(nota ? { nota } : {}) });
  /** Sem conta que reproduza o valor ao centimo, di-lo em vez de mostrar uma formula inexacta. */
  const calculado = (valor: number): string => `= ${eur(valor)}, ${rotuloCalculado}`;

  // 1. A retribuicao do mes em partes. Sem decomposicao (estimativa pelo cargo) e tudo salario base.
  // O salario base e os duodecimos ficam como o processamento os devolveu (o seguro e o IHT assentam neles).
  const salarioBase = d ? d.salarioBase : e.retribuicaoMes;
  const duodecimos = d ? d.duodecimos : 0;
  const kmEAjudas = d ? arredondar((d.km?.valor ?? 0) + (d.ajudas?.valor ?? 0)) : 0;
  const manuais = arredondar(e.manuais);
  let outras = 0;
  let arredondamento = 0;
  let limiteFaltas = 0;
  if (d) {
    const explicado = centimos(salarioBase) + centimos(duodecimos) + centimos(d.subsidioAlimentacao) + centimos(d.subsidioFerias ?? 0) + centimos(d.subsidioNatal ?? 0) + centimos(d.horasExtra) - centimos(d.descontoFaltas) + centimos(d.iht ?? 0) + centimos(kmEAjudas);
    const residuo = centimos(e.retribuicaoMes) - explicado;
    // As faltas acima da retribuicao: o processamento corta o bruto a 0 (nunca uma divida da pessoa), e as partes somam menos que 0.
    const cortadoPelasFaltas = d.descontoFaltas > 0 && residuo > 0 && explicado + centimos(manuais) < 0;
    if (cortadoPelasFaltas) limiteFaltas = emEuros(residuo);
    else if (residuo !== 0 && Math.abs(residuo) < TOLERANCIA_CENTIMOS) arredondamento = emEuros(residuo);
    else if (residuo !== 0) outras = emEuros(residuo);
  }

  const parcelas: LinhaConta[] = [parcela("salarioBase", salarioBase)];
  if (d) {
    if (duodecimos !== 0) {
      parcelas.push(parcela("duodecimos", duodecimos, formulaDuodecimos(salarioBase, d.divisor, duodecimos, rotuloSubsidios, eur, pct, calculado)));
    }
    if (d.subsidioAlimentacao !== 0) {
      const duas = linhasDoSubsidio(d.subsidioAlimentacao, d.subsidioDetalhe, { numero, eur, dias, rotuloDia, rotuloDiaADia }, parcela);
      if (duas) parcelas.push(...duas);
      else parcelas.push(parcela("subsidioAlimentacao", d.subsidioAlimentacao));
    }
    if (d.horasExtra !== 0) parcelas.push(parcela("horasExtra", d.horasExtra));
    if (d.descontoFaltas !== 0) {
      parcelas.push(linhaDasFaltas(d.descontoFaltas, d.faltasDetalhe, { numero, eur, dias, rotuloDia, rotuloDeFalta, rotuloCalculado }, parcela));
    }
    if (d.iht !== null) {
      const ihtPct = salarioBase > 0 ? arredondar((d.iht / salarioBase) * 100) : null;
      const exacto = ihtPct !== null && centimos(arredondar((ihtPct * salarioBase) / 100)) === centimos(d.iht);
      parcelas.push(parcela("iht", d.iht, ihtPct === null ? "" : exacto ? `${pct(ihtPct)} × ${eur(salarioBase)} = ${eur(d.iht)}` : calculado(d.iht)));
    }
    if (d.km) parcelas.push(parcela("km", d.km.valor, formulaUnitaria(d.km, `${numero(d.km.quantidade, 0, 2)} km`, numero, eur, calculado)));
    if (d.ajudas) parcelas.push(parcela("ajudas", d.ajudas.valor, formulaUnitaria(d.ajudas, `${numero(d.ajudas.quantidade, 0, 2)} ${dias}`, numero, eur, calculado)));
    // Os subsidios de ferias e de Natal vem antes dos manuais: entram na soma explicada (nunca em «Outras componentes») e, sendo subsidios, na base da TSU.
    const formulaSubsidio = (valor: number): string => formulaSubsidioFeriasNatal(d.subsidiosDetalhe, valor, rotuloParteSemDuodecimos, eur, pct);
    if ((d.subsidioFerias ?? 0) !== 0) parcelas.push(parcela("subsidioFerias", d.subsidioFerias ?? 0, formulaSubsidio(d.subsidioFerias ?? 0)));
    if ((d.subsidioNatal ?? 0) !== 0) parcelas.push(parcela("subsidioNatal", d.subsidioNatal ?? 0, formulaSubsidio(d.subsidioNatal ?? 0)));
  }
  // Os manuais sao lancamentos reais: nunca «estimados», mesmo numa pessoa estimada.
  if (manuais !== 0) parcelas.push(parcela("manuais", manuais, "", undefined, false));
  if (outras !== 0) parcelas.push(parcela("outras", outras));
  if (arredondamento !== 0) parcelas.push(parcela("arredondamento", arredondamento));
  // Nunca negativo, como o processamento: se as partes (com os pontuais) ainda ficam abaixo de 0, a linha do limite repoe o 0.
  const antesDoLimite = parcelas.reduce((s, l) => s + centimos(l.valor), 0) + centimos(limiteFaltas);
  if (antesDoLimite < 0 && d && d.descontoFaltas > 0) limiteFaltas = emEuros(centimos(limiteFaltas) - antesDoLimite);
  if (limiteFaltas !== 0) parcelas.push(parcela("limiteFaltas", limiteFaltas, "", "faltasExcedem"));

  const retribuicaoCent = parcelas.reduce((s, l) => s + centimos(l.valor), 0);
  const bruto = emEuros(retribuicaoCent);

  // 2. TSU: base = salario base + subsidios (duodecimos, alimentacao, ferias, Natal) - faltas, nunca negativa. Fora: horas extra, IHT, km, ajudas e manuais.
  // Sem decomposicao (estimativa pelo cargo) a retribuicao e toda salario base.
  const baseTsuCent = d
    ? centimos(salarioBase) + centimos(duodecimos) + centimos(d.subsidioAlimentacao) + centimos(d.subsidioFerias ?? 0) + centimos(d.subsidioNatal ?? 0) - centimos(d.descontoFaltas)
    : centimos(e.retribuicaoMes);
  const baseTsu = Math.max(0, emEuros(baseTsuCent));
  const tsu = arredondar((baseTsu * e.taxaPct) / 100);
  // 3. Seguro do cargo, so sobre o salario base.
  const comSeguro = !e.seguroDesconhecido && e.seguroPct !== null && e.seguroPct > 0;
  const seguro = comSeguro ? arredondar((salarioBase * (e.seguroPct ?? 0)) / 100) : 0;
  const equipamentos = arredondar(e.equipamentos);

  const fecho: LinhaConta[] = [
    { chave: "retribuicao", tipo: "subtotal", valor: bruto, formula: "", ...marca },
    parcela("tsu", tsu, `${pct(e.taxaPct)} × ${eur(baseTsu)} = ${eur(tsu)}`, e.taxaDaPessoa ? "taxaDaPessoa" : undefined),
    parcela("seguro", seguro, comSeguro ? `${pct(e.seguroPct ?? 0)} × ${eur(salarioBase)} = ${eur(seguro)}` : "", comSeguro ? undefined : e.seguroDesconhecido ? "cargoDesconhecido" : "semSeguro"),
  ];
  if (equipamentos !== 0) fecho.push(parcela("equipamentos", equipamentos));
  const total = emEuros(retribuicaoCent + centimos(tsu) + centimos(seguro) + centimos(equipamentos));

  return {
    linhas: [...parcelas, ...fecho, { chave: "total", tipo: "total", valor: total, formula: "", ...marca }],
    bruto,
    baseTsu,
    tsu,
    seguro,
    salarioBase,
    kmEAjudas,
    total,
  };
}

/** As percentagens de subsidios em duodecimos que o processamento oferece (0 = pagos em Junho e Novembro, 50 %, 100 % = todos os meses). */
const PCT_DUODECIMOS = [0, 50, 100] as const;
const TOLERANCIA_PCT = 1e-6;

/**
 * A conta dos duodecimos como o processamento a faz: duodecimos = retribuicao × 2 subsidios × pct ÷ 12, com
 * divisor = 168 ÷ (12 + 2 × pct/100). Recupera a pct do divisor e so mostra a formula se a pct for 0, 50 ou 100 e a conta
 * reproduzir o valor ao centimo; senao «= valor, calculado pelo processamento».
 */
function formulaDuodecimos(
  salarioBase: number,
  divisor: number,
  duodecimos: number,
  rotuloSubsidios: string,
  eur: (v: number) => string,
  pct: (v: number) => string,
  calculado: (valor: number) => string,
): string {
  const pctReal = (168 / divisor - 12) * 50;
  const pctExacta = PCT_DUODECIMOS.find((p) => Math.abs(p - pctReal) < TOLERANCIA_PCT);
  if (pctExacta === undefined) return calculado(duodecimos);
  const reproduz = centimos(arredondar((salarioBase * 2 * pctExacta) / 100 / 12)) === centimos(duodecimos);
  return reproduz ? `2 ${rotuloSubsidios} × ${pct(pctExacta)} ÷ 12 × ${eur(salarioBase)} = ${eur(duodecimos)}` : calculado(duodecimos);
}

/**
 * «1 500,00 € × 50 % (a parte que não vai em duodécimos) × 12/12 = 750,00 €»: R × (100 − duodecimos %) × proporcao. A proporcao e «12/12»
 * quando e o ano inteiro e «dias/dias do ano» para quem entrou no ano. So se mostra se reproduzir o valor ao centimo; senao so o valor
 * (formula vazia), tal como no mes fechado, que nao grava o detalhe.
 */
function formulaSubsidioFeriasNatal(
  detalhe: DetalheSubsidiosFeriasNatal | undefined,
  valor: number,
  rotuloParteSemDuodecimos: string,
  eur: (v: number) => string,
  pct: (v: number) => string,
): string {
  if (!detalhe) return "";
  const parteSem = 100 - detalhe.duodecimosPct;
  if (centimos(arredondar((detalhe.r * parteSem * detalhe.proporcao) / 100)) !== centimos(valor)) return "";
  const proporcao =
    detalhe.proporcao === 1 ? "12/12" : detalhe.diasNoAno !== undefined && detalhe.diasDoAno !== undefined ? `${detalhe.diasNoAno}/${detalhe.diasDoAno}` : pct(detalhe.proporcao * 100);
  return `${eur(detalhe.r)} × ${pct(parteSem)} (${rotuloParteSemDuodecimos}) × ${proporcao} = ${eur(valor)}`;
}

/** Um preco unitario com ate 4 casas (0,40 € ou 0,3333 €). */
const eur4 = (numero: (v: number, min?: number, max?: number) => string, v: number): string => `${numero(v, 2, 4)}\u00a0€`;

/** «100 km × 0,40 € = 40,00 €» so quando ha um preco unico e a conta reproduz o valor ao centimo; senao «= valor, calculado pelo processamento». Sem quantidade, sem formula. */
function formulaUnitaria(
  qv: QuantidadeEValor,
  quantidadeEmTexto: string,
  numero: (v: number, min?: number, max?: number) => string,
  eur: (v: number) => string,
  calculado: (valor: number) => string,
): string {
  if (qv.quantidade <= 0) return "";
  const preco = Number((qv.valor / qv.quantidade).toFixed(4));
  const exacto = qv.precoUnico !== false && centimos(arredondar(preco * qv.quantidade)) === centimos(qv.valor);
  return exacto ? `${quantidadeEmTexto} × ${eur4(numero, preco)} = ${eur(qv.valor)}` : calculado(qv.valor);
}

/** 330 min = «5 h 30 min»; 300 = «5 h»; 45 = «45 min». */
function duracao(minutos: number): string {
  const total = Math.round(minutos);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

interface FormatosDaConta {
  numero: (v: number, min?: number, max?: number) => string;
  eur: (v: number) => string;
  dias: string;
  rotuloDia: string;
}

type FazParcela = (chave: ChaveConta, valor: number, formula?: string, nota?: NotaConta, comMarca?: boolean) => LinhaConta;

/** «3 dias» / «1 dia». */
const quantosDias = (n: number, f: Pick<FormatosDaConta, "dias" | "rotuloDia">): string => `${n} ${n === 1 ? f.rotuloDia : f.dias}`;

const datas = (diasDoMes: readonly { data: string | null }[]): string[] =>
  diasDoMes.flatMap((x) => (x.data ? [x.data] : []));

/**
 * O subsidio de alimentacao nas suas DUAS regras: os dias pelo valor do dia (a partir do limite) e os dias pelo valor da hora (abaixo
 * do limite). Cada linha so existe se houver dias dessa regra. `null` = o detalhe nao esta disponivel (mes fechado) ou nao soma o
 * subsidio devolvido (nunca se mostra uma conta que nao bate): fica a linha unica.
 */
function linhasDoSubsidio(
  subsidio: number,
  detalhe: DetalheSubsidio | undefined,
  f: FormatosDaConta & { rotuloDiaADia: string },
  parcela: FazParcela,
): LinhaConta[] | null {
  if (!detalhe) return null;
  const { diasPeloDia, diasPelaHora } = detalhe;
  if (diasPeloDia.length + diasPelaHora.length === 0) return null;
  if (centimos(detalhe.totalPeloDia) + centimos(detalhe.totalPelaHora) !== centimos(subsidio)) return null;
  const rotuloParams = { limite: duracao(detalhe.limiteMin) };
  const linhas: LinhaConta[] = [];
  if (diasPeloDia.length > 0) {
    // O valor do dia mostra-se a 2 casas mas o processamento arredonda-o a centimos: so se mostra «n × valor» se reproduzir o total.
    const valorMostrado = Number(detalhe.valorDia.toFixed(2));
    const reproduzDia = diasPeloDia.length * centimos(valorMostrado) === centimos(detalhe.totalPeloDia);
    const formula = reproduzDia
      ? `${quantosDias(diasPeloDia.length, f)} × ${f.eur(detalhe.valorDia)} = ${f.eur(detalhe.totalPeloDia)}`
      : `= ${f.eur(detalhe.totalPeloDia)}, ${f.rotuloDiaADia}`;
    linhas.push({ ...parcela("subsidioAlimentacaoDia", detalhe.totalPeloDia, formula), rotuloParams, dias: datas(diasPeloDia) });
  }
  if (diasPelaHora.length > 0) {
    const minutos = diasPelaHora.reduce((soma, x) => soma + x.minutos, 0);
    const reproduz = centimos(arredondar((minutos / 60) * detalhe.valorHora)) === centimos(detalhe.totalPelaHora);
    const formula = reproduz
      ? `${duracao(minutos)} × ${f.numero(detalhe.valorHora, 2, 4)}\u00a0€/h = ${f.eur(detalhe.totalPelaHora)}`
      : `= ${f.eur(detalhe.totalPelaHora)}, ${f.rotuloDiaADia}`;
    linhas.push({ ...parcela("subsidioAlimentacaoHora", detalhe.totalPelaHora, formula), rotuloParams, dias: datas(diasPelaHora) });
  }
  return linhas;
}

/** O desconto de faltas com as horas e os dias; se a conta (horas × valor da hora) nao reproduz o valor ao centimo, so o valor e os dias. */
function linhaDasFaltas(
  desconto: number,
  detalhe: DetalheFaltas | undefined,
  f: FormatosDaConta & { rotuloDeFalta: string; rotuloCalculado: string },
  parcela: FazParcela,
): LinhaConta {
  if (!detalhe || detalhe.dias.length === 0) return parcela("faltas", -desconto);
  const preco = Number(detalhe.valorHoraReal.toFixed(4));
  const reproduz = centimos(arredondar((detalhe.minutosDescontados / 60) * preco)) === centimos(desconto);
  const formula = reproduz
    ? `${duracao(detalhe.minutosDescontados)} ${f.rotuloDeFalta} (${quantosDias(detalhe.dias.length, f)}) × ${f.numero(preco, 2, 4)}\u00a0€/h = \u2212${f.eur(desconto)}`
    : `= \u2212${f.eur(desconto)}, ${f.rotuloCalculado}`;
  return { ...parcela("faltas", -desconto, formula), dias: detalhe.dias };
}
