// "Ficha do local" de uma morada de entrega, em duas secções:
//   • Exterior — edifício e acessos (acesso, estacionamento, elevador,
//     andares, frações). O piso é o `floor` da própria morada — não há um
//     segundo campo "piso".
//   • Interior — a casa (tipologia, área, divisões, casas de banho, ano,
//     pavimento, elétrica, canalização, gás, amianto, ocupação, animais, notas).
// Guardada na tabela 1:1 anew_address_building (20261206160000 + interior em
// 20261207110000) e validada lá com as MESMAS regras que aqui
// (fn_validar_ficha_edificio). A morada inclui andar e fração, por isso a
// ficha descreve a casa concreta e o interior fica na mesma linha.
//
// Ficheiro sem dependências (sem supabase) para poder ser usado em testes e
// no validador partilhado. Os nomes "FichaTecnica…" mantêm-se (API usada pelos
// orçamentos e pelas encomendas); "FichaLocal…" são sinónimos.

export type Acesso = "facil" | "dificil";
export type Estacionamento = "pago" | "nao_pago" | "sem_estacionamento";
export type ZonaEstacionamento = "verde" | "amarela" | "vermelha";

export type Tipologia = "T0" | "T1" | "T2" | "T3" | "T4" | "T5+";
export type Pavimento = "ceramico" | "madeira" | "flutuante" | "vinilico" | "outro";
export type Eletrica = "antiga" | "renovada";
export type Canalizacao = "ferro" | "pvc" | "multicamada" | "cobre" | "misto" | "nao_sei";
export type Gas = "canalizado" | "garrafa" | "sem";
export type Amianto = "sim" | "nao" | "nao_sei";

/** Secção Exterior — edifício e acessos. */
export interface FichaExterior {
  acesso: Acesso | null;
  /** 0–100, só com acesso difícil (acréscimo ao preço/tempo). */
  impacto_percent: number | null;
  estacionamento: Estacionamento | null;
  /** Só quando há estacionamento (pago / não pago). */
  zona_estacionamento: ZonaEstacionamento | null;
  tem_elevador: boolean | null;
  /** 1–50, só com elevador. */
  n_elevadores: number | null;
  /** Andares do edifício, 0–200. */
  n_andares: number | null;
  /** 0–200. */
  n_fracoes_por_andar: number | null;
}

/** Secção Interior — a casa. */
export interface FichaInterior {
  tipologia: Tipologia | null;
  /** m², > 0 e ≤ 10000, até 2 casas decimais. */
  area_util_m2: number | null;
  /** 0–100. */
  n_divisoes: number | null;
  /** 0–50. */
  n_casas_banho: number | null;
  /** 1800–ano atual. */
  ano_construcao: number | null;
  pavimento: Pavimento | null;
  eletrica: Eletrica | null;
  quadro_diferencial: boolean | null;
  canalizacao: Canalizacao | null;
  gas: Gas | null;
  amianto: Amianto | null;
  habitada_durante_obra: boolean | null;
  animais: boolean | null;
  /** Até 2000 caracteres. */
  notas_interior: string | null;
}

/** Ficha do local gravada (tudo opcional; null = não indicado). */
export interface FichaTecnicaEdificio extends FichaExterior, FichaInterior {}
export type FichaLocal = FichaTecnicaEdificio;

/** Valores do formulário (números como texto, para validar o que se escreveu). */
export interface FichaTecnicaValores {
  // Exterior
  acesso: Acesso | "";
  impacto_percent: string;
  estacionamento: Estacionamento | "";
  zona_estacionamento: ZonaEstacionamento | "";
  tem_elevador: boolean;
  n_elevadores: string;
  n_andares: string;
  n_fracoes_por_andar: string;
  // Interior
  tipologia: Tipologia | "";
  area_util_m2: string;
  n_divisoes: string;
  n_casas_banho: string;
  ano_construcao: string;
  pavimento: Pavimento | "";
  eletrica: Eletrica | "";
  quadro_diferencial: boolean;
  canalizacao: Canalizacao | "";
  gas: Gas | "";
  amianto: Amianto | "";
  habitada_durante_obra: boolean;
  animais: boolean;
  notas_interior: string;
}
export type FichaLocalValores = FichaTecnicaValores;

export type CampoFichaTecnica = keyof FichaTecnicaValores;
export type ErrosFichaTecnica = Partial<Record<CampoFichaTecnica | "piso", string>>;

export const CAMPOS_EXTERIOR: readonly (keyof FichaExterior)[] = [
  "acesso", "impacto_percent", "estacionamento", "zona_estacionamento",
  "tem_elevador", "n_elevadores", "n_andares", "n_fracoes_por_andar",
];
export const CAMPOS_INTERIOR: readonly (keyof FichaInterior)[] = [
  "tipologia", "area_util_m2", "n_divisoes", "n_casas_banho", "ano_construcao", "pavimento",
  "eletrica", "quadro_diferencial", "canalizacao", "gas", "amianto", "habitada_durante_obra",
  "animais", "notas_interior",
];

export const FICHA_TECNICA_VAZIA: FichaTecnicaEdificio = {
  acesso: null,
  impacto_percent: null,
  estacionamento: null,
  zona_estacionamento: null,
  tem_elevador: null,
  n_elevadores: null,
  n_andares: null,
  n_fracoes_por_andar: null,
  tipologia: null,
  area_util_m2: null,
  n_divisoes: null,
  n_casas_banho: null,
  ano_construcao: null,
  pavimento: null,
  eletrica: null,
  quadro_diferencial: null,
  canalizacao: null,
  gas: null,
  amianto: null,
  habitada_durante_obra: null,
  animais: null,
  notas_interior: null,
};

export const FICHA_TECNICA_VALORES_VAZIOS: FichaTecnicaValores = {
  acesso: "",
  impacto_percent: "",
  estacionamento: "",
  zona_estacionamento: "",
  tem_elevador: false,
  n_elevadores: "",
  n_andares: "",
  n_fracoes_por_andar: "",
  tipologia: "",
  area_util_m2: "",
  n_divisoes: "",
  n_casas_banho: "",
  ano_construcao: "",
  pavimento: "",
  eletrica: "",
  quadro_diferencial: false,
  canalizacao: "",
  gas: "",
  amianto: "",
  habitada_durante_obra: false,
  animais: false,
  notas_interior: "",
};

export const LIMITES_FICHA_TECNICA = {
  impacto_percent: { min: 0, max: 100 },
  n_elevadores: { min: 1, max: 50 },
  n_andares: { min: 0, max: 200 },
  n_fracoes_por_andar: { min: 0, max: 200 },
  n_divisoes: { min: 0, max: 100 },
  n_casas_banho: { min: 0, max: 50 },
  /** O máximo é o ano atual (ver anoAtual em validarFichaTecnica). */
  ano_construcao: { min: 1800 },
  /** > 0 (exclusivo) e ≤ 10000, até 2 casas decimais. */
  area_util_m2: { max: 10000, casasDecimais: 2 },
  notas_interior: { max: 2000 },
} as const;

export const ACESSOS: readonly Acesso[] = ["facil", "dificil"];
export const ESTACIONAMENTOS: readonly Estacionamento[] = ["pago", "nao_pago", "sem_estacionamento"];
export const ZONAS_ESTACIONAMENTO: readonly ZonaEstacionamento[] = ["verde", "amarela", "vermelha"];
export const TIPOLOGIAS: readonly Tipologia[] = ["T0", "T1", "T2", "T3", "T4", "T5+"];
export const PAVIMENTOS: readonly Pavimento[] = ["ceramico", "madeira", "flutuante", "vinilico", "outro"];
export const ELETRICAS: readonly Eletrica[] = ["antiga", "renovada"];
export const CANALIZACOES: readonly Canalizacao[] = ["ferro", "pvc", "multicamada", "cobre", "misto", "nao_sei"];
export const GASES: readonly Gas[] = ["canalizado", "garrafa", "sem"];
export const AMIANTOS: readonly Amianto[] = ["sim", "nao", "nao_sei"];

export const MENSAGENS_FICHA_TECNICA = {
  // Exterior
  acessoInvalido: "Acesso inválido (fácil ou difícil)",
  impactoIntervalo: "O impacto tem de ser um número inteiro entre 0 e 100",
  impactoSoDificil: "O impacto só se indica com acesso difícil",
  estacionamentoInvalido: "Estacionamento inválido",
  zonaInvalida: "Zona de estacionamento inválida",
  zonaSemEstacionamento: "A zona só se indica quando há estacionamento",
  elevadoresIntervalo: "O número de elevadores tem de ser um número inteiro entre 1 e 50",
  elevadoresSemElevador: "O número de elevadores só se indica quando há elevador",
  andaresIntervalo: "O número de andares tem de ser um número inteiro entre 0 e 200",
  fracoesIntervalo: "O número de frações por andar tem de ser um número inteiro entre 0 e 200",
  pisoAcimaDosAndares: "O piso não pode ser acima do número de andares do edifício",
  // Interior
  tipologiaInvalida: "Tipologia inválida (T0 a T5+)",
  areaIntervalo: "A área útil tem de ser maior que 0 e até 10000 m² (no máximo 2 casas decimais)",
  divisoesIntervalo: "O número de divisões tem de ser um número inteiro entre 0 e 100",
  casasBanhoIntervalo: "O número de casas de banho tem de ser um número inteiro entre 0 e 50",
  anoIntervalo: "O ano de construção tem de ser um ano entre 1800 e o ano atual",
  pavimentoInvalido: "Pavimento inválido",
  eletricaInvalida: "Instalação elétrica inválida (antiga ou renovada)",
  canalizacaoInvalida: "Canalização inválida",
  gasInvalido: "Gás inválido (canalizado, garrafa ou sem gás)",
  amiantoInvalido: "Amianto inválido (sim, não ou não sei)",
  notasDemasiadoLongas: "As notas do interior têm no máximo 2000 caracteres",
} as const;

/**
 * Número do piso a partir do texto do andar, como fn_piso_numerico na base:
 * "3", "3º", "3.º", "3 Esq" → 3; "-1" → -1; "R/C", "rc", "rés-do-chão" → 0;
 * texto sem número ("Cave", "Sótão") → null (não entra na regra piso ≤ andares).
 */
export const pisoNumerico = (floor: string | null | undefined): number | null => {
  const t = (floor ?? "").trim();
  if (!t) return null;
  const compacto = t.toLowerCase().replace(/[\s.]/g, "");
  if (/^(r\/?c|r[eé]s-?do-?ch[aã]o)/.test(compacto)) return 0;
  const m = /^-?[0-9]{1,4}(?![0-9])/.exec(t);
  return m ? Number(m[0]) : null;
};

const inteiro = (texto: string): number | null | "invalido" => {
  const t = texto.trim();
  if (!t) return null;
  if (!/^-?[0-9]+$/.test(t)) return "invalido";
  return Number(t);
};

/** Decimal com vírgula ou ponto e até 2 casas: "95", "95,5", "95.25". */
const decimal = (texto: string): number | null | "invalido" => {
  const t = texto.trim();
  if (!t) return null;
  if (!/^[0-9]+([.,][0-9]{1,2})?$/.test(t)) return "invalido";
  return Number(t.replace(",", "."));
};

/** Comprimento em caracteres (pontos de código), como char_length na base. */
export const comprimentoTexto = (s: string): number => Array.from(s).length;

const noIntervalo = (n: number, { min, max }: { min: number; max: number }) => n >= min && n <= max;

const temValor = (x: unknown) => x !== null && x !== undefined;

export const fichaTecnicaVazia = (f: Partial<FichaTecnicaEdificio> | null | undefined): boolean =>
  !f || (Object.keys(FICHA_TECNICA_VAZIA) as (keyof FichaTecnicaEdificio)[]).every((k) => !temValor(f[k]));

export const exteriorVazio = (f: Partial<FichaTecnicaEdificio> | null | undefined): boolean =>
  !f || CAMPOS_EXTERIOR.every((k) => !temValor(f[k]));

export const interiorVazio = (f: Partial<FichaTecnicaEdificio> | null | undefined): boolean =>
  !f || CAMPOS_INTERIOR.every((k) => !temValor(f[k]));

export const valoresDaFichaTecnica = (f: Partial<FichaTecnicaEdificio> | null | undefined): FichaTecnicaValores => {
  if (!f) return { ...FICHA_TECNICA_VALORES_VAZIOS };
  const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  return {
    acesso: f.acesso ?? "",
    impacto_percent: num(f.impacto_percent),
    estacionamento: f.estacionamento ?? "",
    zona_estacionamento: f.zona_estacionamento ?? "",
    tem_elevador: f.tem_elevador === true,
    n_elevadores: num(f.n_elevadores),
    n_andares: num(f.n_andares),
    n_fracoes_por_andar: num(f.n_fracoes_por_andar),
    tipologia: f.tipologia ?? "",
    area_util_m2: num(f.area_util_m2),
    n_divisoes: num(f.n_divisoes),
    n_casas_banho: num(f.n_casas_banho),
    ano_construcao: num(f.ano_construcao),
    pavimento: f.pavimento ?? "",
    eletrica: f.eletrica ?? "",
    quadro_diferencial: f.quadro_diferencial === true,
    canalizacao: f.canalizacao ?? "",
    gas: f.gas ?? "",
    amianto: f.amianto ?? "",
    habitada_durante_obra: f.habitada_durante_obra === true,
    animais: f.animais === true,
    notas_interior: f.notas_interior ?? "",
  };
};

export interface ResultadoValidacaoFichaTecnica {
  valido: boolean;
  erros: ErrosFichaTecnica;
  /** Ficha pronta a gravar; null quando o formulário está vazio. */
  ficha: FichaTecnicaEdificio | null;
}

const lista = <T extends string>(
  valor: T | "",
  permitidos: readonly T[],
  campo: CampoFichaTecnica,
  mensagem: string,
  erros: ErrosFichaTecnica,
): T | null => {
  if (!valor) return null;
  if (!permitidos.includes(valor)) erros[campo] = mensagem;
  return valor;
};

/**
 * Valida a ficha do local (mesmas regras que fn_validar_ficha_edificio).
 *
 * Exterior: inteiros nos intervalos de LIMITES_FICHA_TECNICA; impacto só com
 * acesso difícil; nº de elevadores só com elevador; zona só com estacionamento
 * (pago / não pago); piso (andar da morada) ≤ nº de andares quando ambos são
 * numéricos.
 * Interior: listas fechadas; área > 0 e ≤ 10000 (2 casas decimais, aceita
 * vírgula); divisões 0–100; casas de banho 0–50; ano 1800–anoAtual; notas
 * ≤ 2000 caracteres.
 *
 * Interruptores: numa secção com algum dado, o interruptor desligado quer dizer
 * "não" (false); numa secção vazia fica "não indicado" (null). Formulário todo
 * vazio → ficha null, válido.
 */
export const validarFichaTecnica = (
  v: FichaTecnicaValores,
  piso?: string | null,
  anoAtual: number = new Date().getFullYear(),
): ResultadoValidacaoFichaTecnica => {
  const erros: ErrosFichaTecnica = {};
  const M = MENSAGENS_FICHA_TECNICA;
  const L = LIMITES_FICHA_TECNICA;

  // ─── Exterior ──────────────────────────────────────────────────────────────
  const acesso = lista(v.acesso, ACESSOS, "acesso", M.acessoInvalido, erros);
  const estacionamento = lista(v.estacionamento, ESTACIONAMENTOS, "estacionamento", M.estacionamentoInvalido, erros);

  const zona = lista(v.zona_estacionamento, ZONAS_ESTACIONAMENTO, "zona_estacionamento", M.zonaInvalida, erros);
  if (zona && !erros.zona_estacionamento && (!estacionamento || estacionamento === "sem_estacionamento")) {
    erros.zona_estacionamento = M.zonaSemEstacionamento;
  }

  const impacto = inteiro(v.impacto_percent);
  if (impacto === "invalido" || (impacto !== null && !noIntervalo(impacto, L.impacto_percent))) {
    erros.impacto_percent = M.impactoIntervalo;
  } else if (impacto !== null && acesso !== "dificil") {
    erros.impacto_percent = M.impactoSoDificil;
  }

  const elevadores = inteiro(v.n_elevadores);
  if (elevadores === "invalido" || (elevadores !== null && !noIntervalo(elevadores, L.n_elevadores))) {
    erros.n_elevadores = M.elevadoresIntervalo;
  } else if (elevadores !== null && !v.tem_elevador) {
    erros.n_elevadores = M.elevadoresSemElevador;
  }

  const andares = inteiro(v.n_andares);
  if (andares === "invalido" || (andares !== null && !noIntervalo(andares, L.n_andares))) {
    erros.n_andares = M.andaresIntervalo;
  }

  const fracoes = inteiro(v.n_fracoes_por_andar);
  if (fracoes === "invalido" || (fracoes !== null && !noIntervalo(fracoes, L.n_fracoes_por_andar))) {
    erros.n_fracoes_por_andar = M.fracoesIntervalo;
  }

  const pisoN = pisoNumerico(piso);
  if (pisoN !== null && typeof andares === "number" && !erros.n_andares && pisoN > andares) {
    erros.piso = M.pisoAcimaDosAndares;
  }

  // ─── Interior ──────────────────────────────────────────────────────────────
  const tipologia = lista(v.tipologia, TIPOLOGIAS, "tipologia", M.tipologiaInvalida, erros);

  const area = decimal(v.area_util_m2);
  if (area === "invalido" || (area !== null && (area <= 0 || area > L.area_util_m2.max))) {
    erros.area_util_m2 = M.areaIntervalo;
  }

  const divisoes = inteiro(v.n_divisoes);
  if (divisoes === "invalido" || (divisoes !== null && !noIntervalo(divisoes, L.n_divisoes))) {
    erros.n_divisoes = M.divisoesIntervalo;
  }

  const casasBanho = inteiro(v.n_casas_banho);
  if (casasBanho === "invalido" || (casasBanho !== null && !noIntervalo(casasBanho, L.n_casas_banho))) {
    erros.n_casas_banho = M.casasBanhoIntervalo;
  }

  const ano = inteiro(v.ano_construcao);
  if (ano === "invalido" || (ano !== null && !noIntervalo(ano, { min: L.ano_construcao.min, max: anoAtual }))) {
    erros.ano_construcao = M.anoIntervalo;
  }

  const pavimento = lista(v.pavimento, PAVIMENTOS, "pavimento", M.pavimentoInvalido, erros);
  const eletrica = lista(v.eletrica, ELETRICAS, "eletrica", M.eletricaInvalida, erros);
  const canalizacao = lista(v.canalizacao, CANALIZACOES, "canalizacao", M.canalizacaoInvalida, erros);
  const gas = lista(v.gas, GASES, "gas", M.gasInvalido, erros);
  const amianto = lista(v.amianto, AMIANTOS, "amianto", M.amiantoInvalido, erros);

  const notas = (v.notas_interior ?? "").trim();
  if (comprimentoTexto(notas) > L.notas_interior.max) erros.notas_interior = M.notasDemasiadoLongas;

  if (Object.keys(erros).length > 0) return { valido: false, erros, ficha: null };

  const ficha: FichaTecnicaEdificio = {
    acesso,
    impacto_percent: impacto as number | null,
    estacionamento,
    zona_estacionamento: zona,
    tem_elevador: v.tem_elevador ? true : null,
    n_elevadores: elevadores as number | null,
    n_andares: andares as number | null,
    n_fracoes_por_andar: fracoes as number | null,
    tipologia,
    area_util_m2: area as number | null,
    n_divisoes: divisoes as number | null,
    n_casas_banho: casasBanho as number | null,
    ano_construcao: ano as number | null,
    pavimento,
    eletrica,
    quadro_diferencial: v.quadro_diferencial ? true : null,
    canalizacao,
    gas,
    amianto,
    habitada_durante_obra: v.habitada_durante_obra ? true : null,
    animais: v.animais ? true : null,
    notas_interior: notas || null,
  };
  if (fichaTecnicaVazia(ficha)) return { valido: true, erros: {}, ficha: null };
  // Numa secção preenchida, o interruptor desligado quer dizer "não".
  if (!exteriorVazio(ficha) && !v.tem_elevador) ficha.tem_elevador = false;
  if (!interiorVazio(ficha)) {
    if (!v.quadro_diferencial) ficha.quadro_diferencial = false;
    if (!v.habitada_durante_obra) ficha.habitada_durante_obra = false;
    if (!v.animais) ficha.animais = false;
  }
  return { valido: true, erros: {}, ficha };
};

// ─── Resumo ──────────────────────────────────────────────────────────────────

const ESTACIONAMENTO_TEXTO: Record<Estacionamento, string> = {
  pago: "Estac. pago",
  nao_pago: "Estac. não pago",
  sem_estacionamento: "Sem estacionamento",
};

export const PAVIMENTO_TEXTO: Record<Pavimento, string> = {
  ceramico: "cerâmico",
  madeira: "madeira",
  flutuante: "flutuante",
  vinilico: "vinílico",
  outro: "outro",
};

export const CANALIZACAO_TEXTO: Record<Canalizacao, string> = {
  ferro: "ferro",
  pvc: "PVC",
  multicamada: "multicamada",
  cobre: "cobre",
  misto: "mista",
  nao_sei: "não se sabe",
};

const GAS_TEXTO: Record<Gas, string> = {
  canalizado: "gás canalizado",
  garrafa: "gás de garrafa",
  sem: "sem gás",
};

const AMIANTO_TEXTO: Record<Amianto, string> = {
  sim: "com amianto",
  nao: "sem amianto",
  nao_sei: "amianto por confirmar",
};

const formatarArea = (m2: number) =>
  `${Number.isInteger(m2) ? String(m2) : m2.toFixed(2).replace(/0$/, "").replace(".", ",")} m²`;

/**
 * Resumo da secção Exterior, ex.:
 * "Difícil acesso (+15%) · Estac. pago (zona verde) · 3º de 5 · elevador ×1 · 4 frações/andar".
 */
export const resumoExterior = (
  ficha: Partial<FichaTecnicaEdificio> | null | undefined,
  piso?: string | null,
): string => {
  if (!ficha || exteriorVazio(ficha)) return "";
  const partes: string[] = [];

  if (ficha.acesso === "dificil") {
    partes.push(ficha.impacto_percent ? `Difícil acesso (+${ficha.impacto_percent}%)` : "Difícil acesso");
  } else if (ficha.acesso === "facil") {
    partes.push("Fácil acesso");
  }

  if (ficha.estacionamento) {
    const zona = ficha.zona_estacionamento ? ` (zona ${ficha.zona_estacionamento})` : "";
    partes.push(`${ESTACIONAMENTO_TEXTO[ficha.estacionamento]}${zona}`);
  }

  const pisoTxt = (piso ?? "").trim();
  if (temValor(ficha.n_andares)) {
    if (pisoTxt) {
      const pisoFmt = /^-?[0-9]+$/.test(pisoTxt) && Number(pisoTxt) > 0 ? `${pisoTxt}º` : pisoTxt;
      partes.push(`${pisoFmt} de ${ficha.n_andares}`);
    } else {
      partes.push(ficha.n_andares === 1 ? "1 andar" : `${ficha.n_andares} andares`);
    }
  }

  if (ficha.tem_elevador === true) {
    partes.push(ficha.n_elevadores ? `elevador ×${ficha.n_elevadores}` : "com elevador");
  } else if (ficha.tem_elevador === false) {
    partes.push("sem elevador");
  }

  if (temValor(ficha.n_fracoes_por_andar)) {
    partes.push(ficha.n_fracoes_por_andar === 1 ? "1 fração/andar" : `${ficha.n_fracoes_por_andar} frações/andar`);
  }

  return partes.join(" · ");
};

/**
 * Resumo da secção Interior, ex.:
 * "T3 · 95 m² · 2 WC · 1985 · canalização ferro · habitada".
 * Os interruptores só aparecem quando estão ligados (habitada, animais,
 * diferencial); as notas não entram no resumo.
 */
export const resumoInterior = (ficha: Partial<FichaTecnicaEdificio> | null | undefined): string => {
  if (!ficha || interiorVazio(ficha)) return "";
  const partes: string[] = [];
  if (ficha.tipologia) partes.push(ficha.tipologia);
  if (temValor(ficha.area_util_m2)) partes.push(formatarArea(Number(ficha.area_util_m2)));
  if (temValor(ficha.n_divisoes)) partes.push(ficha.n_divisoes === 1 ? "1 divisão" : `${ficha.n_divisoes} divisões`);
  if (temValor(ficha.n_casas_banho)) partes.push(`${ficha.n_casas_banho} WC`);
  if (temValor(ficha.ano_construcao)) partes.push(String(ficha.ano_construcao));
  if (ficha.pavimento) partes.push(`pavimento ${PAVIMENTO_TEXTO[ficha.pavimento]}`);
  if (ficha.eletrica) {
    partes.push(`elétrica ${ficha.eletrica}${ficha.quadro_diferencial ? " c/ diferencial" : ""}`);
  } else if (ficha.quadro_diferencial) {
    partes.push("c/ diferencial");
  }
  if (ficha.canalizacao) partes.push(`canalização ${CANALIZACAO_TEXTO[ficha.canalizacao]}`);
  if (ficha.gas) partes.push(GAS_TEXTO[ficha.gas]);
  if (ficha.amianto) partes.push(AMIANTO_TEXTO[ficha.amianto]);
  if (ficha.habitada_durante_obra) partes.push("habitada");
  if (ficha.animais) partes.push("animais");
  if (partes.length === 0 && ficha.notas_interior) partes.push("com notas");
  return partes.join(" · ");
};

export interface LinhaResumoFicha {
  seccao: "exterior" | "interior";
  rotulo: "Exterior" | "Interior";
  texto: string;
}

/** As linhas do resumo (só as secções com dados): Exterior e/ou Interior. */
export const linhasResumoFichaLocal = (
  ficha: Partial<FichaTecnicaEdificio> | null | undefined,
  piso?: string | null,
): LinhaResumoFicha[] => {
  const linhas: LinhaResumoFicha[] = [];
  const ext = resumoExterior(ficha, piso);
  if (ext) linhas.push({ seccao: "exterior", rotulo: "Exterior", texto: ext });
  const int = resumoInterior(ficha);
  if (int) linhas.push({ seccao: "interior", rotulo: "Interior", texto: int });
  return linhas;
};

/**
 * Resumo da ficha do local em (até) duas linhas separadas por "\n":
 *   "Exterior: Difícil acesso (+15%) · Estac. pago · 3º de 5 · elevador ×1"
 *   "Interior: T3 · 95 m² · 2 WC · 1985 · canalização ferro · habitada"
 * Devolve "" sem ficha.
 */
export const resumoFichaTecnica = (
  ficha: Partial<FichaTecnicaEdificio> | null | undefined,
  piso?: string | null,
): string => linhasResumoFichaLocal(ficha, piso).map((l) => `${l.rotulo}: ${l.texto}`).join("\n");
