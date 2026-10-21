// Os ajustes à obra que trazem materiais novos (21/10/2026): depois de a encomenda de cliente inicial (EC-<id>) estar no Inventário, uma
// tarefa nova no plano, uma adenda assinada ou materiais mudados à mão numa tarefa disparam uma encomenda de cliente de AJUSTE (EC-<id>-A1,
// origem "CT 2026/<id> · A1"), só com o que falta: as linhas novas e o aumento das quantidades. Usa as regras de sempre do Inventário
// (ponteNegocios.emitirEcNoInventario: reserva FIFO do stock e, do que faltar, encomenda ao fornecedor, pendente por aprovar).
// · O plano ajusta-se: as tarefas com materiais que vêm do fornecedor não começam antes do primeiro dia útil a seguir à chegada prevista
//   (como entregaTarde faz com o início da obra); as fases seguintes empurram-se (ajustesPlano.mudarInicio → encadearFases).
// · O que sai: uma tarefa tirada leva com ela a encomenda de ajuste que só servia essa tarefa, anulada com as regras de sempre (eliminarEc:
//   liberta as reservas e anula as encomendas a fornecedor ligadas), se ainda nada saiu para a obra. Quantidades a menos não mexem na
//   encomenda: o que sobrar volta ao armazém no fim (devolução no Inventário).
// · Antes do pagamento não há encomenda de cliente: o que as tarefas pedem fica por encomendar e emite-se logo a seguir à inicial.
import { comoSistema } from "./inventario/base";
import { eliminarEc } from "./inventario/ec";
import { executar, lerInventario } from "./inventario/loja";
import { emitirNoInventario, idAjuste, pedidoDoNegocio, refAjuste, resumoEcNegocio } from "./inventario/ponteNegocios";
import { mudarInicio } from "./ajustesPlano";
import { deIso, diasDaObra, isoDia } from "./planoObra";
import { inicioDoPlano, type EcAjuste, type LinhaEc } from "./preparacaoObra";
import type { MatTarefa, Negocio, Plano, Tarefa } from "./motor";

const r2 = (x: number) => Math.round(x * 100) / 100;

/** As tarefas cujos materiais se encomendam à parte: as novas (do validador ou de uma adenda) e as do orçamento com materiais mudados à mão. */
export const contaParaAjuste = (t: Tarefa): boolean => !!t.mats && (!!t.nova || !!t.encomendado);

export interface PorEncomendar { t: Tarefa; m: MatTarefa; q: number }
/** O que falta encomendar: os materiais das tarefas menos o que já foi encomendado para elas (pelo nome). */
export function porEncomendar(p: Plano | null | undefined): PorEncomendar[] {
  if (!p || p.estado === "concluída") return [];
  return p.tasks.filter(contaParaAjuste).flatMap((t) =>
    (t.mats ?? []).map((m) => ({ t, m, q: r2(m.q - (t.encomendado?.find((x) => x.n === m.n)?.q ?? 0)) })).filter((x) => x.q > 0));
}
/** O que foi encomendado a mais (as quantidades baixaram depois): fica na encomenda e volta ao armazém no fim. */
export function aMais(p: Plano | null | undefined): PorEncomendar[] {
  if (!p) return [];
  return p.tasks.filter(contaParaAjuste).flatMap((t) =>
    (t.encomendado ?? []).map((e) => ({ t, m: e, q: r2(e.q - ((t.mats ?? []).find((x) => x.n === e.n)?.q ?? 0)) })).filter((x) => x.q > 0));
}

/** As linhas de uma encomenda de ajuste: o que falta, junto pelo nome do material (várias tarefas podem pedir o mesmo). */
export function linhasDeAjuste(P: PorEncomendar[]): LinhaEc[] {
  const L = new Map<string, LinhaEc>();
  for (const { m, q } of P) {
    const x = L.get(m.n);
    if (x) { x.q = r2(x.q + q); x.falta = x.q; continue; }
    const pu = r2(m.preco ?? 0);
    L.set(m.n, { n: m.n, q, un: m.un, de: "material", res: 0, falta: q, custo: pu, preco: pu });
  }
  return [...L.values()];
}

/** As linhas de materiais da obra: as da encomenda inicial e as de cada encomenda de ajuste (não anulada), com o número de cada uma. */
export function linhasDaObra(d: Negocio): { x: LinhaEc; ec: string; motivo?: string }[] {
  const ec = d.obra.ec;
  if (!ec) return [];
  return [
    ...ec.linhas.map((x) => ({ x, ec: ec.n })),
    ...(d.obra.ecsAjuste ?? []).filter((a) => !a.anulada).flatMap((a) => a.linhas.map((x) => ({ x, ec: a.n, motivo: a.motivo }))),
  ];
}

/** O primeiro dia do plano (índice em dias úteis) em que um material que chega a `iso` ("aaaa-mm-dd") já está em obra: o dia útil
 *  a seguir à chegada. Null nos planos sem datas (os de exemplo). */
export function diaDaChegada(p: Plano, iso: string): number | null {
  const i = inicioDoPlano(p);
  if (!i) return null;
  const alvo = deIso(iso);
  alvo.setDate(alvo.getDate() + 1);
  const a = isoDia(alvo), N = 500, ds = diasDaObra(i, N);
  const k = ds.findIndex((x) => isoDia(x) >= a);
  return k < 0 ? N : k;
}

export interface ResultadoAjuste {
  ec: EcAjuste;
  /** quando chega o que foi ao fornecedor ("aaaa-mm-dd"; null se tudo saiu do stock) */
  chegada: string | null;
  /** as tarefas que passaram para depois da chegada: o nome e o novo dia */
  adiadas: { nome: string; dia: number }[];
  /** quantas linhas ficaram reservadas do stock e quantas foram ao fornecedor */
  reservadas: number; aFornecedor: number;
}

/**
 * Emite a encomenda de ajuste com o que falta encomendar e ajusta o plano à chegada. Devolve null se não há nada a encomendar (ou ainda
 * não há encomenda inicial: emite-se depois dela) e { erro } se o Inventário recusou (não fica nada a meio).
 */
export function encomendarAjustes(d: Negocio, motivo: string, quem: string, quando: string): ResultadoAjuste | { erro: string } | null {
  const p = d.obra.plano, base = d.obra.ec;
  if (!p || !base?.ref || d.perdido) return null;
  const P = porEncomendar(p);
  if (!P.length) return null;
  const k = (d.obra.ecsAjuste?.length ?? 0) + 1;
  const linhas = linhasDeAjuste(P);
  const ec: EcAjuste = {
    n: idAjuste(d, k), ref: refAjuste(base.ref, k), estado: "emitida", criada: quando, linhas, motivo, emitida: { por: quem, q: quando },
    valor: r2(linhas.reduce((a, x) => a + x.preco * x.q, 0)), custo: r2(linhas.reduce((a, x) => a + x.custo * x.q, 0)),
  };
  const r = emitirNoInventario({ ...pedidoDoNegocio(d, ec), id: ec.n, registo: `Encomenda de ajuste do negócio: ${motivo}` });
  if (!r.ok) return { erro: r.erro };
  const linhasInv = r.valor.lines.filter((l) => l.sku);
  ec.linhas.forEach((x, i) => { const l = linhasInv[i]; if (l) { x.res = Math.min(x.q, l.stockQty); x.falta = r2(Math.max(0, x.q - l.stockQty)); } });
  (d.obra.ecsAjuste ??= []).push(ec);
  // o que cada tarefa já tem encomendado
  for (const { t, m } of P) {
    const enc = (t.encomendado ??= []), e = enc.find((x) => x.n === m.n);
    if (e) e.q = m.q; else enc.push({ ...m });
    if (!(t.ecs ??= []).includes(ec.n)) t.ecs.push(ec.n);
  }
  // quando chega o que foi ao fornecedor: as tarefas que o usam não começam antes
  const res = resumoEcNegocio(lerInventario(), base.ref);
  const minhas = res?.linhas.filter((l) => l.ec === ec.n) ?? [];
  const chegada = minhas.flatMap((l) => l.pos).filter((x) => x.fase !== "recebida" && x.fase !== "cancelada" && x.prevista).map((x) => x.prevista).sort().at(-1) ?? null;
  const adiadas: ResultadoAjuste["adiadas"] = [];
  const dmin = chegada ? diaDaChegada(p, chegada) : null;
  if (dmin != null) {
    const comFornecedor = new Set(minhas.filter((l) => l.aChegar > 0).map((l) => l.n));
    for (const t of new Set(P.filter((x) => comFornecedor.has(x.m.n)).map((x) => x.t))) {
      if (t.dia >= dmin) continue;
      mudarInicio(p, p.tasks.indexOf(t), dmin);
      adiadas.push({ nome: t.nome, dia: t.dia });
    }
  }
  return { ec, chegada, adiadas, reservadas: minhas.filter((l) => l.aChegar === 0 && l.semForn === 0).length, aFornecedor: minhas.filter((l) => l.aChegar > 0).length };
}

/**
 * A tarefa saiu do plano: as encomendas de ajuste que só ela usava anulam-se no Inventário (regras de sempre: liberta as reservas e
 * anula as encomendas a fornecedor ligadas), se ainda nada saiu para a obra. Devolve as anuladas e as que ficam (já com saídas).
 */
export function anularAjustesDaTarefa(d: Negocio, t: Tarefa, quando: string): { anuladas: string[]; ficam: string[] } {
  const out = { anuladas: [] as string[], ficam: [] as string[] };
  const outras = d.obra.plano?.tasks.filter((x) => x !== t) ?? [];
  for (const id of t.ecs ?? []) {
    if (outras.some((x) => x.ecs?.includes(id))) continue;
    const a = d.obra.ecsAjuste?.find((x) => x.n === id);
    if (!a || a.anulada) continue;
    const r = executar((db) => {
      const e = db.ecs.find((x) => x.id === id);
      if (!e || e.deleted) return "anulada";
      if (e.lines.some((l) => l.served > 0)) return "fica";
      comoSistema(() => eliminarEc(db, e, `A tarefa ${t.nome} saiu do plano da obra`, { contrato: e.origin.k === "CT" }));
      return "anulada";
    });
    if (r.ok && r.valor === "anulada") { a.anulada = quando; out.anuladas.push(id); } else out.ficam.push(id);
  }
  return out;
}
