/**
 * Obras — regras puras: dias úteis, planeamento, totais de fase, alertas,
 * desvios e choques de agenda.
 *
 * Nada aqui fala com a base. A base decide (db/obras.sql); isto serve para o
 * ecrã responder de imediato e explicar porquê. Onde há uma regra nos dois
 * lados, o nome da função SQL espelho está no comentário — se uma mudar, a
 * outra tem de mudar também.
 *
 * As datas andam como texto `AAAA-MM-DD` (o tipo `date` do Postgres). Fazer
 * contas com `Date` local trocava o dia à meia-noite de uma mudança de hora;
 * aqui as contas são todas em UTC e só o texto sai.
 */

/* ─────────────────────────────── Tipos ─────────────────────────────── */

export const ESTADOS_OBRA = ["planeada", "em_curso", "suspensa", "concluida", "cancelada"] as const;
export type EstadoObra = (typeof ESTADOS_OBRA)[number];

export const ESTADOS_TAREFA_OBRA = ["por_fazer", "em_curso", "feita", "validada", "rejeitada"] as const;
export type EstadoTarefaObra = (typeof ESTADOS_TAREFA_OBRA)[number];

/** Motivos de desvio — a mesma lista que a CHECK de `ops_obra_tarefa`. */
export const MOTIVOS_DESVIO = [
  "secagem",
  "condicoes_edificio",
  "material_em_falta",
  "trabalho_imprevisto",
  "acesso_cliente",
  "outro",
] as const;
export type MotivoDesvio = (typeof MOTIVOS_DESVIO)[number];

export const ESTADOS_EXTRA = ["registado", "aprovado", "enviado", "recusado"] as const;
export type EstadoExtra = (typeof ESTADOS_EXTRA)[number];

/**
 * A função em Operações, vista pelas obras. Inclui `supervisor`, que o resto
 * da app (domain/tipos.ts) ainda não conhece — por isso é um tipo local.
 */
export type FuncaoObra = "admin" | "gestor" | "operador" | "tecnico" | "supervisor";

export const ROTULO_ESTADO_OBRA: Record<EstadoObra, string> = {
  planeada: "Planeada",
  em_curso: "Em curso",
  suspensa: "Suspensa",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const ROTULO_ESTADO_TAREFA_OBRA: Record<EstadoTarefaObra, string> = {
  por_fazer: "Por fazer",
  em_curso: "Em curso",
  feita: "Feita · por validar",
  validada: "Validada",
  rejeitada: "Rejeitada",
};

export const ROTULO_MOTIVO: Record<MotivoDesvio, string> = {
  secagem: "Secagem / cura",
  condicoes_edificio: "Condições do edifício",
  material_em_falta: "Material em falta",
  trabalho_imprevisto: "Trabalho imprevisto",
  acesso_cliente: "Acesso / cliente",
  outro: "Outro (explicar)",
};

export const ROTULO_ESTADO_EXTRA: Record<EstadoExtra, string> = {
  registado: "Registado",
  aprovado: "Aprovado",
  enviado: "Enviado ao comercial",
  recusado: "Recusado",
};

/** Nomes por defeito. 3 e 4 não foram nomeadas na reunião — A CONFIRMAR. */
export const FASES_POR_DEFEITO = [
  "Preparação e demolições",
  "Instalações técnicas",
  "Acabamentos",
  "Limpeza e entrega",
] as const;

export const MINUTOS_POR_DIA = 480;

/* ───────────────────────────── Perfis ───────────────────────────── */

export function podePlanear(funcao: string | null | undefined): boolean {
  return funcao === "admin" || funcao === "gestor";
}

export function podeValidar(funcao: string | null | undefined): boolean {
  return funcao === "admin" || funcao === "gestor" || funcao === "supervisor";
}

export function podeDecidirExtras(funcao: string | null | undefined): boolean {
  return podePlanear(funcao);
}

/* ──────────────────────────── Dias úteis ──────────────────────────── */

const DIA_MS = 86_400_000;

function paraUtc(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function deUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Hoje, em texto `AAAA-MM-DD`, no fuso de quem usa a app. */
export function hojeIso(agora: Date = new Date()): string {
  const a = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, "0");
  const d = String(agora.getDate()).padStart(2, "0");
  return `${a}-${m}-${d}`;
}

/** 1 = segunda … 7 = domingo (ISO). */
export function diaDaSemana(iso: string): number {
  const d = new Date(paraUtc(iso)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function ehDiaUtil(iso: string): boolean {
  return diaDaSemana(iso) <= 5;
}

export function somarDias(iso: string, n: number): string {
  return deUtc(paraUtc(iso) + n * DIA_MS);
}

/**
 * O n-ésimo dia útil a partir de `iso`. `n = 0` devolve o próprio dia se for
 * útil, senão o seguinte. Negativo anda para trás.
 * Espelho de `ops_obra_somar_dias_uteis()` (para n ≥ 0).
 */
export function somarDiasUteis(iso: string, n: number): string {
  let d = iso.slice(0, 10);
  if (n >= 0) {
    while (!ehDiaUtil(d)) d = somarDias(d, 1);
    let k = 0;
    while (k < n) {
      d = somarDias(d, 1);
      if (ehDiaUtil(d)) k++;
    }
    return d;
  }
  while (!ehDiaUtil(d)) d = somarDias(d, -1);
  let k = 0;
  while (k < -n) {
    d = somarDias(d, -1);
    if (ehDiaUtil(d)) k++;
  }
  return d;
}

/** Os dias úteis entre `de` e `ate`, inclusive, por ordem. */
export function diasUteisEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  if (paraUtc(ate) < paraUtc(de)) return out;
  for (let d = de; paraUtc(d) <= paraUtc(ate); d = somarDias(d, 1)) {
    if (ehDiaUtil(d)) out.push(d);
  }
  return out;
}

/**
 * Quantos dias úteis vão de `de` a `ate` (0 se for o mesmo dia útil;
 * negativo se `ate` vier antes). Fins de semana não contam.
 */
export function distanciaUteis(de: string, ate: string): number {
  if (de === ate) return 0;
  const sinal = paraUtc(ate) >= paraUtc(de) ? 1 : -1;
  const [a, b] = sinal > 0 ? [de, ate] : [ate, de];
  const n = diasUteisEntre(a, b).length;
  const inicioUtil = ehDiaUtil(a) ? 1 : 0;
  return sinal * Math.max(0, n - inicioUtil);
}

/* ─────────────────────────── Planeamento ─────────────────────────── */

export interface TarefaParaPlanear {
  id: string;
  minutos: number;
}

export interface Intervalo {
  inicio: string;
  fim: string;
}

/**
 * Espalha as tarefas uma a seguir à outra, `minutosPorDia` por dia útil.
 * A ordem é a do array (fase, depois tarefa). Espelho de
 * `ops_obra_replanear_impl()`.
 */
export function planearSequencial(
  tarefas: readonly TarefaParaPlanear[],
  inicio: string,
  minutosPorDia: number = MINUTOS_POR_DIA
): Map<string, Intervalo> {
  const out = new Map<string, Intervalo>();
  let cursor = 0;
  for (const t of tarefas) {
    const m = Math.max(1, Math.round(t.minutos));
    out.set(t.id, {
      inicio: somarDiasUteis(inicio, Math.floor(cursor / minutosPorDia)),
      fim: somarDiasUteis(inicio, Math.floor((cursor + m - 1) / minutosPorDia)),
    });
    cursor += m;
  }
  return out;
}

/** Desloca um intervalo `delta` dias úteis, mantendo a duração em dias úteis. */
export function moverIntervalo(i: Intervalo, delta: number): Intervalo {
  const dur = distanciaUteis(i.inicio, i.fim);
  const inicio = somarDiasUteis(i.inicio, delta);
  return { inicio, fim: somarDiasUteis(inicio, dur) };
}

/**
 * Estica ou encolhe o fim `delta` dias úteis. Nunca acaba antes de começar.
 */
export function redimensionarIntervalo(i: Intervalo, delta: number): Intervalo {
  const fim = somarDiasUteis(i.fim, delta);
  return paraUtc(fim) < paraUtc(i.inicio) ? { inicio: i.inicio, fim: i.inicio } : { inicio: i.inicio, fim };
}

/* ─────────────────────────── Fases e totais ─────────────────────────── */

export interface TarefaResumo {
  id: string;
  faseId: string;
  estado: EstadoTarefaObra;
  minutosPrevistos: number;
  minutosReais: number;
  inicio: string | null;
  fim: string | null;
}

export interface TotaisFase {
  minutosPrevistos: number;
  minutosReais: number;
  inicio: string | null;
  fim: string | null;
  nTarefas: number;
  nFeitas: number;
  nValidadas: number;
  /** 0–100: tarefas feitas ou validadas sobre o total. */
  progresso: number;
}

/** A duração da fase é a SOMA das tarefas; a barra vai do 1.º início ao último fim. */
export function totaisDaFase(tarefas: readonly TarefaResumo[]): TotaisFase {
  let prev = 0;
  let reais = 0;
  let inicio: string | null = null;
  let fim: string | null = null;
  let feitas = 0;
  let validadas = 0;
  for (const t of tarefas) {
    prev += t.minutosPrevistos;
    reais += t.minutosReais;
    if (t.inicio && (!inicio || t.inicio < inicio)) inicio = t.inicio;
    const f = t.fim ?? t.inicio;
    if (f && (!fim || f > fim)) fim = f;
    if (t.estado === "feita" || t.estado === "validada") feitas++;
    if (t.estado === "validada") validadas++;
  }
  return {
    minutosPrevistos: prev,
    minutosReais: Math.round(reais * 10) / 10,
    inicio,
    fim,
    nTarefas: tarefas.length,
    nFeitas: feitas,
    nValidadas: validadas,
    progresso: tarefas.length ? Math.round((feitas / tarefas.length) * 100) : 0,
  };
}

/** "1 h 30 min", "45 min", "2 h". Para tempos de obra (minutos). */
export function formatarMinutos(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return "—";
  const total = Math.round(min);
  const sinal = total < 0 ? "−" : "";
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sinal}${m} min`;
  if (m === 0) return `${sinal}${h} h`;
  return `${sinal}${h} h ${m} min`;
}

/** Cronómetro "1:05:09" a partir de segundos. */
export function formatarCronometro(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}

/* ─────────────────────── Tempo real e alertas ─────────────────────── */

export interface RegistoTempo {
  utilizadorId: string;
  tarefaId: string;
  inicio: string;
  fim: string | null;
}

/** Minutos de um registo; aberto conta até `agora`. */
export function minutosDoRegisto(r: RegistoTempo, agora: Date = new Date()): number {
  const ini = new Date(r.inicio).getTime();
  const fim = r.fim ? new Date(r.fim).getTime() : agora.getTime();
  return Math.max(0, (fim - ini) / 60_000);
}

/** Minutos reais (pessoa × tempo) de uma tarefa. Espelho de `ops_obra_minutos_reais()`. */
export function minutosReais(registos: readonly RegistoTempo[], agora: Date = new Date()): number {
  return registos.reduce((s, r) => s + minutosDoRegisto(r, agora), 0);
}

export type NivelAlerta = "ok" | "aviso" | "excedido";

export const LIMIAR_AVISO = 0.8;

/**
 * ≥ 80 % do previsto: aviso. Acima de 100 %: excedido. Os mesmos limiares
 * que `ops_v_obra_alerta`.
 */
export function nivelDeAlerta(reais: number, previstos: number): NivelAlerta {
  if (previstos <= 0) return reais > 0 ? "excedido" : "ok";
  if (reais > previstos) return "excedido";
  if (reais >= LIMIAR_AVISO * previstos) return "aviso";
  return "ok";
}

/** Percentagem do previsto já gasta (pode passar de 100). */
export function percentagemGasta(reais: number, previstos: number): number {
  if (previstos <= 0) return reais > 0 ? 100 : 0;
  return Math.round((reais / previstos) * 100);
}

/**
 * Terminar exige justificação quando o real passa o previsto MAIS a
 * tolerância. Espelho da verificação em `rpc_ops_obra_terminar_tarefa()`.
 */
export function precisaJustificacao(reais: number, previstos: number, toleranciaPercent: number): boolean {
  return reais > previstos * (1 + toleranciaPercent / 100);
}

export interface Justificacao {
  motivo: MotivoDesvio | "" | null;
  nota: string;
}

/** Mensagem do que falta, ou `null` se a justificação chega. */
export function validarJustificacao(
  j: Justificacao,
  obrigatoria: boolean
): string | null {
  if (!j.motivo) return obrigatoria ? "Escolhe o motivo do desvio." : null;
  if (!(MOTIVOS_DESVIO as readonly string[]).includes(j.motivo)) return "Motivo desconhecido.";
  if (j.motivo === "outro" && !j.nota.trim()) return "Com \"Outro\", escreve uma nota a explicar.";
  return null;
}

/* ─────────────────────────── Ações possíveis ─────────────────────────── */

export interface ContextoTarefa {
  estado: EstadoTarefaObra;
  obraEstado: EstadoObra;
  /** Tenho um relógio a correr NESTA tarefa. */
  aCorrerAqui: boolean;
  /** Tenho um relógio a correr noutra tarefa. */
  aCorrerNoutra: boolean;
  dependenciaPorFazer: boolean;
}

export type AcaoTarefa = "iniciar" | "pausar" | "concluir";

/** Os botões do executor, com o motivo de estar bloqueado. */
export function acoesDoExecutor(c: ContextoTarefa): { acoes: AcaoTarefa[]; bloqueio: string | null } {
  if (c.obraEstado !== "planeada" && c.obraEstado !== "em_curso") {
    return { acoes: [], bloqueio: "A obra não está em curso." };
  }
  if (c.estado === "feita") return { acoes: [], bloqueio: "Feita — à espera de validação." };
  if (c.estado === "validada") return { acoes: [], bloqueio: null };
  if (c.aCorrerAqui) return { acoes: ["pausar", "concluir"], bloqueio: null };
  if (c.dependenciaPorFazer) return { acoes: [], bloqueio: "Depende de uma tarefa que ainda não está feita." };
  if (c.aCorrerNoutra) return { acoes: [], bloqueio: "Tens outra tarefa a correr. Termina-a primeiro." };
  if (c.estado === "em_curso") return { acoes: ["iniciar", "concluir"], bloqueio: null };
  return { acoes: ["iniciar"], bloqueio: null };
}

/* ─────────────────────── Choques de agenda ─────────────────────── */

export interface Atribuicao {
  tarefaId: string;
  obraId: string;
  utilizadorId: string;
  inicio: string | null;
  fim: string | null;
  minutos: number;
  estado: EstadoTarefaObra;
}

export interface Choque {
  utilizadorId: string;
  tarefaId: string;
  outraTarefaId: string;
}

function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

const ABERTA = (e: EstadoTarefaObra) => e === "por_fazer" || e === "em_curso" || e === "rejeitada";

/**
 * A mesma pessoa em duas OBRAS com dias sobrepostos. Na mesma obra é normal
 * fazer duas tarefas no mesmo dia; isso vê-se na sobrecarga. Espelho de
 * `ops_v_obra_conflito`.
 */
export function choquesEntreObras(atribs: readonly Atribuicao[]): Choque[] {
  const out: Choque[] = [];
  const porPessoa = new Map<string, Atribuicao[]>();
  for (const a of atribs) {
    if (!a.inicio || !ABERTA(a.estado)) continue;
    const l = porPessoa.get(a.utilizadorId) ?? [];
    l.push(a);
    porPessoa.set(a.utilizadorId, l);
  }
  for (const [u, l] of porPessoa) {
    for (let i = 0; i < l.length; i++) {
      for (let j = 0; j < l.length; j++) {
        if (i === j || l[i].obraId === l[j].obraId) continue;
        const a = { inicio: l[i].inicio!, fim: l[i].fim ?? l[i].inicio! };
        const b = { inicio: l[j].inicio!, fim: l[j].fim ?? l[j].inicio! };
        if (sobrepoe(a, b)) out.push({ utilizadorId: u, tarefaId: l[i].tarefaId, outraTarefaId: l[j].tarefaId });
      }
    }
  }
  return out;
}

/**
 * Minutos planeados por pessoa e por dia útil, espalhando cada tarefa por
 * igual pelos dias que ocupa. Devolve só os dias acima da capacidade.
 */
export function sobrecargas(
  atribs: readonly Atribuicao[],
  capacidade: number = MINUTOS_POR_DIA
): { utilizadorId: string; dia: string; minutos: number }[] {
  const carga = new Map<string, number>();
  for (const a of atribs) {
    if (!a.inicio || !ABERTA(a.estado)) continue;
    const dias = diasUteisEntre(a.inicio, a.fim ?? a.inicio);
    if (!dias.length) continue;
    const porDia = a.minutos / dias.length;
    for (const d of dias) {
      const k = `${a.utilizadorId}|${d}`;
      carga.set(k, (carga.get(k) ?? 0) + porDia);
    }
  }
  return [...carga]
    .filter(([, m]) => m > capacidade + 0.5)
    .map(([k, m]) => {
      const [utilizadorId, dia] = k.split("|");
      return { utilizadorId, dia, minutos: Math.round(m) };
    })
    .sort((x, y) => (x.dia < y.dia ? -1 : x.dia > y.dia ? 1 : x.utilizadorId < y.utilizadorId ? -1 : 1));
}
