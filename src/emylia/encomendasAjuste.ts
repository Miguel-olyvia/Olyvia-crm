// Os ajustes à obra que trazem materiais novos (21/10/2026): depois de a encomenda de cliente inicial (EC-<id>) estar no Inventário, uma
// tarefa nova no plano, uma adenda assinada ou materiais mudados à mão numa tarefa disparam uma encomenda de cliente de AJUSTE (EC-<id>-A1; 22/10: a de uma adenda leva o número dela, a adenda 2 é a A2,
// origem "CT 2026/<id> · A1"), só com o que falta: as linhas novas e o aumento das quantidades. Usa as regras de sempre do Inventário
// (ponteNegocios.emitirEcNoInventario: reserva FIFO do stock e, do que faltar, encomenda ao fornecedor, pendente por aprovar).
// · O plano ajusta-se: as tarefas com materiais que vêm do fornecedor não começam antes do primeiro dia útil a seguir à chegada prevista
//   (como entregaTarde faz com o início da obra); as fases seguintes empurram-se (ajustesPlano.mudarInicio → encadearFases).
// · O que sai: uma tarefa tirada leva com ela a encomenda de ajuste que só servia essa tarefa, anulada com as regras de sempre (eliminarEc:
//   liberta as reservas e anula as encomendas a fornecedor ligadas), se ainda nada saiu para a obra. Quantidades a menos não mexem na
//   encomenda: o que sobrar volta ao armazém no fim (devolução no Inventário).
// · Antes do pagamento não há encomenda de cliente: o que as tarefas pedem fica por encomendar e emite-se logo a seguir à inicial.
// · 21/10 (decisão B): as tarefas de uma adenda (Tarefa.adenda) guardam os materiais até o Financeiro validar o pagamento DESSA adenda, como
//   no contrato (sem encomenda antes do pagamento). Validado, emite-se a encomenda de ajuste da adenda (EcAjuste.adenda = o número); se ainda
//   não há encomenda inicial, emite-se logo a seguir a ela. As adendas recusadas ou retiradas nunca juntam tarefas: nunca encomendam.
import { comoSistema } from "./inventario/base";
import { eliminarEc } from "./inventario/ec";
import { executar, lerInventario } from "./inventario/loja";
import { emitirNoInventario, idAjuste, pedidoDoNegocio, refAjuste, resumoEcNegocio } from "./inventario/ponteNegocios";
import { mudarInicio } from "./ajustesPlano";
import { deIso, diasDaObra, isoDia } from "./planoObra";
import { custosDosMateriais, inicioDoPlano, type EcAjuste, type EncCliente, type LinhaEc } from "./preparacaoObra";
import { normal } from "./catalogo";
import { precoProduto } from "./produtosVisita";
import { encomendaReal } from "./real/encomendaReal";
import type { MatTarefa, Negocio, Plano, Tarefa } from "./motor";

const r2 = (x: number) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ 30/10: na Olyvia */
// Com a encomenda de cliente da base (obra.ec.contrato, sem a referência do Inventário do browser), os materiais novos vão à encomenda a
// fornecedor da base (obra_encomendar_materiais, 20270101350000): pendente, do fornecedor preferido, ligada à encomenda de cliente, para
// Compras e armazém aprovar. As adendas não passam por aqui: a encomenda delas nasce na base com o pagamento validado.
export interface LinhaAjusteReal { produto: string; n: string; q: number; un: string; tarefa: string }
type PedirAjusteReal = (d: Negocio, motivo: string, linhas: LinhaAjusteReal[]) => void;
let pedirReal: PedirAjusteReal | null = null;
export const definirAjusteReal = (f: PedirAjusteReal | null): void => { pedirReal = f; };

/** null: não é a Olyvia (segue o Inventário do browser). Senão, marca o que fica encomendado em cada tarefa e pede-o à base. */
export function ajusteReal(d: Negocio, motivo: string, adenda?: string): { n: number; linhas: string[] } | { erro: string } | null {
  const base = d.obra.ec;
  // a encomenda da base tem contrato (e também a referência, negocioBase.ts); a do Inventário do browser não tem contrato
  if (!pedirReal || adenda || !base?.contrato || !d.obra.plano || d.perdido) return null;
  const P = porEncomendarDe(d);
  if (!P.length) return { n: 0, linhas: [] };
  const sem = [...new Set(P.filter((x) => !x.m.produto).map((x) => x.m.n))];
  if (sem.length) return { erro: `${sem.join(", ")} não ${sem.length === 1 ? "é um produto" : "são produtos"} do Catálogo: escolha os materiais da lista.` };
  for (const { t, m } of P) {
    const enc = (t.encomendado ??= []), e = enc.find((x) => x.n === m.n);
    if (e) e.q = m.q; else enc.push({ ...m });
  }
  const linhas = P.map(({ t, m, q }) => ({ produto: m.produto!, n: m.n, q, un: m.un, tarefa: t.nome }));
  pedirReal(d, motivo, linhas);
  return { n: linhas.length, linhas: linhas.map((x) => `${x.n} × ${x.q} ${x.un}`) };
}
/** O pedido à base falhou: o que se marcou como encomendado volta a estar por encomendar (para se pedir outra vez). */
export function desfazerAjusteReal(d: Negocio, linhas: readonly LinhaAjusteReal[]): void {
  for (const l of linhas) {
    const t = d.obra.plano?.tasks.find((x) => x.nome === l.tarefa), e = t?.encomendado?.find((x) => x.n === l.n);
    if (e) e.q = r2(Math.max(0, e.q - l.q));
  }
}

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

/** 21/10: a encomenda de ajuste de uma adenda (não anulada). As assinadas antes da decisão B têm só o motivo "adenda <n>". */
export const ecDaAdenda = (d: Negocio, n: string): EcAjuste | undefined =>
  (d.obra.ecsAjuste ?? []).find((a) => !a.anulada && (a.adenda === n || (!a.adenda && a.motivo === "adenda " + n)));

/**
 * 21/10: o que falta encomendar no negócio. Com `adenda`, só o das tarefas dessa adenda; sem ela, o resto: as tarefas de uma adenda ficam
 * de fora enquanto a encomenda da adenda não existir (esperam pelo pagamento dela). Depois, o que se mudar à mão nelas vai como os outros ajustes.
 */
export function porEncomendarDe(d: Negocio, adenda?: string): PorEncomendar[] {
  return porEncomendar(d.obra.plano).filter(({ t }) => (adenda ? t.adenda === adenda : !t.adenda || !!ecDaAdenda(d, t.adenda)));
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

/** 30/10 (visto no browser): as linhas da encomenda de cliente. As da base não vêm no negócio (obraDaEc: linhas []): leem-se do
 *  documento da encomenda (encomendaReal), com o reservado e o que falta. Sem o documento lido, nenhuma.
 *  30/10: o documento não traz preços (e as linhas material_modelo da proposta vão a 0): o custo e o preço por unidade fazem-se como em
 *  gerarEncCliente: os produtos da visita (pelo nome) com os do Catálogo; os materiais do modelo, todos juntos, repartem a linha de
 *  materiais do orçamento (custosDosMateriais), para baterem com o que o cliente aceitou. */
export function linhasDaEc(d: Negocio, ec: EncCliente): LinhaEc[] {
  if (ec.linhas.length || !ec.contrato) return ec.linhas;
  const r = encomendaReal(ec.ref);
  const prods = (d.visita.prod ?? []).filter((p) => !p.cliente);
  const L = (r?.linhas ?? []).map((l) => {
    const tem = r2(l.pronto + l.saida), p = prods.find((x) => normal(x.n.trim()) === normal(l.n.trim()));
    const base = { n: l.n, q: l.q, un: l.un, res: Math.min(l.q, tem), falta: r2(Math.max(0, l.q - tem)) };
    return p
      ? { ...base, de: "produto" as const, custo: r2(p.custo), preco: r2(precoProduto(p) / (p.q || 1)), id: p.id }
      : { ...base, de: "material" as const, custo: 0, preco: 0 };
  });
  const mats = L.filter((x) => x.de === "material"), cm = custosDosMateriais(d, mats);
  mats.forEach((x, j) => Object.assign(x, cm[j]));
  return L;
}

/** 30/10: o custo e o valor na proposta da encomenda de cliente. Os da base vêm a 0 no negócio (obraDaEc): somam-se as linhas (linhasDaEc). */
export function totaisDaEc(d: Negocio, ec: EncCliente): { custo: number; valor: number } {
  if (ec.linhas.length || !ec.contrato) return { custo: ec.custo ?? 0, valor: ec.valor };
  const L = linhasDaEc(d, ec);
  return { custo: r2(L.reduce((a, x) => a + x.custo * x.q, 0)), valor: r2(L.reduce((a, x) => a + x.preco * x.q, 0)) };
}

/** As linhas de materiais da obra: as da encomenda inicial e as de cada encomenda de ajuste (não anulada), com o número de cada uma. */
export function linhasDaObra(d: Negocio): { x: LinhaEc; ec: string; motivo?: string }[] {
  const ec = d.obra.ec;
  if (!ec) return [];
  return [
    ...linhasDaEc(d, ec).map((x) => ({ x, ec: ec.n })),
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

/** 22/10: o número da adenda ("AD 2026/1027-2" → 2); null se não tiver. */
export const numeroAdenda = (n: string): number | null => {
  const m = /-(\d+)$/.exec(n);
  return m ? Number(m[1]) : null;
};
/**
 * 22/10: o k de EC-<id>-A<k>. A de uma adenda leva o número da adenda (a adenda 2 é a A2, mesmo paga antes da 1). As outras (tarefa nova,
 * materiais mudados) levam o primeiro k livre a partir do seguinte, saltando os números das adendas do negócio. Nunca se repete um nome já
 * usado (no negócio, anuladas incluídas, ou no Inventário): se o da adenda já estiver usado (um ajuste antigo ficou com ele), a adenda
 * leva o primeiro livre. As encomendas já gravadas não mudam de nome (a ligação à adenda é pelo campo `adenda`/motivo: ecDaAdenda).
 */
export function kAjuste(d: Negocio, adenda?: string): number {
  const usados = new Set([...(d.obra.ecsAjuste ?? []).map((a) => a.n), ...lerInventario().ecs.map((e) => e.id)]);
  const livre = (k: number) => !usados.has(idAjuste(d, k));
  const kA = adenda ? numeroAdenda(adenda) : null;
  if (kA && livre(kA)) return kA;
  const dasAdendas = new Set((d.adendas ?? []).map((a) => numeroAdenda(a.n)));
  let k = (d.obra.ecsAjuste?.length ?? 0) + 1;
  while (!livre(k) || dasAdendas.has(k)) k++;
  return k;
}

/**
 * Emite a encomenda de ajuste com o que falta encomendar e ajusta o plano à chegada. Devolve null se não há nada a encomendar (ou ainda
 * não há encomenda inicial: emite-se depois dela) e { erro } se o Inventário recusou (não fica nada a meio).
 * 21/10: com `adenda`, só os materiais das tarefas dessa adenda (o motor chama-a quando o pagamento da adenda é validado) e a encomenda
 * fica ligada a ela; sem `adenda`, os das tarefas de adendas ainda sem encomenda ficam de fora (porEncomendarDe).
 */
export function encomendarAjustes(d: Negocio, motivo: string, quem: string, quando: string, adenda?: string): ResultadoAjuste | { erro: string } | null {
  const p = d.obra.plano, base = d.obra.ec;
  if (!p || !base?.ref || d.perdido) return null;
  const P = porEncomendarDe(d, adenda);
  if (!P.length) return null;
  const k = kAjuste(d, adenda);
  const linhas = linhasDeAjuste(P);
  const ec: EcAjuste = {
    n: idAjuste(d, k), ref: refAjuste(base.ref, k), estado: "emitida", criada: quando, linhas, motivo, emitida: { por: quem, q: quando },
    valor: r2(linhas.reduce((a, x) => a + x.preco * x.q, 0)), custo: r2(linhas.reduce((a, x) => a + x.custo * x.q, 0)),
    ...(adenda ? { adenda } : {}),
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
