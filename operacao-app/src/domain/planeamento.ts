/**
 * Planeamento automático das obras — regras puras, espelho do SQL
 * (db/obras.sql, secções 2c, 4, 6b e 9b). A base é que manda; aqui é para o
 * ecrã mostrar o mesmo e para as regras terem testes.
 *
 *   · medidas da área de intervenção (necessidade do negócio no CRM) com as
 *     de referência do pacote onde faltarem;
 *   · fatores que mudam o ritmo de uma tarefa (ficha do local + área);
 *   · espera em tempo CORRIDO (cura, fabrico) num plano em minutos de trabalho;
 *   · aprender o ritmo real: começa no padrão e só se afasta com provas.
 */

/* ───────────────────────────── Medidas ───────────────────────────── */

export type Medida =
  | "qt"
  | "fixo"
  | "m2_pavimento"
  | "m2_parede"
  | "m2_total"
  | "pontos_agua"
  | "pontos_eletricos"
  | "pecas_sanitarias"
  | "acessorios"
  | "modulos"
  | "eletrodomesticos"
  | "ml_bancada";

export const MEDIDAS: readonly { valor: Medida; rotulo: string; unidade: string }[] = [
  { valor: "qt", rotulo: "Quantidade da linha", unidade: "un" },
  { valor: "fixo", rotulo: "Só fixo", unidade: "" },
  { valor: "m2_pavimento", rotulo: "m² de pavimento", unidade: "m²" },
  { valor: "m2_parede", rotulo: "m² de parede", unidade: "m²" },
  { valor: "m2_total", rotulo: "m² total (chão + parede)", unidade: "m²" },
  { valor: "pontos_agua", rotulo: "Pontos de água", unidade: "pontos" },
  { valor: "pontos_eletricos", rotulo: "Pontos elétricos", unidade: "pontos" },
  { valor: "pecas_sanitarias", rotulo: "Peças sanitárias", unidade: "peças" },
  { valor: "acessorios", rotulo: "Acessórios e móveis", unidade: "un" },
  { valor: "modulos", rotulo: "Módulos de móveis", unidade: "módulos" },
  { valor: "eletrodomesticos", rotulo: "Eletrodomésticos", unidade: "un" },
  { valor: "ml_bancada", rotulo: "ml de bancada", unidade: "ml" },
];

export const unidadeDaMedida = (m: string | null | undefined): string =>
  MEDIDAS.find((x) => x.valor === m)?.unidade ?? "";

export const rotuloDaMedida = (m: string | null | undefined): string =>
  MEDIDAS.find((x) => x.valor === m)?.rotulo ?? (m ?? "");

/** A medida pede-se a quem termina? (Não para "só fixo".) */
export const medidaPedeReal = (m: string | null | undefined): boolean => !!m && m !== "fixo";

const num = (x: unknown): number | null => {
  if (x == null || x === "") return null;
  const v = typeof x === "number" ? x : Number(String(x).trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

const ALTURA: Record<string, number | null> = { "20cm": 0.2, "60cm": 0.6, "120cm": 1.2, teto: null };

/** Espelho de ops_obra_medidas(): medidas da área, com a referência do pacote (× qt) onde faltarem. */
export function medidasDaArea(
  area: Record<string, unknown> | null | undefined,
  referencia: Partial<Record<Medida, number>> | null | undefined,
  mult = 1
): Partial<Record<Medida, number>> {
  const a = area ?? {};
  const r = referencia ?? {};
  const m = Math.max(mult ?? 1, 0);
  const v: Partial<Record<Medida, number>> = {};
  const pav = num(a.diag_m2_pavimento) ?? num(a.diag_area_m2);
  const per = num(a.diag_perimetro_m);
  const alt = typeof a.diag_altura_revestimento === "string" && a.diag_altura_revestimento in ALTURA
    ? (ALTURA[a.diag_altura_revestimento] ?? num(a.diag_pe_direito_m) ?? 2.5)
    : null;
  if (pav != null) v.m2_pavimento = pav;
  if (per != null && alt != null) v.m2_parede = Math.round(per * alt * 100) / 100;
  if (num(a.diag_pontos_agua) != null) v.pontos_agua = num(a.diag_pontos_agua)!;
  if (num(a.diag_pontos_eletricos) != null) v.pontos_eletricos = num(a.diag_pontos_eletricos)!;
  for (const k of ["m2_pavimento", "m2_parede", "pontos_agua", "pontos_eletricos", "pecas_sanitarias",
                   "acessorios", "modulos", "eletrodomesticos", "ml_bancada"] as Medida[]) {
    const ref = num(r[k]);
    if (v[k] == null && ref != null) v[k] = Math.round(ref * m * 100) / 100;
  }
  if (v.m2_pavimento != null || v.m2_parede != null) v.m2_total = (v.m2_pavimento ?? 0) + (v.m2_parede ?? 0);
  else if (num(r.m2_total) != null) v.m2_total = Math.round(num(r.m2_total)! * m * 100) / 100;
  return v;
}

/* ───────────────────────────── Fatores ───────────────────────────── */

const simNao = (x: unknown): string | undefined => (x === true ? "sim" : x === false ? "nao" : undefined);
const de = (x: unknown, ok: readonly string[]): string | undefined =>
  typeof x === "string" && ok.includes(x) ? x : undefined;

/** Espelho de ops_obra_fatores(): os fatores que mudam o ritmo (valores fechados). */
export function fatoresDoLocal(
  area: Record<string, unknown> | null | undefined,
  local: Record<string, unknown> | null | undefined
): Record<string, string> {
  const a = area ?? {};
  const l = local ?? {};
  const piso = num(l.piso);
  const f: Record<string, string | undefined> = {
    habitada: simNao(l.habitada_durante_obra),
    acesso: de(l.acesso, ["facil", "dificil"]),
    elevador: simNao(l.tem_elevador),
    andar: piso == null ? undefined : piso <= 0 ? "rc" : piso <= 2 ? "1-2" : "3+",
    mobilada: de(l.mobilada, ["pouco", "medio", "muito"]),
    distancia: de(l.distancia_entrada, ["curta", "media", "longa"]),
    animais: simNao(l.animais),
    janela: simNao(a.diag_janela),
    local_cortes: de(a.diag_local_cortes, ["na_area", "varanda", "fora"]),
    altura_revestimento: de(a.diag_altura_revestimento, ["20cm", "60cm", "120cm", "teto"]),
  };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v != null)) as Record<string, string>;
}

/** Espelho de ops_obra_fatores_chave(): só os fatores que o passo declara, por ordem. */
export function chaveDosFatores(fatores: Record<string, string>, quais: readonly string[]): string {
  return [...quais].sort().filter((k) => k in fatores).map((k) => `${k}=${fatores[k]}`).join("|");
}

const ROTULO_FATOR: Record<string, string> = {
  habitada: "casa habitada", acesso: "acesso", elevador: "elevador", andar: "andar", mobilada: "mobilada",
  distancia: "distância à entrada", animais: "animais", janela: "janela", local_cortes: "cortes",
  altura_revestimento: "revestimento",
};
const ROTULO_VALOR: Record<string, string> = {
  sim: "sim", nao: "não", facil: "fácil", dificil: "difícil", rc: "r/c", pouco: "pouco", medio: "médio",
  muito: "muito", curta: "curta", media: "média", longa: "longa", na_area: "na área", varanda: "na varanda",
  fora: "fora", teto: "até ao teto",
};

/** "casa habitada: sim · cortes: fora" — para o ecrã. */
export function descreverFatores(chave: string | null | undefined): string {
  if (!chave) return "";
  return chave
    .split("|")
    .map((p) => {
      const [k, v] = p.split("=");
      return `${ROTULO_FATOR[k] ?? k}: ${ROTULO_VALOR[v] ?? v}`;
    })
    .join(" · ");
}

/* ───────────────────────────── Esperas ───────────────────────────── */

/** "48 h", "5 dias", "1 dia e 12 h". */
export function formatarEspera(horas: number | null | undefined): string {
  const h = Number(horas ?? 0);
  if (!Number.isFinite(h) || h <= 0) return "";
  if (h <= 48) return `${trim(h)} h`;
  const dias = Math.floor(h / 24);
  const resto = h - dias * 24;
  return resto ? `${dias} dias e ${trim(resto)} h` : `${dias} dias`;
}
const trim = (x: number): string => (Math.round(x * 10) / 10).toString().replace(".", ",");

const DIA_MS = 86_400_000;
const isoDia = (d: Date): string => d.toISOString().slice(0, 10);
const deIso = (s: string): number => Date.parse(`${s}T00:00:00Z`);

/**
 * Espelho de ops_obra_minuto_apos_espera(): o 1.º minuto de trabalho depois de
 * passarem `horas` de relógio desde o minuto de trabalho `m` (0 = arranque).
 * `dias` = os dias úteis do plano ("AAAA-MM-DD", índice 0 = dia 0); o dia de
 * trabalho começa às `hora` (minutos desde a meia-noite) e dura `mpd` minutos.
 */
export function minutoDepoisDaEspera(dias: readonly string[], hora: number, mpd: number, m: number, horas: number): number {
  if (!(horas > 0) || dias.length === 0) return m;
  let ts: number;
  if (m <= 0) ts = deIso(dias[0]) + hora * 60_000;
  else {
    const di = Math.floor((m - 1) / mpd);
    const off = m - di * mpd;
    if (di + 1 > dias.length) return m + Math.ceil(horas / 24) * mpd;
    ts = deIso(dias[di]) + (hora + off) * 60_000;
  }
  const t = ts + horas * 3_600_000;
  const dt = isoDia(new Date(t));
  const i = dias.findIndex((d) => d >= dt);
  if (i < 0) return m + Math.ceil(horas / 24) * mpd;
  if (dias[i] > dt) return i * mpd;
  const tod = (t - deIso(dt)) / 60_000;
  if (tod <= hora) return i * mpd;
  if (tod >= hora + mpd) return (i + 1) * mpd;
  return i * mpd + Math.ceil(tod - hora);
}

/* ───────────────────────────── Aprender ───────────────────────────── */

export interface Ritmo {
  minutos_fixos: number;
  minutos_por_unidade: number;
  n: number;
}

/**
 * Espelho de ops_obra_ritmo_calcular(): o ritmo depois de ver tarefas reais.
 * `reais` em minutos (pessoa × tempo), `qts` a medida real de cada uma.
 * Estimativa = (3 × padrão + Σ observado) ÷ (3 + n); fora os absurdos (> 4× ou
 * < ¼ da mediana, com 3+); com 5+ de tamanhos diferentes separa o fixo do
 * variável (mínimos quadrados, também puxado para o padrão).
 */
export function aprenderRitmo(
  padrao: { fixos: number; porUnidade: number },
  medida: string,
  reais: readonly number[],
  qts: readonly number[]
): Ritmo {
  const k = 3;
  const fix0 = padrao.fixos || 0;
  const pu0 = padrao.porUnidade || 0;
  const soFixo = medida === "fixo" || pu0 === 0;
  let obs: { o: number; q: number; r: number }[] = [];
  reais.forEach((r, i) => {
    const q = qts[i] ?? 0;
    if (r < 5) return;
    if (soFixo) obs.push({ o: r, q, r });
    else if (q > 0) obs.push({ o: Math.max(0, (r - fix0) / q), q, r });
  });
  if (obs.length >= 3) {
    const ord = obs.map((x) => x.o).sort((a, b) => a - b);
    const med = ord.length % 2 ? ord[(ord.length - 1) / 2] : (ord[ord.length / 2 - 1] + ord[ord.length / 2]) / 2;
    if (med > 0) obs = obs.filter((x) => x.o <= 4 * med && x.o >= med / 4);
  }
  const n = obs.length;
  if (n === 0) return { minutos_fixos: fix0, minutos_por_unidade: pu0, n: 0 };
  const soma = obs.reduce((a, x) => a + x.o, 0);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  if (soFixo) return { minutos_fixos: r2((k * fix0 + soma) / (k + n)), minutos_por_unidade: pu0, n };
  let fix = fix0;
  let pu = r3((k * pu0 + soma) / (k + n));
  const qs = obs.map((x) => x.q);
  if (n >= 5 && Math.max(...qs) >= 1.5 * Math.min(...qs)) {
    const mq = qs.reduce((a, x) => a + x, 0) / n;
    const mr = obs.reduce((a, x) => a + x.r, 0) / n;
    const sqq = obs.reduce((a, x) => a + (x.q - mq) ** 2, 0);
    if (sqq > 0) {
      const b = Math.max(0, obs.reduce((a, x) => a + (x.q - mq) * (x.r - mr), 0) / sqq);
      const a = Math.max(0, mr - b * mq);
      fix = r2((k * fix0 + n * a) / (k + n));
      pu = r3((k * pu0 + n * b) / (k + n));
    }
  }
  return { minutos_fixos: fix, minutos_por_unidade: pu, n };
}

/* ───────────────────────────── Origem do tempo ───────────────────────────── */

export type OrigemTempo = "padrao" | "aprendido" | "ficha" | "manual";

/** "padrão", "aprendido (12 obras)", "ficha técnica", "mudado à mão". */
export function rotuloOrigem(origem: string | null | undefined, n?: number | null): string {
  switch (origem) {
    case "aprendido":
      return n ? `aprendido (${n} ${n === 1 ? "tarefa" : "tarefas"})` : "aprendido";
    case "padrao":
      return "padrão";
    case "ficha":
      return "ficha técnica";
    case "manual":
      return "mudado à mão";
    default:
      return "";
  }
}
