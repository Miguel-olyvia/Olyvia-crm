// As contas do relatório da obra para o cliente (15/10/2026; o componente é RelatorioObra.tsx): o que se fez, quando, com que equipa, as fotografias e a garantia.
// Sem React. Tudo sai do que o negócio já guarda (o histórico, o plano com o que os técnicos registaram, o diário de obra,
// as adendas, a fatura e o recibo, o auto de receção); sem custos internos nem margens.
import { eur, type Negocio } from "./motor";
import { FASES_OBRA } from "./fasesObra";
import { equipaDaObra } from "./obraOps";
import { rotuloDia } from "./preparacaoObra";
import { totalComIva } from "./adendas";

/** Um marco da linha do tempo. `k` diz o ícone; `fotos` são as da tarefa validada ou do registo do diário. */
export interface Marco { q: string; t: string; sub?: string; fotos?: string[]; k: "proposta" | "contrato" | "pagamento" | "materiais" | "obra" | "tarefa" | "diario" | "adenda" | "auto" }

/** Quando aconteceu (pelo histórico do negócio): a data do registo mais antigo que bate com o texto. */
function quando(d: Negocio, re: RegExp): string | undefined {
  for (let i = d.hist.length - 1; i >= 0; i--) if (re.test(d.hist[i].t)) return d.hist[i].q;
  return undefined;
}

/** A linha do tempo da obra, pela ordem em que as coisas aconteceram (do pedido à receção). */
export function historiaDaObra(d: Negocio): Marco[] {
  const o = d.orc, p = d.obra.plano, out: Marco[] = [];
  const m = (x: Marco | null | undefined | false) => { if (x) out.push(x); };
  // a proposta (e as versões que se refizeram a pedido do cliente)
  for (const v of o?.versoes ?? []) m({ q: v.enviada, t: `Proposta (versão ${v.n})`, sub: v.motivos.length || v.nota ? `Refeita a seu pedido: ${[...v.motivos, v.nota].filter(Boolean).join(", ").toLowerCase()}` : undefined, k: "proposta" });
  if (o?.enviada) m({ q: o.enviada, t: o.versoes?.length ? `Proposta (versão ${o.versoes.length + 1})` : "Proposta recebida", k: "proposta" });
  if (o?.aceite) m({ q: o.aceite, t: "Proposta aceite", k: "proposta" });
  if (o?.contrato === "assinado") m({ q: o.assinatura?.q ?? quando(d, /Contrato assinado|assinou o contrato/i) ?? "", t: `Contrato CT 2026/${d.id} assinado`, k: "contrato" });
  if (d.fin.fatura) m({ q: d.fin.fatura.q, t: `Fatura ${d.fin.fatura.n}`, k: "pagamento" });
  if (d.fin.recibo) m({ q: d.fin.recibo.q, t: `Pagamento confirmado · recibo ${d.fin.recibo.n}`, k: "pagamento" });
  // as obras antigas do exemplo (encomenda sem origem no Inventário) já tinham os materiais; as outras, a encomenda emitida no Inventário
  if (d.obra.ec && !d.obra.ec.ref) m({ q: d.obra.ec.criada, t: "Materiais prontos para a obra", k: "materiais" });
  else if (d.obra.ec) m({ q: d.obra.ec.emitida?.q ?? quando(d, /Encomenda de cliente .* emitida/i) ?? "", t: `Encomenda de cliente ${d.obra.ec.n} emitida no Inventário`, k: "materiais" });
  m(!!p && p.estado !== "por aprovar" && p.estado !== "aprovado" && { q: quando(d, /^Obra arrancou/) ?? (p.origem === "orcamento" ? rotuloDia(p, 0) : ""), t: "A obra começou", k: "obra" });
  // as adendas (trabalhos a mais) assinadas
  for (const a of d.adendas ?? []) if (a.estado === "assinada") m({ q: a.assinatura?.q ?? a.assinada ?? "", t: `Trabalhos a mais: adenda ${a.n}`, sub: `${a.linhas.map((x) => x.n).join(", ")} · +${eur(totalComIva(a.linhas))} € com IVA`, k: "adenda" });
  // cada tarefa validada pelo responsável de obra, pela ordem do plano, com a fotografia e a nota do técnico
  for (const t of [...(p?.tasks ?? [])].sort((a, b) => a.dia - b.dia)) {
    if (t.exec?.estado !== "validada") continue;
    m({ q: t.exec.validada ?? t.exec.feita ?? (p ? rotuloDia(p, t.dia) : ""), t: t.nome, sub: t.exec.nota, fotos: t.exec.fotos.length ? t.exec.fotos : undefined, k: "tarefa" });
  }
  // o que o diário de obra registou para o cliente (ocorrências e marcos; as horas e as validações já estão nas tarefas)
  for (const e of d.obra.diario ?? []) if (e.k === "ocorrencia" || e.k === "marco") m({ q: e.q, t: e.t, fotos: e.fotos?.length ? e.fotos : undefined, k: "diario" });
  if (p?.estado === "concluída") m({ q: quando(d, /^Obra concluída/) ?? "", t: "Obra concluída", k: "obra" });
  const au = d.obra.auto;
  if (au?.estado === "assinado") m({ q: au.assinado ?? au.q, t: `Auto de receção ${au.n} assinado`, sub: au.reservas ? `Com observações: ${au.reservas}` : "Está tudo bem", k: "auto" });
  return out;
}

/** As fotografias das tarefas validadas, por fase da obra (a 1.ª é o "antes", a última o "depois", quando há mais de uma). */
export function fotosPorFase(d: Negocio): { fase: number; nome: string; fotos: { src: string; t: string }[] }[] {
  const p = d.obra.plano;
  if (!p) return [];
  const g = new Map<number, { src: string; t: string }[]>();
  for (const t of p.tasks) {
    const fs = t.exec?.estado === "validada" ? t.exec.fotos : [];
    fs.forEach((src, i) => {
      const l = g.get(t.fase ?? 0) ?? [];
      l.push({ src, t: fs.length > 1 ? `${t.nome} · ${i === 0 ? "antes" : i === fs.length - 1 ? "depois" : "durante"}` : t.nome });
      g.set(t.fase ?? 0, l);
    });
  }
  return [...g.entries()].sort((a, b) => a[0] - b[0]).map(([fase, fotos]) => ({ fase, nome: FASES_OBRA[fase - 1]?.curto ?? "Obra", fotos }));
}

/** O resumo: as datas, a duração em dias úteis (prevista e real) e a equipa (só os nomes e os ofícios). */
export function resumoObra(d: Negocio): { inicio: string; fim: string; diasPrev: number; diasReal: number; equipa: { n: string; sk: string }[] } | null {
  const p = d.obra.plano;
  if (!p?.tasks.length) return null;
  const fimPrev = Math.max(...p.tasks.map((t) => t.dia + t.dur));
  const R = d.obra.realFases;
  // com o plano do orçamento, as datas reais do calendário; nos planos de exemplo (dias sem data), as do histórico
  const doPlano = p.origem === "orcamento";
  return {
    inicio: (!doPlano && quando(d, /^Obra arrancou/)) || rotuloDia(p, Math.min(...p.tasks.map((t) => t.dia))),
    fim: (!doPlano && quando(d, /^Obra concluída/)) || rotuloDia(p, Math.max(0, Math.ceil(R ? R.diasReal : fimPrev) - 1)),
    diasPrev: R ? R.diasPrev : fimPrev, diasReal: R ? R.diasReal : fimPrev,
    equipa: equipaDaObra(p).map((x) => ({ n: x.n, sk: x.sk })),
  };
}

/** Até quando vai a garantia: a data do auto assinado mais os anos da garantia do contrato ("2 anos" por omissão). */
export function garantiaAte(d: Negocio): string | null {
  const q = d.obra.auto?.estado === "assinado" ? d.obra.auto.assinado ?? d.obra.auto.q : null;
  const m = q?.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?/);
  if (!m) return null;
  const anos = Number((d.f.garantia || "2 anos").match(/\d+/)?.[0] ?? 2);
  return `${m[1]}/${m[2]}/${Number(m[3] ?? new Date().getFullYear()) + anos}`;
}

