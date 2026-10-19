// A obra nas Operações (15/10/2026): o que se mostra e se faz numa obra, com dados de exemplo coerentes com o resto do protótipo.
// · O ciclo da tarefa, como na app das obras (operacao-app), mas muito mais simples: por fazer → em curso → feita (o técnico regista
//   as horas e junta a fotografia) → validada pelo supervisor, ou "a corrigir" (volta ao técnico com o motivo).
// · A equipa (os técnicos do plano, com telefone e custo/hora de exemplo), os equipamentos (das receitas dos serviços, mais os do
//   ofício e a carrinha da Frota), os materiais por fase (da encomenda de cliente e da encomenda a fornecedor), a segurança e as
//   licenças, o diário de obra e os custos previstos e reais.
import { TECS, type Negocio, type Plano, type Tarefa } from "./motor";
import { RECEITAS } from "./receitas";
import { rotuloDia } from "./preparacaoObra";
import { linhaDoResumo, type ResumoEcNeg } from "./inventario/ponteNegocios";

/* ------------------------------------------------------------------ o ciclo da tarefa */
export type EstadoExec = "por fazer" | "em curso" | "feita" | "validada" | "corrigir";
export interface ExecTarefa {
  estado: Exclude<EstadoExec, "por fazer">;
  /** As horas registadas pelo técnico (de equipa). */
  horas: number;
  /** As fotografias (dataURL pequeno ou uma das fotografias de exemplo). */
  fotos: string[];
  nota?: string;
  /** Porque o supervisor pediu correção. */
  motivo?: string;
  feita?: string; validada?: string;
}
export const ROTULO_EXEC: Record<EstadoExec, string> = {
  "por fazer": "por fazer", "em curso": "em curso", feita: "feita, por validar", validada: "validada", corrigir: "a corrigir",
};
export const estadoDe = (t: Tarefa): EstadoExec => t.exec?.estado ?? "por fazer";

/** As tarefas de um técnico no dia `dia` do plano (as que ocupam esse dia e ainda não estão validadas). */
export function tarefasDoDia(p: Plano, dia: number, tec?: string): number[] {
  return p.tasks.map((t, i) => ({ t, i }))
    .filter(({ t }) => (!tec || t.tec === tec) && t.dia <= dia && dia < t.dia + t.dur && estadoDe(t) !== "validada")
    .map(({ i }) => i);
}
/** As tarefas feitas à espera do supervisor. */
export const porValidar = (p: Plano): number[] => p.tasks.map((t, i) => (estadoDe(t) === "feita" ? i : -1)).filter((i) => i >= 0);
/** O que falta para o técnico poder marcar como feita. */
export function faltaParaFeita(t: Tarefa): string[] {
  const F: string[] = [];
  if (!(t.exec && t.exec.horas > 0)) F.push("as horas");
  if (!t.exec?.fotos.length) F.push("uma fotografia do trabalho feito");
  return F;
}
/** O progresso da obra: as horas validadas sobre as previstas (0 a 1). */
export function progresso(p: Plano): number {
  const tot = p.tasks.reduce((a, t) => a + t.h, 0);
  if (p.estado === "concluída") return 1;
  if (!tot) return 0;
  const feito = p.tasks.reduce((a, t) => a + (estadoDe(t) === "validada" ? t.h : estadoDe(t) === "feita" ? t.h * 0.8 : estadoDe(t) === "em curso" ? t.h * 0.3 : 0), 0);
  return Math.min(1, feito / tot);
}

/** Fotografias de exemplo (sem câmara no computador): um desenho simples com a cor da fase e o nome do trabalho. */
export function fotoExemplo(nome: string, cor = "#7c5ce0", k = 0): string {
  const tons = ["#efeaff", "#e8f4ff", "#fff3e6", "#eaf8ef"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="${tons[k % tons.length]}"/>`
    + `<g stroke="${cor}" stroke-width="3" fill="none" opacity="0.55">${Array.from({ length: 6 }, (_, i) => `<line x1="${i * 64}" y1="0" x2="${i * 64}" y2="170"/>`).join("")}${Array.from({ length: 3 }, (_, i) => `<line x1="0" y1="${i * 56}" x2="320" y2="${i * 56}"/>`).join("")}</g>`
    + `<rect y="170" width="320" height="70" fill="${cor}" opacity="0.9"/><text x="16" y="212" font-family="sans-serif" font-size="18" fill="#fff">${nome.replace(/[<&>]/g, "")}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* ------------------------------------------------------------------ a equipa */
/** Os dados de exemplo de cada técnico (nomes fictícios; o custo/hora só a Direção o vê). */
export const FICHA_TEC: Record<string, { tel: string; custoH: number; desde: string }> = {
  js: { tel: "912 418 330", custoH: 14.2, desde: "2019" },
  ra: { tel: "913 552 071", custoH: 14.2, desde: "2022" },
  ma: { tel: "936 120 447", custoH: 18.5, desde: "2017" },
  sf: { tel: "961 734 205", custoH: 17.8, desde: "2018" },
  hn: { tel: "924 806 113", custoH: 17.8, desde: "2021" },
  pm: { tel: "917 645 382", custoH: 16.9, desde: "2020" },
};
export const RESPONSAVEL_OBRA = { n: "Filipe Rocha", papel: "Responsável de obra", tel: "917 300 210" };
export const iniciais = (n: string) => n.split(" ").filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

export interface Membro { id: string; n: string; sk: string; tel: string; custoH: number; dias: number; horas: number; tarefas: string[] }
export function equipaDaObra(p: Plano): Membro[] {
  const M = new Map<string, Membro & { ds: Set<number> }>();
  for (const t of p.tasks) {
    const tec = TECS.find((x) => x.id === t.tec);
    if (!tec) continue;
    const f = FICHA_TEC[tec.id] ?? { tel: "—", custoH: 16, desde: "" };
    const m = M.get(tec.id) ?? { id: tec.id, n: tec.n, sk: tec.sk, tel: f.tel, custoH: f.custoH, dias: 0, horas: 0, tarefas: [], ds: new Set<number>() };
    for (let k = t.dia; k < t.dia + t.dur; k++) m.ds.add(k);
    m.horas += t.h; m.tarefas.push(t.nome);
    M.set(tec.id, m);
  }
  return [...M.values()].map(({ ds, ...m }) => ({ ...m, dias: ds.size, horas: Math.round(m.horas * 10) / 10 }));
}
export const custoHoraDe = (tec: string | null) => (tec && FICHA_TEC[tec]?.custoH) || 16;

/* ------------------------------------------------------------------ os equipamentos */
type Origem = "Armazém" | "Aluguer" | "Frota";
/** Os do ofício (além dos das receitas dos serviços): de onde vêm. */
const DO_OFICIO: Record<string, { n: string; origem: Origem; de?: string }[]> = {
  "Servente · demolição": [{ n: "Aspirador industrial", origem: "Armazém" }],
  Canalizador: [{ n: "Detetor de tubagens", origem: "Armazém" }],
  Ladrilhador: [{ n: "Misturadora de cola", origem: "Armazém" }, { n: "Nível laser", origem: "Armazém" }, { n: "Rebarbadora", origem: "Armazém" },
    { n: "Cortadora de azulejo 120 cm", origem: "Aluguer", de: "Alugatudo Equipamentos (exemplo)" }],
  Montador: [{ n: "Aparafusadora", origem: "Armazém" }, { n: "Nível laser", origem: "Armazém" }],
};
/** Os nomes curtos dos serviços do pacote nas receitas (o plano antigo guarda-os em svcs). */
export interface Equip { n: string; origem: Origem; de?: string; tarefas: string[]; dia: number; fim: number }
export function equipamentosDaObra(p: Plano): Equip[] {
  const E = new Map<string, Equip>();
  const juntar = (n: string, origem: Origem, t: Tarefa, de?: string) => {
    const e = E.get(n) ?? { n, origem, de, tarefas: [], dia: t.dia, fim: t.dia + t.dur };
    if (!e.tarefas.includes(t.nome)) e.tarefas.push(t.nome);
    e.dia = Math.min(e.dia, t.dia); e.fim = Math.max(e.fim, t.dia + t.dur);
    E.set(n, e);
  };
  for (const t of p.tasks) {
    const chaves = t.svcs.length ? t.svcs : /demol/i.test(t.nome) ? ["demol"] : [];
    for (const k of chaves) for (const q of RECEITAS[k]?.equip ?? []) juntar(q.n, "Armazém", t);
    for (const q of DO_OFICIO[t.sk] ?? []) juntar(q.n, q.origem, t, q.de);
  }
  const fim = Math.max(1, ...p.tasks.map((t) => t.dia + t.dur));
  const L = [...E.values()].sort((a, b) => a.dia - b.dia || a.n.localeCompare(b.n));
  // a carrinha da Frota leva a equipa e o material todos os dias
  return [{ n: "Renault Master · AA-12-BC", origem: "Frota", tarefas: ["Transporte da equipa e do material"], dia: 0, fim }, ...L];
}
export const quandoEquip = (p: Plano, e: { dia: number; fim: number }) =>
  `${rotuloDia(p, e.dia)}${e.fim - e.dia > 1 ? ` a ${rotuloDia(p, e.fim - 1)}` : ""} · ${e.fim - e.dia} ${e.fim - e.dia === 1 ? "dia" : "dias"}`;

/* ------------------------------------------------------------------ os materiais, por fase */
export type EstadoMat = "na obra" | "na carrinha" | "reservado" | "recebido" | "a chegar" | "encomendado" | "por encomendar" | "em falta";
export interface Mat { n: string; q: number; un: string; estado: EstadoMat; quando?: string; forn?: string }
/** A fase em que o material entra (pelo nome). */
export function faseDoMaterial(n: string): number {
  const s = n.toLowerCase();
  if (/saco|prote|plást|cartão|entulho/.test(s)) return 1;
  if (/tubo|vál|valv|torneira de corte|multicamada|cabo|caixa/.test(s)) return 2;
  if (/cerâm|ceram|azulej|pavimento|cola|junta|argamassa|revest/.test(s)) return 3;
  return 4;
}
/** Os materiais da obra por fase. `inv`: o estado da encomenda no Inventário novo (16/10); sem ele, o das obras antigas do exemplo. */
export function materiaisPorFase(d: Negocio, inv?: ResumoEcNeg | null): { fase: number; itens: Mat[] }[] {
  const linhas = d.obra.ec?.linhas.map((x) => ({ n: x.n, q: x.q, un: x.un, falta: x.falta })) ?? d.obra.mats?.map((x) => ({ n: x.n, q: x.q, un: x.un, falta: x.falta })) ?? [];
  const itens: (Mat & { fase: number })[] = linhas.map((x) => {
    let estado: EstadoMat = "reservado", quando: string | undefined, forn: string | undefined;
    const li = linhaDoResumo(inv, x.n);
    if (li) {
      const pr = li.pos.find((p) => p.prometida)?.prometida ?? null;
      forn = li.pos[0]?.forn;
      const porAprovar = li.pos.length > 0 && li.pos.every((x) => x.fase === "por aprovar");
      estado = li.st === "served" ? "na obra" : li.aBordo ? "na carrinha" : li.st === "ready" || li.st === "recvpo" ? "reservado" : li.aChegar > 0 ? (porAprovar ? "por encomendar" : pr ? "a chegar" : "encomendado") : "em falta";
      quando = estado === "a chegar" && pr ? `${pr.slice(8, 10)}/${pr.slice(5, 7)}` : undefined;
    } else if (x.falta > 0) estado = d.obra.ec?.ref ? "por encomendar" : "em falta";
    return { n: x.n, q: x.q, un: x.un, estado, quando, forn, fase: faseDoMaterial(x.n) };
  });
  return [1, 2, 3, 4].map((f) => ({ fase: f, itens: itens.filter((x) => x.fase === f).map(({ fase: _f, ...m }) => m) })).filter((g) => g.itens.length);
}

/* ------------------------------------------------------------------ segurança e licenças */
export interface ItemSeg { k: string; t: string; sub: string; ok: boolean }
export function seguranca(d: Negocio): ItemSeg[] {
  const tratado = d.obra.seg ?? {};
  const via = !!(d.orc?.demolicao as { r?: { licenca?: boolean } } | undefined)?.r?.licenca || /via p[úu]blica/i.test(Object.values(d.f).join(" "));
  const cam = d.f.localidade || d.local.split(",").pop()?.trim() || "da zona";
  const L: ItemSeg[] = [
    { k: "seguro", t: "Seguro de responsabilidade civil", sub: "Fidelidade · apólice RC-2026-0412 · válido até 31/12/2026", ok: true },
    { k: "pss", t: "Plano de segurança e saúde", sub: tratado.pss ? `Feito · ${tratado.pss}` : "Riscos da obra, EPI e regras de estaleiro. Fica na carrinha.", ok: !!tratado.pss || d.obra.plano?.estado === "em curso" || d.obra.plano?.estado === "concluída" },
    { k: "condominio", t: "Aviso ao condomínio", sub: tratado.condominio ? `Afixado · ${tratado.condominio}` : "Horário das obras e contacto do responsável, na entrada do prédio.", ok: !!tratado.condominio },
  ];
  if (via) L.push({ k: "via", t: "Licença de ocupação da via pública", sub: tratado.via ? `Aprovada pela Câmara de ${cam} · ${tratado.via}` : `Para o contentor de entulho. Pedido à Câmara de ${cam}.`, ok: !!tratado.via });
  return L;
}

/* ------------------------------------------------------------------ o diário de obra */
export interface EntradaDiario { q: string; quem: string; t: string; k: "horas" | "foto" | "nota" | "ocorrencia" | "validacao" | "correcao" | "marco"; fotos?: string[] }

/* ------------------------------------------------------------------ custos previstos e reais (Direção e Operações) */
export function custosObra(p: Plano): { linhas: { n: string; prev: number; real: number | null }[]; prev: number; real: number } {
  const linhas = p.tasks.map((t) => {
    const ch = custoHoraDe(t.tec), prev = Math.round(t.h * ch * 100) / 100;
    const real = t.exec && t.exec.horas > 0 ? Math.round(t.exec.horas * ch * 100) / 100 : null;
    return { n: t.nome, prev, real };
  });
  return { linhas, prev: linhas.reduce((a, l) => a + l.prev, 0), real: linhas.reduce((a, l) => a + (l.real ?? 0), 0) };
}

