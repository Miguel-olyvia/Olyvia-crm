// 25/11 (Rúben): «exportar o plano todo e o estado para PDF horizontal» e «exportar para Excel: fase, tarefa, micro e tempo». Depois:
// «temos de enviar isto a quem está a validar o plano, para termos os tempos reais e as tarefas reais deste contrato e ensinarmos o
// sistema (tarefas, tempos e dependências); também o histórico da encomenda ao cliente, os materiais pedidos e os prazos de entrega, com o
// máximo de detalhe, para validarem, corrigirem e voltarmos a submeter».
// Os dois ficheiros saem dos mesmos dados (linhasDoPlano): as fases pela ordem do Gantt; cada tarefa com uma referência (T7) que não muda,
// o técnico, o ofício, as datas, as horas, de que tarefas depende, o estado de hoje e as microtarefas (T7.3, com o tempo e se estão
// feitas); a encomenda de cliente (materiais, quantidades, estado, encomenda a fornecedor, fornecedor e entrega prevista); o histórico do
// negócio; as alterações ao plano; o orçado. O Excel tem colunas «CORRIGIR» para quem valida; o PDF (pdf-lib) desenha o Gantt inteiro em
// páginas deitadas e a seguir as tabelas. Tudo no navegador: nada vai para fora.
import { TECS, type Estado, type Negocio, type Plano } from "../motor";
import { FASES_OBRA } from "../fasesObra";
import { tarefasDaFase } from "../ordemPlano";
import { diasDaObra } from "../planoObra";
import { inicioDoPlano } from "../preparacaoObra";
import { listaMicro } from "../microtarefas";
import { fimDe } from "../ajustesPlano";
import type { ResumoEcNeg } from "../inventario/ponteNegocios";
import { ROTULO_ALTERACAO, rotuloAcao } from "../historicoPlano";
import { ROTULO_VIVO, estadoVivo, ligacoesDaTarefa, nomeCurtoTarefa, rotuloVivo, type EstadoVivo } from "./planoVivo";

export interface MicroLinha { ref: string; n: string; h: number; dias: number; feita: boolean }
export interface TarefaLinha {
  ref: string; fase: number; faseNome: string; nome: string; /** o nome como o Gantt o mostra */ curto: string; tec: string; oficio: string; ini: Date | null; fim: Date | null; dia: number; dur: number;
  h: number; hReg: number; v: EstadoVivo; estado: string; depende: string; nota: string; micro: MicroLinha[];
}
export interface MaterialLinha {
  ec: string; sku: string; n: string; q: number; un: string; estado: string; saida: number; pronto: number; aChegar: number; semForn: number;
  pos: string; forn: string; prazo: string; causa: string;
}
export interface PoLinha { id: string; forn: string; estado: string; fase: string; prometida: string; prevista: string }
export interface PlanoExportado {
  titulo: string; nome: string; id: number; estadoPlano: Plano["estado"]; hoje: number; dias: Date[]; nDias: number;
  fases: { n: number; nome: string; tarefas: TarefaLinha[] }[];
  /** a encomenda de cliente (null se ainda não há ou não se leu) e as encomendas a fornecedor */
  ec: { id: string; estado: string; linhas: MaterialLinha[]; pos: PoLinha[] } | null;
  /** o histórico do negócio, do mais antigo para o mais recente */
  hist: { q: string; quem: string; t: string }[];
  /** cada mudança feita ao plano (historicoPlano.ts) */
  alteracoes: { q: string; quem: string; acao: string; tarefa: string; tipo: string; antes: string; depois: string }[];
  /** o orçado no contrato: os serviços, a quantidade e as horas */
  orcado: { n: string; q: number; un: string; h: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const virgula = (n: number) => String(n).replace(".", ",");
const nomeTec = (id: string | null | undefined) => (id ? TECS.find((x) => x.id === id)?.n ?? id : "Por atribuir");
const minData = (l: (Date | null)[]) => l.reduce<Date | null>((a, x) => (x && (!a || x < a) ? x : a), null);
const maxData = (l: (Date | null)[]) => l.reduce<Date | null>((a, x) => (x && (!a || x > a) ? x : a), null);

/** Os dados do plano para exportar, pela ordem do Gantt. `ec`: a encomenda de cliente, como o separador Materiais a mostra. */
export function linhasDoPlano(d: Negocio, S?: Estado | null, ec?: ResumoEcNeg | null): PlanoExportado | null {
  const p = d.obra.plano;
  if (!p) return null;
  const nDias = Math.max(1, fimDe(p.tasks));
  const dias = diasDaObra(inicioDoPlano(p) ?? new Date(), nDias + 1);
  const fases = FASES_OBRA.map((f) => ({
    n: f.n, nome: f.curto,
    tarefas: tarefasDaFase(p, f.n).map((ti): TarefaLinha => {
      const t = p.tasks[ti], v = estadoVivo(t, p), feitos = new Set(t.exec?.passos ?? []), ref = `T${ti + 1}`;
      let micro: MicroLinha[] = [];
      try { micro = listaMicro(t, S, p).map((m, k) => ({ ref: `${ref}.${k + 1}`, n: m.n, h: r2(m.h ?? 0), dias: m.dias ?? 0, feita: feitos.has(m.id) })); } catch { /* sem Catálogo */ }
      let depende = "";
      try { depende = ligacoesDaTarefa(p.tasks, ti).depende.map((l) => `T${l.de + 1} ${p.tasks[l.de].nome}${l.mao ? "" : " (pelas datas)"}`).join("; "); } catch { /* sem ligações */ }
      return {
        ref, fase: f.n, faseNome: f.curto, nome: t.nome, curto: nomeCurtoTarefa(t.nome), tec: nomeTec(t.tec),
        oficio: (S?.svc as Record<string, { perfil?: string }> | undefined)?.[String(t.svcs?.[0] ?? "")]?.perfil ?? t.sk ?? "",
        ini: dias[t.dia] ?? null, fim: dias[t.dia + t.dur - 1] ?? null, dia: t.dia, dur: t.dur, h: r2(t.h ?? 0), hReg: r2(t.exec?.horas ?? 0),
        v, estado: rotuloVivo(t, p), depende, nota: t.nota ?? "", micro,
      };
    }),
  })).filter((f) => f.tarefas.length);
  const encomenda = ec ? {
    id: ec.id, estado: ec.rotulo,
    linhas: ec.linhas.map((l): MaterialLinha => ({
      ec: l.ec, sku: l.sku, n: l.n, q: l.q, un: l.un, estado: l.rotulo, saida: l.saida, pronto: l.pronto, aChegar: l.aChegar, semForn: l.semForn,
      pos: l.pos.map((x) => x.id).join(", "), forn: [...new Set(l.pos.map((x) => x.forn))].join(", "),
      prazo: l.pos.map((x) => x.prevista).filter(Boolean).sort().at(-1) ?? "", causa: l.causa ?? "",
    })),
    pos: ec.pos.map((x): PoLinha => ({ id: x.id, forn: x.forn, estado: x.estado, fase: x.fase, prometida: x.prometida ?? "", prevista: x.prevista })),
  } : null;
  const hist = [...(d.hist ?? [])].reverse().map((h) => ({ q: h.q, quem: h.quem ?? "", t: h.t }));
  const alteracoes = (d.obra.mudancasPlano ?? []).flatMap((a) => a.mudancas.map((m) => ({
    q: a.q, quem: a.quem, acao: rotuloAcao(a.acao), tarefa: m.tarefa, tipo: ROTULO_ALTERACAO[m.tipo], antes: m.antes ?? "",
    depois: m.detalhe ? `${m.depois ?? ""} (${m.detalhe})` : m.depois ?? "",
  })));
  const orcado = (d.orc?.linhas ?? []).flatMap((l) => {
    if (l.t !== "svc") return [];
    const sv = (S?.svc as Record<string, { n: string; un: string; h: number }> | undefined)?.[String(l.sid)];
    const q = Number(l.q) || 0;
    if (q <= 0) return []; // as linhas do modelo que ficaram a zero não são do contrato
    return [{ n: sv?.n ?? String(l.sid), q, un: sv?.un ?? "", h: r2((sv?.h ?? 0) * q) }];
  });
  return { titulo: `Plano da obra ${d.id}`, nome: d.nome, id: d.id, estadoPlano: p.estado, hoje: p.dia, dias, nDias, fases, ec: encomenda, hist, alteracoes, orcado };
}

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const dataCurta = (x: Date | null) => (x ? `${x.getDate()} ${MES[x.getMonth()]}` : "—");
const dataLonga = (x: Date | null) => (x ? `${x.getDate()} ${MES[x.getMonth()]} ${x.getFullYear()}` : "—");
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const isoEmData = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? dataLonga(new Date(`${s.slice(0, 10)}T00:00:00`)) : s || "—");
const limparNome = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
export const nomeFicheiro = (P: PlanoExportado, ext: "pdf" | "xlsx", hoje = new Date()) => `Plano da obra ${P.id} ${limparNome(P.nome)} ${iso(hoje)}.${ext}`;

/** Quantas tarefas em cada estado (para o resumo). */
export function resumoEstados(P: PlanoExportado): { v: EstadoVivo; rot: string; n: number }[] {
  const c = new Map<EstadoVivo, number>();
  for (const f of P.fases) for (const t of f.tarefas) c.set(t.v, (c.get(t.v) ?? 0) + 1);
  const ordem: EstadoVivo[] = ["validada", "feita", "em curso", "hoje", "atrasada", "corrigir", "parada", "pausada", "por começar"];
  return ordem.filter((v) => c.get(v)).map((v) => ({ v, rot: ROTULO_VIVO[v], n: c.get(v)! }));
}

/* ------------------------------------------------------------------ Excel */

type Celula = string | number | Date | "";
export interface FolhaExcel { nome: string; colunas: { k: string; t: string; w: number; tipo?: "number" | "date" }[]; linhas: Record<string, Celula>[] }

/** As folhas: «Como validar», «Plano» (fase › tarefa › microtarefa, com o tempo e as colunas CORRIGIR), «Tarefas», «Materiais»,
 *  «Encomendas a fornecedor», «Histórico», «Alterações ao plano» e «Orçado». */
export function folhasExcel(P: PlanoExportado): FolhaExcel[] {
  const instr: FolhaExcel = {
    nome: "Como validar",
    colunas: [{ k: "t", t: `${P.titulo} · ${P.nome}`, w: 130 }],
    linhas: [
      "Este ficheiro é o plano da obra como está hoje na Olyvia, para quem valida o confirmar ou corrigir.",
      "Folha «Plano»: cada fase, as tarefas dela e as microtarefas de cada tarefa, com o tempo, o técnico, as datas e de que tarefas depende.",
      "Corrija só nas colunas que começam por «CORRIGIR» e em «Observações». Não mude a coluna «Ref»: é por ela que as correções voltam ao plano.",
      "Tempo real: as horas que a tarefa ou a microtarefa leva de facto. Espera: os dias de secagem ou cura, sem trabalho.",
      "Depende de: as Ref das tarefas que têm de acabar antes desta começar (por exemplo: T3; T5).",
      "Fica?: escreva «não» para tirar uma tarefa ou microtarefa. Para uma que falta, junte uma linha nova sem Ref, com «juntar» e o nome.",
      "Folhas «Materiais» e «Encomendas a fornecedor»: o que se pediu para esta obra, a quem, o estado e a data prevista de entrega.",
      "Folha «Histórico»: tudo o que aconteceu no negócio, do pedido à obra. Folha «Alterações ao plano»: cada mudança feita ao plano.",
      "Folha «Orçado»: os serviços do contrato e as horas que o orçamento previa.",
    ].map((t) => ({ t })),
  };
  const plano: FolhaExcel = {
    nome: "Plano",
    colunas: [
      { k: "ref", t: "Ref", w: 8 }, { k: "fase", t: "Fase", w: 26 }, { k: "tarefa", t: "Tarefa", w: 46 }, { k: "micro", t: "Microtarefa", w: 52 },
      { k: "h", t: "Tempo (h)", w: 11, tipo: "number" }, { k: "espera", t: "Espera (dias)", w: 13, tipo: "number" },
      { k: "tec", t: "Técnico", w: 22 }, { k: "oficio", t: "Ofício", w: 16 }, { k: "ini", t: "Início", w: 12, tipo: "date" }, { k: "fim", t: "Fim", w: 12, tipo: "date" },
      { k: "dur", t: "Dias úteis", w: 11, tipo: "number" }, { k: "dep", t: "Depende de", w: 44 }, { k: "estado", t: "Estado", w: 20 },
      { k: "cTempo", t: "CORRIGIR: tempo real (h)", w: 16 }, { k: "cEspera", t: "CORRIGIR: espera (dias)", w: 16 },
      { k: "cDep", t: "CORRIGIR: depende de (Ref)", w: 22 }, { k: "cOficio", t: "CORRIGIR: ofício", w: 18 },
      { k: "cFica", t: "CORRIGIR: fica? (sim, não, juntar)", w: 22 }, { k: "cObs", t: "Observações", w: 40 },
    ],
    linhas: [],
  };
  const tarefas: FolhaExcel = {
    nome: "Tarefas",
    colunas: [
      { k: "ref", t: "Ref", w: 8 }, { k: "fase", t: "Fase", w: 26 }, { k: "tarefa", t: "Tarefa", w: 46 }, { k: "tec", t: "Técnico", w: 22 },
      { k: "ini", t: "Início", w: 12, tipo: "date" }, { k: "fim", t: "Fim", w: 12, tipo: "date" }, { k: "dur", t: "Dias úteis", w: 11, tipo: "number" },
      { k: "h", t: "Horas", w: 9, tipo: "number" }, { k: "hReg", t: "Horas registadas", w: 15, tipo: "number" },
      { k: "micro", t: "Microtarefas", w: 13, tipo: "number" }, { k: "feitas", t: "Feitas", w: 9, tipo: "number" },
      { k: "estado", t: "Estado", w: 20 }, { k: "dep", t: "Depende de", w: 44 }, { k: "nota", t: "Nota para a equipa", w: 36 },
    ],
    linhas: [],
  };
  for (const f of P.fases) {
    const fase = `${f.n} · ${f.nome}`;
    plano.linhas.push({ ref: `F${f.n}`, fase, tarefa: "", micro: "", h: r2(f.tarefas.reduce((a, t) => a + t.h, 0)), espera: "", tec: "",
      ini: minData(f.tarefas.map((t) => t.ini)) ?? "", fim: maxData(f.tarefas.map((t) => t.fim)) ?? "", dur: "", estado: "" });
    for (const t of f.tarefas) {
      plano.linhas.push({ ref: t.ref, fase, tarefa: t.nome, micro: "", h: t.h, espera: "", tec: t.tec, oficio: t.oficio, ini: t.ini ?? "", fim: t.fim ?? "", dur: t.dur, dep: t.depende, estado: t.estado });
      for (const m of t.micro) plano.linhas.push({ ref: m.ref, fase, tarefa: t.nome, micro: m.n, h: m.h || "", espera: m.dias || "", estado: m.feita ? "Feita" : "" });
      tarefas.linhas.push({ ref: t.ref, fase, tarefa: t.nome, tec: t.tec, ini: t.ini ?? "", fim: t.fim ?? "", dur: t.dur, h: t.h, hReg: t.hReg,
        micro: t.micro.length, feitas: t.micro.filter((m) => m.feita).length, estado: t.estado, dep: t.depende, nota: t.nota });
    }
  }
  const out = [instr, plano, tarefas];
  if (P.ec) {
    out.push({
      nome: "Materiais",
      colunas: [
        { k: "ec", t: "Encomenda de cliente", w: 18 }, { k: "sku", t: "Referência", w: 16 }, { k: "n", t: "Material", w: 50 }, { k: "q", t: "Quantidade", w: 11, tipo: "number" },
        { k: "un", t: "Unidade", w: 9 }, { k: "estado", t: "Estado", w: 26 }, { k: "saida", t: "Já na obra", w: 11, tipo: "number" }, { k: "pronto", t: "Pronto no armazém", w: 16, tipo: "number" },
        { k: "aChegar", t: "A chegar", w: 10, tipo: "number" }, { k: "semForn", t: "Sem fornecedor", w: 14, tipo: "number" }, { k: "pos", t: "Encomenda a fornecedor", w: 22 },
        { k: "forn", t: "Fornecedor", w: 28 }, { k: "prazo", t: "Entrega prevista", w: 15 }, { k: "causa", t: "Porque está presa", w: 30 },
        { k: "cQ", t: "CORRIGIR: quantidade", w: 18 }, { k: "cObs", t: "Observações", w: 40 },
      ],
      linhas: P.ec.linhas.map((l) => ({ ...l })),
    });
    out.push({
      nome: "Encomendas a fornecedor",
      colunas: [{ k: "id", t: "Encomenda", w: 18 }, { k: "forn", t: "Fornecedor", w: 30 }, { k: "estado", t: "Estado na base", w: 18 }, { k: "fase", t: "Fase", w: 16 },
        { k: "prometida", t: "Data prometida pelo fornecedor", w: 26 }, { k: "prevista", t: "Entrega prevista", w: 16 }],
      linhas: P.ec.pos.map((x) => ({ ...x })),
    });
  }
  out.push({ nome: "Histórico", colunas: [{ k: "q", t: "Quando", w: 18 }, { k: "quem", t: "Quem", w: 24 }, { k: "t", t: "O que aconteceu", w: 110 }], linhas: P.hist.map((h) => ({ ...h })) });
  if (P.alteracoes.length) out.push({
    nome: "Alterações ao plano",
    colunas: [{ k: "q", t: "Quando", w: 22 }, { k: "quem", t: "Quem", w: 22 }, { k: "acao", t: "Ação", w: 30 }, { k: "tarefa", t: "Tarefa", w: 40 },
      { k: "tipo", t: "O que mudou", w: 18 }, { k: "antes", t: "Antes", w: 40 }, { k: "depois", t: "Depois", w: 50 }],
    linhas: P.alteracoes.map((a) => ({ ...a })),
  });
  if (P.orcado.length) out.push({
    nome: "Orçado",
    colunas: [{ k: "n", t: "Serviço do contrato", w: 60 }, { k: "q", t: "Quantidade", w: 11, tipo: "number" }, { k: "un", t: "Unidade", w: 9 }, { k: "h", t: "Horas orçadas", w: 14, tipo: "number" }],
    linhas: P.orcado.map((o) => ({ ...o })),
  });
  return out;
}

/** Os bytes do Excel (a biblioteca xlsx só se carrega aqui). */
export async function gerarExcelPlano(P: PlanoExportado): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const f of folhasExcel(P)) {
    const linhas = f.linhas.map((l) => Object.fromEntries(f.colunas.map((c) => {
      const v = l[c.k] ?? "";
      // texto que começa por = + - @ não vira fórmula
      return [c.t, typeof v === "string" && /^\s*[=+\-@]/.test(v) ? `'${v}` : v];
    })));
    const ws = XLSX.utils.json_to_sheet(linhas, { header: f.colunas.map((c) => c.t), cellDates: true });
    ws["!cols"] = f.colunas.map((c) => ({ wch: c.w }));
    if (f.linhas.length && f.colunas.length > 1) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: f.colunas.length - 1 } }) };
    for (const [ci, c] of f.colunas.entries()) if (c.tipo === "date") for (let r = 1; r <= linhas.length; r++) {
      const cel = ws[XLSX.utils.encode_cell({ r, c: ci })];
      if (cel && cel.t === "d") cel.z = "dd/mm/yyyy";
    }
    XLSX.utils.book_append_sheet(wb, ws, f.nome.slice(0, 31));
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true, cellDates: true }) as Uint8Array;
}

function descarregar(bytes: Uint8Array, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Gera e descarrega o Excel. */
export async function exportarExcelPlano(d: Negocio, S?: Estado | null, ec?: ResumoEcNeg | null): Promise<boolean> {
  const P = linhasDoPlano(d, S, ec);
  if (!P) return false;
  descarregar(await gerarExcelPlano(P), nomeFicheiro(P, "xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return true;
}

/* ------------------------------------------------------------------ PDF */

/** A fonte padrão do PDF só tem Latin-1 (e o €): o resto troca-se por um parecido ou sai. */
export const textoPdf = (s: string) => s.replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/›/g, ">")
  .replace(/\s+/g, " ").replace(/[^\x20-\x7E\xA0-\xFF€]/g, "");

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
/** As cores do Gantt, pelo estado (como na legenda do plano vivo). */
export const COR_PDF: Record<EstadoVivo, Rgb> = {
  validada: hex("#1f8a4c"), feita: hex("#d97706"), corrigir: hex("#dc2626"), atrasada: hex("#dc2626"), parada: hex("#64748b"), pausada: hex("#64748b"),
  "em curso": hex("#7c5ce0"), hoje: hex("#7c5ce0"), "por começar": hex("#b3a6ee"),
};

/** O PDF horizontal: o resumo do estado e o Gantt inteiro (todas as fases e tarefas), em quantas páginas forem precisas, com o eixo das
 *  datas em cada página; a seguir, as tabelas: tarefas e microtarefas, materiais, encomendas a fornecedor, histórico e alterações.
 *  Até 100 dias úteis, A4 deitado; mais, A3 deitado. */
export async function gerarPdfPlano(P: PlanoExportado, agora = new Date()): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(textoPdf(`${P.titulo} · ${P.nome}`));
  pdf.setCreator("Olyvia");
  const fonte = await pdf.embedFont(StandardFonts.Helvetica), negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  type Fonte = typeof fonte;
  const [W, H] = P.nDias > 100 ? [1190.55, 841.89] : [841.89, 595.28];
  const M = 28, ESQ = Math.min(400, W * 0.44), X0 = M + ESQ, X1 = W - M, LIN = 15, CAB_EIXO = 26, FUNDO = M + 14;
  const col = (X1 - X0) / P.nDias;
  const tinta = rgb(0.1, 0.1, 0.14), cinza = rgb(0.42, 0.42, 0.48), claro = rgb(0.9, 0.9, 0.93), faixa = rgb(0.95, 0.95, 0.97), violeta = rgb(0.486, 0.361, 0.878);
  const corta = (s: string, f: Fonte, tam: number, larg: number) => {
    let t = textoPdf(s);
    if (f.widthOfTextAtSize(t, tam) <= larg) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + "...", tam) > larg) t = t.slice(0, -1);
    return t + "...";
  };
  const C = { tarefa: M + 4, tec: M + ESQ * 0.45, estado: M + ESQ * 0.63, datas: M + ESQ * 0.815 };

  let pag = pdf.addPage([W, H]), y = H - M;
  const paginas = [pag];
  const pagina = () => { pag = pdf.addPage([W, H]); paginas.push(pag); y = H - M; };
  const titulo = (t: string) => { pag.drawText(corta(t, negrito, 13, W - 2 * M), { x: M, y: y - 12, size: 13, font: negrito, color: tinta }); y -= 24; };

  // ---- o Gantt
  const eixo = () => {
    const yTop = y;
    pag.drawText("Tarefa", { x: C.tarefa, y: yTop - 16, size: 8, font: negrito, color: cinza });
    pag.drawText(textoPdf("Técnico"), { x: C.tec, y: yTop - 16, size: 8, font: negrito, color: cinza });
    pag.drawText("Estado", { x: C.estado, y: yTop - 16, size: 8, font: negrito, color: cinza });
    pag.drawText("Datas", { x: C.datas, y: yTop - 16, size: 8, font: negrito, color: cinza });
    let ultimo = -Infinity, mesAnt = -1, ultimoMes = -Infinity;
    P.dias.slice(0, P.nDias).forEach((x, k) => {
      const xx = X0 + k * col;
      // o mês só se escreve com espaço desde o anterior (no início, um mês de poucos dias empurra o seguinte)
      if (x.getMonth() !== mesAnt && xx - ultimoMes >= 44) { ultimoMes = xx; pag.drawText(textoPdf(`${MES[x.getMonth()]} ${x.getFullYear()}`), { x: xx + 1, y: yTop - 8, size: 7, font: negrito, color: tinta }); mesAnt = x.getMonth(); }
      if ((x.getDay() === 1 || k === 0) && xx - ultimo >= 18) { pag.drawText(String(x.getDate()), { x: xx + 1, y: yTop - 18, size: 7, font: fonte, color: cinza }); ultimo = xx; }
    });
    y -= CAB_EIXO;
    pag.drawLine({ start: { x: M, y }, end: { x: X1, y }, thickness: 0.6, color: cinza });
  };
  const grelha = (yTopo: number, yFundo: number) => {
    P.dias.slice(0, P.nDias).forEach((x, k) => {
      if (x.getDay() === 1 && k > 0) pag.drawLine({ start: { x: X0 + k * col, y: yTopo }, end: { x: X0 + k * col, y: yFundo }, thickness: 0.3, color: claro });
    });
    if (P.estadoPlano === "em curso" && P.hoje >= 0 && P.hoje < P.nDias) {
      const xh = X0 + P.hoje * col;
      pag.drawLine({ start: { x: xh, y: yTopo }, end: { x: xh, y: yFundo }, thickness: 1, color: violeta, opacity: 0.8 });
    }
  };

  pag.drawText(corta(`${P.titulo} · ${P.nome}`, negrito, 16, W - 2 * M), { x: M, y: y - 14, size: 16, font: negrito, color: tinta });
  y -= 30;
  const todas = P.fases.flatMap((f) => f.tarefas);
  const ini = minData(todas.map((t) => t.ini)), fim = maxData(todas.map((t) => t.fim));
  const hT = r2(todas.reduce((a, t) => a + t.h, 0)), mT = todas.reduce((a, t) => a + t.micro.length, 0), mF = todas.reduce((a, t) => a + t.micro.filter((m) => m.feita).length, 0);
  const estadoTxt = { "por aprovar": "Por aprovar", aprovado: "Aprovado", "em curso": "Em curso", "concluída": "Concluída" }[P.estadoPlano];
  const linha1 = `Plano: ${estadoTxt}  ·  De ${dataLonga(ini)} a ${dataLonga(fim)} (${P.nDias} dias úteis)${P.estadoPlano === "em curso" ? `  ·  Hoje: dia ${P.hoje + 1} de ${P.nDias}` : ""}  ·  ${todas.length} tarefas, ${virgula(hT)} h${mT ? `  ·  Microtarefas: ${mF} de ${mT} feitas` : ""}${P.ec ? `  ·  Materiais: ${P.ec.estado}` : ""}`;
  pag.drawText(corta(linha1, fonte, 9.5, W - 2 * M), { x: M, y, size: 9.5, font: fonte, color: tinta });
  y -= 15;
  let xr = M;
  for (const e of resumoEstados(P)) {
    const txt = textoPdf(`${e.rot}: ${e.n}`), w = fonte.widthOfTextAtSize(txt, 8.5);
    pag.drawRectangle({ x: xr, y: y - 1, width: 9, height: 7, color: rgb(...COR_PDF[e.v]) });
    pag.drawText(txt, { x: xr + 12, y, size: 8.5, font: fonte, color: tinta });
    xr += w + 26;
  }
  y -= 14;
  let xf = M;
  for (const f of P.fases) {
    const txt = textoPdf(`${f.n} · ${f.nome}: ${dataCurta(minData(f.tarefas.map((t) => t.ini)))} a ${dataCurta(maxData(f.tarefas.map((t) => t.fim)))}`), w = fonte.widthOfTextAtSize(txt, 8.5);
    if (xf + w > W - M) { y -= 12; xf = M; }
    pag.drawText(txt, { x: xf, y, size: 8.5, font: fonte, color: cinza });
    xf += w + 22;
  }
  y -= 18;
  eixo();
  let topoGrelha = y;
  const novaPaginaGantt = () => { grelha(topoGrelha, y); pagina(); eixo(); topoGrelha = y; };
  for (const f of P.fases) {
    if (y - LIN * 2 < FUNDO) novaPaginaGantt();
    pag.drawRectangle({ x: M, y: y - LIN, width: X1 - M, height: LIN, color: faixa });
    pag.drawText(corta(`${f.n} · ${f.nome}`, negrito, 8.5, ESQ - 8), { x: C.tarefa, y: y - LIN + 4.5, size: 8.5, font: negrito, color: tinta });
    y -= LIN;
    for (const t of f.tarefas) {
      if (y - LIN < FUNDO) novaPaginaGantt();
      const yb = y - LIN;
      pag.drawText(corta(`${t.ref}  ${t.curto}`, fonte, 8, C.tec - C.tarefa - 6), { x: C.tarefa + 2, y: yb + 4.5, size: 8, font: fonte, color: tinta });
      pag.drawText(corta(t.tec, fonte, 7.5, C.estado - C.tec - 4), { x: C.tec, y: yb + 4.5, size: 7.5, font: fonte, color: cinza });
      pag.drawText(corta(t.estado, negrito, 7.5, C.datas - C.estado - 4), { x: C.estado, y: yb + 4.5, size: 7.5, font: negrito, color: t.v === "por começar" ? cinza : rgb(...COR_PDF[t.v]) });
      pag.drawText(corta(`${dataCurta(t.ini)} - ${dataCurta(t.fim)}`, fonte, 7.5, X0 - C.datas - 4), { x: C.datas, y: yb + 4.5, size: 7.5, font: fonte, color: cinza });
      pag.drawRectangle({ x: X0 + t.dia * col + 0.5, y: yb + 3, width: Math.max(2, t.dur * col - 1), height: LIN - 6, color: rgb(...COR_PDF[t.v]) });
      pag.drawLine({ start: { x: M, y: yb }, end: { x: X1, y: yb }, thickness: 0.3, color: claro });
      y = yb;
    }
  }
  grelha(topoGrelha, y);

  // ---- as tabelas, numa página nova cada uma (com o cabeçalho repetido em cada página)
  type Col = { t: string; w: number; dir?: boolean };
  const tabela = (nome: string, cols: Col[], linhas: { c: string[]; forte?: boolean; faixa?: boolean }[]) => {
    if (!linhas.length) return;
    pagina(); titulo(nome);
    const total = cols.reduce((a, c) => a + c.w, 0), esc = (W - 2 * M) / total;
    const xs = cols.reduce<number[]>((a, c, i) => [...a, i ? a[i - 1] + cols[i - 1].w * esc : M], []);
    const cab = () => {
      cols.forEach((c, i) => pag.drawText(corta(c.t, negrito, 7.5, c.w * esc - 4), { x: xs[i] + 2, y: y - 9, size: 7.5, font: negrito, color: cinza }));
      y -= 13; pag.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: cinza });
    };
    cab();
    for (const l of linhas) {
      if (y - 12 < FUNDO) { pagina(); titulo(`${nome} (continuação)`); cab(); }
      if (l.faixa) pag.drawRectangle({ x: M, y: y - 12, width: W - 2 * M, height: 12, color: faixa });
      l.c.forEach((v, i) => {
        const f = l.forte ? negrito : fonte, larg = cols[i].w * esc - 4, txt = corta(v, f, 7.5, larg);
        const x = cols[i].dir ? xs[i] + 2 + larg - f.widthOfTextAtSize(txt, 7.5) : xs[i] + 2;
        pag.drawText(txt, { x, y: y - 8.5, size: 7.5, font: f, color: tinta });
      });
      y -= 12;
      pag.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.25, color: claro });
    }
  };
  const num = (n: number) => (n ? virgula(n) : "");
  tabela("Tarefas e microtarefas", [{ t: "Ref", w: 6 }, { t: "Tarefa ou microtarefa", w: 50 }, { t: "Tempo (h)", w: 8, dir: true }, { t: "Espera (dias)", w: 9, dir: true },
    { t: "Técnico", w: 16 }, { t: "Datas", w: 15 }, { t: "Depende de", w: 34 }, { t: "Estado", w: 14 }],
  P.fases.flatMap((f) => [
    { c: [`F${f.n}`, `${f.n} · ${f.nome}`, num(r2(f.tarefas.reduce((a, t) => a + t.h, 0))), "", "", `${dataCurta(minData(f.tarefas.map((t) => t.ini)))} - ${dataCurta(maxData(f.tarefas.map((t) => t.fim)))}`, "", ""], forte: true, faixa: true },
    ...f.tarefas.flatMap((t) => [
      { c: [t.ref, t.nome, num(t.h), "", t.tec, `${dataCurta(t.ini)} - ${dataCurta(t.fim)}`, t.depende, t.estado], forte: true },
      ...t.micro.map((m) => ({ c: [m.ref, `    ${m.n}`, num(m.h), num(m.dias), "", "", "", m.feita ? "Feita" : ""] })),
    ]),
  ]));
  if (P.ec) {
    tabela(`Materiais · ${P.ec.id} · ${P.ec.estado}`, [{ t: "Referência", w: 12 }, { t: "Material", w: 44 }, { t: "Qtd.", w: 7, dir: true }, { t: "Un.", w: 5 },
      { t: "Estado", w: 20 }, { t: "Na obra", w: 7, dir: true }, { t: "Pronto", w: 7, dir: true }, { t: "A chegar", w: 7, dir: true }, { t: "Enc. fornecedor", w: 14 }, { t: "Fornecedor", w: 20 }, { t: "Entrega prevista", w: 12 }],
    P.ec.linhas.map((l) => ({ c: [l.sku, l.n, num(l.q), l.un, l.causa ? `${l.estado} (${l.causa})` : l.estado, num(l.saida), num(l.pronto), num(l.aChegar), l.pos, l.forn, l.prazo ? isoEmData(l.prazo) : ""] })));
    tabela("Encomendas a fornecedor", [{ t: "Encomenda", w: 16 }, { t: "Fornecedor", w: 34 }, { t: "Estado na base", w: 16 }, { t: "Fase", w: 16 }, { t: "Data prometida", w: 16 }, { t: "Entrega prevista", w: 16 }],
      P.ec.pos.map((x) => ({ c: [x.id, x.forn, x.estado, x.fase, x.prometida ? isoEmData(x.prometida) : "", isoEmData(x.prevista)] })));
  }
  tabela("Orçado no contrato", [{ t: "Serviço", w: 70 }, { t: "Quantidade", w: 10, dir: true }, { t: "Unidade", w: 8 }, { t: "Horas orçadas", w: 12, dir: true }],
    P.orcado.map((o) => ({ c: [o.n, num(o.q), o.un, num(o.h)] })));
  tabela("Histórico do negócio", [{ t: "Quando", w: 14 }, { t: "Quem", w: 18 }, { t: "O que aconteceu", w: 110 }], P.hist.map((h) => ({ c: [h.q, h.quem, h.t] })));
  tabela("Alterações ao plano", [{ t: "Quando", w: 14 }, { t: "Quem", w: 14 }, { t: "Ação", w: 20 }, { t: "Tarefa", w: 28 }, { t: "O que mudou", w: 14 }, { t: "Antes", w: 26 }, { t: "Depois", w: 30 }],
    P.alteracoes.map((a) => ({ c: [isoEmData(a.q), a.quem, a.acao, a.tarefa, a.tipo, a.antes, a.depois] })));

  const quando = `${agora.getDate()} ${MES[agora.getMonth()]} ${agora.getFullYear()}, ${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  paginas.forEach((pg, i) => {
    pg.drawText(textoPdf(`${P.titulo} · gerado pela Olyvia a ${quando}`), { x: M, y: M - 12, size: 7, font: fonte, color: cinza });
    const n = textoPdf(`Página ${i + 1} de ${paginas.length}`);
    pg.drawText(n, { x: W - M - fonte.widthOfTextAtSize(n, 7), y: M - 12, size: 7, font: fonte, color: cinza });
  });
  return pdf.save();
}

/** Gera e descarrega o PDF. */
export async function exportarPdfPlano(d: Negocio, S?: Estado | null, ec?: ResumoEcNeg | null): Promise<boolean> {
  const P = linhasDoPlano(d, S, ec);
  if (!P) return false;
  descarregar(await gerarPdfPlano(P), nomeFicheiro(P, "pdf"), "application/pdf");
  return true;
}
