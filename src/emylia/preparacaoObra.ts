// Do contrato à obra (14/10/2026, refeito a 16/10). O circuito:
//   · Contrato assinado (ou venda direta aceite) → só o Plano da obra (do plano do orçamento, por aprovar). Encomenda nenhuma.
//   · Pagamento validado (Financeiro) → o recibo e, logo, a Encomenda de cliente, emitida sozinha no Inventário novo (inventario/ponteNegocios.ts):
//     lá se reserva o stock (FIFO) e o que falta vai à encomenda ao fornecedor preferencial. Ninguém a aprova: já está paga.
//   · Plano aprovado (Operações), com os técnicos e as férias: só depois do pagamento.
//   · Arrancar a obra (Operações), 19/10: com o pagamento validado, o plano aprovado e os materiais garantidos no Inventário: a encomenda de cliente
//     emitida e não eliminada, nenhuma linha sem fornecedor, nenhuma encomenda a fornecedor por aprovar ou por receber, e cada linha saída, pronta a
//     sair no armazém ou a bordo da carrinha (o critério da Frota para carregar). As obras antigas do exemplo (encomenda sem ref) não bloqueiam.
// O cartão do negócio só lê o estado da encomenda no Inventário (reservada, encomendada ao fornecedor, saída).
import { resumoErp } from "./erpEticadata";
import { itemCatalogo, normal } from "./catalogo";
import { DIAS, LINHAS, PAPEIS, TECS, calcMats, conflitos, diaDeFerias, eur, nfmt, r2, type Estado, type Negocio, type Papel, type Plano, type Servico, type StockKey, type Tarefa } from "./motor";
import { custosDe, perfilIdDe, receitaDe } from "./v2/custosModelo";
import { PERFIL_DO_SK, perfilDoTecnico } from "./equipa/tecnicos";
import { dataCurta, deIso, diasDaObra, iniciosRapidos, planoObra, proximoUtil } from "./planoObra";
import { precoProduto } from "./produtosVisita";
import { faltaMateriais, posDaInicial, resumoEcNegocio, textoResumoEc, type ResumoEcNeg } from "./inventario/ponteNegocios";
import { lerInventario } from "./inventario/loja";
import { lerVersao } from "./versaoPrototipo";
import type { Inventario } from "./inventario/tipos";
import { assinadas, diasAdenda, faturasAdenda, nomeParcela, parcelasAdenda, primeiraPaga, type Adenda } from "./adendas";
import { ecDaAdenda, porEncomendarDe } from "./encomendasAjuste";

/* ------------------------------------------------------------------ a encomenda de cliente */
export interface LinhaEc {
  n: string; q: number; un: string;
  /** Material do modelo (com chave de stock) ou produto escolhido na visita. */
  de: "material" | "produto";
  k?: StockKey;
  /** Quanto o Inventário reservou do stock ao emitir e quanto faltava (foi ao fornecedor). O estado vivo lê-se no Inventário. */
  res: number; falta: number;
  /** Custo e preço por unidade (€, sem IVA): a estimativa de materiais do orçamento repartida pelas linhas; nos produtos, os do Catálogo. */
  custo: number; preco: number;
  /** Produto da visita: o id no Catálogo (o produto no Inventário faz-se a partir dele). */
  id?: string;
}
export interface EncCliente {
  /** EC-<id do negócio>: o mesmo número no Inventário. As das obras antigas do exemplo têm o número de antes ("EC 2026/001"). */
  n: string; estado: "emitida"; criada: string;
  linhas: LinhaEc[];
  /** O valor dos materiais e produtos na proposta (sem IVA). */
  valor: number;
  /** O custo das linhas (o que a empresa paga). */
  custo: number;
  /** A origem no Inventário ("CT 2026/<id>" ou "VD 2026/<id>"): a encomenda vive lá. Sem ela, é de uma obra antiga do exemplo (antes do Inventário novo). */
  ref?: string;
  /** Quem a emitiu (ao validar o pagamento) e quando. */
  emitida?: { por: string; q: string };
}
/** 21/10: uma encomenda de cliente de ajuste (EC-<id>-A1): os materiais novos de uma tarefa nova, de uma adenda ou mudados à mão
 *  depois da inicial (encomendasAjuste.ts). Vive no Inventário como a inicial; anulada se as tarefas dela saíram antes de alguma coisa sair. */
export interface EcAjuste extends EncCliente { motivo: string; anulada?: string;
  /** 21/10: a adenda que a originou (o número, "AD 2026/1027-1"): emitida quando o Financeiro validou o pagamento dessa adenda */
  adenda?: string }

/** Os fornecedores de exemplo (o real virá das Compras); o sugerido é pelo tipo de obra. */
export const FORNECEDORES = ["Cerâmica do Centro (exemplo)", "Sanitários do Tejo (exemplo)", "Madeiras e Cozinhas (exemplo)"];
export const fornecedorSugerido = (d: Negocio) => (d.linha === "coz" ? FORNECEDORES[2] : FORNECEDORES[0]);

/** A encomenda de cliente: os materiais do modelo (pelas medidas) e os produtos escolhidos na visita (menos os que o cliente fornece). */
/** O custo por unidade guarda 4 casas: os totais (custo × quantidade) batem com o orçamento ao cêntimo. */
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** A parte da estimativa de materiais (LINHAS.mat.partes) a que um material pertence, pelo nome. */
function parteDe(nome: string, partes: { d: string }[]): number {
  const s = normal(nome);
  const chave = /parede/.test(s) ? /parede/ : /pavimento/.test(s) ? /pavimento/ : /sanita|base de duche|louca|torneira/.test(s) ? /louca|torneira/ : /move|bancada/.test(s) ? /move|bancada/ : /cola|cimento/.test(s) ? /cola|pequeno/ : null;
  const i = chave ? partes.findIndex((p) => chave.test(normal(p.d))) : -1;
  return i >= 0 ? i : partes.findIndex((p) => /pequeno|cola/.test(normal(p.d)));
}

/** O custo e o preço por unidade dos materiais do modelo: a linha de materiais do orçamento (o que o cliente aceitou) repartida
 *  pelas partes da estimativa e, dentro de cada parte, em partes iguais pelos materiais que lhe pertencem. */
export function custosDosMateriais(d: Negocio, mats: { n: string; q: number }[]): { custo: number; preco: number }[] {
  const L = LINHAS[d.linha], partes = L.mat.partes ?? [];
  const linha = d.orc?.linhas.find((l) => l.t === "mat" && l.d === L.mat.d);
  const custoTot = linha && linha.t === "mat" ? linha.custo : L.mat.custo, precoTot = linha && linha.t === "mat" ? linha.preco : L.mat.preco;
  if (!partes.length) return mats.map((x) => ({ custo: r4(custoTot / mats.length / (x.q || 1)), preco: r4(precoTot / mats.length / (x.q || 1)) }));
  const idx = mats.map((x) => parteDe(x.n, partes));
  // as partes sem material nenhum (ex.: torneira e pequeno material sem linha própria) vão para as que têm, na proporção
  const usadas = partes.map((_, i) => idx.includes(i));
  const pesoUsado = partes.reduce((a, p, i) => a + (usadas[i] ? (p as { peso: number }).peso : 0), 0) || 1;
  return mats.map((x, j) => {
    const i = idx[j];
    if (i < 0) return { custo: 0, preco: 0 };
    const quota = (partes[i] as { peso: number }).peso / pesoUsado / idx.filter((y) => y === i).length;
    return { custo: r4((custoTot * quota) / (x.q || 1)), preco: r4((precoTot * quota) / (x.q || 1)) };
  });
}

export function gerarEncCliente(d: Negocio, S: Estado, n: string, quando: string): EncCliente {
  const mats = calcMats(d, S, false).filter((x) => x.q > 0);
  const prods = (d.visita.prod ?? []).filter((p) => !p.cliente && p.q > 0);
  const cm = custosDosMateriais(d, mats);
  const linhas: LinhaEc[] = [
    ...mats.map((x, j) => ({ n: x.n, q: r2(x.q), un: x.un, de: "material" as const, k: x.k, res: r2(x.res), falta: r2(x.falta), ...cm[j] })),
    // os produtos da visita compram-se para esta obra: não há stock deles
    ...prods.map((p) => ({ n: p.n, q: p.q, un: p.un, de: "produto" as const, res: 0, falta: p.q, custo: r2(p.custo), preco: r2(precoProduto(p) / (p.q || 1)), id: p.id })),
  ];
  const valor = linhas.reduce((a, x) => a + x.preco * x.q, 0), custo = linhas.reduce((a, x) => a + x.custo * x.q, 0);
  return { n, estado: "emitida", criada: quando, linhas, valor: r2(valor), custo: r2(custo) };
}

/* ------------------------------------------------------------------ o plano da obra, a partir do orçamento */
/** O ofício de uma tarefa pelo nome (os planos e os serviços de antes, sem o perfil pelo id) → o tipo de técnico (TECS.sk).
 *  22/10: um ofício que não se reconhece fica "" (por atribuir); antes ia para o Montador. */
export function skDaTarefa(perfil: string, nome: string): string {
  const s = normal(`${perfil} ${nome}`);
  if (/demol|servente|entulho|remoc/.test(s)) return "Servente · demolição";
  if (/canaliz|louca|sanit|agua|esgoto|gas/.test(s)) return "Canalizador";
  if (/revest|ladril|pavim|ceram|azulej/.test(s)) return "Ladrilhador";
  if (/carpint|montag|montador|move/.test(s)) return "Montador";
  return "";
}

/** 22/10: o ofício de um serviço (o perfil do Catálogo pelo id): o id e o nome (Tarefa.sk). Sem perfil, o de antes pelo nome. */
export function oficioDoServico(S: Estado, s: Pick<Servico, "perfil" | "n"> & { perfilId?: string }): { perfilId: string; sk: string } {
  const C = custosDe(S), id = perfilIdDe(C, s), p = C.perfis.find((x) => x.id === id);
  if (p) return { perfilId: p.id, sk: p.n };
  const sk = skDaTarefa(s.perfil, s.n);
  return { perfilId: PERFIL_DO_SK[sk] ?? "", sk };
}
/** 22/10: os técnicos de um ofício: os do perfil (pelo id), ou os do mesmo nome nos planos de antes. */
export const tecnicosDoOficio = (t: Pick<Tarefa, "sk"> & { perfilId?: string }) =>
  t.perfilId ? TECS.filter((x) => perfilDoTecnico(x) === t.perfilId) : t.sk ? TECS.filter((x) => x.sk === t.sk) : [];
/** O técnico do ofício livre nesses dias (o primeiro; senão o primeiro do ofício; sem técnicos do ofício, ninguém: fica por atribuir). */
export function tecnicoDoOficio(t: Pick<Tarefa, "sk"> & { perfilId?: string }, p: Plano, dia: number, dur: number): string | null {
  const doOficio = tecnicosDoOficio(t);
  return (doOficio.find((x) => diaDeFerias(x, p, dia, dur) == null) ?? doOficio[0])?.id ?? null;
}
/** 22/10: as tarefas do plano sem técnico (o ofício não tem técnicos no RH): ficam por atribuir, com aviso. */
export const porAtribuir = (p: Plano): Tarefa[] => p.tasks.filter((t) => !t.tec && !(t.exec?.estado === "validada"));

/** As tarefas do plano do orçamento (planoObra.ts), em dias úteis, com um técnico do ofício (o que não está de férias).
 *  22/10: o ofício é o perfil do passo da receita (pelo id); sem técnico com esse perfil, a tarefa fica por atribuir (tec null). */
export function planoDoOrcamento(d: Negocio, S: Estado): Plano {
  const P = planoObra(d, S);
  const plano: Plano = { tasks: [], estado: "por aprovar", dia: 0, origem: "orcamento", inicio: d.orc?.inicioObra };
  const C = custosDe(S);
  // 26/10: as partes de um «MO Modelo» (uma por ofício) já vêm do plano do orçamento (ganttOrcamento.ts: partesPorOficio), cada uma
  // na sua fase e ao lado dos outros serviços: o plano da obra e o do orçamento têm as mesmas tarefas e os mesmos dias
  for (const t of [...P.tarefas].sort((a, b) => a.inicio - b.inicio)) {
    const dia = Math.floor(t.inicio), dur0 = Math.max(1, Math.ceil(t.inicio + t.dias - 1e-9) - dia);
    const sid = t.svc ?? t.chave;
    const of = t.perfilId ? { perfilId: t.perfilId, sk: C.perfis.find((x) => x.id === t.perfilId)?.n ?? t.perfil } : oficioDoServico(S, { perfil: t.perfil, n: t.nome });
    const tec = tecnicoDoOficio(of, plano, dia, dur0);
    plano.tasks.push({ nome: t.nome, svcs: t.chave === "demolicao" ? [] : [sid], dia, dur: dur0, sk: of.sk, ...(of.perfilId ? { perfilId: of.perfilId } : {}), h: r2(t.h), tec, fase: t.fase });
  }
  return plano;
}

/** 26/10: mudou para ganttOrcamento.ts (o plano do orçamento já parte o «MO Modelo»). */
export { partesPorOficio } from "./ganttOrcamento";

/* ------------------------------------------------------------------ os passos, por trilho */
export type Trilho = "ec" | "plano" | "pag" | "obra";
export type EstadoPasso = "feito" | "agora" | "espera";
export interface PassoPrep {
  id: string; trilho: Trilho; t: string; sub: string; who: Papel | null; estado: EstadoPasso;
  /** A ação (A[act](id)) e o texto do botão, para quem é a vez. */
  act?: string; btn?: string;
  /** 21/10: o segundo argumento da ação (o número da adenda), quando o passo é de uma adenda: A[act](id, arg) */
  arg?: string;
}
// 15/10 (Ruben): o pagamento vem primeiro. 16/10: a encomenda de cliente emite-se sozinha com o pagamento validado; o plano aprova-se depois dele
export const TRILHOS: { k: Trilho; t: string }[] = [
  { k: "pag", t: "Pagamento" }, { k: "ec", t: "Materiais" }, { k: "plano", t: "Plano da obra" },
];
/** O plano espera pelo pagamento confirmado. */
export const SO_DEPOIS_DO_PAGAMENTO = "Depois de confirmado o pagamento.";
/** A encomenda de cliente nasce do pagamento validado (no Inventário novo). */
export const EC_NO_PAGAMENTO = "Emite-se quando o pagamento for validado.";

/** O que falta para arrancar a obra (vazio = pode arrancar): o pagamento, a encomenda de cliente, os materiais garantidos no Inventário
 *  (ponteNegocios.ts: faltaMateriais) e o plano aprovado. `db`: o Inventário já lido pelo ecrã (useInventario); sem ele, lê-se aqui. */
export function faltaParaArrancar(d: Negocio, db?: Inventario | null): string[] {
  const p = d.obra.plano, F: string[] = [];
  if (!d.fin.pago) F.push(d.fin.fatura ? "receber o pagamento" : "registar a fatura do ERP e receber o pagamento");
  else if (!d.obra.ec) F.push("emitir a encomenda de cliente");
  else if (d.obra.ec.ref) F.push(...faltaMateriais(resumoEcNegocio(db ?? lerInventario(), d.obra.ec.ref)));
  // 21/10 (decisão B): as adendas assinadas antes do arranque também: o pagamento de cada uma e a encomenda dos materiais dela (como as
  // outras de ajuste, as encomendas a fornecedor dela não seguram o arranque: as tarefas esperam no plano). Com a obra a andar, não bloqueiam nada.
  // 21/10 (decisão C): basta a 1.ª parcela da adenda paga (e a encomenda dela emitida); as outras parcelas não seguram o arranque
  if (!p || p.estado === "por aprovar" || p.estado === "aprovado") for (const a of assinadas(d)) {
    if (!primeiraPaga(a)) F.push(faturasAdenda(a).length ? `receber o pagamento da 1.ª parcela da adenda ${a.n}` : `faturar a 1.ª parcela da adenda ${a.n} e receber o pagamento`);
    else if (d.obra.ec?.ref && !ecDaAdenda(d, a.n) && porEncomendarDe(d, a.n).length) F.push(`emitir a encomenda da adenda ${a.n}`);
  }
  if (!p || p.estado === "por aprovar") F.push("aprovar o plano");
  return F;
}

/** 21/10: as tarefas de uma adenda no plano (as de antes de 21/10 só têm o número no nome). */
export const tarefasDaAdenda = (p: Plano, n: string): Tarefa[] => p.tasks.filter((t) => t.adenda === n || (!t.adenda && t.nome.endsWith(`(adenda ${n})`)));
/** A encomenda da adenda emite-se com o pagamento dela validado (decisão B, como no contrato). */
export const EC_ADENDA_NO_PAGAMENTO = "Emite-se quando o pagamento da 1.ª parcela da adenda for validado.";

/** A frase dos materiais da obra: a encomenda de cliente e o estado dela no Inventário (as obras antigas do exemplo já os têm na obra). */
export function textoMateriais(d: Negocio, r: ResumoEcNeg | null): string {
  if (!d.obra.ec) return d.fin.pago ? "A encomenda de cliente não chegou ao Inventário: emita-a de novo no negócio." : "A encomenda de cliente emite-se quando o pagamento for validado.";
  if (!d.obra.ec.ref) return "Obra do exemplo: os materiais já estão na obra.";
  return r ? `Encomenda de cliente ${r.id}: ${textoResumoEc(r)}` : `Encomenda de cliente ${d.obra.ec.n} emitida.`;
}

/**
 * Os passos do contrato à obra, com o estado de cada um e de quem é a vez (os negócios com plano da obra).
 * `inv`: o estado da encomenda lido do Inventário (ponteNegocios.resumoEcNegocio). Só o cartão o passa; o Hoje não precisa dele
 * (o passo do Inventário é só de leitura: quem lá trabalha é o Armazém, no próprio Inventário).
 */
export function passosPreparacao(d: Negocio, S: Estado, inv?: ResumoEcNeg | null): PassoPrep[] {
  const ec = d.obra.ec, p = d.obra.plano;
  if (!p) return [];
  const L: PassoPrep[] = [];

  // a encomenda de cliente: nasce do pagamento validado, no Inventário novo
  if (!ec) {
    L.push(d.fin.pago
      ? { id: "ec", trilho: "ec", estado: "agora", who: "financeiro", t: "Emitir a encomenda de cliente", sub: "O pagamento está validado mas a encomenda não chegou ao Inventário. Emita-a de novo.", act: "emitirEc", btn: "Emitir no Inventário" }
      : { id: "ec", trilho: "ec", estado: "espera", who: null, t: "Encomenda de cliente", sub: EC_NO_PAGAMENTO });
  } else {
    L.push({ id: "ec", trilho: "ec", estado: "feito", who: ec.ref ? "financeiro" : null, t: `Encomenda de cliente ${ec.n}`,
      sub: `${ec.ref ? `Emitida ao validar o pagamento${ec.emitida ? ` · ${ec.emitida.q}` : ""}` : `De ${ec.criada}`} · ${ec.linhas.length} ${ec.linhas.length === 1 ? "linha" : "linhas"} · ${eur(ec.valor)} € na proposta` });
    if (!ec.ref) L.push({ id: "ec-inv", trilho: "ec", estado: "feito", who: null, t: "Materiais na obra", sub: "Obra do exemplo, de antes do Inventário novo." });
    else if (inv !== undefined) L.push(!inv
      ? { id: "ec-inv", trilho: "ec", estado: "espera", who: null, t: "No Inventário", sub: "A encomenda ainda não está no Inventário (os dados de exemplo foram repostos): volta a ser emitida sozinha." }
      : { id: "ec-inv", trilho: "ec", estado: inv.pronta ? "feito" : "espera", who: null, t: inv.eliminada ? "Eliminada no Inventário" : `No Inventário: ${inv.rotulo.toLowerCase()}`, sub: textoResumoEc(inv) });
  }

  // 21/10 (decisão B): a encomenda de cada adenda assinada (com tarefas no plano), emitida só quando o pagamento dessa adenda é validado
  const ADS = assinadas(d).filter((a) => tarefasDaAdenda(p, a.n).length || ecDaAdenda(d, a.n));
  for (const a of ADS) {
    const ea = ecDaAdenda(d, a.n), pend = porEncomendarDe(d, a.n).length, t = `Encomenda da adenda ${a.n}`, id = "ec-ad-" + a.n;
    L.push(ea
      ? { id, trilho: "ec", estado: "feito", who: ea.adenda ? "financeiro" : null, t: `${t} · ${ea.n}`,
        sub: `${ea.adenda ? `Emitida ao validar o pagamento da adenda${ea.emitida ? ` · ${ea.emitida.q}` : ""}` : "Emitida ao assinar a adenda"} · ${ea.linhas.length} ${ea.linhas.length === 1 ? "linha" : "linhas"} · ${eur(ea.valor)} €` }
      : !pend ? { id, trilho: "ec", estado: "feito", who: null, t, sub: "Sem materiais a encomendar: só mão de obra." }
      : !primeiraPaga(a) ? { id, trilho: "ec", estado: "espera", who: null, t, sub: EC_ADENDA_NO_PAGAMENTO }
      : !ec?.ref ? { id, trilho: "ec", estado: "espera", who: null, t, sub: "O pagamento da adenda está validado: emite-se logo a seguir à encomenda de cliente inicial." }
      : { id, trilho: "ec", estado: "agora", who: "financeiro", t: `Emitir a encomenda da adenda ${a.n}`, sub: "O pagamento da adenda está validado mas a encomenda não chegou ao Inventário. Emita-a de novo.", act: "emitirEcsAdenda", btn: "Emitir no Inventário" });
  }

  // o plano
  const nc = conflitos(p).length, dias = p.tasks.length ? Math.max(...p.tasks.map((t) => t.dia + t.dur)) : 0;
  L.push({ id: "pl", trilho: "plano", estado: "feito", who: null, t: p.origem === "orcamento" ? "Plano gerado do orçamento" : "Plano da obra", sub: `${p.tasks.length} ${p.tasks.length === 1 ? "tarefa" : "tarefas"} · ${nfmt(dias)} dias úteis${p.inicio ? ` · início ${p.inicio.split("-").reverse().slice(0, 2).join("/")}` : ""}` });
  // 21/10: as tarefas de cada adenda assinada, juntas ao plano (no fim da fase de cada serviço); se o plano estava aprovado, volta a aprovação
  for (const a of ADS) {
    const k = tarefasDaAdenda(p, a.n).length, N = diasAdenda(a.linhas);
    if (k) L.push({ id: "pl-ad-" + a.n, trilho: "plano", estado: "feito", who: null, t: `Tarefas da adenda ${a.n} juntas ao plano · +${N} ${N === 1 ? "dia" : "dias"}`,
      sub: `${k} ${k === 1 ? "tarefa" : "tarefas"} no fim da fase de cada serviço.` });
  }
  L.push(p.estado === "por aprovar" && !d.fin.pago
    ? { id: "pl-ok", trilho: "plano", estado: "espera", who: "operacoes", t: "Aprovar o plano", sub: SO_DEPOIS_DO_PAGAMENTO }
    : p.estado === "por aprovar"
    ? { id: "pl-ok", trilho: "plano", estado: "agora", who: "operacoes", t: nc ? "Resolver o conflito e aprovar o plano" : "Aprovar o plano", sub: nc ? `${nc} ${nc === 1 ? "técnico de férias" : "técnicos de férias"} numa tarefa.` : "Os técnicos recebem as tarefas na app.", act: "aprovarPlano", btn: "Aprovar o plano" }
    : { id: "pl-ok", trilho: "plano", estado: "feito", who: "operacoes", t: "Plano aprovado", sub: "Técnicos avisados." });

  // o pagamento
  L.push(d.fin.fatura
    ? { id: "ft", trilho: "pag", estado: "feito", who: "financeiro", t: `Fatura ${d.fin.fatura.n}`, sub: `${d.fin.erp !== undefined ? "Emitida no Eticadata" : "Emitida"} ${d.fin.fatura.q.startsWith("hoje") ? d.fin.fatura.q : "a " + d.fin.fatura.q}.` }
    // 19/10: na V2 a Olyvia não emite faturas: regista-se a do programa certificado no Financeiro do negócio (sem botão aqui)
    : lerVersao() !== "atual"
    ? { id: "ft", trilho: "pag", estado: "agora", who: "financeiro", t: "Registar a fatura", sub: "Emita-a no programa de faturação certificado e registe-a no Financeiro do negócio." }
    // 22/10: no V1 também não: emite-se no Eticadata e regista-se aqui o número (o botão abre o negócio, onde se escreve)
    : { id: "ft", trilho: "pag", estado: "agora", who: "financeiro", t: "Registar a fatura do ERP", sub: "Emita-a no Eticadata e escreva aqui o número.", act: "registarFaturaErp", btn: "Registar fatura" });
  L.push(d.fin.pago
    ? { id: "pg", trilho: "pag", estado: "feito", who: "financeiro", t: `Pagamento validado`, sub: d.fin.recibo ? `Recibo ${d.fin.recibo.n}.` : "" }
    // 22/10: a fatura lida no Eticadata: o pagamento confirma-se lá (FaturaErp.tsx)
    : d.fin.fatura && d.fin.erp
    ? { id: "pg", trilho: "pag", estado: "agora", who: "financeiro", t: "À espera do pagamento", sub: `No Eticadata: ${resumoErp(d.fin.erp)}. Quando for paga, o recibo é o do ERP e a encomenda de cliente vai para o Inventário.`, act: "verificarErp", btn: "Verificar no ERP" }
    : { id: "pg", trilho: "pag", estado: d.fin.fatura ? "agora" : "espera", who: "financeiro", t: "Validar o pagamento", sub: d.fin.fatura ? "Confirmar que o valor entrou. O recibo sai sozinho e a encomenda de cliente vai para o Inventário." : "Depois da fatura.", act: d.fin.fatura ? "validar" : undefined, btn: "Validar o pagamento" });
  // 21/10: a 1.ª parcela de cada adenda assinada, com os mesmos dois passos do contrato (a fatura e o pagamento validado): é ela que
  // emite a encomenda dos materiais da adenda no Inventário. As parcelas seguintes ficam no Financeiro do negócio, como as do contrato.
  for (const a of assinadas(d)) L.push(...passosPagamentoAdenda(d, a));

  // o arranque
  const F = faltaParaArrancar(d);
  L.push(p.estado === "em curso" || p.estado === "concluída"
    ? { id: "go", trilho: "obra", estado: "feito", who: "operacoes", t: p.estado === "concluída" ? "Obra concluída" : "Obra em curso", sub: "" }
    : F.length
      ? { id: "go", trilho: "obra", estado: "espera", who: "operacoes", t: "Arrancar a obra", sub: `Falta ${F.join(", ")}.` }
      : { id: "go", trilho: "obra", estado: "agora", who: "operacoes", t: "Arrancar a obra", sub: "Está tudo pronto.", act: "arrancar", btn: "Arrancar a obra" });
  void S;
  return L;
}

/** 21/10: os passos do pagamento da 1.ª parcela de uma adenda assinada (ids "ft-ad-<n>" e "pg-ad-<n>"), como os do contrato. */
export function passosPagamentoAdenda(d: Negocio, a: Adenda): PassoPrep[] {
  const f0 = faturasAdenda(a).find((f) => f.i === 0), x = parcelasAdenda(d, a)[0], parc = nomeParcela(0);
  const id = a.n, mats = porEncomendarDe(d, a.n).length > 0 || !!ecDaAdenda(d, a.n);
  const ft: PassoPrep = f0
    ? { id: "ft-ad-" + id, trilho: "pag", estado: "feito", who: "financeiro", t: `Fatura ${f0.n} · adenda ${a.n} · ${parc}`, sub: `Emitida ${f0.q.startsWith("hoje") ? f0.q : "a " + f0.q} · ${eur(f0.v)} €.` }
    // na V2 a Olyvia não emite faturas: regista-se a do programa certificado no Financeiro do negócio (sem botão aqui), como no contrato
    : lerVersao() !== "atual"
    ? { id: "ft-ad-" + id, trilho: "pag", estado: "agora", who: "financeiro", t: `Registar a fatura da adenda ${a.n} · ${parc}`, sub: `${x ? eur(x.v) + " € · " : ""}Emita-a no programa de faturação certificado e registe-a no Financeiro do negócio.` }
    : { id: "ft-ad-" + id, trilho: "pag", estado: "agora", who: "financeiro", t: `Emitir a fatura da adenda ${a.n} · ${parc}`, sub: `${x ? eur(x.v) + " € · " : ""}Vai para o portal do cliente.`, act: "faturarAdendas", arg: a.n, btn: "Emitir a fatura" };
  const rc = f0?.recibo;
  const pg: PassoPrep = rc
    ? { id: "pg-ad-" + id, trilho: "pag", estado: "feito", who: "financeiro", t: `Pagamento validado · adenda ${a.n}`, sub: `Recibo ${rc.n}.` }
    : { id: "pg-ad-" + id, trilho: "pag", estado: f0 ? "agora" : "espera", who: "financeiro", t: `Validar o pagamento da adenda ${a.n} · ${parc}`,
      sub: !f0 ? "Depois da fatura." : `${f0.pag?.comprovativo ? `O cliente avisou no portal: ${f0.pag.comprovativo}. ` : ""}Confirmar que o valor da ${f0.n} entrou. O recibo sai sozinho${mats ? " e a encomenda dos materiais da adenda vai para o Inventário" : ""}.`,
      act: f0 ? "validarPagamentosAdenda" : undefined, arg: a.n, btn: "Validar o pagamento" };
  return [ft, pg];
}

/** Os passos à espera de alguém (para o Hoje), pela ordem do circuito. */
export const passosAgora = (d: Negocio, S: Estado) => passosPreparacao(d, S).filter((x) => x.estado === "agora" && x.who);
/** "Direção" / "Sandra · Financeiro". */
export const quemE = (who: Papel | null) => (who ? PAPEIS[who].n : "");

/* ------------------------------------------------------------------ a entrega e o início */
/** As encomendas a fornecedor da encomenda de cliente (no Inventário) chegam no dia em que a obra começa (ou depois)? Pela data prometida no
 *  portal ou, sem ela, a prevista; a mais tarde das que estão por receber. Devolve as datas, o primeiro dia útil a seguir e as encomendas. */
export function entregaTarde(d: Negocio, db?: Inventario | null): { entrega: Date; inicio: Date; depois: Date; pos: string[] } | null {
  const ref = d.obra.ec?.ref, p = d.obra.plano;
  if (!ref || !p || p.estado === "em curso" || p.estado === "concluída") return null;
  const r = resumoEcNegocio(db ?? lerInventario(), ref);
  if (!r || r.eliminada) return null;
  const abertas = posDaInicial(r).filter((x) => x.fase !== "recebida" && x.fase !== "cancelada" && x.prevista);
  if (!abertas.length) return null;
  const inicio = inicioDoPlano(p);
  if (!inicio) return null;
  const entrega = deIso(abertas.map((x) => x.prevista).sort().at(-1)!);
  if (entrega < inicio) return null;
  const a = new Date(entrega); a.setDate(a.getDate() + 1);
  return { entrega, inicio, depois: proximoUtil(a), pos: abertas.map((x) => x.id) };
}

/* ------------------------------------------------------------------ as datas do plano */
/** O início do plano: o escolhido (ou o do orçamento), senão a próxima segunda-feira. Null nos planos antigos (dias de exemplo). */
export function inicioDoPlano(p: Plano, hoje = new Date()): Date | null {
  if (p.origem !== "orcamento") return null;
  return p.inicio ? deIso(p.inicio) : iniciosRapidos(hoje)[0].data;
}
/** O rótulo do dia `k` do plano: "seg, 19 out" (planos do orçamento) ou o dia de exemplo (DIAS). */
export function rotuloDia(p: Plano, k: number, hoje = new Date()): string {
  const i = inicioDoPlano(p, hoje);
  return i ? dataCurta(diasDaObra(i, k + 1)[k]) : DIAS[k] ?? `dia ${k + 1}`;
}
/** Os técnicos que podem fazer a tarefa (do mesmo ofício), com se estão livres nesses dias. */
export function tecnicosPara(t: Tarefa, p: Plano): { id: string; n: string; livre: boolean; ferias: string | null }[] {
  return tecnicosDoOficio(t).map((x) => {
    const k = diaDeFerias(x, p, t.dia, t.dur);
    return { id: x.id, n: x.n, livre: k == null, ferias: k == null ? null : rotuloDia(p, k) };
  });
}
