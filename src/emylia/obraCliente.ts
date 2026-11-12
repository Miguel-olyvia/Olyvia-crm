// A obra contada ao cliente no portal (12/11/2026, Rúben: «o cliente tem de ver todo o histórico no portal das coisas que estão a
// acontecer na obra e o progresso»). Sem React: as contas do progresso e a linha do tempo, do mais recente para o mais antigo.
//
// O que o cliente vê, e de onde vem:
// · os registos dos técnicos (quem foi, o trabalho, a nota e as fotografias), o fim de cada trabalho e a verificação do responsável
//   de obra (plano.tasks[].exec.envios, sem os pedidos de correção nem as tarefas de correção, que são internos);
// · os avisos de mudança do plano que a equipa lhe quis dar (obra.alteracoes com avisoCliente);
// · do histórico do negócio, só uma lista fechada de acontecimentos (HIST_CLIENTE): a proposta e o contrato, os materiais
//   encomendados, o início e o fim da obra, as adendas, as faturas e os pagamentos, o auto de receção. O resto do histórico
//   (custos, margens, aprovações, imprevistos, problemas e notas da equipa) nunca sai do CRM: a vista do cliente
//   (real/vistaCliente.ts) já o grava só com estas linhas (`historicoParaCliente`).
// As datas: as do histórico vêm da base («dd/mm hh:mm»); as dos registos e dos avisos saem do dia do plano (os textos «hoje 15:21»
// ficam gravados assim e envelhecem mal).
import type { Evento, Negocio, Plano, Tarefa } from "./motor";
import { diasDaObra, dataCurta } from "./planoObra";
import { inicioDoPlano, rotuloDia } from "./preparacaoObra";
import { fimDe } from "./ajustesPlano";
import { estadoDe, progresso } from "./obraOps";
import { enviosDe, type Envio } from "./trabalhoObra";
import type { ResumoEcNeg } from "./inventario/ponteNegocios";

/* ------------------------------------------------------------------ as datas */
const doisD = (n: number) => String(n).padStart(2, "0");

/** Um texto de data do motor numa data: «aaaa-mm-dd[ hh:mm]», «dd/mm[/aaaa] hh:mm» (também com o dia da semana à frente), «hoje hh:mm».
 *  Sem ano, é o deste ano, ou o do ano passado se ficar mais de dois meses no futuro. Sem data reconhecível: null. */
export function dataDoTexto(q: string | null | undefined, hoje = new Date()): Date | null {
  if (!q) return null;
  const s = q.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  m = /^hoje(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), +(m[1] ?? 0), +(m[2] ?? 0));
  m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:,?\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  const dia = +m[1], mes = +m[2] - 1, h = +(m[4] ?? 0), mi = +(m[5] ?? 0);
  if (m[3]) return new Date(+m[3], mes, dia, h, mi);
  const d = new Date(hoje.getFullYear(), mes, dia, h, mi);
  return d.getTime() - hoje.getTime() > 60 * 864e5 ? new Date(hoje.getFullYear() - 1, mes, dia, h, mi) : d;
}

/** A data do dia `k` do plano (planos do orçamento, com o início). Nos planos de exemplo, sem calendário: null. */
export function dataDoDia(p: Plano, k: number, hoje = new Date()): Date | null {
  if (p.origem !== "orcamento" || k < 0) return null;
  const i = inicioDoPlano(p, hoje);
  return i ? diasDaObra(i, k + 1)[k] ?? null : null;
}

/** O dia do plano em que estamos hoje, pelo calendário (o p.dia da vista pode estar parado desde a última gravação no CRM).
 *  -1 antes do início; nos planos de exemplo, o dia do plano. */
export function diaDeHoje(p: Plano, hoje = new Date()): number {
  const i = p.origem === "orcamento" ? inicioDoPlano(p, hoje) : null;
  if (!i) return p.dia;
  const hj = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = diasDaObra(i, Math.max(1, fimDe(p.tasks)) + 400);
  let k = -1;
  for (let x = 0; x < dias.length && dias[x] <= hj; x++) k = x;
  return k;
}

/** A hora («17:40») de um texto de data, se tiver. */
const horaDe = (q: string) => /(\d{1,2}):(\d{2})/.exec(q);

/** Quando foi um registo do técnico (ou um aviso): o dia do plano com a hora escrita; sem calendário, o próprio texto. */
function quandoNoPlano(p: Plano, dia: number, q: string, hoje: Date): Date | null {
  const d = dataDoDia(p, dia, hoje);
  if (!d) return dataDoTexto(q, hoje);
  const h = horaDe(q);
  return h ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), +h[1], +h[2]) : d;
}

/** «hoje», «ontem» ou «ter, 11 nov» (com o ano, se não for o de hoje). */
export function rotuloDoDia(d: Date, hoje = new Date()): string {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  if (a === h) return "Hoje";
  if (h - a === 864e5) return "Ontem";
  return dataCurta(d) + (d.getFullYear() !== hoje.getFullYear() ? ` ${d.getFullYear()}` : "");
}
export const horaCurta = (d: Date) => (d.getHours() || d.getMinutes() ? `${doisD(d.getHours())}:${doisD(d.getMinutes())}` : "");

/* ------------------------------------------------------------------ o histórico do negócio que o cliente pode ver */
export type TipoMarco = "tecnico" | "acabou" | "concluida" | "inicio" | "plano" | "materiais" | "adenda" | "pagamento" | "fatura" | "contrato" | "fim" | "auto";

/** Uma linha do histórico do negócio que pode ir ao cliente: o texto como fica gravado na vista (`canon`, que volta a casar com `re`)
 *  e como o cliente o lê (`marco`). */
interface Regra { re: RegExp; canon?: (m: RegExpExecArray) => string; marco: (m: RegExpExecArray) => { k: TipoMarco; t: string; sub?: string } }

export const HIST_CLIENTE: readonly Regra[] = [
  { re: /^O cliente aceitou a proposta/, canon: () => "O cliente aceitou a proposta", marco: () => ({ k: "contrato", t: "Aceitou a proposta" }) },
  { re: /^Contrato assinado pelo cliente/, canon: () => "Contrato assinado pelo cliente", marco: () => ({ k: "contrato", t: "Assinou o contrato" }) },
  { re: /^Encomenda de cliente (.+?) emitida/, canon: (m) => `Encomenda de cliente ${m[1]} emitida`, marco: (m) => ({ k: "materiais", t: "Encomendámos os materiais da obra", sub: `Encomenda ${m[1]}` }) },
  { re: /^Encomenda de ajuste (.+?) emitida/, canon: (m) => `Encomenda de ajuste ${m[1]} emitida`, marco: (m) => ({ k: "materiais", t: "Encomendámos os materiais dos trabalhos novos", sub: `Encomenda ${m[1]}` }) },
  { re: /^Obra arrancou/, canon: () => "Obra arrancou", marco: () => ({ k: "inicio", t: "A obra começou" }) },
  { re: /^Obra concluída/, canon: () => "Obra concluída", marco: () => ({ k: "fim", t: "A obra ficou concluída" }) },
  { re: /^Proposta da adenda (.+?)(?: v(\d+))? enviada ao portal do cliente(?:: (.*))?$/,
    marco: (m) => ({ k: "adenda", t: `Recebeu a proposta da adenda ${m[1]}${m[2] ? ` (versão ${m[2]})` : ""}`, sub: m[3] ? primeira(m[3].split(" · ").slice(0, 2).join(" · ")) : undefined }) },
  { re: /^O cliente aceitou a adenda (.+?) no portal/, marco: (m) => ({ k: "adenda", t: `Aceitou a adenda ${m[1]}` }) },
  { re: /^Adenda (.+?) assinada pelo cliente/, canon: (m) => `Adenda ${m[1]} assinada pelo cliente`, marco: (m) => ({ k: "adenda", t: `Assinou a adenda ${m[1]}`, sub: "Os trabalhos a mais entram no plano da obra." }) },
  { re: /^O cliente não aceitou a adenda (\S+(?: \S+)?)(?::|$)/, marco: (m) => ({ k: "adenda", t: `Não aceitou a adenda ${m[1]}`, sub: "A obra segue como no contrato." }) },
  { re: /^Adenda (.+?) retirada do portal do cliente/, canon: (m) => `Adenda ${m[1]} retirada do portal do cliente`, marco: (m) => ({ k: "adenda", t: `A adenda ${m[1]} foi retirada`, sub: "Já não precisa de responder a ela." }) },
  // «Fatura X registada · 1.ª prestação · emitida no programa certificado» ou «Fatura X registada sem confirmar no Eticadata (…)»
  { re: /^Fatura (.+?) registada(?: · (.+?) · emitida)?/, canon: (m) => `Fatura ${m[1]} registada${m[2] ? ` · ${m[2]} · emitida` : ""}`, marco: (m) => ({ k: "fatura", t: `Emitimos a fatura ${m[1]}`, sub: m[2] ? primeira(m[2]) : undefined }) },
  { re: /^Pagamento confirmado no Eticadata · (.+?) paga(?: com o (.+))?$/, marco: (m) => ({ k: "pagamento", t: "Recebemos o seu pagamento", sub: `Fatura ${m[1]}${m[2] ? ` · recibo ${m[2]}` : ""}` }) },
  { re: /^Pagamento da (.+?) validado · (.+?) emitido/, canon: (m) => `Pagamento da ${m[1]} validado · ${m[2]} emitido`, marco: (m) => ({ k: "pagamento", t: "Recebemos o seu pagamento", sub: `${primeira(m[1])} · recibo ${m[2]}` }) },
  { re: /^Pagamento validado · (.+?) emitido/, canon: (m) => `Pagamento validado · ${m[1]} emitido`, marco: (m) => ({ k: "pagamento", t: "Recebemos o seu pagamento", sub: `Recibo ${m[1]}` }) },
  { re: /^O cliente avisou no portal que pagou(?: a fatura (\S+(?: \S+)?))?/, canon: (m) => `O cliente avisou no portal que pagou${m[1] ? ` a fatura ${m[1]}` : ""}`,
    marco: (m) => ({ k: "pagamento", t: m[1] ? `Avisou-nos de que pagou a fatura ${m[1]}` : "Avisou-nos de que pagou", sub: "O Financeiro confirma e envia o recibo." }) },
  { re: /^Auto de receção (.+?) enviado ao portal do cliente/, canon: (m) => `Auto de receção ${m[1]} enviado ao portal do cliente`, marco: (m) => ({ k: "auto", t: "O auto de receção ficou pronto", sub: `Auto ${m[1]}, para assinar quando receber a obra.` }) },
  { re: /^Auto de receção (.+?) assinado pelo cliente(?:.*?, com observações: (.+))?/, marco: (m) => ({ k: "auto", t: "Recebeu a obra e assinou o auto de receção", sub: m[2] ? `Com observações: ${m[2]}` : "Está tudo bem." }) },
];
/** A primeira letra em maiúscula. */
function primeira(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }

const regraDe = (t: string): [Regra, RegExpExecArray] | null => {
  for (const r of HIST_CLIENTE) { const m = r.re.exec(t); if (m) return [r, m]; }
  return null;
};

/** O histórico do negócio como vai na vista do cliente: só as linhas da lista, com o texto limpo, e a data «hoje hh:mm» (as linhas
 *  desta sessão, ainda por reler da base) passada a «dd/mm hh:mm». Sem autor: quem fez é da equipa. */
export function historicoParaCliente(hist: readonly Evento[], hoje = new Date()): Evento[] {
  const out: Evento[] = [];
  for (const e of hist) {
    const r = regraDe(e.t);
    if (!r) continue;
    const q = /^hoje\b/.test(e.q.trim()) ? (() => { const d = dataDoTexto(e.q, hoje)!; return `${doisD(d.getDate())}/${doisD(d.getMonth() + 1)}/${d.getFullYear()} ${doisD(d.getHours())}:${doisD(d.getMinutes())}`; })() : e.q;
    out.push({ t: r[0].canon ? r[0].canon(r[1]) : e.t, q, k: e.k });
  }
  return out;
}

/* ------------------------------------------------------------------ a linha do tempo */
export interface MarcoCliente {
  k: TipoMarco;
  quando: Date | null;
  t: string;
  sub?: string;
  /** a nota do técnico */
  nota?: string;
  fotos?: string[];
  /** o trabalho (registos dos técnicos) e a fase dele */
  tarefa?: string; fase?: number;
}

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] || "A equipa";
/** As tarefas que o cliente vê: as de correção são internas. */
export const tarefasDoCliente = (p: Plano): Tarefa[] => p.tasks.filter((t) => t.corrige == null);
/** Os registos de uma tarefa que o cliente vê. */
const enviosDoCliente = (t: Tarefa): Envio[] => enviosDe(t).filter((e) => e.k !== "correcao");

/** Tudo o que aconteceu na obra (e o que a pôs a andar), do mais recente para o mais antigo. Os que não têm data ficam no fim. */
export function historicoDaObra(d: Negocio, hoje = new Date()): MarcoCliente[] {
  const p = d.obra.plano, L: { m: MarcoCliente; ordem: number }[] = [];
  let n = 0;
  const pôr = (m: MarcoCliente) => L.push({ m, ordem: n++ });
  // o histórico do negócio, só o que a lista deixa (o mais antigo está no fim)
  const vistos = new Set<string>();
  for (const e of [...d.hist].reverse()) {
    const r = regraDe(e.t);
    if (!r) continue;
    const x = r[0].marco(r[1]), quando = dataDoTexto(e.q, hoje), chave = `${x.k}|${x.t}|${x.sub ?? ""}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    pôr({ ...x, quando });
  }
  // aceite e assinado no portal real, sem a linha no histórico: as datas da proposta e da assinatura
  const o = d.orc;
  if (o?.aceite && !L.some((x) => x.m.t === "Aceitou a proposta")) { const q = dataDoTexto(o.aceite, hoje); if (q) pôr({ k: "contrato", t: "Aceitou a proposta", quando: q }); }
  if (o?.contrato === "assinado" && !L.some((x) => x.m.t === "Assinou o contrato")) { const q = dataDoTexto(o.assinatura?.q, hoje); if (q) pôr({ k: "contrato", t: "Assinou o contrato", quando: q }); }
  if (p) {
    // a obra começou sem a linha no histórico (obras antigas): o 1.º dia do plano
    if ((p.estado === "em curso" || p.estado === "concluída") && !L.some((x) => x.m.k === "inicio")) pôr({ k: "inicio", t: "A obra começou", quando: dataDoDia(p, 0, hoje) });
    // os registos dos técnicos, o fim de cada trabalho e a verificação do responsável de obra
    for (const t of tarefasDoCliente(p)) {
      for (const e of enviosDoCliente(t)) {
        const quando = quandoNoPlano(p, e.dia, e.q, hoje), base = { quando, tarefa: t.nome, fase: t.fase, fotos: e.fotos?.length ? e.fotos : undefined, nota: e.nota?.trim() || undefined };
        if (e.k === "validada") pôr({ ...base, k: "concluida", t: `${t.nome}: concluído`, sub: "Verificado pelo responsável de obra." });
        else if (e.k === "feita") pôr({ ...base, k: "acabou", t: `${primeiroNome(e.quem)} acabou ${t.nome.toLowerCase()}`, sub: "Falta a verificação do responsável de obra." });
        else pôr({ ...base, k: "tecnico", t: `${primeiroNome(e.quem)} esteve na obra`, sub: t.nome });
      }
    }
    // os avisos de mudança do plano que a equipa deu ao cliente
    for (const a of d.obra.alteracoes ?? []) if (a.cliente && a.avisoCliente) pôr({ k: "plano", t: a.fimAntes !== a.fimDepois ? "A data de fim da obra mudou" : "Aviso da equipa", sub: a.avisoCliente, quando: quandoNoPlano(p, a.dia, a.q, hoje) });
  }
  // do mais recente para o mais antigo; com a mesma data, o que entrou depois primeiro; sem data, no fim
  return L.sort((a, b) => {
    const x = a.m.quando?.getTime(), y = b.m.quando?.getTime();
    if (x == null && y == null) return b.ordem - a.ordem;
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x || b.ordem - a.ordem;
  }).map((x) => x.m);
}

/** Os marcos agrupados por dia (o rótulo do dia), pela mesma ordem. */
export function porDia(L: readonly MarcoCliente[], hoje = new Date()): { dia: string; marcos: MarcoCliente[] }[] {
  const out: { dia: string; marcos: MarcoCliente[] }[] = [];
  for (const m of L) {
    const dia = m.quando ? rotuloDoDia(m.quando, hoje) : "Sem data";
    const ult = out[out.length - 1];
    if (ult && ult.dia === dia) ult.marcos.push(m); else out.push({ dia, marcos: [m] });
  }
  return out;
}

/* ------------------------------------------------------------------ o progresso */
export type EstadoCliente = "concluída" | "a verificar" | "a decorrer" | "hoje" | "por começar";
export interface TarefaCliente {
  nome: string; fase?: number; estado: EstadoCliente;
  /** as datas previstas («seg, 17 nov») */
  de: string; ate: string;
  /** devia ter acabado e ainda não acabou: a data prevista do fim */
  atrasada?: string;
}
export interface ProgressoCliente {
  estado: Plano["estado"];
  /** 0 a 100 */
  pct: number;
  total: number; concluidas: number; aDecorrer: number; porComecar: number;
  tarefas: TarefaCliente[];
  atrasadas: TarefaCliente[];
  /** o que está a acontecer agora (a decorrer, ou previsto para hoje) e o que vem a seguir */
  agora: TarefaCliente[]; aSeguir: TarefaCliente[];
  inicio: string; fim: string;
  /** a data de fim que o cliente conhecia antes dos avisos de mudança (só se mudou) */
  fimInicial: string | null;
  /** já passou a data de fim e a obra não está concluída */
  fimPassou: boolean;
}

export function progressoDaObra(d: Negocio, hoje = new Date()): ProgressoCliente | null {
  const p = d.obra.plano;
  if (!p || !p.tasks.length) return null;
  const concluida = p.estado === "concluída", emCurso = p.estado === "em curso" || concluida;
  const k = emCurso ? diaDeHoje(p, hoje) : -1, ultimo = fimDe(p.tasks) - 1;
  const tarefas = tarefasDoCliente(p).map((t): TarefaCliente => {
    const e = estadoDe(t), fimT = t.dia + t.dur - 1;
    const estado: EstadoCliente = concluida || e === "validada" ? "concluída" : e === "feita" ? "a verificar" : e === "em curso" || e === "corrigir" ? "a decorrer"
      : emCurso && k >= t.dia && k <= fimT ? "hoje" : "por começar";
    const atrasada = emCurso && (estado === "a decorrer" || estado === "por começar") && k > fimT ? rotuloDia(p, fimT) : undefined;
    return { nome: t.nome, ...(t.fase ? { fase: t.fase } : {}), estado, de: rotuloDia(p, t.dia), ate: rotuloDia(p, fimT), ...(atrasada ? { atrasada } : {}) };
  });
  const ordem = tarefasDoCliente(p);
  const porInicio = (a: TarefaCliente, b: TarefaCliente) => ordem[tarefas.indexOf(a)].dia - ordem[tarefas.indexOf(b)].dia;
  const avisos = (d.obra.alteracoes ?? []).filter((a) => a.cliente && a.avisoCliente && a.fimAntes !== a.fimDepois);
  const fim = rotuloDia(p, ultimo), fimInicial = avisos.length ? avisos[avisos.length - 1].fimAntes : null;
  return {
    estado: p.estado,
    pct: Math.round(progresso(p) * 100),
    total: tarefas.length,
    concluidas: tarefas.filter((t) => t.estado === "concluída").length,
    aDecorrer: tarefas.filter((t) => t.estado === "a decorrer" || t.estado === "a verificar" || t.estado === "hoje").length,
    porComecar: tarefas.filter((t) => t.estado === "por começar").length,
    tarefas,
    atrasadas: tarefas.filter((t) => t.atrasada),
    agora: tarefas.filter((t) => t.estado === "a decorrer" || t.estado === "a verificar" || t.estado === "hoje").sort(porInicio),
    aSeguir: tarefas.filter((t) => t.estado === "por começar" && !t.atrasada).sort(porInicio).slice(0, 3),
    inicio: rotuloDia(p, 0), fim,
    fimInicial: fimInicial && fimInicial !== fim ? fimInicial : null,
    fimPassou: emCurso && !concluida && k > ultimo,
  };
}

/** Os materiais da obra numa frase para o cliente (o estado da encomenda, sem fornecedores). */
export function materiaisDaObra(r: ResumoEcNeg | null | undefined): { naObra: number; prontos: number; aChegar: number; total: number; chegam: string | null } | null {
  if (!r || r.eliminada || !r.linhas.length) return null;
  // cada material conta uma vez: já na obra, a chegar (pedido ao fornecedor, ou ainda sem ele) ou pronto (no armazém ou na carrinha)
  const naObra = r.linhas.filter((l) => l.st === "served").length;
  const aChegar = r.linhas.filter((l) => l.st !== "served" && (l.aChegar > 0 || l.semForn > 0)).length;
  const datas = r.pos.filter((x) => x.fase !== "recebida" && x.fase !== "cancelada" && x.prevista).map((x) => x.prevista).sort();
  const ultima = datas.length ? dataDoTexto(datas[datas.length - 1]) : null;
  return { naObra, prontos: r.linhas.length - naObra - aChegar, aChegar, total: r.linhas.length, chegam: aChegar && ultima ? dataCurta(ultima) : null };
}
