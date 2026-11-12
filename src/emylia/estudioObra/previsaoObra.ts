// 12/11/2026 (Rúben: «melhorar muito a gestão da obra… go all in, deixa isto WOW»). O que o Estúdio da obra lê da obra viva, sem React:
//  · previsao: o fim provável pela velocidade real (o trabalho feito face ao que o plano previa até hoje), com a confiança e o intervalo;
//    as horas planeadas e as reais, dia a dia, para o gráfico;
//  · margemAoVivo: a margem do orçamento e para onde vai (a mão de obra real até hoje, a projeção do resto ao mesmo ritmo, os materiais
//    pedidos a mais);
//  · caminhoCritico: as tarefas sem folga (atrasar uma delas atrasa o fim);
//  · hojeNaObra: quem está na obra hoje e o que faz, o que acabou, o que está atrasado;
//  · diarioDaObra: o que se passou, do mais recente para o mais antigo, com as fotografias; antesEDepois: a primeira e a última fotografia;
//  · pontoDaSemana: o resumo da semana para o cliente.
import { tot, type Estado, type Negocio, type Plano, type Tarefa } from "../motor";
import { custoObra } from "../custoObra";
import { assinadas, totaisAdenda } from "../adendas";
import { porEncomendarDe } from "../encomendasAjuste";
import { custosDosMateriais } from "../preparacaoObra";
import { enviosDe } from "../trabalhoObra";
import { fimDe } from "../ajustesPlano";
import { estadoVivo, feitoDe } from "./planoVivo";

const r2 = (x: number) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ a previsão */
export interface Previsao {
  /** o fim do plano e o provável (índices de dia, exclusivos), e o intervalo do provável */
  fimPlano: number; fimProvavel: number; de: number; ate: number;
  /** a velocidade: o trabalho feito a dividir pelo que o plano previa até hoje (1 = no ritmo) */
  ritmo: number;
  confianca: "baixa" | "média" | "alta";
  /** as horas acumuladas, dia a dia: as do plano (todos os dias) e as reais (até hoje) */
  planeadas: number[]; reais: number[];
  totalH: number; feitoH: number;
}
/** As horas que o plano previa até ao fim do dia k (cada tarefa reparte as horas pelos dias dela). */
const planeadoAte = (p: Plano, k: number) => p.tasks.reduce((a, t) => a + t.h * Math.max(0, Math.min(1, (k + 1 - t.dia) / Math.max(1, t.dur))), 0);

export function previsao(p: Plano): Previsao {
  const fimPlano = Math.max(1, fimDe(p.tasks));
  const hoje = p.estado === "em curso" ? p.dia : p.estado === "concluída" ? fimPlano - 1 : -1;
  const totalH = p.tasks.reduce((a, t) => a + t.h, 0) || 1;
  const feitoH = p.tasks.reduce((a, t) => a + t.h * feitoDe(t, p), 0);
  const plan = hoje >= 0 ? planeadoAte(p, hoje) : 0;
  const ritmo = hoje < 0 || plan < 0.5 ? 1 : Math.max(0.35, Math.min(1.8, feitoH / plan));
  const resto = Math.max(0, fimPlano - (hoje + 1));
  const fimProvavel = p.estado === "concluída" ? fimPlano : hoje < 0 ? fimPlano : hoje + 1 + Math.ceil(resto / ritmo - 1e-9);
  const f = feitoH / totalH;
  const confianca: Previsao["confianca"] = f >= 0.6 ? "alta" : f >= 0.25 ? "média" : "baixa";
  const folga = Math.ceil(Math.max(0, fimProvavel - (hoje + 1)) * (1 - f) * (confianca === "baixa" ? 0.35 : confianca === "média" ? 0.2 : 0.1));
  // as horas reais acumuladas: os registos de cada dia; o que não tem registo conta no último dia com trabalho (ou hoje)
  const porDia = new Array(Math.max(fimPlano, fimProvavel)).fill(0);
  for (const t of p.tasks) {
    let somadas = 0;
    for (const e of enviosDe(t)) if (e.horas && e.horas > 0 && e.dia < porDia.length) { porDia[Math.max(0, e.dia)] += e.horas; somadas += e.horas; }
    const resto = (t.exec?.horas ?? 0) - somadas;
    if (resto > 0.01) porDia[Math.max(0, Math.min(hoje >= 0 ? hoje : 0, t.dia + t.dur - 1))] += resto;
  }
  const n = porDia.length, planeadas: number[] = [], reais: number[] = [];
  let acc = 0;
  for (let k = 0; k < n; k++) {
    planeadas.push(r2(planeadoAte(p, k)));
    acc += porDia[k];
    if (k <= hoje) reais.push(r2(acc));
  }
  return { fimPlano, fimProvavel, de: Math.max(hoje + 1, fimProvavel - folga), ate: fimProvavel + folga, ritmo: r2(ritmo), confianca, planeadas, reais, totalH: r2(totalH), feitoH: r2(feitoH) };
}

/* ------------------------------------------------------------------ a margem ao vivo */
export interface MargemViva {
  valor: number; custoOrc: number; margemOrc: number;
  /** o desvio da mão de obra até hoje (real − previsto das tarefas com horas), a projeção do resto ao mesmo ritmo e os materiais a mais */
  desvioMO: number; projecao: number; materiais: number;
  custoVivo: number; margemViva: number;
}
export function margemAoVivo(d: Negocio, S: Estado): MargemViva | null {
  if (!d.orc || !d.obra.plano) return null;
  let T: ReturnType<typeof tot>;
  try { T = tot(d, S); } catch { return null; }
  const ads = assinadas(d);
  const valor = r2(T.pf + ads.reduce((a, x) => a + totaisAdenda(x).base, 0));
  const K = custoObra(d, S);
  const ritmo = K.prevFeito > 0 ? K.desvio / K.prevFeito : 0;
  const projecao = r2(Math.max(0, K.prev - K.prevFeito) * ritmo);
  const pend = porEncomendarDe(d);
  const materiais = r2(pend.reduce((a, x) => a + x.q * (x.m.preco ?? custosDosMateriais(d, [{ n: x.m.n, q: x.q }])[0]?.custo ?? 0), 0));
  const custoOrc = r2(T.custo);
  const custoVivo = r2(custoOrc + K.desvio + projecao + materiais);
  return { valor, custoOrc, margemOrc: valor > 0 ? (valor - custoOrc) / valor : 0, desvioMO: r2(K.desvio), projecao, materiais, custoVivo, margemViva: valor > 0 ? (valor - custoVivo) / valor : 0 };
}

/* ------------------------------------------------------------------ o caminho crítico */
/** As tarefas por fazer sem folga: as que, se atrasarem, atrasam o fim (pelas dependências do plano: uma tarefa espera pelas que acabam até ao
 *  dia em que ela começa, como no replanear). */
export function caminhoCritico(p: Plano): Set<number> {
  const T = p.tasks, N = T.length, fim = fimDe(T);
  const ef = T.map((t) => t.dia + t.dur);
  const succ: { s: number; lag: number }[][] = T.map(() => []);
  T.forEach((t, i) => T.forEach((x, j) => { if (j !== i && x.dia < t.dia && x.dia + x.dur <= t.dia + 1) succ[j].push({ s: i, lag: t.dia - (x.dia + x.dur) }); }));
  const lf = new Array(N).fill(fim);
  const ordem = T.map((_, i) => i).sort((a, b) => T[b].dia - T[a].dia);
  for (const j of ordem) {
    if (!succ[j].length) continue;
    // acaba o mais tarde possível: a seguinte começa o mais tarde possível (lf − dur); um intervalo entre as duas é folga, a sobreposição
    // de meio dia que o orçamento já tinha mantém-se
    lf[j] = Math.min(...succ[j].map(({ s, lag }) => lf[s] - T[s].dur - Math.min(0, lag)));
  }
  const out = new Set<number>();
  T.forEach((t, i) => { const v = estadoVivo(t, p); if (v !== "validada" && v !== "feita" && lf[i] - ef[i] <= 0) out.add(i); });
  return out;
}

/* ------------------------------------------------------------------ hoje na obra */
export interface HojeNaObra {
  /** quem está na obra hoje e o que faz */
  pessoas: { tec: string | null; tarefas: { ti: number; t: Tarefa }[] }[];
  acabaram: { ti: number; t: Tarefa }[];
  atrasadas: { ti: number; t: Tarefa }[];
}
export function hojeNaObra(p: Plano): HojeNaObra {
  const hoje = p.dia;
  // as de hoje e as atrasadas (os dias passaram, mas ainda se estão a fazer)
  const hojeT = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => { const v = estadoVivo(t, p); return t.dia <= hoje && (hoje < t.dia + Math.max(t.dur, 1) || v === "atrasada") && v !== "validada"; });
  const pessoas = [...new Set(hojeT.map((x) => x.t.tec))].map((tec) => ({ tec, tarefas: hojeT.filter((x) => x.t.tec === tec) }));
  const acabaram = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => enviosDe(t).some((e) => (e.k === "feita" || e.k === "validada") && e.dia >= hoje - 1));
  const atrasadas = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => estadoVivo(t, p) === "atrasada");
  return { pessoas, acabaram, atrasadas };
}

/* ------------------------------------------------------------------ o diário */
export interface EntradaFeed { q: string; quem: string; t: string; k: string; fotos: string[]; ordem: number }
/** O diário da obra, do mais recente para o mais antigo: o diário (registos, validações, imprevistos, ajustes) e, nas obras sem diário
 *  (as de exemplo), os registos das tarefas. */
export function diarioDaObra(d: Negocio): EntradaFeed[] {
  const p = d.obra.plano;
  const L: EntradaFeed[] = (d.obra.diario ?? []).map((e, i) => ({ q: e.q, quem: e.quem, t: e.t, k: e.k, fotos: e.fotos ?? [], ordem: i }));
  // os registos das tarefas que não estão no diário (pelo texto não se sabe; usa-se a data e a pessoa)
  if (p) for (const t of p.tasks) for (const e of enviosDe(t)) {
    if (L.some((x) => x.q === e.q && x.quem === e.quem)) continue;
    const txt = e.k === "validada" ? `Validou ${t.nome.toLowerCase()}` : e.k === "feita" ? `${t.nome}: feita${e.horas ? ` (${e.horas} h)` : ""}` : e.k === "correcao" ? `${t.nome}: ${e.nota ?? "correção"}` : `${t.nome}: registo do dia${e.horas ? ` (${e.horas} h)` : ""}`;
    L.push({ q: e.q, quem: e.quem, t: e.nota && e.k !== "correcao" ? `${txt}. ${e.nota}` : txt, k: e.k === "validada" ? "validacao" : e.k === "correcao" ? "correcao" : "horas", fotos: e.fotos ?? [], ordem: -1000 + e.dia * 10 });
  }
  return L.sort((a, b) => b.ordem - a.ordem);
}
/** Todas as fotografias da obra (dos registos), da mais antiga para a mais recente, com a tarefa. */
export function fotografiasDaObra(p: Plano | null | undefined): { foto: string; t: Tarefa; ti: number; dia: number }[] {
  if (!p) return [];
  const out: { foto: string; t: Tarefa; ti: number; dia: number }[] = [];
  p.tasks.forEach((t, ti) => {
    const vistas = new Set<string>();
    for (const e of enviosDe(t)) for (const f of e.fotos ?? []) if (!vistas.has(f)) { vistas.add(f); out.push({ foto: f, t, ti, dia: e.dia }); }
    for (const f of t.exec?.fotos ?? []) if (!vistas.has(f)) { vistas.add(f); out.push({ foto: f, t, ti, dia: t.dia }); }
  });
  return out.sort((a, b) => a.dia - b.dia);
}
/** O antes e o depois: a fotografia da visita (se houver) ou a primeira da obra, e a última. */
export function antesEDepois(d: Negocio): { antes: string; depois: string } | null {
  const F = fotografiasDaObra(d.obra.plano);
  const visita = d.visita.fotosImg?.interior?.[0] ?? d.visita.fotosImg?.area?.[0];
  const antes = visita ?? F[0]?.foto, depois = F[F.length - 1]?.foto;
  return antes && depois && antes !== depois ? { antes, depois } : null;
}

/* ------------------------------------------------------------------ o ponto da semana */
/** O resumo da semana para o cliente, em linguagem simples (sem técnicos nem horas): o que ficou feito, o que está a decorrer, o que vem a
 *  seguir e quando acaba. `dataDe` dá a data de um índice de dia. */
export function pontoDaSemana(p: Plano, dataDe: (k: number) => string): string {
  const hoje = p.estado === "em curso" ? p.dia : 0;
  const nomes = (L: Tarefa[]) => L.map((t) => t.nome.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " e $1");
  const feitas = p.tasks.filter((t) => { const v = estadoVivo(t, p); return (v === "validada" || v === "feita") && enviosDe(t).some((e) => e.dia >= hoje - 4); });
  const decorrer = p.tasks.filter((t) => { const v = estadoVivo(t, p); return v === "em curso" || v === "hoje" || v === "atrasada" || v === "corrigir"; });
  const seguir = p.tasks.filter((t) => t.dia > hoje && t.dia <= hoje + 5 && estadoVivo(t, p) === "por começar");
  const fim = fimDe(p.tasks);
  const partes = [
    feitas.length ? `Esta semana ficou feito: ${nomes(feitas)}.` : "",
    decorrer.length ? `Estamos a trabalhar em ${nomes(decorrer)}.` : "",
    seguir.length ? `Nos próximos dias: ${nomes(seguir)}.` : "",
    `A obra deve ficar pronta a ${dataDe(fim - 1)}.`,
    "As fotografias de cada trabalho estão no portal.",
  ];
  return partes.filter(Boolean).join(" ");
}
