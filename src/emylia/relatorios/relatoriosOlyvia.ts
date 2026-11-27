// 26/11 (Rúben: «faz isso ao máximo detalhe, super bonito e detalhado»). Os relatórios da Olyvia: os negócios (o funil por fase, os
// valores), as obras (o estado, o fim, o que os agentes pedem) e o orçamento de um negócio (as linhas, os totais por fase e por taxa de
// IVA, as adendas, as prestações e, para quem vê custos, o custo e a margem). Leem a base de conhecimento (olyvia_conhecimento, com a
// RLS de quem abre): cada pessoa só vê o que já vê na app. Um documento só (DocRelatorio) desenha-se no ecrã, em PDF e em Excel, para os
// três dizerem sempre o mesmo.

export type TipoRelatorio = "negocios" | "obras" | "obra" | "orcamento" | "servicos";
/** 27/11 (Rúben: «preciso de um relatório com todos os negócios com obra por iniciar»): os filtros do relatório dos negócios. */
export type FiltroNegocios = "obra_por_iniciar" | "obra_em_curso" | "em_proposta" | "ganhos" | "perdidos" | `fase:${number}`;
export const FILTROS_NEGOCIOS: { k: FiltroNegocios; rot: string }[] = [
  { k: "obra_por_iniciar", rot: "Com obra por iniciar" }, { k: "obra_em_curso", rot: "Com obra em curso" }, { k: "em_proposta", rot: "Em proposta" },
  { k: "ganhos", rot: "Ganhos" }, { k: "perdidos", rot: "Perdidos" },
];
export interface LinhaBase { tipo: string; numero: number | null; titulo: string; texto: string; dados: Record<string, unknown> | null; atualizado_em: string }

export interface Coluna { t: string; w: number; dir?: true; dinheiro?: true }
export type Seccao =
  | { k: "kpis"; itens: { rot: string; valor: string; nota?: string; tom?: "bom" | "atencao" | "neutro" }[] }
  | { k: "barras"; titulo: string; nota?: string; itens: { rot: string; valor: number; texto: string }[] }
  | { k: "tabela"; titulo: string; nota?: string; colunas: Coluna[]; linhas: (string | number)[][]; total?: (string | number)[] }
  | { k: "texto"; titulo: string; paragrafos: string[] };
export interface DocRelatorio { tipo: TipoRelatorio; titulo: string; subtitulo: string; atualizado: string | null; seccoes: Seccao[]; nomeFicheiro: string }

export const FASES_NEGOCIO = ["Por contactar", "Contacto", "Visita", "Negócio", "Financeiro", "Obra"];
// sempre com o separador dos milhares (o pt-PT só agrupa a partir de 5 algarismos: «8784,10» ao lado de «10 312,45»)
const FMT_EUR = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
export const eur = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${FMT_EUR.format(n)} €`);
const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${(Math.round(n * 1000) / 10).toLocaleString("pt-PT")}%`);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const str = (x: unknown) => (typeof x === "string" ? x : "");
const dataPt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-PT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** A data por extenso: ISO («2026-11-24…») ou como a app a guarda («24/11 23:20», «24/11»); outro texto fica como está. */
export const dia = (v: unknown): string => {
  if (typeof v !== "string" || !v.trim()) return "—";
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${+iso[3]} de ${MESES[+iso[2] - 1]} de ${iso[1]}`;
  const pt = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (pt && +pt[2] >= 1 && +pt[2] <= 12) return `${+pt[1]} de ${MESES[+pt[2] - 1]}${pt[3] ? ` de ${pt[3].length === 2 ? `20${pt[3]}` : pt[3]}` : ""}`;
  return v.trim();
};
const hojeIso = () => new Date().toISOString().slice(0, 10);
const limpar = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const recente = (L: LinhaBase[]) => L.map((x) => x.atualizado_em).filter(Boolean).sort().pop() ?? null;
const nomeDe = (titulo: string) => titulo.replace(/^[^·]*·\s*/, "");

/** Os negócios: o funil por fase, os números e a lista. */
export function docNegocios(L: LinhaBase[], org = "", filtro?: FiltroNegocios | null): DocRelatorio {
  const todos = L.filter((x) => x.tipo === "negocio" && x.numero != null).map((x) => {
    const d = x.dados ?? {};
    return { n: x.numero!, nome: nomeDe(x.titulo), fase: str(d.fase), faseN: num(d.faseN), perdido: !!d.perdido, valor: typeof d.valor === "number" ? d.valor : null,
      obra: str(d.obra), enviada: str(d.enviada), aceite: str(d.aceite) };
  }).sort((a, b) => a.faseN - b.faseN || b.n - a.n);
  // o filtro (o mesmo do chat, relatorio_olyvia): obra por iniciar = aceite e a obra ainda sem plano, por aprovar ou aprovada
  const fFase = filtro?.startsWith("fase:") ? Number(filtro.slice(5)) : null;
  const passa = (x: (typeof todos)[number]) => !filtro ? true
    : filtro === "obra_por_iniciar" ? !x.perdido && !!x.aceite && (!x.obra || x.obra === "por aprovar" || x.obra === "aprovado")
    : filtro === "obra_em_curso" ? x.obra === "em curso"
    : filtro === "em_proposta" ? !x.perdido && !!x.enviada && !x.aceite
    : filtro === "ganhos" ? !x.perdido && !!x.aceite
    : filtro === "perdidos" ? x.perdido
    : fFase != null ? !x.perdido && x.faseN === fFase : true;
  const N = todos.filter(passa);
  const nomeFiltro = filtro ? (FILTROS_NEGOCIOS.find((f) => f.k === filtro)?.rot ?? (fFase != null ? `Na fase ${FASES_NEGOCIO[fFase] ?? fFase}` : "")) : "";
  const ativos = N.filter((x) => !x.perdido), perdidos = N.filter((x) => x.perdido);
  const propostas = ativos.filter((x) => x.enviada && !x.aceite), ganhos = ativos.filter((x) => x.aceite);
  const soma = (A: typeof N) => A.reduce((a, x) => a + (x.valor ?? 0), 0);
  const porFase = FASES_NEGOCIO.map((f, i) => { const A = ativos.filter((x) => x.faseN === i); return { rot: f, n: A.length, valor: soma(A) }; });
  const conv = propostas.length + ganhos.length ? ganhos.length / (propostas.length + ganhos.length) : null;
  return {
    tipo: "negocios", titulo: nomeFiltro ? `Negócios · ${nomeFiltro.toLowerCase()}` : "Relatório dos negócios",
    subtitulo: `${org ? `${org} · ` : ""}${filtro ? `${N.length} ${N.length === 1 ? "negócio" : "negócios"}` : `${ativos.length} negócios ativos`}`, atualizado: recente(L),
    nomeFicheiro: `Relatorio negocios${nomeFiltro ? ` ${limpar(nomeFiltro.toLowerCase())}` : ""} ${hojeIso()}`,
    seccoes: [
      { k: "kpis", itens: [
        { rot: "Negócios ativos", valor: String(ativos.length), nota: perdidos.length === 1 ? "1 perdido" : `${perdidos.length} perdidos` },
        { rot: "Em proposta", valor: eur(soma(propostas)), nota: propostas.length === 1 ? "1 proposta enviada por aceitar" : `${propostas.length} propostas enviadas por aceitar`, tom: "atencao" },
        { rot: "Ganhos", valor: eur(soma(ganhos)), nota: ganhos.length === 1 ? "1 proposta aceite" : `${ganhos.length} propostas aceites`, tom: "bom" },
        { rot: "Taxa de aceitação", valor: pct(conv), nota: "das propostas enviadas", tom: "neutro" },
      ] },
      { k: "barras", titulo: "O funil por fase", nota: "Quantos negócios ativos há em cada fase e o valor das propostas (com IVA).",
        itens: porFase.map((f) => ({ rot: f.rot, valor: f.n, texto: f.valor > 0 ? `${f.n} · ${eur(f.valor)}` : `${f.n} · sem proposta` })) },
      { k: "tabela", titulo: "Os negócios", colunas: [{ t: "Nº", w: 8, dir: true }, { t: "Cliente", w: 38 }, { t: "Fase", w: 16 }, { t: "Proposta (com IVA)", w: 20, dir: true, dinheiro: true }, { t: "Estado", w: 22 }],
        linhas: N.map((x) => [x.n, x.nome, x.fase || FASES_NEGOCIO[x.faseN] || "—", x.valor ?? "—",
          x.perdido ? "Perdido" : x.obra ? `Obra ${x.obra}` : x.aceite ? `Aceite a ${dia(x.aceite)}` : x.enviada ? `Enviada a ${dia(x.enviada)}` : "Por enviar"]),
        total: ["", `${N.length} negócios`, "", soma(ativos), ""] },
    ],
  };
}

/** As obras: o estado, o fim, o que os agentes pedem e o dia. */
export function docObras(L: LinhaBase[], org = ""): DocRelatorio {
  // 27/11 (Rúben: «os relatórios gerados por AI têm de estar muito melhor estruturados»): números, tabelas e listas por tema, em vez
  // do texto corrido «obra a obra». As linhas antigas da base (sem os dados novos) caem no texto, até a base se reescrever (10 a 15 min).
  type Prop = { agente: string; modo: string; titulo: string };
  type Prox = { nome: string; estado: string; quando: string; tec: string };
  type Feito = { quando: string; texto: string; quem: string };
  const O = L.filter((x) => x.tipo === "obra" && x.numero != null).sort((a, b) => a.numero! - b.numero!);
  const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  const dec = O.reduce((a, x) => a + num(x.dados?.decisoes), 0);
  const emCurso = O.filter((x) => str(x.dados?.estado) === "em curso").length;
  const comDados = O.some((x) => x.dados?.total != null);
  const feitasT = O.reduce((a, x) => a + num(x.dados?.feitas), 0), totalT = O.reduce((a, x) => a + num(x.dados?.total), 0);
  const nomeObra = (x: LinhaBase) => `${x.numero} · ${nomeDe(x.titulo)}`;
  const modoTxt = (m: string) => (m === "pede" ? "Pede decisão" : m === "prazo" ? "Aplica-se ao fim do dia" : m === "ja" ? "A aplicar" : "Para saber");
  const props = O.flatMap((x) => arr<Prop>(x.dados?.propostas).map((p) => ({ obra: nomeObra(x), ...p })));
  const pedem = props.filter((p) => p.modo === "pede"), outras = props.filter((p) => p.modo !== "pede");
  const proximas = O.flatMap((x) => arr<Prox>(x.dados?.proximas).map((t) => ({ obra: nomeObra(x), ...t })));
  // a hora: o Cérebro guarda a data ISO (27/11); mostra-se só hh:mm
  const hora = (q: string) => (/^\d{4}-\d{2}-\d{2}T/.test(q) ? new Date(q).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) : q);
  const feitos = O.flatMap((x) => arr<Feito>(x.dados?.feitos).map((f) => ({ obra: nomeObra(x), ...f, quando: hora(str(f.quando)), quem: f.quem || "sozinho" })));
  const pctObra = (x: LinhaBase) => (num(x.dados?.total) ? Math.round((num(x.dados?.feitas) / num(x.dados?.total)) * 100) : 0);
  return {
    tipo: "obras", titulo: "Relatório das obras", subtitulo: `${org ? `${org} · ` : ""}${O.length} obras em curso ou aprovadas`, atualizado: recente(L),
    nomeFicheiro: `Relatorio obras ${hojeIso()}`,
    seccoes: [
      { k: "kpis", itens: [
        { rot: "Obras", valor: String(O.length), nota: `${emCurso} em curso, ${O.length - emCurso} aprovadas` },
        { rot: "Decisões à espera", valor: String(dec), nota: dec ? `em ${O.filter((x) => num(x.dados?.decisoes)).length} ${O.filter((x) => num(x.dados?.decisoes)).length === 1 ? "obra" : "obras"}` : "nada à espera", tom: dec ? "atencao" : "bom" },
        ...(comDados ? [{ rot: "Tarefas feitas", valor: `${feitasT} de ${totalT}`, nota: totalT ? `${Math.round((feitasT / totalT) * 100)}% do total` : "", tom: "neutro" as const }] : []),
        ...(comDados ? [{ rot: "Os agentes fizeram", valor: String(feitos.length), nota: feitos.length ? "hoje, sozinhos ou aceites" : "nada hoje", tom: (feitos.length ? "bom" : "neutro") as "bom" | "neutro" }] : []),
      ] },
      ...(comDados ? [{ k: "barras" as const, titulo: "Progresso por obra", nota: "Tarefas feitas ou validadas sobre o total do plano.", itens: O.map((x) => ({ rot: nomeObra(x), valor: pctObra(x), texto: `${pctObra(x)}% · ${num(x.dados?.feitas)} de ${num(x.dados?.total)}` })) }] : []),
      { k: "tabela", titulo: "As obras", colunas: [{ t: "Nº", w: 7, dir: true }, { t: "Cliente", w: 32 }, { t: "Estado", w: 12 }, { t: "Dia", w: 7, dir: true }, { t: "Tarefas", w: 11, dir: true }, { t: "Acaba a", w: 14 }, { t: "Decisões", w: 10, dir: true }],
        linhas: O.map((x) => [x.numero!, nomeDe(x.titulo), str(x.dados?.estado) || "—", x.dados?.dia != null ? String(num(x.dados?.dia)) : "—",
          x.dados?.total != null ? `${num(x.dados?.feitas)} de ${num(x.dados?.total)}` : "—", str(x.dados?.fim) || "—", num(x.dados?.decisoes)]) },
      ...(pedem.length ? [{ k: "tabela" as const, titulo: "O que pede decisão", nota: "As propostas dos agentes à espera do gestor, obra a obra.", colunas: [{ t: "Obra", w: 28 }, { t: "Agente", w: 12 }, { t: "Proposta", w: 60 }],
        linhas: pedem.map((p) => [p.obra, p.agente, p.titulo]) }] : []),
      ...(proximas.length ? [{ k: "tabela" as const, titulo: "A seguir em cada obra", colunas: [{ t: "Obra", w: 24 }, { t: "Tarefa", w: 36 }, { t: "Estado", w: 12 }, { t: "Quando", w: 14 }, { t: "Técnico", w: 16 }],
        linhas: proximas.map((t) => [t.obra, t.nome, t.estado, t.quando, t.tec]) }] : []),
      ...(feitos.length ? [{ k: "tabela" as const, titulo: "O que os agentes fizeram hoje", colunas: [{ t: "Obra", w: 24 }, { t: "Quando", w: 10 }, { t: "O quê", w: 52 }, { t: "Quem", w: 14 }],
        linhas: feitos.map((f) => [f.obra, f.quando, f.texto, f.quem]) }] : []),
      ...(outras.length ? [{ k: "tabela" as const, titulo: "Os agentes a observar", nota: "Não pedem nada: só para saber.", colunas: [{ t: "Obra", w: 28 }, { t: "Agente", w: 12 }, { t: "Estado", w: 16 }, { t: "Nota", w: 48 }],
        linhas: outras.map((p) => [p.obra, p.agente, modoTxt(p.modo), p.titulo]) }] : []),
      // as linhas antigas, sem os dados novos: o texto, como antes
      ...(!comDados ? [{ k: "texto" as const, titulo: "Obra a obra", paragrafos: O.map((x) => x.texto) }] : []),
    ],
  };
}

/** 27/11 (Rúben: «exporta este plano para excel»): o plano de UMA obra, tarefa a tarefa (a fase, as datas, quem e o estado), o que os
 *  agentes pedem e o que está para saber. */
export function docObra(o: LinhaBase, org = ""): DocRelatorio {
  type T = { fase: string; nome: string; ini: string; fim: string; dias: number; tec: string; estado: string };
  type Prop = { agente: string; modo: string; titulo: string };
  const d = o.dados ?? {};
  const T = (Array.isArray(d.tarefas) ? d.tarefas : []) as T[];
  const props = (Array.isArray(d.propostas) ? d.propostas : []) as Prop[];
  const feitas = T.filter((t) => t.estado === "feita" || t.estado === "validada").length;
  const fases = [...new Set(T.map((t) => t.fase))];
  const semTec = T.filter((t) => t.tec === "—").length;
  return {
    tipo: "obra", titulo: `Plano da obra ${o.numero} · ${nomeDe(o.titulo)}`,
    subtitulo: `${org ? `${org} · ` : ""}${str(d.estado) || "—"}${d.dia != null ? ` · dia ${num(d.dia)}` : ""}${str(d.fim) ? ` · acaba a ${str(d.fim)}` : ""}`,
    atualizado: o.atualizado_em, nomeFicheiro: `Plano obra ${o.numero} ${limpar(nomeDe(o.titulo))} ${hojeIso()}`,
    seccoes: [
      { k: "kpis", itens: [
        { rot: "Estado", valor: str(d.estado) || "—", nota: d.dia != null ? `dia ${num(d.dia)}` : "" },
        { rot: "Tarefas feitas", valor: `${feitas} de ${T.length}`, nota: T.length ? `${Math.round((feitas / T.length) * 100)}%` : "", tom: "neutro" },
        { rot: "Acaba a", valor: str(d.fim) || "—" },
        { rot: "Sem técnico", valor: String(semTec), nota: semTec ? "por atribuir" : "todas atribuídas", tom: (semTec ? "atencao" : "bom") as "atencao" | "bom" },
      ] },
      ...(fases.length ? [{ k: "barras" as const, titulo: "Tarefas por fase", itens: fases.map((f) => { const A = T.filter((t) => t.fase === f); const ok = A.filter((t) => t.estado === "feita" || t.estado === "validada").length; return { rot: f, valor: A.length, texto: `${ok} de ${A.length} feitas` }; }) }] : []),
      ...(T.length ? [{ k: "tabela" as const, titulo: "As tarefas", colunas: [{ t: "Fase", w: 18 }, { t: "Tarefa", w: 40 }, { t: "Início", w: 13 }, { t: "Fim", w: 13 }, { t: "Dias", w: 6, dir: true as const }, { t: "Técnico", w: 16 }, { t: "Estado", w: 12 }],
        linhas: T.map((t) => [t.fase, t.nome, t.ini, t.fim, t.dias, t.tec, t.estado]) }] : [{ k: "texto" as const, titulo: "O plano", paragrafos: [o.texto] }]),
      ...(props.some((p) => p.modo === "pede") ? [{ k: "tabela" as const, titulo: "O que pede decisão", colunas: [{ t: "Agente", w: 14 }, { t: "Proposta", w: 80 }], linhas: props.filter((p) => p.modo === "pede").map((p) => [p.agente, p.titulo]) }] : []),
      ...(props.some((p) => p.modo !== "pede") ? [{ k: "tabela" as const, titulo: "Os agentes a observar", colunas: [{ t: "Agente", w: 14 }, { t: "Nota", w: 80 }], linhas: props.filter((p) => p.modo !== "pede").map((p) => [p.agente, p.titulo]) }] : []),
    ],
  };
}

/** 27/11 (Rúben: «faz-me um report pdf com o tipo de serviço que mais vendemos e as suas margens de lucro»): os serviços vendidos, somados
 *  pelos orçamentos dos negócios (por omissão só os ganhos), por serviço e por ofício; com os custos (só quem os vê), a margem de cada um. */
export function docServicos(L: LinhaBase[], org = "", so: "ganhos" | "todos" = "ganhos"): DocRelatorio {
  type Linha = { nome: string; tipo: string; oficio?: string; q?: number; total?: number; preco?: number; custo?: number };
  const neg = new Map(L.filter((x) => x.tipo === "negocio" && x.numero != null).map((x) => [x.numero!, x.dados ?? {}]));
  const conta = (n: number | null) => { const d = n != null ? neg.get(n) : null; return !!d && !d.perdido && (so === "todos" || !!d.aceite); };
  const orcs = L.filter((x) => x.tipo === "orcamento" && conta(x.numero));
  const custos = new Map(L.filter((x) => x.tipo === "custos" && conta(x.numero)).map((x) => [x.numero!, (Array.isArray(x.dados?.linhas) ? x.dados!.linhas : []) as Linha[]]));
  const temCustos = custos.size > 0;
  type Acc = { nome: string; oficio: string; negocios: Set<number>; q: number; vendido: number; preco: number; custo: number };
  const porServ = new Map<string, Acc>();
  for (const o of orcs) {
    const LL = (Array.isArray(o.dados?.linhas) ? o.dados!.linhas : []) as Linha[];
    const CL = custos.get(o.numero!) ?? [];
    for (const l of LL.filter((x) => x.tipo === "servico")) {
      const a = porServ.get(l.nome) ?? { nome: l.nome, oficio: l.oficio || "Outros", negocios: new Set<number>(), q: 0, vendido: 0, preco: 0, custo: 0 };
      a.negocios.add(o.numero!); a.q += num(l.q); a.vendido += num(l.total);
      const c = CL.find((x) => x.nome === l.nome && x.tipo === "servico");
      if (c) { a.preco += num(c.preco); a.custo += num(c.custo); }
      porServ.set(l.nome, a);
    }
  }
  const S = [...porServ.values()].sort((a, b) => b.vendido - a.vendido);
  const margem = (a: { preco: number; custo: number }) => (a.preco > 0 && a.custo > 0 ? (a.preco - a.custo) / a.preco : null);
  const porOficio = new Map<string, { oficio: string; vendido: number; preco: number; custo: number; servicos: number }>();
  for (const a of S) { const o = porOficio.get(a.oficio) ?? { oficio: a.oficio, vendido: 0, preco: 0, custo: 0, servicos: 0 }; o.vendido += a.vendido; o.preco += a.preco; o.custo += a.custo; o.servicos++; porOficio.set(a.oficio, o); }
  const O = [...porOficio.values()].sort((a, b) => b.vendido - a.vendido);
  const total = S.reduce((x, a) => x + a.vendido, 0), tp = S.reduce((x, a) => x + a.preco, 0), tc = S.reduce((x, a) => x + a.custo, 0);
  const mTotal = tp > 0 && tc > 0 ? (tp - tc) / tp : null;
  const top = S[0];
  return {
    tipo: "servicos", titulo: "Os serviços vendidos", subtitulo: `${org ? `${org} · ` : ""}${so === "ganhos" ? `${orcs.length} negócios ganhos` : `${orcs.length} negócios (todos os ativos)`}`,
    atualizado: recente(L), nomeFicheiro: `Servicos vendidos ${so === "ganhos" ? "ganhos " : ""}${hojeIso()}`,
    seccoes: [
      { k: "kpis", itens: [
        { rot: "Vendido em serviços", valor: eur(total), nota: "sem IVA, com os descontos", tom: "neutro" },
        { rot: "O mais vendido", valor: top ? top.nome.slice(0, 28) : "—", nota: top ? `${eur(top.vendido)} em ${top.negocios.size} ${top.negocios.size === 1 ? "negócio" : "negócios"}` : "" },
        { rot: "Serviços diferentes", valor: String(S.length), nota: `${O.length} ${O.length === 1 ? "ofício" : "ofícios"}` },
        ...(temCustos ? [{ rot: "Margem dos serviços", valor: mTotal != null ? pct(mTotal) : "—", nota: `${eur(tp - tc)} de lucro previsto`, tom: (mTotal != null && mTotal >= 0.28 ? "bom" : "atencao") as "bom" | "atencao" }] : []),
      ] },
      ...(O.length ? [{ k: "barras" as const, titulo: "Por tipo de serviço (ofício)", nota: "O valor vendido sem IVA, somado pelos serviços de cada ofício.",
        itens: O.map((o) => ({ rot: o.oficio, valor: o.vendido, texto: `${eur(o.vendido)}${margem(o) != null ? ` · margem ${pct(margem(o)!)}` : ""}` })) }] : []),
      ...(S.length ? [{ k: "barras" as const, titulo: "Os 10 serviços mais vendidos", itens: S.slice(0, 10).map((a) => ({ rot: a.nome, valor: a.vendido, texto: `${eur(a.vendido)}${margem(a) != null ? ` · ${pct(margem(a)!)}` : ""}` })) }] : []),
      ...(S.length ? [{ k: "tabela" as const, titulo: "Por serviço", nota: temCustos ? "A margem é a prevista no orçamento: preço menos custo, sobre o preço." : "Sem acesso aos custos: as margens não aparecem.",
        colunas: [{ t: "Serviço", w: 38 }, { t: "Ofício", w: 14 }, { t: "Negócios", w: 9, dir: true as const }, { t: "Qtd.", w: 8, dir: true as const }, { t: "Vendido s/ IVA", w: 14, dir: true as const, dinheiro: true as const },
          ...(temCustos ? [{ t: "Custo", w: 12, dir: true as const, dinheiro: true as const }, { t: "Margem", w: 9, dir: true as const }] : [])],
        linhas: S.map((a) => [a.nome, a.oficio, a.negocios.size, Math.round(a.q * 100) / 100, Math.round(a.vendido * 100) / 100, ...(temCustos ? [Math.round(a.custo * 100) / 100, margem(a) != null ? pct(margem(a)!) : "—"] : [])]),
        total: ["Total", "", "", "", Math.round(total * 100) / 100, ...(temCustos ? [Math.round(tc * 100) / 100, mTotal != null ? pct(mTotal) : "—"] : [])] }] : [{ k: "texto" as const, titulo: "Os serviços", paragrafos: ["Ainda não há orçamentos com serviços nestes negócios."] }]),
      ...(O.length ? [{ k: "tabela" as const, titulo: "Por ofício", colunas: [{ t: "Ofício", w: 24 }, { t: "Serviços", w: 10, dir: true as const }, { t: "Vendido s/ IVA", w: 16, dir: true as const, dinheiro: true as const },
          ...(temCustos ? [{ t: "Custo", w: 14, dir: true as const, dinheiro: true as const }, { t: "Margem", w: 10, dir: true as const }] : [])],
        linhas: O.map((o) => [o.oficio, o.servicos, Math.round(o.vendido * 100) / 100, ...(temCustos ? [Math.round(o.custo * 100) / 100, margem(o) != null ? pct(margem(o)!) : "—"] : [])]) }] : []),
    ],
  };
}

/** O orçamento de um negócio ao detalhe (e o custo e a margem, se vierem: só quem vê custos os recebe). */
export function docOrcamento(orc: LinhaBase, custos: LinhaBase | null, org = ""): DocRelatorio {
  const d = orc.dados ?? {};
  const linhas = (Array.isArray(d.linhas) ? d.linhas : []) as { nome: string; q: number; un: string; tipo: string; pu: number; total: number; iva: number }[];
  const T = (d.totais ?? {}) as { base?: number; iva?: number; total?: number; a6?: number; a23?: number; isento?: number };
  const porFase = (Array.isArray(d.porFase) ? d.porFase : []) as { nome: string; valor: number }[];
  const adendas = (Array.isArray(d.adendas) ? d.adendas : []) as { n: string; estado: string; motivo: string; total: number; linhas: number }[];
  const parcelas = (Array.isArray(d.parcelas) ? d.parcelas : []) as { nome: string; valor: number; paga: boolean; devida: boolean }[];
  const contrato = d.contrato as { contrato: number; adendas: number; total: number } | null;
  const sv = linhas.filter((l) => l.tipo === "servico"), pr = linhas.filter((l) => l.tipo !== "servico");
  const tabela = (titulo: string, A: typeof linhas) => ({ k: "tabela" as const, titulo, colunas: [{ t: "Descrição", w: 44 }, { t: "Qtd.", w: 10, dir: true as const }, { t: "Un.", w: 7 }, { t: "Preço un.", w: 14, dir: true as const, dinheiro: true as const }, { t: "IVA", w: 7, dir: true as const }, { t: "Total s/ IVA", w: 16, dir: true as const, dinheiro: true as const }],
    linhas: A.map((l) => [l.nome, l.q.toLocaleString("pt-PT"), l.un, l.pu, `${l.iva}%`, l.total]), total: ["Subtotal", "", "", "", "", A.reduce((a, l) => a + l.total, 0)] });
  const c = custos?.dados ?? null;
  const fasesCusto = (Array.isArray(c?.fases) ? c!.fases : []) as { nome: string; prev: number; real: number; preco: number; margemPrev: number; margemReal: number }[];
  const pagas = parcelas.filter((x) => x.paga).reduce((a, x) => a + x.valor, 0);
  const estado = str(d.aceite) ? `aceite a ${dia(d.aceite)}` : str(d.enviada) ? `enviado a ${dia(d.enviada)}` : "por enviar";
  return {
    tipo: "orcamento", titulo: `Orçamento ${orc.numero} · ${nomeDe(orc.titulo)}`, subtitulo: `${org ? `${org} · ` : ""}fase ${str(d.fase) || "—"} · ${estado}${num(d.desconto) ? ` · desconto de ${num(d.desconto)}%` : ""}`,
    atualizado: orc.atualizado_em, nomeFicheiro: `Orcamento ${orc.numero} ${limpar(nomeDe(orc.titulo))} ${hojeIso()}`,
    seccoes: [
      { k: "kpis", itens: [
        { rot: "Total com IVA", valor: eur(T.total), nota: `${eur(T.base)} + ${eur(T.iva)} de IVA`, tom: "neutro" },
        { rot: "Linhas", valor: String(linhas.length), nota: `${sv.length} ${sv.length === 1 ? "serviço" : "serviços"}, ${pr.length} ${pr.length === 1 ? "produto" : "produtos"}` },
        ...(contrato && contrato.adendas ? [{ rot: "Contrato com adendas", valor: eur(contrato.total), nota: `${eur(contrato.adendas)} em adendas assinadas` }] : []),
        ...(parcelas.length ? [{ rot: "Recebido", valor: eur(pagas), nota: `${parcelas.filter((x) => x.paga).length} de ${parcelas.length} prestações pagas`, tom: (pagas > 0 ? "bom" : "atencao") as "bom" | "atencao" }] : []),
        ...(c ? [{ rot: "Margem prevista", valor: pct(num(c.margem)), nota: `${eur(num(c.lucro))} sobre ${eur(num(c.venda))}`, tom: (num(c.margem) >= 0.2 ? "bom" : "atencao") as "bom" | "atencao" }] : []),
      ] },
      ...(porFase.length ? [{ k: "barras" as const, titulo: "Por fase da obra (sem IVA)", itens: porFase.map((f) => ({ rot: f.nome, valor: f.valor, texto: eur(f.valor) })) }] : []),
      ...(sv.length ? [tabela("Serviços", sv)] : []),
      ...(pr.length ? [tabela("Produtos e materiais", pr)] : []),
      { k: "tabela", titulo: "Totais por taxa de IVA", colunas: [{ t: "Parte", w: 40 }, { t: "Valor", w: 18, dir: true, dinheiro: true }],
        linhas: [["A 6% (mão de obra e produtos a 6%)", num(T.a6)], ["A 23% (materiais)", num(T.a23)], ...(num(T.isento) ? [["Isento (autoliquidação)", num(T.isento)] as (string | number)[]] : []), ["IVA", num(T.iva)]],
        total: ["Total com IVA", num(T.total)] },
      ...(adendas.length ? [{ k: "tabela" as const, titulo: "Adendas", colunas: [{ t: "Adenda", w: 14 }, { t: "Motivo", w: 30 }, { t: "Estado", w: 14 }, { t: "Linhas", w: 8, dir: true as const }, { t: "Total com IVA", w: 16, dir: true as const, dinheiro: true as const }],
        linhas: adendas.map((a) => [a.n, a.motivo, a.estado, a.linhas, a.total]) }] : []),
      ...(parcelas.length ? [{ k: "tabela" as const, titulo: "Prestações", colunas: [{ t: "Prestação", w: 40 }, { t: "Valor", w: 16, dir: true as const, dinheiro: true as const }, { t: "Estado", w: 20 }],
        linhas: parcelas.map((x) => [x.nome.charAt(0).toUpperCase() + x.nome.slice(1), x.valor, x.paga ? "Paga" : x.devida ? "Por pagar (devida)" : "Por pagar"]), total: ["Total", parcelas.reduce((a, x) => a + x.valor, 0), ""] }] : []),
      ...(c ? [{ k: "tabela" as const, titulo: "Custo e margem (interno)", nota: "Só aparece a quem vê custos. Não vai para o cliente.",
        colunas: [{ t: "Indicador", w: 34 }, { t: "Valor", w: 18, dir: true as const }],
        linhas: [["Venda sem IVA", eur(num(c.venda))], ["Custo previsto", eur(num(c.custo))], ["Margem prevista", `${pct(num(c.margem))} (${eur(num(c.lucro))})`], ["Horas previstas", `${num(c.horas).toLocaleString("pt-PT")} h`],
          ...(c.custoReal != null ? [["Custo real até agora", eur(num(c.custoReal))], ["Horas registadas", `${num(c.horasRegistadas).toLocaleString("pt-PT")} h`]] : [])] }] : []),
      ...(fasesCusto.length ? [{ k: "tabela" as const, titulo: "Custo e margem por fase (interno)", colunas: [{ t: "Fase", w: 26 }, { t: "Custo previsto", w: 16, dir: true as const, dinheiro: true as const }, { t: "Custo real", w: 14, dir: true as const, dinheiro: true as const }, { t: "Margem prevista", w: 14, dir: true as const }, { t: "Margem real", w: 12, dir: true as const }],
        linhas: fasesCusto.map((f) => [f.nome, f.prev, f.real, pct(f.margemPrev), pct(f.margemReal)]) }] : []),
    ],
  };
}

/** O endereço do relatório na app (o chat e a voz dão-no como ligação). */
export function enderecoRelatorioFiltro(filtro: FiltroNegocios, formato?: "pdf" | "excel"): string {
  const q = new URLSearchParams({ tipo: "negocios", filtro });
  if (formato) q.set("formato", formato);
  return `/relatorios/olyvia?${q.toString()}`;
}
export function enderecoRelatorio(tipo: TipoRelatorio, o: { numero?: number | null; formato?: "pdf" | "excel" | null } = {}): string {
  const q = new URLSearchParams({ tipo });
  if (o.numero) q.set("numero", String(o.numero));
  if (o.formato) q.set("formato", o.formato);
  return `/relatorios/olyvia?${q.toString()}`;
}
