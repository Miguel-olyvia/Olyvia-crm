// Trabalhos a mais depois do contrato assinado (14/10/2026): a adenda ao contrato. Sem React.
// O comercial escolhe os serviços e as quantidades; a adenda vai ao cliente para assinar; assinada, as tarefas entram no
// plano da obra (no fim da fase de cada serviço, ou no fim da obra) e o plano volta a aprovação das Operações, se já estava
// aprovado. Fatura-se à parte (só mão de obra e consumíveis dos serviços: IVA a 6%).
import { TECS, diaDeFerias, garantirServico, servicoDoCatalogo, totaisIva, r2, IVA_MO, type Assinatura, type Estado, type MatTarefa, type Negocio, type Plano, type Tarefa } from "./motor";
import { diasDeHoras } from "./ganttOrcamento";
import { fasesPadrao, type FaseObra } from "./fasesObra";
import { skDaTarefa } from "./preparacaoObra";

export interface LinhaAdenda { sid: string; n: string; un: string; q: number; pu: number; h: number; perfil: string;
  /** 21/10: uma linha livre (de um imprevisto): o trabalho descrito à mão, com as horas e os materiais escolhidos */
  livre?: true; mats?: MatTarefa[] }
export interface Adenda {
  /** 21/10: "recusada" pelo cliente no portal (com o porquê) ou "anulada" pelo comercial antes da assinatura; o número não se reutiliza. */
  n: string; estado: "enviada" | "assinada" | "recusada" | "anulada"; criada: string; assinada?: string;
  recusada?: string; recusa?: string;
  motivo: string; linhas: LinhaAdenda[];
  /** 15/10: a assinatura do cliente no portal (Chave Móvel Digital ou código por SMS; o desenho só nas antigas), como no contrato. */
  assinatura?: Assinatura;
  /** 21/10: nasceu de um imprevisto na obra (imprevistos.ts): o que o técnico encontrou, onde e a fotografia */
  origem?: { imprevisto: string; texto: string; onde: string; foto?: string };
  /** 21/10: a fatura própria da adenda (o Financeiro emite-a depois da assinatura) e o recibo, com o pagamento validado */
  fatura?: { n: string; q: string }; recibo?: { n: string; q: string };
  /** 21/10: o pagamento no portal: o método escolhido, o comprovativo e, no débito direto, o IBAN (últimos 4) e o titular */
  pag?: Record<string, string>;
}
/** 21/10: as adendas assinadas por faturar e as faturadas com o pagamento por validar (para o Financeiro). */
export const porFaturar = (d: Negocio) => assinadas(d).filter((a) => !a.fatura);
export const pagamentoPorValidar = (d: Negocio) => assinadas(d).filter((a) => a.fatura && !a.recibo && !!a.pag?.comprovativo);
export const porPagar = (d: Negocio) => assinadas(d).filter((a) => a.fatura && !a.recibo);
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
/** O valor do contrato com IVA: o do contrato assinado, o das adendas assinadas e o total que o cliente paga. */
export function valorContrato(d: Negocio, S: Estado) {
  const contrato = r2(totaisIva(d, S).total), adendas = r2(assinadas(d).reduce((a, x) => a + totalComIva(x.linhas), 0));
  return { contrato, adendas, total: r2(contrato + adendas) };
}
export const totalAdenda = (L: LinhaAdenda[]) => r2(L.reduce((a, x) => a + x.q * x.pu, 0));
export const totalComIva = (L: LinhaAdenda[]) => r2(totalAdenda(L) * (1 + IVA_MO));
/** Os dias úteis a mais (cada serviço em sequência, como no plano). */
export const diasAdenda = (L: LinhaAdenda[]) => L.reduce((a, x) => a + Math.max(1, Math.ceil(diasDeHoras(x.h * x.q) - 1e-9)), 0);

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
