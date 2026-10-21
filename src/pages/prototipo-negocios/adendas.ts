// Trabalhos a mais depois do contrato assinado (14/10/2026): a adenda ao contrato. Sem React.
// O comercial escolhe os serviços e as quantidades; a adenda vai ao cliente para assinar; assinada, as tarefas entram no
// plano da obra (no fim da fase de cada serviço, ou no fim da obra) e o plano volta a aprovação das Operações, se já estava
// aprovado. Fatura-se à parte.
// 21/10 (o mesmo percurso do orçamento): rascunho → verificação das margens (e a aprovação da Direção, com as mesmas regras do
// orçamento) → proposta enviada → aceite / pedido de alterações (nova versão com o MESMO número, "substitui a versão N") / recusada →
// o contrato da adenda, gerado pelo comercial (com a revisão das cláusulas pelo Jurídico, se o cliente pedir) → assinada (CMD/SMS) →
// faturas por parcela (as mesmas parcelas do contrato) → pagamento validado. A 1.ª parcela paga emite a encomenda dos materiais.
// IVA: a mão de obra (os serviços) a 6% e os materiais (os escolhidos nas linhas livres) a 23%, como no orçamento.
import { TECS, alertas, bloqueado, custoUnLinha, diaDeFerias, garantirServico, servicoDoCatalogo, r2, tot, totaisIva, IVA_MAT, IVA_MO,
  type Alerta, type Assinatura, type Estado, type LinhaOrc, type MatTarefa, type Negocio, type Orcamento, type Plano, type Tarefa } from "./motor";
import { diasDeHoras } from "./ganttOrcamento";
import { fasesPadrao, type FaseObra } from "./fasesObra";
import { skDaTarefa } from "./preparacaoObra";
import { prestacoes } from "./planoObra";

export interface LinhaAdenda { sid: string; n: string; un: string; q: number; pu: number; h: number; perfil: string;
  /** 21/10: uma linha livre (de um imprevisto): o trabalho descrito à mão, com as horas e os materiais escolhidos */
  livre?: true; mats?: MatTarefa[] }
/** 21/10: rascunho (por verificar e enviar) → enviada (a proposta no portal) → aceite (o contrato da adenda) → assinada;
 *  "recusada" pelo cliente no portal (com o porquê) ou "anulada" pelo comercial antes da assinatura; o número não se reutiliza. */
export type EstadoAdenda = "rascunho" | "enviada" | "aceite" | "assinada" | "recusada" | "anulada";
/** 21/10: uma proposta da adenda enviada e substituída a pedido do cliente (a atual é versoes.length + 1). */
export interface VersaoAdenda { n: number; enviada: string; substituida: string; /** com IVA */ total: number; motivos: string[]; nota?: string; linhas: LinhaAdenda[]; desconto?: number }
/** 21/10 (decisão C): a fatura de uma parcela da adenda (as mesmas parcelas do contrato), com o valor congelado ao emitir, o pagamento no portal e o recibo. */
export interface FaturaAdenda { n: string; q: string; /** a parcela (o índice nas prestações do contrato) */ i: number; l: string; p: number; v: number;
  recibo?: { n: string; q: string }; pag?: Record<string, string> }
export interface Adenda {
  n: string; estado: EstadoAdenda; criada: string; assinada?: string;
  recusada?: string; recusa?: string;
  motivo: string; linhas: LinhaAdenda[];
  /** 21/10: o desconto (%) nas linhas, como no orçamento (reparte-se pela mão de obra e pelos materiais) */
  desconto?: number;
  /** 21/10: a verificação das margens antes de enviar e a aprovação da Direção (as regras do orçamento: motor.alertas) */
  verif?: boolean; aprov?: null | "pedida" | "ok";
  /** 21/10: a proposta enviada ao portal e aceite pelo cliente (null: ainda não). As antigas não têm (migrarAdenda). */
  enviada?: string | null; aceite?: string | null;
  /** 21/10: o cliente pediu alterações no portal; limpa-se quando o comercial faz a nova versão */
  pedidoCliente?: { motivos: string[]; nota?: string; q: string } | null;
  versoes?: VersaoAdenda[];
  /** 21/10: o contrato da adenda gerado e enviado pelo comercial (assinado = estado "assinada") e a revisão das cláusulas, como no contrato */
  contrato?: null | "enviado";
  contratoPedido?: Orcamento["contratoPedido"]; contratoVersoes?: Orcamento["contratoVersoes"]; clausulas?: Orcamento["clausulas"]; contratoRevisto?: Orcamento["contratoRevisto"];
  /** 15/10: a assinatura do cliente no portal (Chave Móvel Digital ou código por SMS; o desenho só nas antigas), como no contrato. */
  assinatura?: Assinatura;
  /** 21/10: nasceu de um imprevisto na obra (imprevistos.ts): o que o técnico encontrou, onde e a fotografia */
  origem?: { imprevisto: string; texto: string; onde: string; foto?: string };
  /** 21/10: as faturas, uma por parcela (o Financeiro emite-as depois da assinatura) */
  faturas?: FaturaAdenda[];
  /** antes das parcelas: uma só fatura (100%), o recibo e o pagamento no portal (migrarAdenda passa-os para `faturas`) */
  fatura?: { n: string; q: string }; recibo?: { n: string; q: string }; pag?: Record<string, string>;
  /** 21/10: o comercial já viu a recusa (sai do Hoje dele) */
  vista?: true;
}
export const MOTIVOS_ADENDA = ["O cliente pediu", "Surpresa em obra", "Erro de medição"] as const;
/** 21/10: o motivo das adendas que nascem de um imprevisto registado na obra. */
export const MOTIVO_IMPREVISTO = "Imprevisto na obra";
/** 21/10: porque o cliente não aceita a adenda, nas palavras dele (no portal). */
export const MOTIVOS_RECUSA_ADENDA = ["O preço", "Não preciso destes trabalhos", "O prazo", "Quero falar primeiro"];

/** Uma linha da adenda: o serviço (do Catálogo, entra em uso se ainda não estava), a quantidade, o preço e as horas por unidade. */
export function linhaAdenda(S: Estado, sid: string, q: number): LinhaAdenda | null {
  const s = garantirServico(S, sid);
  if (!s) return null;
  return { sid, n: s.n, un: s.un, q, pu: r2(s.preco), h: s.h, perfil: s.perfil };
}
/** A mesma linha sem mexer no estado (a pré-visualização ao criar): o preço e as horas que o cliente vai receber. */
export function previsaoLinha(S: Estado, sid: string, q: number): LinhaAdenda | null {
  const s = S.svc[sid] ?? servicoDoCatalogo(sid);
  return s ? { sid, n: s.n, un: s.un, q, pu: r2(s.preco), h: s.h, perfil: s.perfil } : null;
}
export const assinadas = (d: Negocio) => (d.adendas ?? []).filter((a) => a.estado === "assinada");
/** A versão da proposta da adenda em cima da mesa (1 se nunca se refez). */
export const versaoAdenda = (a: Adenda) => (a.versoes?.length ?? 0) + 1;
/** Ainda por responder (antes da assinatura): conta para encerrar a obra e para o portal. */
export const emCurso = (a: Adenda) => a.estado === "rascunho" || a.estado === "enviada" || a.estado === "aceite";

/* ------------------------------------------------------------------ as contas (IVA por taxa) */
export type TotaisIva = ReturnType<typeof totaisIva>;
/** Os materiais das linhas livres (os escolhidos à mão), com o preço ao cliente. */
const matsLivres = (L: LinhaAdenda[]) => L.flatMap((x) => (x.livre ? x.mats ?? [] : []));
/** 21/10: os totais da adenda com o IVA por taxa (o mesmo formato do orçamento, para o QuadroIva): a mão de obra (os serviços) a 6%
 *  e os materiais das linhas livres a 23%, depois do desconto. */
export function totaisLinhas(L: LinhaAdenda[], desconto = 0): TotaisIva {
  const k = 1 - (desconto || 0) / 100;
  const mo = L.reduce((a, x) => a + x.q * x.pu, 0) * k, mat = matsLivres(L).reduce((a, m) => a + (m.preco ?? 0) * m.q, 0) * k;
  const ivaMo = mo * IVA_MO, ivaMat = mat * IVA_MAT;
  return { mo, mat, ivaMo, ivaMat, base: mo + mat, iva: ivaMo + ivaMat, total: mo + mat + ivaMo + ivaMat };
}
export const totaisAdenda = (a: Pick<Adenda, "linhas" | "desconto">) => totaisLinhas(a.linhas, a.desconto);
/** Sem IVA (mão de obra e materiais). */
export const totalAdenda = (L: LinhaAdenda[], desconto = 0) => r2(totaisLinhas(L, desconto).base);
/** Com IVA (6% na mão de obra, 23% nos materiais). */
export const totalComIva = (L: LinhaAdenda[], desconto = 0) => r2(totaisLinhas(L, desconto).total);
/** O valor do contrato com IVA: o do contrato assinado, o das adendas assinadas e o total que o cliente paga. */
export function valorContrato(d: Negocio, S: Estado) {
  const contrato = r2(totaisIva(d, S).total), adendas = r2(assinadas(d).reduce((a, x) => a + totaisAdenda(x).total, 0));
  return { contrato, adendas, total: r2(contrato + adendas) };
}
/** Os dias úteis a mais (cada serviço em sequência, como no plano). */
export const diasAdenda = (L: LinhaAdenda[]) => L.reduce((a, x) => a + Math.max(1, Math.ceil(diasDeHoras(x.h * x.q) - 1e-9)), 0);

/** 21/10: os materiais da adenda, para a proposta: os das linhas livres (com o preço, a 23%) e os da receita de cada serviço (já no preço dele). */
export function materiaisAdenda(a: Adenda, receita: (sid: string, q: number) => MatTarefa[]): { n: string; q: number; un: string; preco?: number; incluido: boolean }[] {
  return a.linhas.flatMap((x): { n: string; q: number; un: string; preco?: number; incluido: boolean }[] => x.livre
    ? (x.mats ?? []).map((m) => ({ n: m.n, q: m.q, un: m.un, preco: m.preco, incluido: false }))
    : receita(x.sid, x.q).map((m) => ({ n: m.n, q: m.q, un: m.un, incluido: true })));
}

/* ------------------------------------------------------------------ a verificação (as regras do orçamento) */
/** A adenda como um orçamento (para as mesmas regras de margem de motor.alertas): uma linha de serviço por linha (o custo do Catálogo;
 *  nas livres, só a mão de obra) e os materiais das livres como linhas de materiais (ao preço). */
function comoOrcamento(d: Negocio, S: Estado, a: Adenda): Negocio {
  const linhas: LinhaOrc[] = [];
  for (const x of a.linhas) {
    const s = S.svc[x.sid];
    const cu = s ? custoUnLinha(x.livre ? { ...s, cons: 0 } : s, S) : 0;
    linhas.push({ t: "svc", sid: x.sid, q: x.q, cu, pu: x.pu });
  }
  for (const m of matsLivres(a.linhas)) { const v = r2((m.preco ?? 0) * m.q); linhas.push({ t: "mat", d: "Materiais · " + m.n, custo: v, preco: v }); }
  const orc: Orcamento = { modelo: "Adenda " + a.n, linhas, desconto: a.desconto || 0, vendaDireta: false, verif: !!a.verif, aprov: a.aprov ?? null, enviada: null, aceite: null, contrato: null, avisosVistos: {} };
  return { ...d, orc };
}
/** 21/10 (decisão D): os bloqueios e avisos da adenda, com as regras do orçamento (margem mínima, abaixo do custo, desconto). */
export function alertasAdenda(d: Negocio, S: Estado, a: Adenda): Alerta[] {
  const x = comoOrcamento(d, S, a);
  return a.linhas.some((l) => S.svc[l.sid]) ? alertas(x, S) : [];
}
/** A margem total da adenda (como a do orçamento: depois do desconto). */
export const margemAdenda = (d: Negocio, S: Estado, a: Adenda) => tot(comoOrcamento(d, S, a), S).m;
/** Não se envia: há bloqueios e a Direção ainda não aprovou (ou não se aprovam: abaixo do custo). */
export function adendaBloqueada(d: Negocio, S: Estado, a: Adenda): boolean {
  if (!a.linhas.some((l) => S.svc[l.sid])) return false;
  return bloqueado(comoOrcamento(d, S, a), S);
}
/** O preço sugerido de uma linha livre: as horas ao custo/hora da estrutura, com a margem alvo. */
export const precoSugeridoLivre = (S: Estado, h: number) => r2(custoUnLinha({ n: "", un: "vg", h, eh: 25, eq: 0, cons: 0, preco: 0, perfil: "" }, S) / (1 - S.cfg.alvo / 100));

/* ------------------------------------------------------------------ as parcelas e as faturas (decisão C) */
/** As faturas da adenda (as antigas, de antes das parcelas: uma só, de 100%). */
export function faturasAdenda(a: Adenda): FaturaAdenda[] {
  if (a.faturas) return a.faturas;
  return a.fatura ? [{ n: a.fatura.n, q: a.fatura.q, i: 0, l: "Única", p: 1, v: r2(totaisAdenda(a).total), ...(a.recibo ? { recibo: a.recibo } : {}), ...(a.pag ? { pag: a.pag } : {}) }] : [];
}
export interface ParcelaAdenda { i: number; l: string; p: number; v: number; ft?: FaturaAdenda }
/** As parcelas da adenda: as mesmas prestações do contrato (d.f.pagamento / pagFases; por omissão 50% + 50% no fim), sobre o total
 *  com IVA da adenda; a última leva o resto (os cêntimos batem certo). Com as faturas a cobrir tudo, valem as faturas. */
export function parcelasAdenda(d: Negocio, a: Adenda): ParcelaAdenda[] {
  const F = faturasAdenda(a), total = r2(totaisAdenda(a).total);
  if (F.length && F.reduce((s, f) => s + f.p, 0) >= 1 - 1e-9) return F.map((f) => ({ i: f.i, l: f.l, p: f.p, v: f.v, ft: f }));
  const pr = prestacoes(d.f.pagamento, d.orc?.pagFases);
  let acum = 0;
  return pr.map((t, i) => {
    const v = i === pr.length - 1 ? r2(total - acum) : r2(total * t.p);
    acum = r2(acum + v);
    return { i, l: t.l, p: t.p, v, ft: F.find((f) => f.i === i) };
  });
}
/** A parcela seguinte a faturar (pela ordem: a 2.ª só depois da 1.ª), ou undefined. */
export const proximaParcela = (d: Negocio, a: Adenda) => parcelasAdenda(d, a).find((x) => !x.ft);
/** A 1.ª parcela paga (com o recibo): dispara a encomenda dos materiais e deixa a obra arrancar. */
export const primeiraPaga = (a: Adenda) => !!faturasAdenda(a).find((f) => f.i === 0)?.recibo;
/** O nome curto da parcela ("1.ª parcela"). */
export const nomeParcela = (i: number) => `${i + 1}.ª parcela`;
/** As adendas assinadas sem nenhuma fatura (a 1.ª parcela por faturar), para o Hoje do Financeiro. */
export const porFaturar = (d: Negocio) => assinadas(d).filter((a) => !faturasAdenda(a).length);
/** As faturas das adendas por pagar e, delas, as que o cliente já disse que pagou (para validar). */
export const porPagar = (d: Negocio) => assinadas(d).flatMap((a) => faturasAdenda(a).filter((f) => !f.recibo).map((f) => ({ a, f })));
export const pagamentoPorValidar = (d: Negocio) => porPagar(d).filter(({ f }) => !!f.pag?.comprovativo);

/* ------------------------------------------------------------------ o que o cliente vê e o comercial */
/** A proposta como foi enviada: com a nova versão em preparação, a última enviada (o cliente ainda não vê a nova). */
export function adendaComoEnviada(a: Adenda): Adenda {
  const v = a.estado === "rascunho" ? a.versoes?.at(-1) : undefined;
  return v ? { ...a, linhas: v.linhas, desconto: v.desconto, enviada: v.enviada, versoes: a.versoes!.slice(0, -1) } : a;
}
/** O estado da adenda em palavras (o comercial, no negócio). */
export function estadoAdenda(a: Adenda): { t: string; cor: string } {
  if (a.estado === "rascunho") return a.aprov === "pedida" ? { t: "à espera da Direção", cor: "bg-warning/15" } : { t: a.versoes?.length ? `versão ${versaoAdenda(a)} por enviar` : "por enviar", cor: "bg-muted" };
  if (a.estado === "enviada") return a.pedidoCliente ? { t: "o cliente pediu alterações", cor: "bg-warning/15" } : { t: "enviada · à espera do cliente", cor: "bg-warning/15" };
  if (a.estado === "aceite") return a.contratoPedido ? { t: "aceite · contrato no Jurídico", cor: "bg-warning/15" } : a.contrato === "enviado" ? { t: "contrato enviado · por assinar", cor: "bg-warning/15" } : { t: "aceite · contrato por gerar", cor: "bg-primary/10" };
  if (a.estado === "assinada") return { t: "assinada", cor: "bg-success/15" };
  if (a.estado === "recusada") return { t: "o cliente não aceitou", cor: "bg-destructive/10" };
  return { t: "retirada", cor: "bg-muted text-muted-foreground" };
}

/* ------------------------------------------------------------------ as adendas guardadas antes do percurso novo */
/** 21/10: uma adenda de antes (enviada sem a proposta) fica aceite com o contrato enviado (pode-se assinar como antes); a fatura única
 *  passa a ser a da parcela única (100%). Devolve se mudou alguma coisa. */
export function migrarAdenda(a: Adenda): boolean {
  let mudou = false;
  if (a.enviada === undefined) {
    a.enviada = a.criada; a.verif = true; mudou = true;
    if (a.estado === "enviada") { a.estado = "aceite"; a.aceite = a.criada; a.contrato = "enviado"; }
  }
  if (!a.faturas && a.fatura) {
    a.faturas = faturasAdenda(a);
    delete a.fatura; delete a.recibo; delete a.pag;
    mudou = true;
  }
  return mudou;
}
export function migrarAdendas(S: Estado): boolean {
  let mudou = false;
  for (const d of S.deals) for (const a of d.adendas ?? []) if (migrarAdenda(a)) mudou = true;
  return mudou;
}

/* ------------------------------------------------------------------ o plano */
/** As tarefas da adenda no plano: cada uma no fim da sua fase (as tarefas seguintes empurram-se), com um técnico do ofício livre. */
export function juntarAoPlano(p: Plano, a: Adenda): Tarefa[] {
  const novas: Tarefa[] = [];
  for (const x of a.linhas) {
    const fase: FaseObra = fasesPadrao(x.n, x.perfil)[0];
    const dur = Math.max(1, Math.ceil(diasDeHoras(x.h * x.q) - 1e-9));
    // começa quando acaba a última tarefa desta fase (ou das anteriores); as das fases seguintes andam `dur` dias
    const ate = p.tasks.filter((t) => (t.fase ?? 4) <= fase);
    // 21/10: com a obra em curso, nunca num dia que já passou
    const dia = Math.max(ate.length ? Math.max(...ate.map((t) => t.dia + t.dur)) : 0, p.estado === "em curso" ? p.dia : 0);
    for (const t of p.tasks) if (t.dia >= dia && (t.fase ?? 4) > fase) t.dia += dur;
    const sk = skDaTarefa(x.perfil, x.n);
    const doOficio = TECS.filter((t) => t.sk === sk);
    const tec = doOficio.find((t) => diaDeFerias(t, p, dia, dur) == null) ?? doOficio[0];
    const t: Tarefa = { nome: `${x.n} (adenda ${a.n})`, svcs: [x.sid], dia, dur, sk, h: r2(x.h * x.q), tec: tec?.id ?? null, fase };
    p.tasks.push(t); novas.push(t);
  }
  p.tasks.sort((a1, b1) => a1.dia - b1.dia || (a1.fase ?? 0) - (b1.fase ?? 0));
  return novas;
}
/** 21/10: o que a adenda faz ao plano, sem mexer nele (a proposta mostra-o): as tarefas novas com o dia e o fim da obra antes e depois. */
export function impactoNoPlano(p: Plano | null | undefined, a: Adenda): { novas: Tarefa[]; fimAntes: number; fimDepois: number; plano: Plano } | null {
  if (!p || !p.tasks.length) return null;
  const c: Plano = structuredClone(p);
  const fimAntes = Math.max(...c.tasks.map((t) => t.dia + t.dur));
  const novas = juntarAoPlano(c, a);
  return { novas, fimAntes, fimDepois: Math.max(...c.tasks.map((t) => t.dia + t.dur)), plano: c };
}
