/**
 * As contas do custo de uma pessoa num mes, PASSO A PASSO e sem React: cada linha leva a sua chave (o ecra traduz o rotulo),
 * a formula em texto e o valor. A soma das parcelas bate sempre com o total.
 *
 * Regras (decididas com o utilizador):
 *  - TSU = a taxa da entidade empregadora em Portugal, FIXA (`TSU_EMPREGADOR_PCT`); so a «taxa desta pessoa» a substitui
 *    (regimes de taxa reduzida). Incide sobre a retribuicao do mes SEM quilometros nem ajudas de custo (SUPOSICAO: dentro dos
 *    limites legais nao sao base de TSU); os valores manuais entram na base.
 *  - O seguro de acidentes e uma percentagem POR CARGO e incide so sobre o SALARIO BASE mensal (sem duodecimos, IHT, km nem ajudas).
 *  - Nada se inventa: so se decompoe o que o processamento devolveu; o que ele nao explica fica em «Outras componentes».
 */
import { arredondar } from "./custo";

/** A TSU da entidade empregadora (Portugal), em percentagem. Constante: nao se edita no ecra. */
export const TSU_EMPREGADOR_PCT = 23.75;

export type ChaveConta =
  | "salarioBase"
  | "duodecimos"
  | "subsidioAlimentacao"
  | "horasExtra"
  | "faltas"
  | "iht"
  | "km"
  | "ajudas"
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
}

/** O que o processamento devolveu, na parte de que as contas precisam (`ResultadoProcessamentoPessoa` serve). */
export interface ResultadoParaContas {
  baseMes: number | null;
  divisorDuodecimos: number | null;
  linhasAutomaticas: ReadonlyArray<{ origem: string | null; valor: number }>;
  linhasRegra: ReadonlyArray<{ tipo: string; faixa: number | null; quantidade: number | null; valor: number }>;
  descontoFaltas: number;
  subsidioAlimentacao: number;
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
  /** Horas extra, feriados e descansos trabalhados (codigos automaticos) e noturnas. */
  horasExtra: number;
  descontoFaltas: number;
  iht: number | null;
  km: QuantidadeEValor | null;
  ajudas: QuantidadeEValor | null;
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
    horasExtra: soma([...codigos, ...noturnas]),
    descontoFaltas: r.descontoFaltas,
    iht: dosTipo(r.linhasRegra, "iht")?.valor ?? null,
    km: dosTipo(r.linhasRegra, "km"),
    ajudas: dosTipo(r.linhasRegra, "ajudas"),
  };
}

export interface EntradaContas {
  /** A retribuicao do mes SEM os lancamentos manuais; `null` = sem retribuicao registada. */
  retribuicaoMes: number | null;
  /** Sem decomposicao (estimativa pelo cargo) a retribuicao conta toda como salario base. */
  decomposicao: DecomposicaoRetribuicao | null;
  estimado: boolean;
  /** Os lancamentos manuais do mes (premios, valores negociados): entram na retribuicao e na base da TSU. */
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
  rotuloSeguro?: string;
  /** «calculado pelo processamento»: acompanha o valor quando preco × quantidade (ou pct × base) nao o reproduz ao centimo. */
  rotuloCalculado?: string;
}

export interface ContasDoMes {
  linhas: LinhaConta[];
  /** A retribuicao do mes com os manuais. `null` = sem retribuicao. */
  bruto: number | null;
  /** A base da TSU: a retribuicao com os manuais, menos km e ajudas. */
  baseTsu: number;
  tsu: number;
  seguro: number;
  salarioBase: number | null;
  /** O que o km e as ajudas valem (ficam fora da base da TSU). */
  kmEAjudas: number;
  total: number | null;
  /** So o salario base repartido por 12 meses: salario base × 14 ÷ 12 + TSU + seguro. NAO inclui alimentacao, horas extra, IHT, km, ajudas, manuais nem equipamentos. So para comparar. */
  repartido: { valor: number; formula: string } | null;
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

const SEM_CONTAS: ContasDoMes = { linhas: [], bruto: null, baseTsu: 0, tsu: 0, seguro: 0, salarioBase: null, kmEAjudas: 0, total: null, repartido: null };

export function contasDoMes(e: EntradaContas, opcoes: OpcoesContas = {}): ContasDoMes {
  if (e.retribuicaoMes === null) return SEM_CONTAS;
  const { numero, eur, pct } = formatador(opcoes.lingua ?? "pt");
  const dias = opcoes.rotuloDias ?? "dias";
  const rotuloSeguro = opcoes.rotuloSeguro ?? "seguro";
  const rotuloCalculado = opcoes.rotuloCalculado ?? "calculado pelo processamento";
  const d = e.decomposicao;
  const marca = e.estimado ? ({ estimado: true } as const) : {};
  const parcela = (chave: ChaveConta, valor: number, formula = "", nota?: NotaConta, comMarca = true): LinhaConta => ({ chave, tipo: "parcela", valor, formula, ...(comMarca ? marca : {}), ...(nota ? { nota } : {}) });
  /** Sem conta que reproduza o valor ao centimo, di-lo em vez de mostrar uma formula inexacta. */
  const calculado = (valor: number): string => `= ${eur(valor)}, ${rotuloCalculado}`;

  // 1. A retribuicao do mes em partes. Sem decomposicao (estimativa pelo cargo) e tudo salario base.
  // O salario base e os duodecimos ficam como o processamento os devolveu (o seguro, o IHT e o «para comparar» assentam neles).
  const salarioBase = d ? d.salarioBase : e.retribuicaoMes;
  const duodecimos = d ? d.duodecimos : 0;
  const kmEAjudas = d ? arredondar((d.km?.valor ?? 0) + (d.ajudas?.valor ?? 0)) : 0;
  const manuais = arredondar(e.manuais);
  let outras = 0;
  let arredondamento = 0;
  let limiteFaltas = 0;
  if (d) {
    const explicado = centimos(salarioBase) + centimos(duodecimos) + centimos(d.subsidioAlimentacao) + centimos(d.horasExtra) - centimos(d.descontoFaltas) + centimos(d.iht ?? 0) + centimos(kmEAjudas);
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
      const exacto = centimos(arredondar((salarioBase * 14) / d.divisor - salarioBase)) === centimos(duodecimos);
      parcelas.push(parcela("duodecimos", duodecimos, exacto ? `${eur(salarioBase)} × 14 ÷ ${numero(d.divisor, 0, 0)} − ${eur(salarioBase)} = ${eur(duodecimos)}` : calculado(duodecimos)));
    }
    if (d.subsidioAlimentacao !== 0) parcelas.push(parcela("subsidioAlimentacao", d.subsidioAlimentacao));
    if (d.horasExtra !== 0) parcelas.push(parcela("horasExtra", d.horasExtra));
    if (d.descontoFaltas !== 0) parcelas.push(parcela("faltas", -d.descontoFaltas));
    if (d.iht !== null) {
      const ihtPct = salarioBase > 0 ? arredondar((d.iht / salarioBase) * 100) : null;
      const exacto = ihtPct !== null && centimos(arredondar((ihtPct * salarioBase) / 100)) === centimos(d.iht);
      parcelas.push(parcela("iht", d.iht, ihtPct === null ? "" : exacto ? `${pct(ihtPct)} × ${eur(salarioBase)} = ${eur(d.iht)}` : calculado(d.iht)));
    }
    if (d.km) parcelas.push(parcela("km", d.km.valor, formulaUnitaria(d.km, `${numero(d.km.quantidade, 0, 2)} km`, numero, eur, calculado)));
    if (d.ajudas) parcelas.push(parcela("ajudas", d.ajudas.valor, formulaUnitaria(d.ajudas, `${numero(d.ajudas.quantidade, 0, 2)} ${dias}`, numero, eur, calculado)));
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

  // 2. TSU: base = retribuicao com os manuais, sem km nem ajudas.
  const baseTsu = Math.max(0, arredondar(bruto - kmEAjudas));
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

  // 4. Para comparar: os subsidios repartidos por 12 meses.
  const repartidoBase = arredondar((salarioBase * 14) / 12);
  const tsuRepartido = arredondar((repartidoBase * e.taxaPct) / 100);
  const valorRepartido = arredondar(repartidoBase + tsuRepartido + seguro);
  const repartido = {
    valor: valorRepartido,
    formula: `${eur(salarioBase)} × 14 ÷ 12 = ${eur(repartidoBase)}; TSU ${pct(e.taxaPct)} × ${eur(repartidoBase)} = ${eur(tsuRepartido)}; ${rotuloSeguro} ${eur(seguro)}; ${eur(valorRepartido)}`,
  };

  return {
    linhas: [...parcelas, ...fecho, { chave: "total", tipo: "total", valor: total, formula: "", ...marca }],
    bruto,
    baseTsu,
    tsu,
    seguro,
    salarioBase,
    kmEAjudas,
    total,
    repartido,
  };
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
