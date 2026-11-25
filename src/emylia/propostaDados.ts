// Os dados da proposta e do contrato do negócio, sem React (19/11/2026). Antes viviam dentro dos componentes de DocsCliente.tsx
// (PropostaDoc, ObraNaProposta, AdendasDoContrato); saíram para aqui para o documento do template no portal do cliente
// (src/components/portal/obra) e, numa segunda fase, o PDF, usarem as mesmas regras sem copiar as folhas A4 da Emylia.
// Só regras e valores: o texto (português) fica nos componentes que mostram.
import { LINHAS, calcMats, linhaCalc, totaisIva, type Estado, type Negocio } from "./motor";
import type { FaseObra } from "./fasesObra";
import { LINHA_DEMOLICAO } from "./entulho";
import { ESCOLHAS } from "./campos";
import { assinadas, diasAdenda, totaisAdenda, valorContrato, type Adenda } from "./adendas";
import { porFase, quantidade, escolhasVisiveis, fornecidosPeloCliente, type FaseProposta, type Fornecido } from "./propostaConteudo";
import { dataCurta, deIso, diaDaPrestacao, diasDaObra, faseDosMateriais, iniciosRapidos, planoObra, prestacoes, valoresPrestacoes, type Prestacao } from "./planoObra";

/** "05/10" → 5 de outubro de 2026; "hoje…" ou vazio → hoje. */
export function dataDe(q: string | null | undefined): Date {
  const m = q?.match(/^(\d{1,2})\/(\d{1,2})/);
  return m ? new Date(2026, Number(m[2]) - 1, Number(m[1])) : new Date();
}

/** O dia em que a proposta foi emitida e até quando é válida (a validade da proposta, em dias; 30 por omissão). */
export function validadeDaProposta(d: Negocio): { emitida: Date; ate: Date } {
  const emitida = dataDe(d.orc?.enviada);
  const dv = Number((d.f.validade || "30 dias").match(/\d+/)?.[0] ?? 30);
  const ate = new Date(emitida); ate.setDate(ate.getDate() + dv);
  return { emitida, ate };
}

/** O primeiro dia da obra: o início marcado no orçamento, ou a próxima segunda-feira. */
export const inicioDaObra = (d: Negocio): Date => (d.orc?.inicioObra ? deIso(d.orc.inicioObra) : iniciosRapidos(new Date())[0].data);

/** Os dias úteis da obra pelo plano (pelo menos 1). */
export const diasDoPlano = (d: Negocio, S: Estado): number => Math.max(1, Math.ceil(planoObra(d, S).dias - 1e-9));

/** O prazo que se promete ao cliente: o da proposta (o comercial pode dar folga); sem ele, o do plano. */
export const prazoDaProposta = (d: Negocio, S: Estado): number => Number(d.f.prazo_exec) || diasDoPlano(d, S);

/** A fase de cada serviço do orçamento, pela primeira tarefa do plano que o faz (26/10: um «MO Modelo», pela 1.ª parte). */
export function fasesDosServicos(d: Negocio, S: Estado): Map<string, FaseObra> {
  const faseDe = new Map<string, FaseObra>();
  for (const t of planoObra(d, S).tarefas) if (!faseDe.has(t.svc ?? t.chave)) faseDe.set(t.svc ?? t.chave, t.fase);
  return faseDe;
}

/** "O que vamos fazer": as linhas do orçamento por fase da obra, em grupos curtos (os serviços pela fase da tarefa; os materiais pela
 *  descrição; a demolição na 1). */
export function conteudoPorFase(d: Negocio, S: Estado, faseDe = fasesDosServicos(d, S)): FaseProposta[] {
  // 25/11: os serviços do modelo que ficaram a zero não são do contrato (não aparecem «Canalização · 0 pontos»)
  return porFase((d.orc?.linhas ?? []).filter((l) => l.t !== "svc" || Number(l.q) > 0).map((l) => {
    if (l.t === "svc") { const x = linhaCalc(l, S); return { fase: faseDe.get(l.sid) ?? 4, t: "svc" as const, nome: (x.s?.n ?? "Serviço"), q: l.q, un: (x.s?.un ?? "") }; }
    return { fase: l.d === LINHA_DEMOLICAO ? 1 : faseDosMateriais(l.d), t: "mat" as const, d: l.d };
  }));
}

/** O modelo de obra do negócio (para a frase de abertura quando o cliente não escreveu o pedido). */
export const modeloDaObra = (d: Negocio): string => LINHAS[d.linha]?.modelo ?? "";

export interface ItemMaterial { k: string; nome: string; det: string }
export interface EscolhaCliente { k: string; l: string; v?: string }
export interface MateriaisProposta {
  mats: ItemMaterial[]; escolhidos: ItemMaterial[]; fornecidos: Fornecido[]; escolhas: EscolhaCliente[];
  /** Sem produtos escolhidos: o que o cliente disse que precisava (as necessidades da visita). */
  nec: string[];
}
/** "Materiais e escolhas": os do modelo, os escolhidos, o que o cliente fornece (com o que poupa) e as escolhas. */
export function materiaisDaProposta(d: Negocio, S: Estado): MateriaisProposta {
  const mats = calcMats(d, S, true).filter((x) => x.q > 0);
  const prods = (d.visita.prod ?? []).filter((p) => p.q > 0);
  const campos = ESCOLHAS.campos.filter((c) => d.f[c.k] && c.k !== "materiais_cliente");
  const vis = escolhasVisiveis(campos.map((c) => [c.l, d.f[c.k]] as const));
  // a chave do campo acompanha a escolha (o portal traduz o rótulo por ela); escolhasVisiveis mantém a ordem e tira os "Não"
  const escolhas = vis.map((e) => ({ k: campos.find((c) => c.l === e.l)?.k ?? e.l, ...e }));
  return {
    mats: mats.map((x) => ({ k: x.n, nome: x.n, det: quantidade(x.q, x.un) })),
    escolhidos: prods.filter((p) => !p.cliente).map((p) => ({ k: p.id, nome: p.n, det: quantidade(p.q, p.un) })),
    fornecidos: fornecidosPeloCliente(d, S),
    escolhas,
    nec: !prods.length ? d.visita.nec : [],
  };
}

/** Uma fase do planeamento: os dias úteis desde o início (meio dia = 0,5), as datas do calendário e as tarefas. */
export interface FasePlaneamento { n: FaseObra; nome: string; dias: number; de: Date; ate: Date; tarefas: string[] }
export interface Planeamento {
  fases: FasePlaneamento[]; inicio: Date; fim: Date;
  /** Os dias da obra pelo plano (a largura de cada fase na barra é dias / diasTotal). */
  diasTotal: number;
}
/** As fases da obra com as datas (do plano da obra do orçamento, só dias úteis). Sem fases com dias: null. */
export function planeamentoDaObra(d: Negocio, S: Estado): Planeamento | null {
  const P = planoObra(d, S);
  const fases = P.fases.filter((f) => f.fim > f.inicio);
  if (!fases.length) return null;
  const n = Math.max(1, Math.ceil(P.dias - 1e-9));
  const cal = diasDaObra(inicioDaObra(d), n);
  const dia = (x: number) => cal[Math.min(cal.length - 1, Math.max(0, x))];
  return {
    fases: fases.map((f) => {
      const i = Math.floor(f.inicio), j = Math.ceil(f.fim - 1e-9) - 1;
      return { n: f.n, nome: f.nome, dias: f.fim - f.inicio, de: dia(i), ate: dia(j <= i ? i : j), tarefas: f.tarefas.map((t) => t.nome) };
    }),
    inicio: dia(0), fim: dia(n - 1), diasTotal: P.dias,
  };
}

/** Uma prestação: o momento (o texto do motor ou o escrito à mão), a percentagem, o valor com IVA e a data prevista. */
export interface PrestacaoDoc { l: string; p: number; v: number; data?: Date; fase: Prestacao["fase"] }
/** As prestações das condições de pagamento (com "Por fases", as guardadas no plano da obra), com a data prevista de cada uma
 *  (o dia em que acaba a fase, pelo plano da obra). */
export function prestacoesDaProposta(d: Negocio, total: number, S?: Estado): PrestacaoDoc[] {
  const pr = prestacoes(d.f.pagamento, d.orc?.pagFases);
  let quando: ((t: Prestacao) => Date | undefined) | null = null;
  if (S && d.orc) {
    const P = planoObra(d, S), n = Math.max(1, Math.ceil(P.dias - 1e-9));
    const cal = diasDaObra(inicioDaObra(d), n);
    quando = (t) => (t.fase === 0 ? undefined : cal[Math.min(n - 1, Math.max(0, Math.ceil(diaDaPrestacao(P, t) - 1e-9) - 1))]);
  }
  const vs = valoresPrestacoes(total, pr);
  return pr.map((t, i) => ({ l: t.l, p: t.p, v: vs[i], data: quando?.(t), fase: t.fase }));
}
/** As prestações como DocsCliente as mostra ("seg, 19 out"). */
export const comDataCurta = (L: PrestacaoDoc[]): { l: string; p: number; v: number; quando?: string }[] =>
  L.map((t) => ({ l: t.l, p: t.p, v: t.v, quando: t.data ? dataCurta(t.data) : undefined }));

/** O fim previsto: `dias` dias úteis (só sem fins de semana) a contar do início, o próprio incluído. Sem um dos dois: null. */
export function fimPrevistoData(inicio?: string, dias?: string): Date | null {
  if (!inicio || !dias) return null;
  const d = new Date(inicio + "T12:00:00"); let n = Number(dias);
  while (n > 1) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; }
  return d;
}

/** Os valores das cláusulas do contrato (o negócio, sem adenda): o objeto, o preço por taxa de IVA, as prestações, o prazo, a garantia
 *  e as cláusulas que o Jurídico reescreveu (texto, por título). O texto em português é o de DocsCliente.tsx (clausulasContrato). */
export interface ClausulasDados {
  servico: string; morada: string; localidade: string; servicos: string[];
  T: ReturnType<typeof totaisIva>;
  prestacoes: PrestacaoDoc[];
  prazo: { inicio: string | null; dias: string | null; fim: Date | null; multa: boolean };
  garantia: string | null;
  revistas: Record<string, string>;
}
export function dadosDasClausulas(d: Negocio, S: Estado): ClausulasDados {
  const o = d.orc!, T = totaisIva(d, S);
  return {
    servico: d.servico, morada: d.f.morada || d.local, localidade: d.f.localidade || "",
    servicos: o.linhas.filter((l) => l.t === "svc").map((l) => (linhaCalc(l, S).s?.n ?? "serviço")),
    T, prestacoes: prestacoesDaProposta(d, T.total, S),
    prazo: { inicio: d.f.inicio_prev || null, dias: d.f.prazo_exec || null, fim: fimPrevistoData(d.f.inicio_prev, d.f.prazo_exec), multa: d.f.multa === "Sim" },
    garantia: d.f.garantia || null,
    revistas: { ...(o.clausulas ?? {}) },
  };
}

/** Uma adenda assinada, como fica anexa ao contrato. */
export interface AdendaAnexa { n: string; trabalhos: string[]; total: number; dias: number; motivo: string; assinada: string | null; a: Adenda }
/** As adendas assinadas do contrato e o valor do contrato com elas (o preço da cláusula fica o assinado). Sem adendas: null. */
export function adendasDoContrato(d: Negocio, S: Estado): { adendas: AdendaAnexa[]; contrato: number; somaAdendas: number; total: number } | null {
  const as = assinadas(d);
  if (!as.length) return null;
  const V = valorContrato(d, S);
  return {
    adendas: as.map((a) => ({ n: a.n, trabalhos: a.linhas.map((x) => x.n), total: totaisAdenda(a).total, dias: diasAdenda(a.linhas), motivo: a.motivo,
      assinada: a.assinatura ? a.assinatura.q : a.assinada ?? null, a })),
    contrato: V.contrato, somaAdendas: V.adendas, total: V.total,
  };
}
