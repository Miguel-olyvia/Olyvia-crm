/**
 * Regras salariais da organizacao (20270107600000, Entrega B): o formulario, a validacao no cliente e a leitura dos erros da base.
 *
 * A base repete todas estas verificacoes (intervalos, duas casas decimais, faixas sem sobreposicao); aqui diz-se o erro ao lado do
 * campo antes de gravar. As mensagens sao CHAVES de traducao, nunca texto escrito.
 */
import type { FaixaNoturna, RegraSalarial } from "@/types/hr";

/** O que a RPC `rpc_hr_regras_salariais_guardar` recebe em `_regra`. */
export interface PayloadRegraSalarial {
  subsidio_limite_min: number;
  subsidio_valor_hora: number;
  subsidio_valor_dia: number;
  he_pct_dia_util: number;
  he_pct_feriado: number;
  he_pct_descanso: number;
  he_limite_anual_min: number;
  iht_pct: number;
  km_valor: number;
  ajudas_custo_dia: number;
  noturnas: Array<{ hora_inicio: string; hora_fim: string; percentagem?: number; preco_hora?: number }>;
}

export type ModoDaFaixa = "percentagem" | "preco";

export interface FaixaForm {
  /** Identidade estavel para a lista editavel (a posicao muda ao remover). */
  chave: string;
  inicio: string;
  fim: string;
  modo: ModoDaFaixa;
  valor: string;
}

export interface FormRegraSalarial {
  limiteHoras: string;
  limiteMinutos: string;
  valorHora: string;
  valorDia: string;
  hePctDiaUtil: string;
  hePctFeriado: string;
  hePctDescanso: string;
  heLimiteHoras: string;
  heLimiteMinutos: string;
  ihtPct: string;
  kmValor: string;
  ajudasDia: string;
  faixas: FaixaForm[];
  validoDe: string;
}

/** Erros por campo (chave de traducao). Os das faixas levam o indice: `faixa.0.horas`, `faixa.0.valor`. */
export type ErrosRegraSalarial = Record<string, string>;

const MINUTOS_DIA = 1440;
const LIMITE_SUBSIDIO_MAX_MIN = 1440;
const LIMITE_ANUAL_MAX_MIN = 24000;
export const MAX_FAIXAS = 12;

/** Os intervalos da base (CHECK de hr_regras_salariais e hr_regras_salariais_noturnas, 20270107600000). */
export const INTERVALOS = {
  valorHora: [0, 10],
  valorDia: [0, 50],
  pct: [0, 300],
  ihtPct: [0, 50],
  kmValor: [0, 2],
  ajudasDia: [0, 300],
  faixaPct: [0, 300],
  faixaPreco: [0, 50],
} as const;

let contadorDeFaixas = 0;
export const novaChaveDeFaixa = (): string => `faixa-${++contadorDeFaixas}`;

export const faixaVazia = (): FaixaForm => ({ chave: novaChaveDeFaixa(), inicio: "", fim: "", modo: "percentagem", valor: "" });

/** "1,5" ou "1.5" em numero; `null` se vazio, nao numerico ou com mais de duas casas decimais. */
export function numeroComDuasCasas(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Number(limpo);
}

const inteiroNaoNegativo = (texto: string): number | null => {
  const limpo = texto.trim();
  return /^\d+$/.test(limpo) ? Number(limpo) : null;
};

const decimalParaTexto = (n: number): string => String(n).replace(".", ",");

/** "HH:MM" em minutos do dia, ou `null` se nao for uma hora valida. Como FIM de faixa, "24:00" e o fim do dia (1440). */
export function minutosDaHora(texto: string, comoFim = false): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (comoFim && h === 24 && min === 0) return 1440;
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/** Os minutos do dia cobertos por uma faixa: [inicio, fim), ou ate a meia-noite e depois de 0 se a faixa a atravessa. */
export function intervalosDaFaixa(inicio: number, fim: number): Array<[number, number]> {
  return fim > inicio
    ? [[inicio, fim]]
    : [
        [inicio, MINUTOS_DIA],
        [0, fim],
      ].filter(([a, b]) => b > a) as Array<[number, number]>;
}

const sobrepoe = (a: Array<[number, number]>, b: Array<[number, number]>): boolean =>
  a.some(([a1, a2]) => b.some(([b1, b2]) => a1 < b2 && b1 < a2));

/** Valores da regra em vigor para preencher o formulario; sem regra, tudo vazio (nao se inventam valores). */
export function formDeRegra(regra: RegraSalarial | null, hoje: string): FormRegraSalarial {
  if (!regra) {
    return {
      limiteHoras: "",
      limiteMinutos: "",
      valorHora: "",
      valorDia: "",
      hePctDiaUtil: "",
      hePctFeriado: "",
      hePctDescanso: "",
      heLimiteHoras: "",
      heLimiteMinutos: "",
      ihtPct: "",
      kmValor: "",
      ajudasDia: "",
      faixas: [],
      validoDe: hoje,
    };
  }
  return {
    limiteHoras: String(Math.floor(regra.subsidio_limite_min / 60)),
    limiteMinutos: String(regra.subsidio_limite_min % 60),
    valorHora: decimalParaTexto(regra.subsidio_valor_hora),
    valorDia: decimalParaTexto(regra.subsidio_valor_dia),
    hePctDiaUtil: decimalParaTexto(regra.he_pct_dia_util),
    hePctFeriado: decimalParaTexto(regra.he_pct_feriado),
    hePctDescanso: decimalParaTexto(regra.he_pct_descanso),
    heLimiteHoras: String(Math.floor(regra.he_limite_anual_min / 60)),
    heLimiteMinutos: String(regra.he_limite_anual_min % 60),
    ihtPct: decimalParaTexto(regra.iht_pct),
    kmValor: decimalParaTexto(regra.km_valor),
    ajudasDia: decimalParaTexto(regra.ajudas_custo_dia),
    faixas: regra.noturnas.map((f: FaixaNoturna) => ({
      chave: novaChaveDeFaixa(),
      inicio: f.hora_inicio,
      fim: f.hora_fim,
      modo: f.preco_hora !== null && f.preco_hora !== undefined ? "preco" : "percentagem",
      valor: decimalParaTexto((f.preco_hora ?? f.percentagem ?? 0) as number),
    })),
    // A base recusa uma data anterior a versao mais recente: propoe a mais tardia entre hoje e o inicio dela.
    validoDe: regra.valido_de > hoje ? regra.valido_de : hoje,
  };
}

const dentro = (n: number, [min, max]: readonly [number, number]): boolean => n >= min && n <= max;

export interface ResultadoValidacao {
  erros: ErrosRegraSalarial;
  payload: PayloadRegraSalarial | null;
}

/** Valida o formulario como a base: `payload` so existe sem erros. */
export function validarRegraSalarial(form: FormRegraSalarial): ResultadoValidacao {
  const erros: ErrosRegraSalarial = {};

  const horas = inteiroNaoNegativo(form.limiteHoras);
  const minutos = form.limiteMinutos.trim() === "" ? 0 : inteiroNaoNegativo(form.limiteMinutos);
  let limiteMin = 0;
  if (horas === null || minutos === null || minutos > 59) {
    erros.limite = "hr.regrasSalariais.erro.limiteInvalido";
  } else {
    limiteMin = horas * 60 + minutos;
    if (limiteMin < 1 || limiteMin > LIMITE_SUBSIDIO_MAX_MIN) erros.limite = "hr.regrasSalariais.erro.limiteInvalido";
  }

  const dinheiro = (campo: string, texto: string, intervalo: readonly [number, number], chave: string): number => {
    const n = numeroComDuasCasas(texto);
    if (n === null || !dentro(n, intervalo)) {
      erros[campo] = chave;
      return 0;
    }
    return n;
  };
  const valorHora = dinheiro("valorHora", form.valorHora, INTERVALOS.valorHora, "hr.regrasSalariais.erro.valorHoraInvalido");
  const valorDia = dinheiro("valorDia", form.valorDia, INTERVALOS.valorDia, "hr.regrasSalariais.erro.valorDiaInvalido");
  const hePctDiaUtil = dinheiro("hePctDiaUtil", form.hePctDiaUtil, INTERVALOS.pct, "hr.regrasSalariais.erro.percentagemInvalida");
  const hePctFeriado = dinheiro("hePctFeriado", form.hePctFeriado, INTERVALOS.pct, "hr.regrasSalariais.erro.percentagemInvalida");
  const hePctDescanso = dinheiro("hePctDescanso", form.hePctDescanso, INTERVALOS.pct, "hr.regrasSalariais.erro.percentagemInvalida");
  const ihtPct = dinheiro("ihtPct", form.ihtPct, INTERVALOS.ihtPct, "hr.regrasSalariais.erro.ihtInvalido");
  const kmValor = dinheiro("kmValor", form.kmValor, INTERVALOS.kmValor, "hr.regrasSalariais.erro.kmInvalido");
  const ajudasDia = dinheiro("ajudasDia", form.ajudasDia, INTERVALOS.ajudasDia, "hr.regrasSalariais.erro.ajudasInvalido");

  // Limite anual de horas extra: horas e minutos inteiros (sem dizimas), de 1 minuto a 400 horas.
  const heHoras = inteiroNaoNegativo(form.heLimiteHoras);
  const heMinutos = form.heLimiteMinutos.trim() === "" ? 0 : inteiroNaoNegativo(form.heLimiteMinutos);
  let heMin = 0;
  if (heHoras === null || heMinutos === null || heMinutos > 59) {
    erros.heLimiteHoras = "hr.regrasSalariais.erro.limiteAnualInvalido";
  } else {
    heMin = heHoras * 60 + heMinutos;
    if (heMin < 1 || heMin > LIMITE_ANUAL_MAX_MIN) erros.heLimiteHoras = "hr.regrasSalariais.erro.limiteAnualInvalido";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.validoDe)) {
    erros.validoDe = "hr.regrasSalariais.erro.dataInvalida";
  } else if (form.validoDe < "2000-01-01" || form.validoDe > "2100-12-31") {
    erros.validoDe = "hr.regrasSalariais.erro.dataInvalida";
  }

  if (form.faixas.length > MAX_FAIXAS) erros.faixas = "hr.regrasSalariais.erro.demasiadasFaixas";

  const faixasValidas: Array<{ indice: number; ivs: Array<[number, number]> }> = [];
  const noturnas: PayloadRegraSalarial["noturnas"] = [];
  form.faixas.forEach((f, i) => {
    const ini = minutosDaHora(f.inicio);
    const fim = minutosDaHora(f.fim, true);
    if (ini === null || fim === null) {
      erros[`faixa.${i}.horas`] = "hr.regrasSalariais.erro.faixaHoras";
    } else if (ini === fim) {
      erros[`faixa.${i}.horas`] = "hr.regrasSalariais.erro.faixaMesmaHora";
    } else {
      faixasValidas.push({ indice: i, ivs: intervalosDaFaixa(ini, fim) });
    }
    const n = numeroComDuasCasas(f.valor);
    const intervalo = f.modo === "percentagem" ? INTERVALOS.faixaPct : INTERVALOS.faixaPreco;
    if (n === null || n <= 0 || !dentro(n, intervalo)) {
      erros[`faixa.${i}.valor`] =
        f.modo === "percentagem" ? "hr.regrasSalariais.erro.faixaPercentagem" : "hr.regrasSalariais.erro.faixaPreco";
    } else if (ini !== null && fim !== null && ini !== fim) {
      noturnas.push({
        hora_inicio: f.inicio.trim().padStart(5, "0"),
        hora_fim: f.fim.trim().padStart(5, "0"),
        ...(f.modo === "percentagem" ? { percentagem: n } : { preco_hora: n }),
      });
    }
  });
  // Sobreposicao: a segunda faixa de cada par que se cruza leva o erro (e diz com que faixa).
  faixasValidas.forEach((b, j) => {
    for (let k = 0; k < j; k++) {
      if (sobrepoe(faixasValidas[k].ivs, b.ivs)) {
        erros[`faixa.${b.indice}.horas`] ??= "hr.regrasSalariais.erro.faixasSobrepostas";
        break;
      }
    }
  });

  if (Object.keys(erros).length > 0) return { erros, payload: null };
  return {
    erros,
    payload: {
      subsidio_limite_min: limiteMin,
      subsidio_valor_hora: valorHora,
      subsidio_valor_dia: valorDia,
      he_pct_dia_util: hePctDiaUtil,
      he_pct_feriado: hePctFeriado,
      he_pct_descanso: hePctDescanso,
      he_limite_anual_min: heMin,
      iht_pct: ihtPct,
      km_valor: kmValor,
      ajudas_custo_dia: ajudasDia,
      noturnas,
    },
  };
}

export type CampoDaRegra = Exclude<keyof PayloadRegraSalarial, "noturnas">;

/** Os campos numericos da regra, pela ordem em que se mostram. */
export const CAMPOS_DA_REGRA: readonly CampoDaRegra[] = [
  "subsidio_limite_min",
  "subsidio_valor_hora",
  "subsidio_valor_dia",
  "he_pct_dia_util",
  "he_pct_feriado",
  "he_pct_descanso",
  "he_limite_anual_min",
  "iht_pct",
  "km_valor",
  "ajudas_custo_dia",
];

export interface FaixaDoPayload {
  hora_inicio: string;
  hora_fim: string;
  percentagem?: number;
  preco_hora?: number;
}

export interface DiferencasDaRegra {
  /** Os campos que mudam; `antes` e `null` quando ainda nao havia regra. */
  campos: Array<{ campo: CampoDaRegra; antes: number | null; depois: number }>;
  faixas: { mudou: boolean; antes: FaixaDoPayload[]; depois: FaixaDoPayload[] };
}

const chaveDaFaixa = (f: FaixaDoPayload): string =>
  `${f.hora_inicio}|${f.hora_fim}|${f.percentagem !== undefined ? `p${f.percentagem}` : `e${f.preco_hora}`}`;

/** O que a regra nova muda em relacao a regra de partida (a que se ve no ecra), para a confirmacao antes de gravar. */
export function diferencasDaRegra(base: RegraSalarial | null, payload: PayloadRegraSalarial): DiferencasDaRegra {
  const campos = CAMPOS_DA_REGRA.flatMap((campo) => {
    const antes = base ? (base[campo] as number) : null;
    return antes === payload[campo] ? [] : [{ campo, antes, depois: payload[campo] }];
  });
  const antes: FaixaDoPayload[] = (base?.noturnas ?? []).map((f) => ({
    hora_inicio: f.hora_inicio,
    hora_fim: f.hora_fim,
    ...(f.preco_hora !== null && f.preco_hora !== undefined ? { preco_hora: f.preco_hora } : { percentagem: f.percentagem ?? 0 }),
  }));
  const chave = (l: FaixaDoPayload[]): string => l.map(chaveDaFaixa).sort().join(";");
  return { campos, faixas: { mudou: chave(antes) !== chave(payload.noturnas), antes, depois: payload.noturnas } };
}

/** Os prefixos que as RPCs levantam (20270107600000), traduzidos em chave. A ordem importa: o mais especifico primeiro. */
const PREFIXOS: ReadonlyArray<[string, string]> = [
  ["regras_salariais_periodo_fechado", "hr.regrasSalariais.erro.periodoFechado"],
  ["regras_salariais_retroactiva", "hr.regrasSalariais.erro.retroactiva"],
  ["regras_salariais_historico_imutavel", "hr.regrasSalariais.erro.historicoImutavel"],
  ["regras_salariais_data_anterior", "hr.regrasSalariais.erro.dataAnterior"],
  ["regras_salariais_data_invalida", "hr.regrasSalariais.erro.dataInvalida"],
  ["regras_salariais_faixa_invalida", "hr.regrasSalariais.erro.faixaInvalida"],
  ["regras_salariais_fora_de_intervalo", "hr.regrasSalariais.erro.foraDeIntervalo"],
  ["regras_salariais_valor_invalido", "hr.regrasSalariais.erro.valorInvalido"],
  ["regras_salariais_dados_em_falta", "hr.regrasSalariais.erro.dadosEmFalta"],
  ["regras_salariais_versoes_sobrepostas", "hr.regrasSalariais.erro.versoesSobrepostas"],
  ["regras_salariais_faixas_sobrepostas", "hr.regrasSalariais.erro.faixasSobrepostas"],
  ["regras_salariais_sem_permissao", "hr.regrasSalariais.erro.semPermissao"],
  ["regras_salariais_sem_sessao", "hr.regrasSalariais.erro.semPermissao"],
  ["regras_salariais_sem_utilizador", "hr.regrasSalariais.erro.semPermissao"],
  ["direitos_salariais_sem_permissao", "hr.direitosSalariais.erro.semPermissao"],
  ["direitos_salariais_sem_sessao", "hr.direitosSalariais.erro.semPermissao"],
  ["direitos_salariais_dados_em_falta", "hr.direitosSalariais.erro.dadosEmFalta"],
];

const mensagemDe = (erro: unknown): string =>
  typeof erro === "string"
    ? erro
    : typeof (erro as { message?: unknown } | null)?.message === "string"
      ? (erro as { message: string }).message
      : "";

/** A chave de traducao do erro de uma RPC das regras salariais ou dos direitos, ou `null` se nao o reconhece. */
export function chaveDoErroDeRegrasSalariais(erro: unknown): string | null {
  const mensagem = mensagemDe(erro);
  if (!mensagem) return null;
  return PREFIXOS.find(([prefixo]) => mensagem.includes(prefixo))?.[1] ?? null;
}
