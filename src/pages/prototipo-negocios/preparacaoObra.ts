// Do contrato à obra (14/10/2026), sem React. Pedido do Ruben: "o orçamento gera o contrato; depois do contrato
// assinado, gera uma encomenda de cliente e o plano (que já está no orçamento); ambos têm de ser aprovados; se a
// encomenda for aprovada, emite uma encomenda a fornecedor, que tem de ser validada".
//   · Contrato assinado → Encomenda de cliente (EC, por aprovar) e Plano da obra (do plano do orçamento, por aprovar).
//   · EC aprovada (o comercial, que conhece o que vendeu) → reserva o stock; o que falta vai numa Encomenda a fornecedor (EF, por validar).
//   · EF validada (Financeiro, que vê se o sinal já entrou) → encomendada → recebida (Armazém).
//   · Plano aprovado (Operações), com os técnicos e as férias.
//   · Pagamento: a fatura e o recibo (Financeiro), em paralelo; o recibo passa o negócio à Obra.
//   · Arrancar a obra (Operações) só com tudo: EC aprovada, materiais recebidos, plano aprovado e sinal pago.
import { normal } from "./catalogo";
import { DIAS, LINHAS, PAPEIS, TECS, calcMats, conflitos, diaDeFerias, eur, nfmt, r2, type Estado, type Negocio, type Papel, type Plano, type StockKey, type Tarefa } from "./motor";
import { dataCurta, deIso, diasDaObra, iniciosRapidos, planoObra, proximoUtil } from "./planoObra";
import { precoProduto } from "./produtosVisita";

/* ------------------------------------------------------------------ a encomenda de cliente */
export interface LinhaEc {
  n: string; q: number; un: string;
  /** Material do modelo (com chave de stock) ou produto escolhido na visita. */
  de: "material" | "produto";
  k?: StockKey;
  /** Quanto há em stock para reservar e quanto falta (vai para o fornecedor). */
  res: number; falta: number;
  /** Custo e preço por unidade (€, sem IVA): a estimativa de materiais do orçamento repartida pelas linhas; nos produtos, os do Catálogo. */
  custo: number; preco: number;
}
export interface EncCliente {
  n: string; estado: "por aprovar" | "aprovada"; criada: string;
  linhas: LinhaEc[];
  /** O valor dos materiais e produtos na proposta (sem IVA). */
  valor: number;
  /** O custo das linhas (o que a empresa paga). */
  custo: number;
  aprovada?: { por: string; q: string };
}

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
    ...prods.map((p) => ({ n: p.n, q: p.q, un: p.un, de: "produto" as const, res: 0, falta: p.q, custo: r2(p.custo), preco: r2(precoProduto(p) / (p.q || 1)) })),
  ];
  const valor = linhas.reduce((a, x) => a + x.preco * x.q, 0), custo = linhas.reduce((a, x) => a + x.custo * x.q, 0);
  return { n, estado: "por aprovar", criada: quando, linhas, valor: r2(valor), custo: r2(custo) };
}
/** O total de uma encomenda a fornecedor (custo × quantidade). */
export const totalEf = (e: { linhas: { q: number; custo?: number }[] }) => r2(e.linhas.reduce((a, x) => a + (x.custo ?? 0) * x.q, 0));
/** O custo das linhas em falta (o que vai na encomenda a fornecedor). */
export const custoFalta = (ec: EncCliente) => r2(ec.linhas.reduce((a, x) => a + x.custo * x.falta, 0));

/* ------------------------------------------------------------------ o plano da obra, a partir do orçamento */
/** O ofício de uma tarefa → o tipo de técnico do RH (TECS.sk). */
export function skDaTarefa(perfil: string, nome: string): string {
  const s = normal(`${perfil} ${nome}`);
  if (/demol|servente|entulho|remoc/.test(s)) return "Servente · demolição";
  if (/canaliz|louca|sanit|agua|esgoto|gas/.test(s)) return "Canalizador";
  if (/revest|ladril|pavim|ceram|azulej/.test(s)) return "Ladrilhador";
  return "Montador";
}

/** As tarefas do plano do orçamento (planoObra.ts), em dias úteis, com um técnico do ofício (o que não está de férias). */
export function planoDoOrcamento(d: Negocio, S: Estado): Plano {
  const P = planoObra(d, S);
  const plano: Plano = { tasks: [], estado: "por aprovar", dia: 0, origem: "orcamento", inicio: d.orc?.inicioObra };
  plano.tasks = P.tarefas.map((t) => {
    const sk = skDaTarefa(t.perfil, t.nome);
    const dia = Math.floor(t.inicio), dur = Math.max(1, Math.ceil(t.inicio + t.dias - 1e-9) - dia);
    const doOficio = TECS.filter((x) => x.sk === sk);
    // o primeiro do ofício que não está de férias nesses dias (pelas datas reais)
    const livre = doOficio.find((x) => diaDeFerias(x, plano, dia, dur) == null) ?? doOficio[0];
    return { nome: t.nome, svcs: t.chave === "demolicao" ? [] : [t.chave], dia, dur, sk, h: r2(t.h), tec: livre?.id ?? null, fase: t.fase };
  });
  return plano;
}

/* ------------------------------------------------------------------ os passos, por trilho */
export type Trilho = "ec" | "plano" | "pag" | "obra";
export type EstadoPasso = "feito" | "agora" | "espera";
export interface PassoPrep {
  id: string; trilho: Trilho; t: string; sub: string; who: Papel | null; estado: EstadoPasso;
  /** A ação (A[act](id)) e o texto do botão, para quem é a vez. */
  act?: string; btn?: string;
}
export const TRILHOS: { k: Trilho; t: string }[] = [
  { k: "ec", t: "Encomenda" }, { k: "plano", t: "Plano da obra" }, { k: "pag", t: "Pagamento" },
];

/** O que falta para arrancar a obra (vazio = pode arrancar). */
export function faltaParaArrancar(d: Negocio): string[] {
  const ec = d.obra.ec, e = d.obra.enc, p = d.obra.plano, F: string[] = [];
  if (ec && ec.estado !== "aprovada") F.push("aprovar a encomenda de cliente");
  if (e && e.estado !== "recebida") F.push(e.estado === "por confirmar" ? "validar a encomenda ao fornecedor" : "receber os materiais");
  if (!p || p.estado === "por aprovar") F.push("aprovar o plano");
  if (!d.fin.pago) F.push(d.fin.fatura ? "receber o pagamento" : "emitir a fatura e receber o pagamento");
  return F;
}

/** Os passos do contrato à obra, com o estado de cada um e de quem é a vez. Só para os negócios com encomenda de cliente. */
export function passosPreparacao(d: Negocio, S: Estado): PassoPrep[] {
  const ec = d.obra.ec, e = d.obra.enc, p = d.obra.plano;
  if (!ec || !p) return [];
  const L: PassoPrep[] = [];
  const nFalta = ec.linhas.filter((x) => x.falta > 0).length;

  // a encomenda de cliente e a de fornecedor
  L.push({ id: "ec", trilho: "ec", estado: "feito", who: null, t: `Encomenda de cliente ${ec.n}`, sub: `Gerada do contrato a ${ec.criada} · ${ec.linhas.length} ${ec.linhas.length === 1 ? "linha" : "linhas"} · custo ${eur(ec.custo ?? 0)} € · ${eur(ec.valor)} € na proposta` });
  L.push(ec.estado === "aprovada"
    ? { id: "ec-ok", trilho: "ec", estado: "feito", who: "comercial", t: "Encomenda de cliente aprovada", sub: `${ec.aprovada?.por ?? "Comercial"} · ${ec.aprovada?.q ?? ""} · stock reservado` }
    : { id: "ec-ok", trilho: "ec", estado: "agora", who: "comercial", t: "Aprovar a encomenda de cliente", sub: nFalta ? `Ao aprovar, reserva o stock e pede ao fornecedor ${nFalta} ${nFalta === 1 ? "linha" : "linhas"} em falta.` : "Ao aprovar, reserva o stock: está tudo em armazém.", act: "aprovarEc", btn: "Aprovar a encomenda" });
  if (ec.estado !== "aprovada") L.push({ id: "ef", trilho: "ec", estado: "espera", who: "financeiro", t: "Encomenda a fornecedor", sub: nFalta ? `Emite-se ao aprovar a encomenda de cliente (${nFalta} em falta).` : "Nada a encomendar: tudo em stock." });
  else if (!e) L.push({ id: "ef", trilho: "ec", estado: "feito", who: null, t: "Sem encomenda a fornecedor", sub: "Tudo em stock e reservado." });
  else {
    L.push(e.estado === "por confirmar"
      ? { id: "ef", trilho: "ec", estado: "agora", who: "financeiro", t: `Validar a encomenda ${e.n}`, sub: `${e.forn ?? "Fornecedor por escolher"} · ${e.linhas.length} ${e.linhas.length === 1 ? "linha" : "linhas"} · ${eur(totalEf(e))} €${d.fin.pago ? " · sinal recebido" : " · atenção: o sinal ainda não entrou"}`, act: "validarEf", btn: "Validar e encomendar" }
      : { id: "ef", trilho: "ec", estado: "feito", who: "financeiro", t: `Encomenda ${e.n} validada`, sub: `${e.forn ?? ""}${e.validada ? ` · ${e.validada.por} · ${e.validada.q}` : ""}` });
    L.push(e.estado === "recebida"
      ? { id: "rec", trilho: "ec", estado: "feito", who: "armazem", t: "Materiais recebidos", sub: "Tudo reservado para a obra." }
      : e.estado === "por confirmar"
        ? { id: "rec", trilho: "ec", estado: "espera", who: "armazem", t: "Receber os materiais", sub: "Depois de validada." }
        // encomendada ou parcial: o Armazém confere no Inventário, linha a linha
        : { id: "rec", trilho: "ec", estado: "agora", who: "armazem", t: e.estado === "parcial" ? "Receber o que falta" : "Receber os materiais",
            sub: e.estado === "parcial"
              ? `Entrada parcial: faltam ${e.linhas.filter((x) => (x.recebido ?? 0) < x.q).map((x) => `${nfmt(r2(x.q - (x.recebido ?? 0)))} ${x.un} de ${x.n.toLowerCase()}`).join(", ")}.`
              : `${e.n} · ${e.entrega ? `entrega confirmada para ${e.entrega}` : "à espera da data do fornecedor"}; conferir e dar entrada.${entregaTarde(d) ? " · atenção: chega no dia em que a obra começa (ou depois)" : ""}`,
            act: "abrirInv", btn: "Conferir no Inventário" });
  }

  // o plano
  const nc = conflitos(p).length, dias = p.tasks.length ? Math.max(...p.tasks.map((t) => t.dia + t.dur)) : 0;
  L.push({ id: "pl", trilho: "plano", estado: "feito", who: null, t: p.origem === "orcamento" ? "Plano gerado do orçamento" : "Plano da obra", sub: `${p.tasks.length} ${p.tasks.length === 1 ? "tarefa" : "tarefas"} · ${nfmt(dias)} dias úteis${p.inicio ? ` · início ${p.inicio.split("-").reverse().slice(0, 2).join("/")}` : ""}` });
  L.push(p.estado === "por aprovar"
    ? { id: "pl-ok", trilho: "plano", estado: "agora", who: "operacoes", t: nc ? "Resolver o conflito e aprovar o plano" : "Aprovar o plano", sub: nc ? `${nc} ${nc === 1 ? "técnico de férias" : "técnicos de férias"} numa tarefa.` : "Os técnicos recebem as tarefas na app.", act: "aprovarPlano", btn: "Aprovar o plano" }
    : { id: "pl-ok", trilho: "plano", estado: "feito", who: "operacoes", t: "Plano aprovado", sub: "Técnicos avisados." });

  // o pagamento
  L.push(d.fin.fatura
    ? { id: "ft", trilho: "pag", estado: "feito", who: "financeiro", t: `Fatura ${d.fin.fatura.n}`, sub: `Emitida ${d.fin.fatura.q.startsWith("hoje") ? d.fin.fatura.q : "a " + d.fin.fatura.q}.` }
    : { id: "ft", trilho: "pag", estado: "agora", who: "financeiro", t: "Emitir a fatura", sub: "Vai para o portal do cliente.", act: "emitir", btn: "Emitir a fatura" });
  L.push(d.fin.pago
    ? { id: "pg", trilho: "pag", estado: "feito", who: "financeiro", t: `Pagamento validado`, sub: d.fin.recibo ? `Recibo ${d.fin.recibo.n}.` : "" }
    : { id: "pg", trilho: "pag", estado: d.fin.fatura ? "agora" : "espera", who: "financeiro", t: "Validar o pagamento", sub: d.fin.fatura ? "Confirmar que o valor entrou. O recibo sai sozinho." : "Depois da fatura.", act: d.fin.fatura ? "validar" : undefined, btn: "Validar o pagamento" });

  // o arranque
  const F = faltaParaArrancar(d);
  L.push(p.estado === "em curso" || p.estado === "concluída"
    ? { id: "go", trilho: "obra", estado: "feito", who: "operacoes", t: p.estado === "concluída" ? "Obra concluída" : "Obra em curso", sub: "" }
    : F.length
      ? { id: "go", trilho: "obra", estado: "espera", who: "operacoes", t: "Arrancar a obra", sub: `Falta ${F.join(", ")}.` }
      : { id: "go", trilho: "obra", estado: "agora", who: "operacoes", t: "Arrancar a obra", sub: "Está tudo pronto.", act: "arrancar", btn: "Arrancar a obra" });
  return L;
}

/** Os passos à espera de alguém (para o Hoje), pela ordem do circuito. */
export const passosAgora = (d: Negocio, S: Estado) => passosPreparacao(d, S).filter((x) => x.estado === "agora" && x.who);
/** "Direção" / "Sandra · Financeiro". */
export const quemE = (who: Papel | null) => (who ? PAPEIS[who].n : "");

/* ------------------------------------------------------------------ a entrega e o início */
/** A entrega do fornecedor calha no dia em que a obra começa (ou depois)? Devolve as datas e o primeiro dia útil a seguir à entrega. */
export function entregaTarde(d: Negocio): { entrega: Date; inicio: Date; depois: Date } | null {
  const e = d.obra.enc, p = d.obra.plano;
  if (!e?.entregaIso || e.estado === "recebida" || !p || p.estado === "em curso" || p.estado === "concluída") return null;
  const inicio = inicioDoPlano(p);
  if (!inicio) return null;
  const entrega = deIso(e.entregaIso);
  if (entrega < inicio) return null;
  const a = new Date(entrega); a.setDate(a.getDate() + 1);
  return { entrega, inicio, depois: proximoUtil(a) };
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
  return TECS.filter((x) => x.sk === t.sk).map((x) => {
    const k = diaDeFerias(x, p, t.dia, t.dur);
    return { id: x.id, n: x.n, livre: k == null, ferias: k == null ? null : rotuloDia(p, k) };
  });
}
