// Ficha técnica do edifício de uma morada de entrega (acesso, estacionamento,
// elevador, andares, frações). Guardada na tabela 1:1 anew_address_building
// (20261206160000) e validada lá com as MESMAS regras que aqui
// (fn_validar_ficha_edificio). O piso é o `floor` da própria morada — não há
// um segundo campo "piso".
//
// Ficheiro sem dependências (sem supabase) para poder ser usado em testes e
// no validador partilhado.

export type Acesso = "facil" | "dificil";
export type Estacionamento = "pago" | "nao_pago" | "sem_estacionamento";
export type ZonaEstacionamento = "verde" | "amarela" | "vermelha";

/** Ficha técnica gravada (tudo opcional; null = não indicado). */
export interface FichaTecnicaEdificio {
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

/** Valores do formulário (números como texto, para validar o que se escreveu). */
export interface FichaTecnicaValores {
  acesso: Acesso | "";
  impacto_percent: string;
  estacionamento: Estacionamento | "";
  zona_estacionamento: ZonaEstacionamento | "";
  tem_elevador: boolean;
  n_elevadores: string;
  n_andares: string;
  n_fracoes_por_andar: string;
}

export type CampoFichaTecnica = keyof FichaTecnicaValores;
export type ErrosFichaTecnica = Partial<Record<CampoFichaTecnica | "piso", string>>;

export const FICHA_TECNICA_VAZIA: FichaTecnicaEdificio = {
  acesso: null,
  impacto_percent: null,
  estacionamento: null,
  zona_estacionamento: null,
  tem_elevador: null,
  n_elevadores: null,
  n_andares: null,
  n_fracoes_por_andar: null,
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
};

export const LIMITES_FICHA_TECNICA = {
  impacto_percent: { min: 0, max: 100 },
  n_elevadores: { min: 1, max: 50 },
  n_andares: { min: 0, max: 200 },
  n_fracoes_por_andar: { min: 0, max: 200 },
} as const;

export const ACESSOS: readonly Acesso[] = ["facil", "dificil"];
export const ESTACIONAMENTOS: readonly Estacionamento[] = ["pago", "nao_pago", "sem_estacionamento"];
export const ZONAS_ESTACIONAMENTO: readonly ZonaEstacionamento[] = ["verde", "amarela", "vermelha"];

export const MENSAGENS_FICHA_TECNICA = {
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

const noIntervalo = (n: number, { min, max }: { min: number; max: number }) => n >= min && n <= max;

export const fichaTecnicaVazia = (f: FichaTecnicaEdificio | null | undefined): boolean =>
  !f || (Object.keys(FICHA_TECNICA_VAZIA) as (keyof FichaTecnicaEdificio)[]).every((k) => f[k] === null || f[k] === undefined);

export const valoresDaFichaTecnica = (f: FichaTecnicaEdificio | null | undefined): FichaTecnicaValores => {
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
  };
};

export interface ResultadoValidacaoFichaTecnica {
  valido: boolean;
  erros: ErrosFichaTecnica;
  /** Ficha pronta a gravar; null quando o formulário está vazio. */
  ficha: FichaTecnicaEdificio | null;
}

/**
 * Valida a ficha técnica (mesmas regras que fn_validar_ficha_edificio):
 * inteiros nos intervalos de LIMITES_FICHA_TECNICA; impacto só com acesso
 * difícil; nº de elevadores só com elevador; zona só com estacionamento
 * (pago / não pago); piso (andar da morada) ≤ nº de andares quando ambos são
 * numéricos. Formulário todo vazio (e sem elevador) → ficha null, válido.
 */
export const validarFichaTecnica = (
  v: FichaTecnicaValores,
  piso?: string | null,
): ResultadoValidacaoFichaTecnica => {
  const erros: ErrosFichaTecnica = {};

  const acesso = v.acesso || null;
  if (acesso && !ACESSOS.includes(acesso)) erros.acesso = MENSAGENS_FICHA_TECNICA.acessoInvalido;

  const estacionamento = v.estacionamento || null;
  if (estacionamento && !ESTACIONAMENTOS.includes(estacionamento)) {
    erros.estacionamento = MENSAGENS_FICHA_TECNICA.estacionamentoInvalido;
  }

  const zona = v.zona_estacionamento || null;
  if (zona && !ZONAS_ESTACIONAMENTO.includes(zona)) erros.zona_estacionamento = MENSAGENS_FICHA_TECNICA.zonaInvalida;
  else if (zona && (!estacionamento || estacionamento === "sem_estacionamento")) {
    erros.zona_estacionamento = MENSAGENS_FICHA_TECNICA.zonaSemEstacionamento;
  }

  const impacto = inteiro(v.impacto_percent);
  if (impacto === "invalido" || (impacto !== null && !noIntervalo(impacto, LIMITES_FICHA_TECNICA.impacto_percent))) {
    erros.impacto_percent = MENSAGENS_FICHA_TECNICA.impactoIntervalo;
  } else if (impacto !== null && acesso !== "dificil") {
    erros.impacto_percent = MENSAGENS_FICHA_TECNICA.impactoSoDificil;
  }

  const elevadores = inteiro(v.n_elevadores);
  if (elevadores === "invalido" || (elevadores !== null && !noIntervalo(elevadores, LIMITES_FICHA_TECNICA.n_elevadores))) {
    erros.n_elevadores = MENSAGENS_FICHA_TECNICA.elevadoresIntervalo;
  } else if (elevadores !== null && !v.tem_elevador) {
    erros.n_elevadores = MENSAGENS_FICHA_TECNICA.elevadoresSemElevador;
  }

  const andares = inteiro(v.n_andares);
  if (andares === "invalido" || (andares !== null && !noIntervalo(andares, LIMITES_FICHA_TECNICA.n_andares))) {
    erros.n_andares = MENSAGENS_FICHA_TECNICA.andaresIntervalo;
  }

  const fracoes = inteiro(v.n_fracoes_por_andar);
  if (fracoes === "invalido" || (fracoes !== null && !noIntervalo(fracoes, LIMITES_FICHA_TECNICA.n_fracoes_por_andar))) {
    erros.n_fracoes_por_andar = MENSAGENS_FICHA_TECNICA.fracoesIntervalo;
  }

  const pisoN = pisoNumerico(piso);
  if (pisoN !== null && typeof andares === "number" && !erros.n_andares && pisoN > andares) {
    erros.piso = MENSAGENS_FICHA_TECNICA.pisoAcimaDosAndares;
  }

  if (Object.keys(erros).length > 0) return { valido: false, erros, ficha: null };

  const ficha: FichaTecnicaEdificio = {
    acesso: acesso as Acesso | null,
    impacto_percent: impacto as number | null,
    estacionamento: estacionamento as Estacionamento | null,
    zona_estacionamento: zona as ZonaEstacionamento | null,
    tem_elevador: v.tem_elevador ? true : null,
    n_elevadores: elevadores as number | null,
    n_andares: andares as number | null,
    n_fracoes_por_andar: fracoes as number | null,
  };
  if (fichaTecnicaVazia(ficha)) return { valido: true, erros: {}, ficha: null };
  // Com a ficha preenchida, o interruptor desligado quer dizer "sem elevador".
  if (!v.tem_elevador) ficha.tem_elevador = false;
  return { valido: true, erros: {}, ficha };
};

const ESTACIONAMENTO_TEXTO: Record<Estacionamento, string> = {
  pago: "Estac. pago",
  nao_pago: "Estac. não pago",
  sem_estacionamento: "Sem estacionamento",
};

/**
 * Resumo de uma linha da ficha técnica, ex.:
 * "Difícil acesso (+15%) · Estac. pago (zona verde) · 3º de 5 · elevador ×1 · 4 frações/andar".
 * Devolve "" sem ficha.
 */
export const resumoFichaTecnica = (
  ficha: FichaTecnicaEdificio | null | undefined,
  piso?: string | null,
): string => {
  if (fichaTecnicaVazia(ficha) || !ficha) return "";
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
  if (ficha.n_andares !== null && ficha.n_andares !== undefined) {
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

  if (ficha.n_fracoes_por_andar !== null && ficha.n_fracoes_por_andar !== undefined) {
    partes.push(ficha.n_fracoes_por_andar === 1 ? "1 fração/andar" : `${ficha.n_fracoes_por_andar} frações/andar`);
  }

  return partes.join(" · ");
};
