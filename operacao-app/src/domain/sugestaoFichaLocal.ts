// Sugestão de PROTEÇÕES e LOGÍSTICA a partir da ficha do local (CRM,
// anew_address_building + o andar da morada) e, quando as há, das medidas da
// visita (deal_needs.diag_*: m² de pavimento, distância da entrada, portas a
// proteger, mobília, onde se cortam, m² a demolir).
//
// É SÓ SUGESTÃO: não entra no preço do orçamento (o impacto no orçamento é uma
// decisão em aberto — reunião de 02/10/2026). Serve ao comercial para ver o que
// a ficha implica e à equipa de Operações para preparar o material.
//
// Ficheiro sem dependências e IGUAL em dois sítios (os builds são separados):
//   src/lib/addresses/sugestaoFichaLocal.ts           (CRM)
//   operacao-app/src/domain/sugestaoFichaLocal.ts     (Operações)
// Um teste das Operações confirma que os dois são iguais. Quem mudar um, copia
// para o outro.

// ─── Parâmetros (valores de referência, sem IVA; mudar aqui) ─────────────────
export const PARAMETROS_SUGESTAO = {
  /** Largura do percurso protegido da entrada até à área (m). */
  larguraPercurso_m: 1.2,
  /** Comprimento do percurso pela "distância da entrada" da visita (m). */
  percurso_m: { curta: 5, media: 12, longa: 25 } as Record<string, number>,
  /** Sem a distância da visita: percurso estimado (m). */
  percursoPorDefeito_m: 10,
  /** Sobreposição/desperdício do cartão e do plástico (fração). */
  desperdicio: 0.1,
  /** Cartão canelado (rolo) no pavimento do percurso, €/m². */
  cartao_eur_m2: 1.2,
  /** Pavimento sensível (madeira, flutuante, vinílico): cartão + manta, €/m². */
  cartaoReforcado_eur_m2: 2.6,
  /** Plástico de proteção (rolo, 50 µm), €/m². */
  plastico_eur_m2: 0.35,
  /** Plástico para tapar mobília, m² por área, pela "mobília" da visita. */
  plasticoMobilia_m2: { pouco: 10, medio: 25, muito: 50 } as Record<string, number>,
  /** Plástico para vedar cada porta/vão a proteger (m²). */
  plasticoPorPorta_m2: 4,
  /** Cortes feitos dentro da área: plástico extra contra o pó (m²). */
  plasticoCortesNaArea_m2: 10,
  /** Fita (rolo) — um rolo por cada X m² de cartão + plástico. */
  m2PorRoloFita: 15,
  fita_eur_rolo: 2.5,
  /** Protetor de porta/aro (un). */
  protetorPorta_eur: 6,
  /** Porta de pó com fecho (kit) por área quando a casa está habitada. */
  portaPo_eur: 35,
  /** Proteção do elevador (mantas/painéis), por obra. */
  elevador_eur: 25,
  /** Proteção de escadas (cartão + fita) por andar subido a pé. */
  escadaPorAndar_eur: 8,

  /** Parquímetro, €/dia, pela zona da ficha (sem zona: amarela). */
  parquimetro_eur_dia: { verde: 6, amarela: 10, vermelha: 15 } as Record<string, number>,
  /** Sem estacionamento: parque público / cargas e descargas, €/dia. */
  semEstacionamento_eur_dia: 12,
  /** Transporte manual por escada: horas por andar acima do 1.º, por área. */
  horasEscadaPorAndar: 1.5,
  /** Mão de obra de logística, €/h. */
  maoObra_eur_h: 20,
  /** Distância ao armazém ida e volta, enquanto não se calcula pela morada (km). */
  kmIdaVoltaPorDefeito: 30,
  /** Deslocação da carrinha, €/km (combustível + desgaste). */
  km_eur: 0.4,
  /** Big bag de entulho: m² demolidos por saco e preço (recolha incluída). */
  m2DemolicaoPorBigBag: 8,
  bigBag_eur: 45,
  /** Dias de obra quando não há plano (por área de intervenção). */
  diasPorArea: { casa_banho: 10, cozinha: 12, outro: 8 } as Record<string, number>,
  diasPorDefeito: 10,
} as const;

export type ParametrosSugestao = typeof PARAMETROS_SUGESTAO;

// ─── Entradas ────────────────────────────────────────────────────────────────
/** Os campos da ficha do local que contam (todos opcionais). */
export interface FichaParaSugestao {
  acesso?: string | null;
  impacto_percent?: number | null;
  estacionamento?: string | null;
  zona_estacionamento?: string | null;
  tem_elevador?: boolean | null;
  n_andares?: number | null;
  /** O andar da morada ("3.º Esq", "R/C"). */
  piso?: string | null;
  pavimento?: string | null;
  area_util_m2?: number | null;
  habitada_durante_obra?: boolean | null;
  animais?: boolean | null;
  amianto?: string | null;
}

/** Uma área de intervenção (deal_needs.diag_*), tudo opcional. */
export interface AreaParaSugestao {
  diag_tipo_area?: string | null;
  diag_m2_pavimento?: number | string | null;
  diag_area_m2?: number | string | null;
  diag_distancia_entrada?: string | null;
  diag_mobilada?: string | null;
  diag_portas_proteger?: number | null;
  diag_local_cortes?: string | null;
  diag_demolir_m2?: number | string | null;
}

export interface OpcoesSugestao {
  /** Dias úteis de obra (do plano, nas Operações). Sem eles, estima-se. */
  diasObra?: number | null;
  /** km ida e volta do armazém, se já se souber. */
  kmIdaVolta?: number | null;
  parametros?: ParametrosSugestao;
}

// ─── Saída ───────────────────────────────────────────────────────────────────
export interface LinhaSugestao {
  chave: string;
  grupo: "protecao" | "logistica";
  descricao: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  total: number;
  /** Porque aparece (ex.: "4.º andar sem elevador"). */
  razao: string;
  /** A quantidade é uma estimativa (falta um dado na ficha ou na visita). */
  estimado?: boolean;
}

export interface SugestaoFichaLocal {
  protecoes: LinhaSugestao[];
  logistica: LinhaSugestao[];
  totalProtecoes: number;
  totalLogistica: number;
  total: number;
  /** Dias de obra usados nas contas, e de onde vieram. */
  dias: number;
  diasOrigem: "plano" | "estimado";
  /** Atenções sem preço (amianto, acesso difícil, animais). */
  avisos: string[];
  /** O que falta saber para a sugestão ser mais certa. */
  faltaSaber: string[];
}

// ─── Auxiliares ──────────────────────────────────────────────────────────────
const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** O andar em número ("3.º Esq" → 3, "R/C" → 0), ou null. */
export function andarNumero(piso: string | null | undefined): number | null {
  const t = (piso ?? "").trim();
  if (!t) return null;
  if (/^(r\/?c|r[eé]s)/i.test(t.replace(/[\s.]/g, ""))) return 0;
  const m = /-?\d{1,4}/.exec(t);
  return m ? Number(m[0]) : null;
}

/**
 * Dias úteis (segunda a sexta, sem contar feriados) entre duas datas ISO
 * (AAAA-MM-DD), as duas incluídas. Para os dias de obra a partir do plano.
 */
export function diasUteisEntre(inicio: string | null | undefined, fim: string | null | undefined): number | null {
  if (!inicio || !fim) return null;
  const a = new Date(`${inicio.slice(0, 10)}T12:00:00Z`);
  const b = new Date(`${fim.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  return n;
}

const ordinal = (n: number) => (n === 0 ? "R/C" : `${n}.º andar`);

const PAVIMENTOS_SENSIVEIS: Record<string, string> = {
  madeira: "madeira",
  flutuante: "flutuante",
  vinilico: "vinílico",
};
const ROTULO_ZONA: Record<string, string> = { verde: "verde", amarela: "amarela", vermelha: "vermelha" };
const ROTULO_DISTANCIA: Record<string, string> = { curta: "curta", media: "média", longa: "longa" };

function linha(
  grupo: LinhaSugestao["grupo"],
  chave: string,
  descricao: string,
  quantidade: number,
  unidade: string,
  precoUnitario: number,
  razao: string,
  estimado = false,
): LinhaSugestao {
  const q = r1(quantidade);
  return { chave, grupo, descricao, quantidade: q, unidade, precoUnitario, total: r2(q * precoUnitario), razao, ...(estimado ? { estimado } : {}) };
}

/** Tem algum dado que dê sugestão? */
export function fichaDaSugestao(f: FichaParaSugestao | null | undefined, areas: AreaParaSugestao[] = []): boolean {
  if (areas.length > 0) return true;
  if (!f) return false;
  return [f.acesso, f.estacionamento, f.tem_elevador, f.piso, f.pavimento, f.habitada_durante_obra, f.amianto]
    .some((v) => v !== null && v !== undefined && v !== "");
}

// ─── O cálculo ───────────────────────────────────────────────────────────────
export function sugerirProtecoesELogistica(
  ficha: FichaParaSugestao | null | undefined,
  areasIn: AreaParaSugestao[] | null | undefined = [],
  opcoes: OpcoesSugestao = {},
): SugestaoFichaLocal {
  const P = opcoes.parametros ?? PARAMETROS_SUGESTAO;
  const f: FichaParaSugestao = ficha ?? {};
  const areas = (areasIn ?? []).filter(Boolean);
  // Sem visita, conta como uma área "genérica" para o percurso e a mobília.
  const nAreas = Math.max(areas.length, 1);
  const protecoes: LinhaSugestao[] = [];
  const logistica: LinhaSugestao[] = [];
  const avisos: string[] = [];
  const falta = new Set<string>();

  // Dias de obra: do plano; senão pela soma das áreas (casa de banho 10, …).
  let dias: number;
  let diasOrigem: SugestaoFichaLocal["diasOrigem"];
  const diasPlano = num(opcoes.diasObra);
  if (diasPlano !== null && diasPlano > 0) {
    dias = Math.round(diasPlano);
    diasOrigem = "plano";
  } else {
    dias = areas.length > 0
      ? areas.reduce((s, a) => s + (P.diasPorArea[a.diag_tipo_area ?? ""] ?? P.diasPorDefeito), 0)
      : P.diasPorDefeito;
    diasOrigem = "estimado";
  }

  // ── Proteções ──────────────────────────────────────────────────────────────
  // Percurso da entrada até cada área.
  let percurso = 0;
  let percursoEstimado = false;
  const distancias: string[] = [];
  for (let i = 0; i < nAreas; i++) {
    const d = areas[i]?.diag_distancia_entrada ?? null;
    if (d && P.percurso_m[d] !== undefined) {
      percurso += P.percurso_m[d];
      distancias.push(ROTULO_DISTANCIA[d] ?? d);
    } else {
      percurso += P.percursoPorDefeito_m;
      percursoEstimado = true;
    }
  }
  if (percursoEstimado) falta.add("a distância da entrada à área (visita)");
  const m2Cartao = percurso * P.larguraPercurso_m * (1 + P.desperdicio);
  const sensivel = f.pavimento ? PAVIMENTOS_SENSIVEIS[f.pavimento] : undefined;
  protecoes.push(linha(
    "protecao",
    "cartao",
    sensivel ? "Cartão canelado + manta no percurso" : "Cartão canelado no pavimento do percurso",
    m2Cartao,
    "m²",
    sensivel ? P.cartaoReforcado_eur_m2 : P.cartao_eur_m2,
    [
      `${r1(percurso)} m × ${P.larguraPercurso_m} m da entrada à área`,
      distancias.length ? `distância ${distancias.join(", ")}` : null,
      sensivel ? `pavimento ${sensivel}` : null,
    ].filter(Boolean).join(" · "),
    percursoEstimado,
  ));
  if (!f.pavimento) falta.add("o pavimento da casa (ficha, interior)");

  // Plástico: mobília + portas + pó dos cortes.
  let m2Plastico = 0;
  const razoesPlastico: string[] = [];
  let plasticoEstimado = false;
  let portas = 0;
  let portasConhecidas = false;
  areas.forEach((a) => {
    const mob = a.diag_mobilada ? P.plasticoMobilia_m2[a.diag_mobilada] : undefined;
    if (mob !== undefined) {
      m2Plastico += mob;
      razoesPlastico.push(`mobília: ${a.diag_mobilada === "medio" ? "média" : a.diag_mobilada}`);
    }
    if (a.diag_portas_proteger !== null && a.diag_portas_proteger !== undefined) {
      portas += Math.max(0, a.diag_portas_proteger);
      portasConhecidas = true;
    }
    if (a.diag_local_cortes === "na_area") {
      m2Plastico += P.plasticoCortesNaArea_m2;
      razoesPlastico.push("cortes dentro da área (pó)");
    }
  });
  if (m2Plastico === 0) {
    // Sem a visita: mobília "média" por área.
    m2Plastico = P.plasticoMobilia_m2.medio * nAreas;
    plasticoEstimado = true;
    falta.add("quão mobilada está a casa (visita)");
  }
  if (!portasConhecidas) {
    portas = nAreas; // pelo menos a porta da área
    falta.add("quantas portas proteger (visita)");
  }
  m2Plastico += portas * P.plasticoPorPorta_m2;
  if (portas > 0) razoesPlastico.push(`${portas} porta${portas === 1 ? "" : "s"} a vedar`);
  if (f.habitada_durante_obra) razoesPlastico.push("casa habitada");
  m2Plastico *= 1 + P.desperdicio;
  protecoes.push(linha(
    "protecao", "plastico", "Plástico de proteção (mobília e vãos)", m2Plastico, "m²", P.plastico_eur_m2,
    razoesPlastico.join(" · ") || "mobília estimada",
    plasticoEstimado || !portasConhecidas,
  ));

  if (portas > 0) {
    protecoes.push(linha(
      "protecao", "protetor_porta", "Protetores de portas e aros", portas, "un", P.protetorPorta_eur,
      portasConhecidas ? `${portas} porta${portas === 1 ? "" : "s"} no percurso (visita)` : "estimado: a porta de cada área",
      !portasConhecidas,
    ));
  }

  if (f.habitada_durante_obra) {
    protecoes.push(linha(
      "protecao", "porta_po", "Porta de pó com fecho (kit)", nAreas, "un", P.portaPo_eur,
      "casa habitada durante a obra — isolar a área do resto da casa",
    ));
  }

  const andar = andarNumero(f.piso);
  if (f.tem_elevador) {
    protecoes.push(linha("protecao", "elevador", "Proteção do elevador (mantas/painéis)", 1, "obra", P.elevador_eur, "o material e o entulho sobem e descem no elevador"));
  } else if (f.tem_elevador === false && andar !== null && andar >= 1) {
    protecoes.push(linha(
      "protecao", "escadas", "Proteção das escadas e patamares", andar, "andar", P.escadaPorAndar_eur,
      `${ordinal(andar)} sem elevador`,
    ));
  }

  const m2Fita = m2Cartao + m2Plastico;
  protecoes.push(linha("protecao", "fita", "Fita adesiva (crepe/proteção)", Math.max(1, Math.ceil(m2Fita / P.m2PorRoloFita)), "rolo", P.fita_eur_rolo, `1 rolo por ${P.m2PorRoloFita} m² de cartão e plástico`));

  // ── Logística ──────────────────────────────────────────────────────────────
  if (f.estacionamento === "pago") {
    const zona = f.zona_estacionamento ?? "";
    const preco = P.parquimetro_eur_dia[zona] ?? P.parquimetro_eur_dia.amarela;
    if (!zona) falta.add("a zona do estacionamento (ficha, exterior)");
    logistica.push(linha(
      "logistica", "parquimetro", "Parquímetro da carrinha", dias, "dia", preco,
      `estacionamento pago${zona ? ` · zona ${ROTULO_ZONA[zona] ?? zona}` : " · zona por indicar"} · ${dias} dias de obra`,
      !zona || diasOrigem === "estimado",
    ));
  } else if (f.estacionamento === "sem_estacionamento") {
    logistica.push(linha(
      "logistica", "sem_estacionamento", "Parque público / cargas e descargas", dias, "dia", P.semEstacionamento_eur_dia,
      `sem estacionamento junto à obra · ${dias} dias de obra`,
      diasOrigem === "estimado",
    ));
  } else if (!f.estacionamento) {
    falta.add("o estacionamento (ficha, exterior)");
  }

  if (f.tem_elevador === false && andar !== null && andar >= 2) {
    const horas = (andar - 1) * P.horasEscadaPorAndar * nAreas;
    logistica.push(linha(
      "logistica", "escada", "Subir material e descer entulho pela escada", horas, "h", P.maoObra_eur_h,
      `${ordinal(andar)} sem elevador · ${P.horasEscadaPorAndar} h por andar acima do 1.º${nAreas > 1 ? ` × ${nAreas} áreas` : ""}`,
    ));
  } else if (f.tem_elevador === null || f.tem_elevador === undefined) {
    falta.add("se há elevador (ficha, exterior)");
  }
  if (andar === null) falta.add("o andar da morada");

  const km = num(opcoes.kmIdaVolta);
  const kmUsados = km !== null && km > 0 ? km : P.kmIdaVoltaPorDefeito;
  logistica.push(linha(
    "logistica", "deslocacoes", "Deslocações da carrinha (armazém ↔ obra)", kmUsados * dias, "km", P.km_eur,
    `${kmUsados} km ida e volta × ${dias} dias${km === null ? " · distância ao armazém estimada" : ""}`,
    km === null || diasOrigem === "estimado",
  ));
  if (km === null) falta.add("a distância ao armazém (ainda não se calcula pela morada)");

  const m2Demolir = areas.reduce((s, a) => s + (num(a.diag_demolir_m2) ?? 0), 0);
  if (m2Demolir > 0) {
    logistica.push(linha(
      "logistica", "entulho", "Big bags de entulho (com recolha)", Math.ceil(m2Demolir / P.m2DemolicaoPorBigBag), "un", P.bigBag_eur,
      `${r1(m2Demolir)} m² a demolir · 1 saco por ${P.m2DemolicaoPorBigBag} m²`,
    ));
  }

  // ── Avisos (sem preço) ─────────────────────────────────────────────────────
  if (f.acesso === "dificil") {
    avisos.push(`Acesso difícil${f.impacto_percent ? `: +${f.impacto_percent} % indicado na ficha` : ""} — conta no tempo da obra.`);
  }
  if (f.amianto === "sim") avisos.push("Amianto: a remoção exige empresa certificada — fora destas contas.");
  else if (f.amianto === "nao_sei") avisos.push("Amianto por confirmar antes de demolir.");
  if (f.animais) avisos.push("Há animais em casa: manter portas de pó fechadas e combinar com o cliente.");

  const totalProtecoes = r2(protecoes.reduce((s, l) => s + l.total, 0));
  const totalLogistica = r2(logistica.reduce((s, l) => s + l.total, 0));
  return {
    protecoes,
    logistica,
    totalProtecoes,
    totalLogistica,
    total: r2(totalProtecoes + totalLogistica),
    dias,
    diasOrigem,
    avisos,
    faltaSaber: [...falta],
  };
}
