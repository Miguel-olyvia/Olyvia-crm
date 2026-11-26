// 26/11 (Rúben: «faz isso ao máximo detalhe, super bonito e detalhado»). Os relatórios da Olyvia: os negócios (o funil por fase, os
// valores), as obras (o estado, o fim, o que os agentes pedem) e o orçamento de um negócio (as linhas, os totais por fase e por taxa de
// IVA, as adendas, as prestações e, para quem vê custos, o custo e a margem). Leem a base de conhecimento (olyvia_conhecimento, com a
// RLS de quem abre): cada pessoa só vê o que já vê na app. Um documento só (DocRelatorio) desenha-se no ecrã, em PDF e em Excel, para os
// três dizerem sempre o mesmo.

export type TipoRelatorio = "negocios" | "obras" | "orcamento";
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
const dia = (iso: unknown) => (typeof iso === "string" && iso ? iso.slice(0, 10).split("-").reverse().join("-") : "—");
const hojeIso = () => new Date().toISOString().slice(0, 10);
const limpar = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const recente = (L: LinhaBase[]) => L.map((x) => x.atualizado_em).filter(Boolean).sort().pop() ?? null;
const nomeDe = (titulo: string) => titulo.replace(/^[^·]*·\s*/, "");

/** Os negócios: o funil por fase, os números e a lista. */
export function docNegocios(L: LinhaBase[], org = ""): DocRelatorio {
  const N = L.filter((x) => x.tipo === "negocio" && x.numero != null).map((x) => {
    const d = x.dados ?? {};
    return { n: x.numero!, nome: nomeDe(x.titulo), fase: str(d.fase), faseN: num(d.faseN), perdido: !!d.perdido, valor: typeof d.valor === "number" ? d.valor : null,
      obra: str(d.obra), enviada: str(d.enviada), aceite: str(d.aceite) };
  }).sort((a, b) => a.faseN - b.faseN || b.n - a.n);
  const ativos = N.filter((x) => !x.perdido), perdidos = N.filter((x) => x.perdido);
  const propostas = ativos.filter((x) => x.enviada && !x.aceite), ganhos = ativos.filter((x) => x.aceite);
  const soma = (A: typeof N) => A.reduce((a, x) => a + (x.valor ?? 0), 0);
  const porFase = FASES_NEGOCIO.map((f, i) => { const A = ativos.filter((x) => x.faseN === i); return { rot: f, n: A.length, valor: soma(A) }; });
  const conv = propostas.length + ganhos.length ? ganhos.length / (propostas.length + ganhos.length) : null;
  return {
    tipo: "negocios", titulo: "Relatório dos negócios", subtitulo: `${org ? `${org} · ` : ""}${ativos.length} negócios ativos`, atualizado: recente(L),
    nomeFicheiro: `Relatorio negocios ${hojeIso()}`,
    seccoes: [
      { k: "kpis", itens: [
        { rot: "Negócios ativos", valor: String(ativos.length), nota: `${perdidos.length} perdidos` },
        { rot: "Em proposta", valor: eur(soma(propostas)), nota: `${propostas.length} propostas enviadas por aceitar`, tom: "atencao" },
        { rot: "Ganhos", valor: eur(soma(ganhos)), nota: `${ganhos.length} propostas aceites`, tom: "bom" },
        { rot: "Taxa de aceitação", valor: pct(conv), nota: "das propostas enviadas", tom: "neutro" },
      ] },
      { k: "barras", titulo: "O funil por fase", nota: "Quantos negócios ativos há em cada fase e o valor das propostas (com IVA).",
        itens: porFase.map((f) => ({ rot: f.rot, valor: f.n, texto: `${f.n} · ${eur(f.valor)}` })) },
      { k: "tabela", titulo: "Os negócios", colunas: [{ t: "Nº", w: 8, dir: true }, { t: "Cliente", w: 38 }, { t: "Fase", w: 16 }, { t: "Proposta (com IVA)", w: 20, dir: true, dinheiro: true }, { t: "Estado", w: 22 }],
        linhas: N.map((x) => [x.n, x.nome, x.fase || FASES_NEGOCIO[x.faseN] || "—", x.valor ?? "—",
          x.perdido ? "Perdido" : x.obra ? `Obra ${x.obra}` : x.aceite ? `Aceite a ${dia(x.aceite)}` : x.enviada ? `Enviada a ${dia(x.enviada)}` : "Por enviar"]),
        total: ["", `${N.length} negócios`, "", soma(ativos), ""] },
    ],
  };
}

/** As obras: o estado, o fim, o que os agentes pedem e o dia. */
export function docObras(L: LinhaBase[], org = ""): DocRelatorio {
  const O = L.filter((x) => x.tipo === "obra" && x.numero != null).sort((a, b) => a.numero! - b.numero!);
  const resumo = L.find((x) => x.tipo === "resumo");
  const dec = O.reduce((a, x) => a + num(x.dados?.decisoes), 0);
  const emCurso = O.filter((x) => str(x.dados?.estado) === "em curso").length;
  return {
    tipo: "obras", titulo: "Relatório das obras", subtitulo: `${org ? `${org} · ` : ""}${O.length} obras em curso ou aprovadas`, atualizado: recente(L),
    nomeFicheiro: `Relatorio obras ${hojeIso()}`,
    seccoes: [
      { k: "kpis", itens: [
        { rot: "Obras", valor: String(O.length), nota: `${emCurso} em curso, ${O.length - emCurso} aprovadas` },
        { rot: "Decisões à espera", valor: String(dec), nota: "pedidas pelos agentes", tom: dec ? "atencao" : "bom" },
      ] },
      { k: "barras", titulo: "Decisões à espera por obra", itens: O.map((x) => ({ rot: `${x.numero} · ${nomeDe(x.titulo)}`, valor: num(x.dados?.decisoes), texto: String(num(x.dados?.decisoes)) })) },
      { k: "tabela", titulo: "As obras", colunas: [{ t: "Nº", w: 8, dir: true }, { t: "Cliente", w: 36 }, { t: "Estado", w: 14 }, { t: "Acaba a", w: 16 }, { t: "Decisões", w: 10, dir: true }],
        linhas: O.map((x) => [x.numero!, nomeDe(x.titulo), str(x.dados?.estado) || "—", str(x.dados?.fim) || "—", num(x.dados?.decisoes)]) },
      ...(resumo ? [{ k: "texto" as const, titulo: "O dia das obras", paragrafos: [resumo.texto] }] : []),
      { k: "texto", titulo: "Obra a obra", paragrafos: O.map((x) => x.texto) },
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
        linhas: parcelas.map((x) => [x.nome, x.valor, x.paga ? "Paga" : x.devida ? "Por pagar (devida)" : "Por pagar"]), total: ["Total", parcelas.reduce((a, x) => a + x.valor, 0), ""] }] : []),
      ...(c ? [{ k: "tabela" as const, titulo: "Custo e margem (interno)", nota: "Só aparece a quem vê custos. Não vai para o cliente.",
        colunas: [{ t: "", w: 34 }, { t: "Valor", w: 18, dir: true as const }],
        linhas: [["Venda sem IVA", eur(num(c.venda))], ["Custo previsto", eur(num(c.custo))], ["Margem prevista", `${pct(num(c.margem))} (${eur(num(c.lucro))})`], ["Horas previstas", `${num(c.horas).toLocaleString("pt-PT")} h`],
          ...(c.custoReal != null ? [["Custo real até agora", eur(num(c.custoReal))], ["Horas registadas", `${num(c.horasRegistadas).toLocaleString("pt-PT")} h`]] : [])] }] : []),
      ...(fasesCusto.length ? [{ k: "tabela" as const, titulo: "Custo e margem por fase (interno)", colunas: [{ t: "Fase", w: 26 }, { t: "Custo previsto", w: 16, dir: true as const, dinheiro: true as const }, { t: "Custo real", w: 14, dir: true as const, dinheiro: true as const }, { t: "Margem prevista", w: 14, dir: true as const }, { t: "Margem real", w: 12, dir: true as const }],
        linhas: fasesCusto.map((f) => [f.nome, f.prev, f.real, pct(f.margemPrev), pct(f.margemReal)]) }] : []),
    ],
  };
}

/** O endereço do relatório na app (o chat e a voz dão-no como ligação). */
export function enderecoRelatorio(tipo: TipoRelatorio, o: { numero?: number | null; formato?: "pdf" | "excel" | null } = {}): string {
  const q = new URLSearchParams({ tipo });
  if (o.numero) q.set("numero", String(o.numero));
  if (o.formato) q.set("formato", o.formato);
  return `/relatorios/olyvia?${q.toString()}`;
}
