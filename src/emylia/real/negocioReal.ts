// CRM: o Negócio da Emylia ↔ as linhas das tabelas (migrations 20261231940000 e 950000), nos dois sentidos, sem base.
// paraLinhas(d) dá as linhas de um negócio; deLinhas(L) monta o Negocio outra vez. Os serviços vão pela chave da Emylia, os produtos e
// os ramos pelo id do Catálogo: trocar por uuid é da camada da base (lerNegocios/gravarNegocios). As datas vão em ISO; na volta saem no
// formato que o motor entende ("dd/mm hh:mm"; "aaaa-mm-dd" nas faturas e no início da obra).
// As adendas vão também (migration 20261231990000). Fora daqui, por agora: a obra (Fase 3), a demolição e o acesso ao portal (Fase 4).
import type { Evento, LinhaOrc, Negocio, Orcamento, Papel, PedidoClausula, VersaoProposta } from "../motor";
import { PREFIXO_PROD, textoProduto, type ProdVisita } from "../produtosVisita";
import type { FaturaReg } from "../v2/financeiro";
import { prestacoes, type Prestacao } from "../planoObra";
import { faturasAdenda, totaisLinhas, type Adenda, type EstadoAdenda, type FaturaAdenda, type LinhaAdenda as LinhaAdendaEmylia } from "../adendas";

/* ------------------------------------------------------------------ datas */
const ANO = 2026;
const dois = (n: number) => String(n).padStart(2, "0");
/** Um texto de data da Emylia em ISO (sem fuso: hora de Portugal tal como está escrita). "hoje 14:05" é hoje. Sem data: null. */
export function paraIso(q: string | null | undefined, hoje: Date = new Date()): string | null {
  if (!q) return null;
  const s = q.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00`;
  m = /^hoje(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) return `${hoje.getFullYear()}-${dois(hoje.getMonth() + 1)}-${dois(hoje.getDate())}T${dois(+(m[1] ?? 0))}:${m[2] ?? "00"}:00`;
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:,?\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return `${m[3] ?? ANO}-${dois(+m[2])}-${dois(+m[1])}T${dois(+(m[4] ?? 0))}:${m[5] ?? "00"}:00`;
  return null;
}
/** ISO → "dd/mm hh:mm" (o formato das datas do motor). */
export const deIso = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(iso);
  return m ? `${m[3]}/${m[2]} ${m[4] ?? "00"}:${m[5] ?? "00"}` : "";
};
/** ISO → "dd/mm/aaaa hh:mm" (a data da assinatura). */
export const deIsoAno = (iso: string | null | undefined): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4] ?? "00"}:${m[5] ?? "00"}` : "";
};
/** ISO → "aaaa-mm-dd". */
export const deIsoDia = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : "");
/** Uma data da Emylia como fica depois da ida e volta (para comparar nos testes). */
export const normalQ = (q: string | null | undefined, hoje?: Date) => deIso(paraIso(q, hoje));

/* ------------------------------------------------------------------ as linhas */
export interface LinhaNegocioBase {
  numero: number; titulo: string; telefone: string; fase: number; linha: string; linha_por_definir: boolean; servico_pedido: string;
  morada_obra: string; origem: string; pedido_em: string | null; dono_papel: Papel; estado: "aberto" | "perdido"; motivo_perda: string | null;
  anulado_em: string | null; anulado_por: string | null; anulado_motivo: string | null; anulado_origem: string | null;
  fatura_numero: string | null; fatura_em: string | null; fatura_paga: boolean; recibo_numero: string | null; recibo_em: string | null;
}
export interface LinhaResposta { campo_chave: string; valor: string; sugerido: boolean }
export interface LinhaMedidas {
  pav: number; par: number; pts: number; pcs: number; ptf: number | null; ptq: number | null; necessidades: string[]; slot: string;
  fotos_total: number; fotos_exterior: number | null; fotos_interior: number | null; fotos_area: number | null; fechada: boolean;
}
export interface LinhaServicoVisita { servico: string; inclusao: "pacote" | "fora" | "extra"; quantidade: number | null; mantem: boolean | null; cliente_compra: string | null; ordem: number }
export interface LinhaProdutoVisita {
  ordem: number; produto: string; nome: string; unidade: string; custo_un: number; pvp_un: number | null; categoria: string | null; quantidade: number;
  cliente_fornece: boolean; servico: string | null; fator: number | null; sem_instalacao: boolean;
}
export interface LinhaOficio { perfil_chave: string; nome: string; horas_un: number; custo_hora: number; tecnicos: string[] | null }
export interface LinhaOrcamentoLinha {
  ordem: number; tipo: "servico" | "materiais_modelo" | "produto" | "livre"; servico: string | null; descricao: string; unidade: string | null;
  /** Linha de produto: o produto escolhido na visita (para a encomenda de cliente do CRM). Não volta ao Negocio (deriva-se da descrição). */
  produto?: string | null;
  quantidade: number; preco_un: number; parte_iva: "mao_obra" | "materiais"; taxa_iva: number | null; fornecedor: string | null;
  qtd_origem: number | null; preco_un_origem: number | null; custo_un_origem: number | null;
  custo: { custo_un: number; manual: boolean; congelado: boolean; horas_un: number; mao_obra_un: number; equipamentos_un: number; consumiveis_un: number;
    estrutura_hora: number; estrutura_un: number; ajuste_un: number; congelado_em: string | null; oficios: LinhaOficio[] };
  zonas: { zona: string; quantidade: number; valor: number | null }[] | null;
}
export interface LinhaPrestacao { ordem: number; rotulo: string; pct: number; marco: "adjudicacao" | "antes" | "fase" | "fim"; fase: number | null }
export interface LinhaOrcamento {
  versao: number; estado: "rascunho" | "enviado" | "aceite" | "substituido" | "recusado"; modelo: string; desconto: number; venda_direta: boolean;
  inicio_obra: string | null; equipa: number | null; verificado: boolean; aprovacao: "pedida" | "aprovada" | null;
  motivos_versao: string[]; nota_versao: string | null; onde_refeita: "orcamento" | "visita" | null;
  pedido_cliente: { motivos: string[]; nota: string | null; em: string | null } | null;
  recusa: { motivos: string[]; nota: string | null; em: string | null } | null;
  enviado_em: string | null; aceite_em: string | null; substituido_em: string | null; aceite_antes_em: string | null;
  preco_final: number | null; total_com_iva: number | null;
  prestacoes_por_fases: boolean; sem_demolicao: boolean;
  linhas: LinhaOrcamentoLinha[] | null; zonas: string[] | null; prazo: { tarefa: string; dias: number }[];
  prestacoes: LinhaPrestacao[]; avisos: string[]; precos_manuais: { descricao: string; preco: number }[] | null;
  produtos: LinhaProdutoVisita[] | null; partes_fora: string[] | null;
}
export interface LinhaContrato {
  versao: number; estado: "rascunho" | "enviado" | "alteracoes_pedidas" | "assinado" | "substituido"; substituido_em: string | null;
  revisto_por: string | null; revisto_em: string | null; assinado_em: string | null;
  pedidos: { clausula: string; nota: string; pedido_em: string | null }[];
  clausulas: { titulo: string; texto: string }[];
  assinatura: { metodo: "digital" | "sms" | "desenho"; nome: string; identificador: string | null; telefone_mascarado: string | null; assinado_em: string | null } | null;
}
export interface LinhaFatura {
  chave: string; numero: string; emitida_em: string | null; total: number; prestacao_ordem: number; pdf_caminho: string | null;
  pagamento: { validado_em: string | null; conta_destino: string; referencia: string } | null; recibo: string | null;
}
export interface LinhasNegocio {
  negocio: LinhaNegocioBase;
  respostas: LinhaResposta[];
  visitas: number[];
  medidas: LinhaMedidas;
  servicos: LinhaServicoVisita[];
  produtos: LinhaProdutoVisita[] | null;
  partes_fora: string[] | null;
  orcamentos: LinhaOrcamento[];
  contratos: LinhaContrato[];
  faturas: LinhaFatura[] | null;
  historico: { ordem: number; texto: string; tipo: string; ocorrido_em: string | null }[];
  /** A encomenda de cliente emitida no 1.º pagamento validado (o motor guarda-a em obra.ec). Só vai para a base. */
  ec?: { emitida_em: string | null; por: string | null } | null;
  /** As adendas (trabalhos a mais depois do contrato). */
  adendas?: LinhaAdendaNegocio[];
}
export interface LinhaAdendaLinha {
  ordem: number; servico: string | null; chave: string; livre: boolean; descricao: string; unidade: string; quantidade: number; preco_un: number;
  horas_un: number; perfil: string; perfil_chave: string | null; custo_un: number | null; mao_obra_un: number | null;
  materiais: { nome: string; quantidade: number; unidade: string; preco: number | null; fornecedor: string | null }[] | null;
}
export interface LinhaAdendaVersao {
  versao: number; estado: "rascunho" | "enviado" | "aceite" | "substituido" | "recusado" | "anulado"; desconto: number; verificado: boolean;
  aprovacao: "pedida" | "aprovada" | null; motivos: string[]; nota: string | null;
  pedido_cliente: { motivos: string[]; nota: string | null; em: string | null } | null;
  enviado_em: string | null; aceite_em: string | null; substituido_em: string | null; total: number | null; total_com_iva: number | null;
  linhas: LinhaAdendaLinha[];
}
export interface LinhaFaturaAdenda {
  chave: string; numero: string; emitida_em: string | null; total: number; parcela: number; rotulo: string; pct: number;
  recibo: { numero: string; em: string | null } | null; aviso: { campo: string; valor: string }[];
}
export interface LinhaAdendaNegocio {
  numero: number; referencia: string; estado: EstadoAdenda; motivo: string; criada_em: string | null; enviada_em: string | null; aceite_em: string | null;
  assinada_em: string | null; recusada_em: string | null; recusa: string | null; vista: boolean;
  /** Sem IVA, com IVA e a parte da mão de obra (sem IVA) da versão atual: repartem o IVA das faturas. */
  total: number | null; total_com_iva: number | null; mao_obra?: number | null;
  origem: { imprevisto: string; texto: string; onde: string; foto: string | null } | null;
  versoes: LinhaAdendaVersao[]; contratos: LinhaContrato[]; faturas: LinhaFaturaAdenda[];
}

/** Os contratos de um documento (o orçamento ou uma adenda): as versões substituídas e a atual. */
type DocContrato = Pick<Orcamento, "contratoVersoes" | "contratoPedido" | "clausulas" | "contratoRevisto" | "assinatura">;
function contratosDoc(o: DocContrato, estado: "assinado" | "enviado" | null, iso: (q: string | null | undefined) => string | null): LinhaContrato[] {
  const contratos: LinhaContrato[] = [];
  for (const cv of o.contratoVersoes ?? []) contratos.push({
    versao: cv.n, estado: "substituido", substituido_em: iso(cv.substituido), revisto_por: cv.revisto?.por ?? null, revisto_em: iso(cv.revisto?.q),
    assinado_em: null, pedidos: cv.pedido.map((p) => ({ clausula: p.c, nota: p.nota, pedido_em: null })), clausulas: [], assinatura: null,
  });
  const temAtual = estado || o.contratoPedido || o.clausulas || o.contratoRevisto || o.assinatura;
  if (temAtual) {
    const a = o.assinatura;
    contratos.push({
      versao: (o.contratoVersoes?.length ?? 0) + 1,
      estado: estado === "assinado" ? "assinado" : estado === "enviado" ? "enviado" : o.contratoPedido ? "alteracoes_pedidas" : "rascunho",
      substituido_em: null, revisto_por: o.contratoRevisto?.por ?? null, revisto_em: iso(o.contratoRevisto?.q),
      assinado_em: estado === "assinado" ? iso(a?.q) ?? iso("hoje 00:00") : null,
      pedidos: (o.contratoPedido?.clausulas ?? []).map((p: PedidoClausula) => ({ clausula: p.c, nota: p.nota, pedido_em: iso(o.contratoPedido!.q) })),
      clausulas: Object.entries(o.clausulas ?? {}).map(([titulo, texto]) => ({ titulo, texto })),
      assinatura: a ? { metodo: a.tipo, nome: a.nome, identificador: a.id ?? null, telefone_mascarado: a.telemovel ?? null, assinado_em: iso(a.q) } : null,
    });
  }
  return contratos;
}
/** O inverso: a versão atual e os campos do contrato no documento. */
function docDeContratos(L: LinhaContrato[]): { cAtual: LinhaContrato | undefined; campos: DocContrato } {
  const cAtual = [...L].sort((a, b) => b.versao - a.versao).find((c) => c.estado !== "substituido");
  const cAntigas = L.filter((c) => c.estado === "substituido").sort((a, b) => a.versao - b.versao);
  const a = cAtual?.assinatura;
  return { cAtual, campos: {
    ...(a ? { assinatura: { tipo: a.metodo, nome: a.nome, q: deIsoAno(a.assinado_em), ...(a.identificador ? { id: a.identificador } : {}), ...(a.telefone_mascarado ? { telemovel: a.telefone_mascarado } : {}) } } : {}),
    ...(cAtual && cAtual.pedidos.length ? { contratoPedido: { clausulas: cAtual.pedidos.map((p) => ({ c: p.clausula, nota: p.nota })), q: deIso(cAtual.pedidos[0]?.pedido_em) } } : {}),
    ...(cAntigas.length ? { contratoVersoes: cAntigas.map((c) => ({ n: c.versao, substituido: deIso(c.substituido_em), pedido: c.pedidos.map((p) => ({ c: p.clausula, nota: p.nota })), ...(c.revisto_por ? { revisto: { por: c.revisto_por, q: deIso(c.revisto_em) } } : {}) })) } : {}),
    ...(cAtual?.clausulas.length ? { clausulas: Object.fromEntries(cAtual.clausulas.map((c) => [c.titulo, c.texto])) } : {}),
    ...(cAtual?.revisto_por ? { contratoRevisto: { por: cAtual.revisto_por, q: deIso(cAtual.revisto_em) } } : {}),
  } };
}

/* ------------------------------------------------------------------ adendas */
const r2a = (x: number) => Math.round(x * 100) / 100;
/** O desconto da adenda é em % na Emylia e em fração na base. */
const fracao = (pct: number | undefined) => (pct ? Math.round(pct * 1e4) / 1e6 : 0);
const percent = (f: number) => Math.round(f * 1e6) / 1e4;
const linhaAdendaParaLinha = (x: LinhaAdendaEmylia, i: number): LinhaAdendaLinha => ({
  ordem: i, servico: x.livre ? null : x.sid, chave: x.sid, livre: !!x.livre, descricao: x.n, unidade: x.un, quantidade: x.q, preco_un: x.pu, horas_un: x.h,
  perfil: x.perfil, perfil_chave: x.perfilId ?? null, custo_un: x.cu ?? null, mao_obra_un: x.mo ?? null,
  materiais: x.mats ? x.mats.map((m) => ({ nome: m.n, quantidade: m.q, unidade: m.un, preco: m.preco ?? null, fornecedor: m.forn ?? null })) : null,
});
const linhaAdendaDeLinha = (l: LinhaAdendaLinha): LinhaAdendaEmylia => ({
  sid: l.chave, n: l.descricao, un: l.unidade, q: l.quantidade, pu: l.preco_un, h: l.horas_un, perfil: l.perfil,
  ...(l.perfil_chave ? { perfilId: l.perfil_chave } : {}), ...(l.custo_un != null ? { cu: l.custo_un } : {}), ...(l.mao_obra_un != null ? { mo: l.mao_obra_un } : {}),
  ...(l.livre ? { livre: true as const } : {}),
  ...(l.materiais ? { mats: l.materiais.map((m) => ({ n: m.nome, q: m.quantidade, un: m.unidade, ...(m.preco != null ? { preco: m.preco } : {}), ...(m.fornecedor ? { forn: m.fornecedor } : {}) })) } : {}),
});
const ESTADO_VERSAO: Record<EstadoAdenda, LinhaAdendaVersao["estado"]> = { rascunho: "rascunho", enviada: "enviado", aceite: "aceite", assinada: "aceite", recusada: "recusado", anulada: "anulado" };

/** Uma adenda da Emylia → as linhas. `k` é o número (o fim da referência "AD 2026/<negócio>-<k>"). */
export function adendaParaLinhas(a: Adenda, k: number, iso: (q: string | null | undefined) => string | null): LinhaAdendaNegocio {
  const T = totaisLinhas(a.linhas, a.desconto);
  const versoes: LinhaAdendaVersao[] = (a.versoes ?? []).map((v) => ({
    versao: v.n, estado: "substituido", desconto: fracao(v.desconto), verificado: true, aprovacao: null, motivos: v.motivos, nota: v.nota ?? null, pedido_cliente: null,
    enviado_em: iso(v.enviada), aceite_em: null, substituido_em: iso(v.substituida), total: r2a(totaisLinhas(v.linhas, v.desconto).base), total_com_iva: r2a(v.total),
    linhas: v.linhas.map(linhaAdendaParaLinha),
  }));
  versoes.push({
    versao: versoes.length + 1, estado: ESTADO_VERSAO[a.estado], desconto: fracao(a.desconto), verificado: !!a.verif,
    aprovacao: a.aprov === "ok" ? "aprovada" : a.aprov === "pedida" ? "pedida" : null, motivos: [], nota: null,
    pedido_cliente: a.pedidoCliente ? { motivos: a.pedidoCliente.motivos, nota: a.pedidoCliente.nota ?? null, em: iso(a.pedidoCliente.q) } : null,
    enviado_em: iso(a.enviada), aceite_em: iso(a.aceite), substituido_em: null, total: r2a(T.base), total_com_iva: r2a(T.total),
    linhas: a.linhas.map(linhaAdendaParaLinha),
  });
  return {
    numero: k, referencia: a.n, estado: a.estado, motivo: a.motivo, criada_em: iso(a.criada), enviada_em: iso(a.enviada), aceite_em: iso(a.aceite),
    assinada_em: a.estado === "assinada" ? iso(a.assinada ?? a.criada) : null, recusada_em: a.estado === "recusada" ? iso(a.recusada ?? a.criada) : null,
    recusa: a.recusa ?? null, vista: !!a.vista, total: r2a(T.base), total_com_iva: r2a(T.total), mao_obra: r2a(T.mo),
    origem: a.origem ? { imprevisto: a.origem.imprevisto, texto: a.origem.texto, onde: a.origem.onde, foto: a.origem.foto ?? null } : null,
    versoes,
    contratos: contratosDoc(a, a.estado === "assinada" ? "assinado" : a.contrato === "enviado" ? "enviado" : null, iso),
    faturas: faturasAdenda(a).map((f) => ({
      chave: `${a.n}#${f.i}`, numero: f.n, emitida_em: iso(f.q), total: f.v, parcela: f.i + 1, rotulo: f.l, pct: f.p,
      recibo: f.recibo ? { numero: f.recibo.n, em: iso(f.recibo.q) } : null,
      aviso: Object.entries(f.pag ?? {}).map(([campo, valor]) => ({ campo, valor: String(valor) })),
    })),
  };
}

/** O inverso: a adenda da Emylia a partir das linhas. */
export function adendaDeLinhas(L: LinhaAdendaNegocio): Adenda {
  const vs = [...L.versoes].sort((a, b) => a.versao - b.versao);
  const cur = vs[vs.length - 1];
  const antigas = vs.slice(0, -1);
  const { cAtual, campos } = docDeContratos(L.contratos);
  return {
    n: L.referencia, estado: L.estado, criada: deIso(L.criada_em),
    ...(L.assinada_em ? { assinada: deIso(L.assinada_em) } : {}), ...(L.recusada_em ? { recusada: deIso(L.recusada_em) } : {}), ...(L.recusa ? { recusa: L.recusa } : {}),
    motivo: L.motivo, linhas: [...(cur?.linhas ?? [])].sort((x, y) => x.ordem - y.ordem).map(linhaAdendaDeLinha),
    ...(cur?.desconto ? { desconto: percent(cur.desconto) } : {}),
    verif: !!cur?.verificado, aprov: cur?.aprovacao === "aprovada" ? "ok" : cur?.aprovacao === "pedida" ? "pedida" : null,
    enviada: cur?.enviado_em ? deIso(cur.enviado_em) : null, aceite: cur?.aceite_em ? deIso(cur.aceite_em) : null,
    ...(cur?.pedido_cliente ? { pedidoCliente: { motivos: cur.pedido_cliente.motivos, ...(cur.pedido_cliente.nota ? { nota: cur.pedido_cliente.nota } : {}), q: deIso(cur.pedido_cliente.em) } } : {}),
    ...(antigas.length ? { versoes: antigas.map((v) => ({
      n: v.versao, enviada: deIso(v.enviado_em), substituida: deIso(v.substituido_em), total: v.total_com_iva ?? 0, motivos: v.motivos,
      ...(v.nota ? { nota: v.nota } : {}), linhas: [...v.linhas].sort((x, y) => x.ordem - y.ordem).map(linhaAdendaDeLinha), ...(v.desconto ? { desconto: percent(v.desconto) } : {}),
    })) } : {}),
    ...(cAtual?.estado === "enviado" ? { contrato: "enviado" as const } : {}),
    ...campos,
    ...(L.origem ? { origem: { imprevisto: L.origem.imprevisto, texto: L.origem.texto, onde: L.origem.onde, ...(L.origem.foto ? { foto: L.origem.foto } : {}) } } : {}),
    ...(L.faturas.length ? { faturas: [...L.faturas].sort((x, y) => x.parcela - y.parcela).map((f): FaturaAdenda => ({
      n: f.numero, q: deIso(f.emitida_em), i: f.parcela - 1, l: f.rotulo, p: f.pct, v: f.total,
      ...(f.recibo ? { recibo: { n: f.recibo.numero, q: deIso(f.recibo.em) } } : {}),
      ...(f.aviso.length ? { pag: Object.fromEntries(f.aviso.map((x) => [x.campo, x.valor])) } : {}),
    })) } : {}),
    ...(L.vista ? { vista: true as const } : {}),
  };
}

/* ------------------------------------------------------------------ Negocio → linhas */
const prodParaLinha = (p: ProdVisita, i: number): LinhaProdutoVisita => ({
  ordem: i, produto: p.id, nome: p.n, unidade: p.un, custo_un: p.custo, pvp_un: p.pvp ?? null, categoria: p.no ?? null, quantidade: p.q,
  cliente_fornece: !!p.cliente, servico: p.svc ?? null, fator: p.fator ?? null, sem_instalacao: !!p.semSvc,
});
function linhaParaLinha(l: LinhaOrc, i: number, prods: readonly ProdVisita[] = []): LinhaOrcamentoLinha {
  if (l.t === "svc") {
    const det = l.det;
    return {
      ordem: i, tipo: "servico", servico: l.sid, descricao: l.sid, unidade: null, quantidade: l.q, preco_un: l.pu, parte_iva: "mao_obra",
      taxa_iva: l.iva ?? null, fornecedor: null, qtd_origem: null, preco_un_origem: null, custo_un_origem: null,
      custo: { custo_un: l.cu, manual: !!l.cuMan, congelado: !!det, horas_un: det?.h ?? 0, mao_obra_un: det?.mo ?? 0, equipamentos_un: det?.eq ?? 0,
        consumiveis_un: det?.cons ?? 0, estrutura_hora: det?.taxaEstr ?? 0, estrutura_un: det?.estr ?? 0, ajuste_un: det?.ajuste ?? 0,
        congelado_em: det ? paraIso(det.q) : null,
        oficios: (det?.oficios ?? []).map((o) => ({ perfil_chave: o.perfil, nome: o.n, horas_un: o.h, custo_hora: o.eh, tecnicos: o.tecnicos ?? null })) },
      zonas: l.zonas ? l.zonas.map((z) => ({ zona: z.z, quantidade: z.q, valor: z.preco ?? null })) : null,
    };
  }
  return {
    ordem: i, tipo: l.livre ? "livre" : l.prod ? "produto" : "materiais_modelo", servico: null, descricao: l.d, unidade: l.livre?.un ?? null,
    produto: l.d.startsWith(PREFIXO_PROD) ? prods.find((p) => !p.cliente && PREFIXO_PROD + textoProduto(p) === l.d)?.id ?? null : null,
    quantidade: 1, preco_un: l.preco, parte_iva: "materiais", taxa_iva: l.iva ?? null, fornecedor: l.prod?.forn ?? null,
    qtd_origem: l.livre?.q ?? l.prod?.q ?? null, preco_un_origem: l.livre?.pu ?? l.prod?.precoUn ?? null, custo_un_origem: l.prod?.custoUn ?? null,
    custo: { custo_un: l.custo, manual: false, congelado: false, horas_un: 0, mao_obra_un: 0, equipamentos_un: 0, consumiveis_un: 0, estrutura_hora: 0,
      estrutura_un: 0, ajuste_un: 0, congelado_em: null, oficios: [] },
    zonas: l.zonas ? l.zonas.map((z) => ({ zona: z.z, quantidade: z.q, valor: z.preco ?? null })) : null,
  };
}
const marcoDe = (p: Prestacao, i: number): LinhaPrestacao["marco"] => (p.fase === "fim" ? "fim" : p.fase === 0 ? (i === 0 ? "adjudicacao" : "antes") : "fase");
const prestacoesDe = (d: Negocio): { L: LinhaPrestacao[]; porFases: boolean } => {
  const P = prestacoes(d.f.pagamento?.trim() || undefined, d.orc?.pagFases);
  return {
    L: P.map((p, i) => ({ ordem: i + 1, rotulo: p.l, pct: p.p, marco: marcoDe(p, i), fase: typeof p.fase === "number" && p.fase > 0 ? p.fase : null })),
    porFases: !!d.orc?.pagFases && P === d.orc.pagFases,
  };
};

/** As linhas de um negócio (sem a obra, as adendas, a demolição e o acesso ao portal). */
export function paraLinhas(d: Negocio, hoje: Date = new Date()): LinhasNegocio {
  const iso = (q: string | null | undefined) => paraIso(q, hoje);
  const o = d.orc;
  const v = d.visita;
  const orcamentos: LinhaOrcamento[] = [];
  if (o) {
    for (const vs of o.versoes ?? []) orcamentos.push({
      versao: vs.n, estado: "substituido", modelo: o.modelo, desconto: vs.desconto ?? 0, venda_direta: o.vendaDireta, inicio_obra: null, equipa: null,
      verificado: false, aprovacao: null, motivos_versao: vs.motivos, nota_versao: vs.nota ?? null, onde_refeita: vs.onde ?? null, pedido_cliente: null, recusa: null,
      enviado_em: iso(vs.enviada), aceite_em: null, substituido_em: iso(vs.substituida), aceite_antes_em: iso(vs.aceite ?? null),
      preco_final: Math.round(vs.total * 100) / 100, total_com_iva: vs.totalIva != null ? Math.round(vs.totalIva * 100) / 100 : null, prestacoes_por_fases: false, sem_demolicao: false,
      linhas: vs.linhas ? vs.linhas.map(linhaParaLinha) : null, zonas: null, prazo: [], prestacoes: [], avisos: [], precos_manuais: null,
      produtos: vs.prod ? vs.prod.map(prodParaLinha) : null, partes_fora: vs.semParte ?? null,
    });
    const pr = prestacoesDe(d);
    orcamentos.push({
      versao: (o.versoes?.length ?? 0) + 1,
      estado: o.recusada ? "recusado" : o.aceite ? "aceite" : o.enviada ? "enviado" : "rascunho",
      modelo: o.modelo, desconto: o.desconto, venda_direta: o.vendaDireta, inicio_obra: o.inicioObra ?? null, equipa: o.equipa ?? null,
      verificado: o.verif, aprovacao: o.aprov === "ok" ? "aprovada" : o.aprov === "pedida" ? "pedida" : null, motivos_versao: [], nota_versao: null, onde_refeita: null,
      pedido_cliente: o.pedidoCliente ? { motivos: o.pedidoCliente.motivos, nota: o.pedidoCliente.nota ?? null, em: iso(o.pedidoCliente.q) } : null,
      recusa: o.recusada ? { motivos: o.recusada.motivos, nota: o.recusada.nota ?? null, em: iso(o.recusada.q) } : null,
      enviado_em: iso(o.enviada), aceite_em: iso(o.aceite), substituido_em: null, aceite_antes_em: null, preco_final: null, total_com_iva: null,
      prestacoes_por_fases: pr.porFases, sem_demolicao: !!o.semDemolicao,
      linhas: o.linhas.map((l, i) => linhaParaLinha(l, i, d.visita.prod ?? [])), zonas: o.zonas ?? null,
      prazo: Object.entries(o.prazo ?? {}).map(([tarefa, dias]) => ({ tarefa, dias })),
      prestacoes: pr.L, avisos: Object.entries(o.avisosVistos ?? {}).filter(([, x]) => x).map(([k]) => k),
      precos_manuais: o.precosMan ? Object.entries(o.precosMan).map(([descricao, preco]) => ({ descricao, preco })) : null,
      produtos: null, partes_fora: null,
    });
  }
  const contratos: LinhaContrato[] = o ? contratosDoc(o, o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "enviado" : null, iso) : [];
  const ordemTranche = (id: string) => (id === "unica" ? 1 : Number(/^t(\d+)$/.exec(id)?.[1] ?? 0));
  const mantem = v.manter ?? {}, compra = v.clienteCompra ?? {};
  const svcs = new Map<string, LinhaServicoVisita>();
  let ordem = 0;
  const svc = (sid: string) => { if (!svcs.has(sid)) svcs.set(sid, { servico: sid, inclusao: "pacote", quantidade: null, mantem: null, cliente_compra: null, ordem: ordem++ }); return svcs.get(sid)!; };
  for (const sid of v.off) svc(sid).inclusao = "fora";
  for (const [sid, q] of Object.entries(v.extra ?? {})) if (q != null) { const x = svc(sid); x.inclusao = "extra"; x.quantidade = q; }
  for (const [sid, r] of Object.entries(mantem)) svc(sid).mantem = r === "sim";
  for (const [sid, t] of Object.entries(compra)) svc(sid).cliente_compra = t;
  return {
    negocio: {
      numero: d.id, titulo: d.nome, telefone: d.tel, fase: d.fase, linha: d.linha, linha_por_definir: !!d.linhaPorDefinir, servico_pedido: d.servico,
      morada_obra: d.local, origem: d.origem, pedido_em: iso(d.quando), dono_papel: d.dono, estado: d.perdido ? "perdido" : "aberto",
      motivo_perda: d.motivoPerda ?? null, anulado_em: d.anulado ? iso(d.anulado.q) : null, anulado_por: d.anulado?.por ?? null,
      anulado_motivo: d.anulado?.motivo ?? null, anulado_origem: d.anulado?.origem ?? null,
      fatura_numero: d.fin.fatura?.n ?? null, fatura_em: iso(d.fin.fatura?.q), fatura_paga: d.fin.pago,
      recibo_numero: d.fin.recibo?.n ?? null, recibo_em: iso(d.fin.recibo?.q),
    },
    respostas: [...new Set([...Object.keys(d.f), ...Object.keys(d.sug ?? {})])].map((k) => ({ campo_chave: k, valor: d.f[k] ?? "", sugerido: !!d.sug?.[k] })),
    visitas: d.vis ?? [],
    medidas: {
      pav: v.med.pav, par: v.med.par, pts: v.med.pts, pcs: v.med.pcs, ptf: v.med.ptf ?? null, ptq: v.med.ptq ?? null, necessidades: v.nec, slot: v.slot,
      fotos_total: v.fotos, fotos_exterior: v.fotosPor?.exterior ?? null, fotos_interior: v.fotosPor?.interior ?? null, fotos_area: v.fotosPor?.area ?? null, fechada: v.fechada,
    },
    servicos: [...svcs.values()],
    produtos: v.prod ? v.prod.map(prodParaLinha) : null,
    partes_fora: v.semParte ?? null,
    orcamentos, contratos,
    faturas: d.fin.tranches ? d.fin.tranches.map((f) => ({
      chave: f.id, numero: f.numero, emitida_em: iso(f.data), total: f.valor, prestacao_ordem: ordemTranche(f.tranche), pdf_caminho: f.pdf ?? null,
      pagamento: f.pagamento ? { validado_em: iso(f.pagamento.data), conta_destino: f.pagamento.conta, referencia: f.pagamento.ref } : null,
      recibo: f.recibo ?? null,
    })) : null,
    historico: d.hist.map((e, i) => ({ ordem: i, texto: e.t, tipo: e.k, ocorrido_em: iso(e.q) })),
    ec: d.obra?.ec ? { emitida_em: iso(d.obra.ec.emitida?.q ?? d.obra.ec.criada), por: d.obra.ec.emitida?.por ?? null } : null,
    adendas: (d.adendas ?? []).map((a, i) => adendaParaLinhas(a, Number(/-(\d+)$/.exec(a.n)?.[1]) || i + 1, iso)),
  };
}

/* ------------------------------------------------------------------ linhas → Negocio */
const linhaParaProd = (p: LinhaProdutoVisita): ProdVisita => ({
  id: p.produto, n: p.nome, un: p.unidade, custo: p.custo_un, q: p.quantidade, no: p.categoria,
  ...(p.cliente_fornece ? { cliente: true } : {}), ...(p.servico ? { svc: p.servico } : {}), ...(p.fator != null ? { fator: p.fator } : {}),
  ...(p.pvp_un != null ? { pvp: p.pvp_un } : {}), ...(p.sem_instalacao ? { semSvc: true } : {}),
} as ProdVisita);
function linhaDeLinha(l: LinhaOrcamentoLinha): LinhaOrc {
  const zonas = l.zonas ? { zonas: l.zonas.map((z) => ({ z: z.zona, q: z.quantidade, ...(z.valor != null ? { preco: z.valor } : {}) })) } : {};
  const iva = l.taxa_iva != null ? { iva: l.taxa_iva as 6 | 23 } : {};
  if (l.tipo === "servico") {
    const c = l.custo;
    return {
      t: "svc", sid: l.servico!, q: l.quantidade, cu: c.custo_un, pu: l.preco_un, ...(c.manual ? { cuMan: true as const } : {}),
      ...(c.congelado ? { det: { h: c.horas_un, oficios: c.oficios.map((o) => ({ perfil: o.perfil_chave, n: o.nome, h: o.horas_un, eh: o.custo_hora, ...(o.tecnicos ? { tecnicos: o.tecnicos } : {}) })),
        mo: c.mao_obra_un, eq: c.equipamentos_un, cons: c.consumiveis_un, taxaEstr: c.estrutura_hora, estr: c.estrutura_un, ajuste: c.ajuste_un, q: deIso(c.congelado_em) } } : {}),
      ...iva, ...zonas,
    };
  }
  return {
    t: "mat", d: l.descricao, custo: l.custo.custo_un, preco: l.preco_un,
    ...(l.tipo === "produto" ? { prod: { ...(l.fornecedor ? { forn: l.fornecedor } : {}), custoUn: l.custo_un_origem ?? 0, precoUn: l.preco_un_origem ?? 0, q: l.qtd_origem ?? 0 } } : {}),
    ...(l.tipo === "livre" ? { livre: { q: l.qtd_origem ?? 0, un: l.unidade ?? "", pu: l.preco_un_origem ?? 0 } } : {}),
    ...iva, ...zonas,
  } as LinhaOrc;
}

/** O Negocio a partir das linhas (o inverso de paraLinhas). */
export function deLinhas(L: LinhasNegocio): Negocio {
  const n = L.negocio;
  const atual = [...L.orcamentos].sort((a, b) => b.versao - a.versao).find((o) => o.estado !== "substituido");
  const antigas = L.orcamentos.filter((o) => o.estado === "substituido").sort((a, b) => a.versao - b.versao);
  const { cAtual, campos: contratoCampos } = docDeContratos(L.contratos);
  const f: Record<string, string> = {}, sug: Record<string, true> = {};
  for (const r of L.respostas) { f[r.campo_chave] = r.valor; if (r.sugerido) sug[r.campo_chave] = true; }
  let orc: Orcamento | null = null;
  if (atual) {
    orc = {
      modelo: atual.modelo, linhas: (atual.linhas ?? []).sort((x, y) => x.ordem - y.ordem).map(linhaDeLinha), desconto: atual.desconto,
      vendaDireta: atual.venda_direta, verif: atual.verificado, aprov: atual.aprovacao === "aprovada" ? "ok" : atual.aprovacao === "pedida" ? "pedida" : null,
      enviada: atual.enviado_em ? deIso(atual.enviado_em) : null, aceite: atual.aceite_em ? deIso(atual.aceite_em) : null,
      contrato: cAtual?.estado === "assinado" ? "assinado" : cAtual?.estado === "enviado" ? "enviado" : null,
      ...(contratoCampos.assinatura ? { assinatura: contratoCampos.assinatura } : {}),
      avisosVistos: Object.fromEntries(atual.avisos.map((k) => [k, true])),
      ...(atual.precos_manuais ? { precosMan: Object.fromEntries(atual.precos_manuais.map((p) => [p.descricao, p.preco])) } : {}),
      ...(atual.sem_demolicao ? { semDemolicao: true as const } : {}),
      ...(atual.zonas ? { zonas: atual.zonas } : {}),
      ...(atual.prazo.length ? { prazo: Object.fromEntries(atual.prazo.map((p) => [p.tarefa, p.dias])) } : {}),
      ...(atual.inicio_obra ? { inicioObra: atual.inicio_obra } : {}),
      ...(atual.prestacoes_por_fases ? { pagFases: atual.prestacoes.sort((x, y) => x.ordem - y.ordem).map((p) => ({ l: p.rotulo, p: p.pct, fase: (p.marco === "fim" ? "fim" : p.marco === "fase" ? p.fase : 0) as Prestacao["fase"] })) } : {}),
      ...(atual.equipa != null ? { equipa: atual.equipa } : {}),
      ...(antigas.length ? { versoes: antigas.map((v): VersaoProposta => ({
        n: v.versao, enviada: deIso(v.enviado_em), ...(v.aceite_antes_em ? { aceite: deIso(v.aceite_antes_em) } : {}), substituida: deIso(v.substituido_em),
        total: v.preco_final ?? 0, ...(v.total_com_iva != null ? { totalIva: v.total_com_iva } : {}), motivos: v.motivos_versao, ...(v.nota_versao ? { nota: v.nota_versao } : {}),
        onde: v.onde_refeita ?? "orcamento",
        ...(v.produtos?.length ? { prod: v.produtos.sort((x, y) => x.ordem - y.ordem).map(linhaParaProd) } : {}), ...(v.partes_fora?.length ? { semParte: v.partes_fora } : {}),
        ...(v.linhas ? { linhas: v.linhas.sort((x, y) => x.ordem - y.ordem).map(linhaDeLinha) } : {}), desconto: v.desconto,
      })) } : {}),
      ...(atual.pedido_cliente ? { pedidoCliente: { motivos: atual.pedido_cliente.motivos, ...(atual.pedido_cliente.nota ? { nota: atual.pedido_cliente.nota } : {}), q: deIso(atual.pedido_cliente.em) } } : {}),
      ...(atual.recusa ? { recusada: { motivos: atual.recusa.motivos, ...(atual.recusa.nota ? { nota: atual.recusa.nota } : {}), q: deIso(atual.recusa.em) } } : {}),
      ...(contratoCampos.contratoPedido ? { contratoPedido: contratoCampos.contratoPedido } : {}),
      ...(contratoCampos.contratoVersoes ? { contratoVersoes: contratoCampos.contratoVersoes } : {}),
      ...(contratoCampos.clausulas ? { clausulas: contratoCampos.clausulas } : {}),
      ...(contratoCampos.contratoRevisto ? { contratoRevisto: contratoCampos.contratoRevisto } : {}),
    };
  }
  const m = L.medidas;
  const off: string[] = [], extra: Record<string, number> = {}, manter: Record<string, "sim" | "nao"> = {}, clienteCompra: Record<string, string> = {};
  for (const s of [...L.servicos].sort((x, y) => x.ordem - y.ordem)) {
    if (s.inclusao === "fora") off.push(s.servico);
    if (s.inclusao === "extra" && s.quantidade != null) extra[s.servico] = s.quantidade;
    if (s.mantem != null) manter[s.servico] = s.mantem ? "sim" : "nao";
    if (s.cliente_compra != null) clienteCompra[s.servico] = s.cliente_compra;
  }
  const fotosPor = m.fotos_exterior != null || m.fotos_interior != null || m.fotos_area != null
    ? { fotosPor: { ...(m.fotos_exterior != null ? { exterior: m.fotos_exterior } : {}), ...(m.fotos_interior != null ? { interior: m.fotos_interior } : {}), ...(m.fotos_area != null ? { area: m.fotos_area } : {}) } } : {};
  return {
    id: n.numero, nome: n.titulo, tel: n.telefone, linha: n.linha as Negocio["linha"], ...(n.linha_por_definir ? { linhaPorDefinir: true } : {}),
    servico: n.servico_pedido, local: n.morada_obra, origem: n.origem, quando: deIso(n.pedido_em), dono: n.dono_papel, fase: n.fase, perdido: n.estado === "perdido",
    ...(n.motivo_perda ? { motivoPerda: n.motivo_perda } : {}),
    ...(n.anulado_em ? { anulado: { q: deIso(n.anulado_em), por: n.anulado_por ?? "", motivo: n.anulado_motivo ?? "", origem: (n.anulado_origem ?? "negocio") as "negocio" | "inventario" } } : {}),
    f, ...(Object.keys(sug).length ? { sug } : {}), ...(L.visitas.length ? { vis: L.visitas } : {}),
    visita: {
      slot: m.slot, nec: m.necessidades, med: { pav: m.pav, par: m.par, pts: m.pts, pcs: m.pcs, ...(m.ptf != null ? { ptf: m.ptf } : {}), ...(m.ptq != null ? { ptq: m.ptq } : {}) },
      off, extra, fotos: m.fotos_total, fechada: m.fechada, ...fotosPor,
      ...(L.produtos ? { prod: L.produtos.sort((x, y) => x.ordem - y.ordem).map(linhaParaProd) } : {}),
      ...(Object.keys(manter).length ? { manter } : {}), ...(Object.keys(clienteCompra).length ? { clienteCompra } : {}),
      ...(L.partes_fora ? { semParte: L.partes_fora } : {}),
    },
    orc,
    fin: {
      fatura: n.fatura_numero ? { n: n.fatura_numero, q: deIso(n.fatura_em) } : null, pago: n.fatura_paga,
      recibo: n.recibo_numero ? { n: n.recibo_numero, q: deIso(n.recibo_em) } : null,
      ...(L.faturas ? { tranches: L.faturas.map((x): FaturaReg => ({
        id: x.chave, numero: x.numero, data: deIsoDia(x.emitida_em), valor: x.total, tranche: (atual?.prestacoes.length ?? 0) === 1 ? "unica" : `t${x.prestacao_ordem}`,
        ...(x.pdf_caminho ? { pdf: x.pdf_caminho } : {}),
        ...(x.pagamento ? { pagamento: { data: deIsoDia(x.pagamento.validado_em), conta: x.pagamento.conta_destino, ref: x.pagamento.referencia } } : {}),
        ...(x.recibo ? { recibo: x.recibo } : {}),
      })) } : {}),
    },
    obra: { plano: null, mats: null, real: null, aprendido: false },
    hist: [...L.historico].sort((a, b) => a.ordem - b.ordem).map((e): Evento => ({ t: e.texto, q: deIso(e.ocorrido_em), k: e.tipo as Evento["k"] })),
    ...(L.adendas?.length ? { adendas: [...L.adendas].sort((x, y) => x.numero - y.numero).map(adendaDeLinhas) } : {}),
  };
}
