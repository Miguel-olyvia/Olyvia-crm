// 27/11 (Rúben: «é preciso que cries uma nova área no menu para o cérebro, mostrar os agentes a trabalhar, e a base do conhecimento toda,
// como se fosse Obsidian e interativo»). O Cérebro da Olyvia: a base de conhecimento (olyvia_conhecimento) como um grafo de notas ligadas,
// e os seis agentes ao vivo. Aqui está só a parte pura (sem ecrã): montar os nós e as arestas a partir das linhas da base, procurar, e
// juntar o que os agentes estão a fazer em cada obra (da base, ou do Estado dos Negócios quando já está carregado nesta sessão).
import type { Estado } from "../motor";
import { ocupacaoDosTecnicos, rotuloDia } from "../preparacaoObra";
import { fimDe } from "../ajustesPlano";
import { AGENTES, DEGRAUS, DEGRAUS_DE_ORIGEM, degrauDe, modoDa, propostasDosAgentes, type AgenteId, type Degrau } from "../estudioObra/agentes";

export type TipoItem = "guia" | "resumo" | "negocio" | "obra" | "orcamento" | "custos";
/** Os tipos de nó: os da base, mais os temas (os nós que juntam as notas, como as etiquetas no Obsidian) e os seis agentes. */
export type TipoNo = TipoItem | "tema" | "agente";

/** Uma linha de olyvia_conhecimento, como a RLS a deixa ler. */
export interface LinhaConhecimento {
  chave?: string | null;
  tipo: string;
  numero: number | null;
  titulo: string;
  texto: string;
  dados: Record<string, unknown> | null;
  atualizado_em?: string | null;
}

export interface NoGrafo {
  id: string;
  tipo: TipoNo;
  titulo: string;
  /** o nome curto que se escreve ao lado do nó */
  rotulo: string;
  numero: number | null;
  texto: string;
  dados: Record<string, unknown>;
  atualizado: string | null;
  /** quantas ligações tem (o tamanho do nó) */
  grau: number;
  /** obras: quantas propostas dos agentes pedem decisão (o nó pulsa) */
  decisoes: number;
  cor: string;
  agente?: AgenteId;
}
export type TipoAresta = "negocio" | "tema" | "resumo" | "agente";
export interface ArestaGrafo {
  id: string;
  de: string;
  para: string;
  tipo: TipoAresta;
  /** um agente com decisões à espera nesta obra (a ligação corre) */
  ativa?: boolean;
}
export interface Grafo { nos: NoGrafo[]; arestas: ArestaGrafo[] }

/** As cores por tipo (fundo escuro, ao estilo do Obsidian, com a marca). */
export const CORES: Record<Exclude<TipoNo, "agente">, string> = {
  guia: "#a78bfa",
  resumo: "#f5f3ff",
  negocio: "#5aa9ff",
  orcamento: "#34d399",
  custos: "#fbbf24",
  obra: "#f472b6",
  tema: "#c4b5fd",
};
export const NOMES_TIPO: Record<TipoNo, { um: string; varios: string }> = {
  guia: { um: "Guia", varios: "Guia" },
  resumo: { um: "Resumo do dia", varios: "Resumo do dia" },
  negocio: { um: "Negócio", varios: "Negócios" },
  orcamento: { um: "Orçamento", varios: "Orçamentos" },
  custos: { um: "Custos e margem", varios: "Custos" },
  obra: { um: "Obra", varios: "Obras" },
  tema: { um: "Tema", varios: "Temas" },
  agente: { um: "Agente", varios: "Agentes" },
};
export const TIPOS_NO: TipoNo[] = ["negocio", "orcamento", "custos", "obra", "agente", "guia", "resumo", "tema"];

/** Os temas: juntam as notas do guia ao que explicam (e os negócios, as obras e os agentes ao seu tema). */
export const TEMAS: { id: string; titulo: string; re: RegExp }[] = [
  { id: "tema:negocios", titulo: "Negócios", re: /neg[óo]cio|proposta|or[çc]amento|fases? d/i },
  { id: "tema:obras", titulo: "Obras", re: /\bobras?\b|plano|gantt|est[úu]dio/i },
  { id: "tema:agentes", titulo: "Agentes", re: /agente|degrau|autonomia|aprend/i },
  { id: "tema:voz", titulo: "Voz e chat", re: /\bvoz\b|falar|chat|ovelha/i },
  { id: "tema:portal", titulo: "Portal do cliente", re: /portal/i },
];

const TEMAS_LIGADOS: [string, string][] = [["tema:portal", "tema:negocios"], ["tema:voz", "tema:agentes"], ["tema:obras", "tema:agentes"], ["tema:negocios", "tema:obras"]];
const TIPOS_ITEM = new Set<string>(["guia", "resumo", "negocio", "obra", "orcamento", "custos"]);
const curto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/** O nome depois do «·» do título («Negócio 1048 · Tiago Bandarra» → «Tiago Bandarra»). */
const depoisDoPonto = (t: string) => { const i = t.indexOf("·"); return i >= 0 ? t.slice(i + 1).trim() : t; };

export function chaveDe(l: LinhaConhecimento): string {
  return l.chave || `${l.tipo}:${l.numero ?? l.titulo}`;
}

function rotuloDe(l: LinhaConhecimento): string {
  switch (l.tipo) {
    case "negocio": return curto(`${l.numero ?? ""} · ${depoisDoPonto(l.titulo)}`.replace(/^ · /, ""), 26);
    case "obra": return `Obra ${l.numero ?? ""}`.trim();
    case "orcamento": return `Orçamento ${l.numero ?? ""}`.trim();
    case "custos": return `Custos ${l.numero ?? ""}`.trim();
    case "resumo": return "O dia das obras";
    default: return curto(l.titulo, 30);
  }
}

/** Os temas de uma nota do guia: pelo título; sem nenhum, pela primeira frase. */
export function temasDoGuia(titulo: string, texto: string): string[] {
  const pelo = (s: string) => TEMAS.filter((t) => t.re.test(s)).map((t) => t.id);
  const t = pelo(titulo);
  if (t.length) return t;
  const frase = texto.split(/(?<=\.)\s/)[0] ?? "";
  const f = pelo(frase);
  return f.length ? f : ["tema:obras"];
}

// ------------------------------------------------------------------ os agentes em cada obra

export type ModoProposta = "ver" | "pede" | "prazo" | "ja";
export interface PropostaCerebro { agente: AgenteId; modo: ModoProposta; titulo: string; sub?: string }
export interface FeitoCerebro { agente: AgenteId | null; texto: string; quando: string | null; auto: boolean; quem?: string }
export interface ObraCerebro {
  numero: number;
  nome: string;
  estado: string;
  fim: string | null;
  propostas: PropostaCerebro[];
  feitos: FeitoCerebro[];
  degraus: Record<AgenteId, Degrau>;
}

const ID_DO_NOME = new Map(AGENTES.map((a) => [a.nome.toLowerCase(), a.id]));
const ehAgente = (x: unknown): x is AgenteId => typeof x === "string" && AGENTES.some((a) => a.id === x);
const agenteDe = (x: unknown): AgenteId | null => (ehAgente(x) ? x : typeof x === "string" ? ID_DO_NOME.get(x.toLowerCase()) ?? null : null);
const ehModo = (x: unknown): x is ModoProposta => x === "ver" || x === "pede" || x === "prazo" || x === "ja";

/** As obras com o que os agentes fazem, lidas da base (o que o servidor e a página dos Negócios lá deixaram). */
export function obrasDaBase(linhas: LinhaConhecimento[]): ObraCerebro[] {
  const out: ObraCerebro[] = [];
  for (const l of linhas) {
    if (l.tipo !== "obra" || l.numero == null) continue;
    const d = l.dados ?? {};
    const props = Array.isArray(d.propostas) ? d.propostas as Record<string, unknown>[] : [];
    const feitos = Array.isArray(d.feitos) ? d.feitos as Record<string, unknown>[] : [];
    const g = (d.degraus ?? {}) as Partial<Record<AgenteId, unknown>>;
    out.push({
      numero: l.numero,
      nome: depoisDoPonto(l.titulo),
      estado: typeof d.estado === "string" ? d.estado : "",
      fim: typeof d.fim === "string" ? d.fim : null,
      propostas: props.flatMap((p) => { const a = agenteDe(p.agente); return a ? [{ agente: a, modo: ehModo(p.modo) ? p.modo : "pede", titulo: String(p.titulo ?? "") }] : []; }),
      feitos: feitos.map((f) => ({ agente: agenteDe(f.agente), texto: String(f.texto ?? ""), quando: typeof f.quando === "string" ? f.quando : null, auto: f.auto !== false, quem: typeof f.quem === "string" ? f.quem : undefined })),
      degraus: Object.fromEntries(AGENTES.map((a) => { const v = Number(g[a.id]); return [a.id, (v === 0 || v === 1 || v === 2 || v === 3 ? v : DEGRAUS_DE_ORIGEM[a.id]) as Degrau]; })) as Record<AgenteId, Degrau>,
    });
  }
  return out.sort((a, b) => a.numero - b.numero);
}

/** As mesmas obras, calculadas agora a partir do Estado dos Negócios (quando a página já os leu nesta sessão): o que a fita veria. */
export function obrasDoEstado(S: Pick<Estado, "deals"> & Partial<Estado>, agora = new Date()): ObraCerebro[] {
  const out: ObraCerebro[] = [];
  for (const d of S.deals ?? []) {
    const p = d.obra?.plano;
    if (!p || d.perdido || (p.estado !== "em curso" && p.estado !== "aprovado")) continue;
    let L: ReturnType<typeof propostasDosAgentes> = [];
    try { L = propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id)); } catch { L = []; }
    const e = d.obra.agentes;
    let fim: string | null = null;
    try { fim = rotuloDia(p, fimDe(p.tasks) - 1); } catch { fim = null; }
    out.push({
      numero: d.id, nome: d.nome, estado: p.estado, fim,
      propostas: L.map((x) => ({ agente: x.agente, modo: modoDa(x, e, agora), titulo: x.titulo, sub: x.auto ? `${x.sub} Proposta: ${x.auto.texto}` : x.sub })),
      feitos: (e?.feitos ?? []).filter((f) => !f.desfeito && new Date(f.q).toDateString() === agora.toDateString())
        .map((f) => ({ agente: f.agente, texto: f.texto, quando: f.q, auto: f.auto, quem: f.quem })),
      degraus: Object.fromEntries(AGENTES.map((a) => [a.id, degrauDe(e, a.id)])) as Record<AgenteId, Degrau>,
    });
  }
  return out.sort((a, b) => a.numero - b.numero);
}

export interface ResumoAgente {
  id: AgenteId; nome: string; sigla: string; cor: string; vigia: string;
  propostas: number; pedem: number; prazo: number; feitos: number;
  /** o degrau mais comum nas obras (e se varia de obra para obra) */
  degrau: Degrau; degrauVaria: boolean;
  obras: { numero: number; nome: string; propostas: number; pedem: number; degrau: Degrau }[];
}

/** O que cada um dos seis agentes tem em mãos, somado por todas as obras. */
export function resumoDosAgentes(obras: ObraCerebro[]): ResumoAgente[] {
  return AGENTES.map((a) => {
    const porObra = obras.map((o) => {
      const P = o.propostas.filter((x) => x.agente === a.id);
      return { numero: o.numero, nome: o.nome, propostas: P.length, pedem: P.filter((x) => x.modo === "pede").length, prazo: P.filter((x) => x.modo === "prazo").length, degrau: o.degraus[a.id] ?? DEGRAUS_DE_ORIGEM[a.id] };
    });
    const conta = new Map<Degrau, number>();
    for (const o of porObra) conta.set(o.degrau, (conta.get(o.degrau) ?? 0) + 1);
    const degrau = ([...conta.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? DEGRAUS_DE_ORIGEM[a.id]) as Degrau;
    return {
      id: a.id, nome: a.nome, sigla: a.sigla, cor: a.cor, vigia: a.vigia,
      propostas: porObra.reduce((s, o) => s + o.propostas, 0),
      pedem: porObra.reduce((s, o) => s + o.pedem, 0),
      prazo: porObra.reduce((s, o) => s + o.prazo, 0),
      feitos: obras.reduce((s, o) => s + o.feitos.filter((f) => f.agente === a.id).length, 0),
      degrau, degrauVaria: conta.size > 1,
      obras: porObra.filter((o) => o.propostas > 0).map(({ prazo: _p, ...o }) => o),
    };
  });
}
export const nomeDoDegrau = (g: Degrau) => DEGRAUS.find((x) => x.n === g)?.nome ?? "";

// ------------------------------------------------------------------ o grafo

/** Os nós e as arestas a partir das linhas da base. As obras dos agentes (da base ou ao vivo) ligam cada agente às obras onde propõe algo. */
export function montarGrafo(linhas: LinhaConhecimento[], obras: ObraCerebro[] = obrasDaBase(linhas)): Grafo {
  const nos = new Map<string, NoGrafo>();
  const arestas = new Map<string, ArestaGrafo>();
  const ligar = (de: string, para: string, tipo: TipoAresta, ativa = false) => {
    if (de === para || !nos.has(de) || !nos.has(para)) return;
    const id = de < para ? `${de}|${para}` : `${para}|${de}`;
    const ja = arestas.get(id);
    if (ja) { if (ativa) ja.ativa = true; return; }
    arestas.set(id, { id, de, para, tipo, ...(ativa ? { ativa } : {}) });
  };
  const decisoesPorObra = new Map(obras.map((o) => [o.numero, o.propostas.filter((x) => x.modo === "pede").length]));

  for (const l of linhas) {
    if (!TIPOS_ITEM.has(l.tipo)) continue;
    const id = chaveDe(l);
    if (nos.has(id)) continue;
    const tipo = l.tipo as TipoItem;
    const dados = l.dados ?? {};
    const dec = tipo === "obra" && l.numero != null
      ? decisoesPorObra.get(l.numero) ?? (typeof dados.decisoes === "number" ? dados.decisoes : 0)
      : 0;
    nos.set(id, { id, tipo, titulo: l.titulo, rotulo: rotuloDe(l), numero: l.numero, texto: l.texto, dados, atualizado: l.atualizado_em ?? null, grau: 0, decisoes: dec, cor: CORES[tipo] });
  }

  // os temas (só os que ficam com alguma ligação)
  for (const t of TEMAS) nos.set(t.id, { id: t.id, tipo: "tema", titulo: t.titulo, rotulo: t.titulo, numero: null, texto: `O tema «${t.titulo}» junta as notas da base que falam dele: carrega numa ligação para a abrir.`, dados: {}, atualizado: null, grau: 0, decisoes: 0, cor: CORES.tema });
  // os seis agentes
  const comAgentes = obras.length > 0 || [...nos.values()].some((n) => n.tipo === "obra" || n.tipo === "resumo");
  if (comAgentes) for (const a of AGENTES) nos.set(`agente:${a.id}`, { id: `agente:${a.id}`, tipo: "agente", titulo: `Agente ${a.nome}`, rotulo: a.nome, numero: null, texto: `Vigia ${a.vigia}.`, dados: {}, atualizado: null, grau: 0, decisoes: 0, cor: a.cor, agente: a.id });

  const todos = [...nos.values()];
  const porNumero = (tipo: TipoItem, n: number | null) => (n == null ? undefined : todos.find((x) => x.tipo === tipo && x.numero === n));
  for (const n of todos) {
    switch (n.tipo) {
      case "negocio": ligar(n.id, "tema:negocios", "tema"); break;
      case "orcamento": case "custos": case "obra": {
        const neg = porNumero("negocio", n.numero);
        if (neg) ligar(neg.id, n.id, "negocio");
        else ligar(n.id, n.tipo === "obra" ? "tema:obras" : "tema:negocios", "tema");
        if (n.tipo === "custos") { const orc = porNumero("orcamento", n.numero); if (orc) ligar(orc.id, n.id, "negocio"); }
        if (n.tipo === "obra") ligar(n.id, "tema:obras", "tema");
        break;
      }
      case "resumo": ligar(n.id, "tema:obras", "tema"); ligar(n.id, "tema:agentes", "tema"); break;
      case "guia": for (const t of temasDoGuia(n.titulo, n.texto)) ligar(n.id, t, "tema"); break;
      case "agente": ligar(n.id, "tema:agentes", "tema"); break;
      default: break;
    }
  }
  // 27/11: os temas ligam-se entre si (o portal recebe as propostas, a voz fala com os agentes, os agentes vigiam as obras): o grafo fica
  // num só corpo, sem temas a fugir para os cantos
  const comNotas = new Set([...arestas.values()].flatMap((e) => [e.de, e.para]).filter((x) => x.startsWith("tema:")));
  for (const [x, y] of TEMAS_LIGADOS) if (comNotas.has(x) && comNotas.has(y)) ligar(x, y, "tema");
  // o resumo do dia fala de cada obra
  const resumo = todos.find((x) => x.tipo === "resumo");
  if (resumo) for (const o of todos.filter((x) => x.tipo === "obra")) ligar(resumo.id, o.id, "resumo");
  // cada agente liga-se às obras onde propõe alguma coisa; a ligação corre quando pede decisão
  for (const o of obras) {
    const no = porNumero("obra", o.numero);
    if (!no) continue;
    for (const a of AGENTES) {
      const P = o.propostas.filter((x) => x.agente === a.id);
      if (P.length || o.feitos.some((f) => f.agente === a.id)) ligar(`agente:${a.id}`, no.id, "agente", P.some((x) => x.modo === "pede"));
    }
  }

  const A = [...arestas.values()];
  for (const e of A) { nos.get(e.de)!.grau++; nos.get(e.para)!.grau++; }
  // um tema sem nada fica de fora
  const N = [...nos.values()].filter((n) => n.tipo !== "tema" || n.grau > 0);
  const ficam = new Set(N.map((n) => n.id));
  return { nos: N, arestas: A.filter((e) => ficam.has(e.de) && ficam.has(e.para)) };
}

/** Só os nós dos tipos escolhidos (e as arestas entre eles). */
export function filtrarGrafo(g: Grafo, tipos: ReadonlySet<TipoNo>): Grafo {
  const nos = g.nos.filter((n) => tipos.has(n.tipo));
  const ficam = new Set(nos.map((n) => n.id));
  return { nos, arestas: g.arestas.filter((e) => ficam.has(e.de) && ficam.has(e.para)) };
}

/** Os vizinhos de um nó (as ligações, como os «backlinks» do Obsidian). */
export function vizinhos(g: Grafo, id: string): Set<string> {
  const out = new Set<string>();
  for (const e of g.arestas) { if (e.de === id) out.add(e.para); else if (e.para === id) out.add(e.de); }
  return out;
}

export const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Os nós que batem com a pesquisa (título, número e texto, sem acentos). Os do título primeiro. */
export function procurar(g: Grafo, q: string): string[] {
  const termos = semAcentos(q).trim().split(/\s+/).filter(Boolean);
  if (!termos.length) return [];
  const pontos = g.nos.map((n) => {
    const tit = semAcentos(`${n.titulo} ${n.rotulo} ${n.numero ?? ""}`), txt = semAcentos(n.texto);
    if (!termos.every((t) => tit.includes(t) || txt.includes(t))) return null;
    return { id: n.id, p: termos.filter((t) => tit.includes(t)).length * 10 + n.grau / 100 };
  }).filter((x): x is { id: string; p: number } => !!x);
  return pontos.sort((a, b) => b.p - a.p).map((x) => x.id);
}

/** As ligações de cada nó para a app: o negócio, o Estúdio da obra e o relatório. */
export function ligacoesDoNo(n: NoGrafo, g: Grafo): { negocio?: string; obra?: string; relatorio?: string } {
  const num = n.numero;
  const tem = (tipo: TipoItem) => num != null && g.nos.some((x) => x.tipo === tipo && x.numero === num);
  const out: { negocio?: string; obra?: string; relatorio?: string } = {};
  if (num != null && (n.tipo === "negocio" || n.tipo === "orcamento" || n.tipo === "custos" || n.tipo === "obra")) {
    out.negocio = `/negocios?negocio=${num}`;
    if (n.tipo === "obra" || tem("obra")) out.obra = `/negocios?vista=operacoes&obra=${num}`;
    out.relatorio = n.tipo === "obra" ? "/relatorios/olyvia?tipo=obras" : tem("orcamento") ? `/relatorios/olyvia?tipo=orcamento&numero=${num}` : "/relatorios/olyvia?tipo=negocios";
  } else if (n.tipo === "resumo" || n.id === "tema:obras") out.relatorio = "/relatorios/olyvia?tipo=obras";
  else if (n.id === "tema:negocios") out.relatorio = "/relatorios/olyvia?tipo=negocios";
  return out;
}

// ------------------------------------------------------------------ o servidor

/** O servidor (pg_cron «*\/15 * * * *») corre aos 0, 15, 30 e 45 minutos de cada hora: a próxima volta depois de `agora`. */
export function proximaVolta(agora: Date): Date {
  const d = new Date(agora);
  d.setSeconds(0, 0);
  d.setMinutes(Math.floor(d.getMinutes() / 15) * 15 + 15);
  return d;
}
/** Quem escreveu a base da última vez, e quando (pelo resumo do dia). */
export function ultimaEscrita(linhas: LinhaConhecimento[]): { quando: string | null; origem: "servidor" | "pagina" | null } {
  const r = linhas.find((l) => l.tipo === "resumo");
  const o = r?.dados?.origem;
  const quando = (typeof r?.dados?.volta === "string" ? r.dados.volta : null) ?? r?.atualizado_em ?? null;
  return { quando, origem: o === "servidor" || o === "pagina" ? o : null };
}
