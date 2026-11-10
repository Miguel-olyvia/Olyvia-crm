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
import { PERFIL_DO_SK, tecnicosDoPerfil } from "./equipa/tecnicos";
import { equipaDe } from "./equipa/equipasObra";
import { dataCurta, deIso, diasDaObra, iniciosRapidos, isoDia, planoObra, proximoUtil } from "./planoObra";
import { precoProduto } from "./produtosVisita";
import { faltaMateriais, posDaInicial, resumoEcNegocio, textoResumoEc, type ResumoEcNeg } from "./inventario/ponteNegocios";
import { lerInventario } from "./inventario/loja";
import { faltaMateriaisReal, prontidaoDe, textoProntidaoReal, usarProntidao } from "./inventario/prontidaoReal";
import { lerVersao } from "./versaoPrototipo";
import type { Inventario } from "./inventario/tipos";
import { assinadas, diasAdenda, faturasAdenda, nomeParcela, parcelasAdenda, primeiraPaga, type Adenda } from "./adendas";
import { ecDaAdenda, linhasDaEc, porEncomendarDe, totaisDaEc } from "./encomendasAjuste";

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
  /** F3 (28/10): numa organização real, a encomenda de cliente do CRM (client_contracts.id; n é o order_number). Vive nas Encomendas de
   *  cliente da Olyvia, não no Inventário de exemplo: a prontidão lê-se de lá (inventario/prontidaoReal.ts). */
  contrato?: string;
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

/* ------------------------------------------------------------------ 9/11: o fluxo novo da obra */
// Rúben (9/11): proposta aceite → Financeiro valida o pagamento → o supervisor retifica as medidas (aceites) → as Operações validam e ajustam o
// plano → contrato assinado → encomenda (a fornecedor) e tudo recebido → início da obra. A venda direta não tem obra a medir nem contrato.
/** As medidas retificadas pelo supervisor e aceites (o primeiro passo da Obra). */
// os negócios de antes, com a encomenda já emitida pelo fluxo antigo, não ficam presos a um passo que não existia
export const retificacaoAceite = (d: Negocio): boolean => !!d.f.retif_aceite || !!d.orc?.vendaDireta || !!d.obra.ec;
/** O contrato assinado (na venda direta não há contrato). */
export const contratoAssinado = (d: Negocio): boolean => d.orc?.contrato === "assinado" || !!d.orc?.vendaDireta;
/** O plano aprovado pelas Operações (ou já em curso, ou concluído). */
export const planoAprovadoDe = (d: Negocio): boolean => ["aprovado", "em curso", "concluída"].includes(d.obra.plano?.estado ?? "");

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
/** 22/10: os técnicos de um ofício: os do perfil (pelo id), ou os do mesmo nome nos planos de antes.
 *  30/10: um técnico do RH com vários ofícios conta em todos (tecnicosDoPerfil); antes só contava no primeiro. */
export const tecnicosDoOficio = (t: Pick<Tarefa, "sk"> & { perfilId?: string }) =>
  t.perfilId ? tecnicosDoPerfil(t.perfilId, TECS) : t.sk ? TECS.filter((x) => x.sk === t.sk) : [];
/** O técnico do ofício livre nesses dias (o primeiro; senão o primeiro do ofício; sem técnicos do ofício, ninguém: fica por atribuir). */
export function tecnicoDoOficio(t: Pick<Tarefa, "sk"> & { perfilId?: string }, p: Plano, dia: number, dur: number): string | null {
  const doOficio = tecnicosDoOficio(t);
  return (doOficio.find((x) => diaDeFerias(x, p, dia, dur) == null) ?? doOficio[0])?.id ?? null;
}
/** 22/10: as tarefas do plano sem técnico (o ofício não tem técnicos no RH): ficam por atribuir, com aviso. */
export const porAtribuir = (p: Plano): Tarefa[] => p.tasks.filter((t) => !t.tec && !(t.exec?.estado === "validada"));
/** 30/10: o plano ainda por aprovar que tem tarefas por atribuir (o ofício não tinha técnicos no RH quando se gerou): cada uma fica com um
 *  técnico do ofício que o RH já tem, o livre nesses dias. Os planos aprovados não mudam sozinhos. Devolve quantas tarefas ficaram atribuídas. */
export function atribuirPorAtribuir(p: Plano | null | undefined): number {
  if (!p || p.estado !== "por aprovar") return 0;
  let n = 0;
  for (const t of porAtribuir(p)) {
    const tec = tecnicoDoOficio(t, p, t.dia, t.dur);
    if (tec) { t.tec = tec; n++; }
  }
  return n;
}

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
    plano.tasks.push({ nome: t.nome, svcs: t.chave === "demolicao" ? [] : [sid], dia, dur: dur0, sk: of.sk, ...(of.perfilId ? { perfilId: of.perfilId } : {}), h: r2(t.h), tec, fase: t.fase, ini: r2(t.inicio), dias: r2(t.dias) });
  }
  // 9/11: com o dia de início, os técnicos livres (sem outra obra nesses dias, nem outra tarefa desta)
  if (plano.inicio) escolherTecnicos(plano, ocupacaoDosTecnicos(S, d.id), escolhasDoNegocio(d.f ?? {}));
  return plano;
}

/* 9/11 (Rúben: «gerar logo o plano da obra com tudo direitinho, técnicos etc.»): o técnico de cada tarefa é o do ofício livre nesses dias:
   sem férias e sem outra obra (antes só se viam as férias). O plano da visita (planoDaVisita.ts) e o da obra usam esta mesma regra. */
/** Os dias (aaaa-mm-dd) em que cada técnico já está noutra obra (os planos dos outros negócios com datas reais e por acabar). */
export function ocupacaoDosTecnicos(S: Pick<Estado, "deals">, exceto?: number): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const d of S.deals ?? []) {
    const p = d.obra?.plano;
    if (d.id === exceto || !p || p.estado === "concluída" || !p.inicio) continue;
    const fim = p.tasks.reduce((a, t) => Math.max(a, t.dia + t.dur), 0);
    if (!fim) continue;
    const ds = diasDaObra(deIso(p.inicio), fim);
    for (const t of p.tasks) {
      if (!t.tec || t.exec?.estado === "validada") continue;
      // 9/11: a equipa vem toda (ou nenhum membro): um membro numa obra ocupa a equipa inteira nesses dias
      const quem = equipaDe(t.tec)?.membros ?? [t.tec];
      for (const id of quem) {
        const s = out.get(id) ?? new Set<string>();
        for (let k = t.dia; k < t.dia + t.dur && k < ds.length; k++) s.add(isoDia(ds[k]));
        out.set(id, s);
      }
    }
  }
  return out;
}

/**
 * Os técnicos das tarefas: o do ofício livre nesses dias, sem férias (as do RH) e sem outra obra (as outras obras e as tarefas deste
 * plano que já têm o técnico nesses dias). Sem nenhum livre, o primeiro do ofício (marcado como ocupado); sem ninguém do ofício, null.
 */
/** 9/11: o que o comercial escolheu no plano (Estúdio, visita, orçamento): o técnico de uma tarefa (pela chave) e a equipa da obra
 *  (os técnicos que se escolhem primeiro em cada ofício). Fica no negócio (f.plano_tecnicos, f.plano_equipa). */
export interface EscolhasEquipa { tecnicos?: Record<string, string>; equipa?: string[]; /** 9/11: as equipas (ids) que vêm a esta obra */ equipas?: string[] }
/** A chave de uma tarefa para as escolhas: a fase e o nome (não muda quando os dias mudam). */
export const chaveTarefa = (t: Pick<Tarefa, "nome" | "fase">) => `${t.fase ?? 0}:${t.nome}`;
/** Os campos do negócio onde as escolhas ficam (o valor vazio apaga). */
export const camposDasEscolhas = (e: EscolhasEquipa): [string, string][] => [
  ["plano_tecnicos", e.tecnicos && Object.keys(e.tecnicos).length ? JSON.stringify(e.tecnicos) : ""],
  ["plano_equipa", e.equipa?.length ? JSON.stringify(e.equipa) : ""],
  ["plano_equipas", e.equipas?.length ? JSON.stringify(e.equipas) : ""],
];
export function escolhasDoNegocio(f: Record<string, string | undefined>): EscolhasEquipa {
  const ler = <T,>(s: string | undefined): T | undefined => { try { return s ? JSON.parse(s) as T : undefined; } catch { return undefined; } };
  return { tecnicos: ler<Record<string, string>>(f.plano_tecnicos), equipa: ler<string[]>(f.plano_equipa), equipas: ler<string[]>(f.plano_equipas) };
}

type Extensao = Pick<Tarefa, "dia" | "dur"> & Partial<Pick<Tarefa, "ini" | "dias">>;
/** 10/11: onde a tarefa está no plano, em dias: o início a meio do dia e a duração reais (frações de dia, do plano do orçamento). Mudada
 *  de dia (adiar, arrastar, uma fase que anda), a tarefa leva a hora do início com ela; com a duração mudada à mão (os dias inteiros já
 *  não batem com a real), contam os dias inteiros. */
export function extensaoTarefa(t: Extensao): [number, number] {
  if (t.ini != null && t.dias != null) {
    const meio = t.ini - Math.floor(t.ini + 1e-9);
    if (Math.max(1, Math.ceil(meio + t.dias - 1e-9)) === t.dur) return [t.dia + meio, t.dia + meio + t.dias];
  }
  return [t.dia, t.dia + t.dur];
}
/** 10/11: duas tarefas ao mesmo tempo (as que só se tocam, uma acaba a meio do dia e a outra começa aí, não se sobrepõem). */
export const sobrepostas = (a: Extensao, b: Extensao) => { const [a0, a1] = extensaoTarefa(a), [b0, b1] = extensaoTarefa(b); return a0 < b1 - 1e-6 && b0 < a1 - 1e-6; };

/** Porque é que um técnico não está livre para uma tarefa (null: livre). */
export function motivoOcupado(tecId: string, t: Extensao, plano: Plano, ocupados: Map<string, Set<string>>, outras: readonly (Extensao & Pick<Tarefa, "tec">)[] = []): string | null {
  const tec = TECS.find((x) => x.id === tecId);
  if (!tec) return null;
  if (diaDeFerias(tec, plano, t.dia, t.dur) != null) return "de férias";
  if (plano.inicio) {
    const ds = diasDaObra(deIso(plano.inicio), t.dia + t.dur);
    const fora = ocupados.get(tecId);
    for (let k = t.dia; k < t.dia + t.dur; k++) if (fora && ds[k] && fora.has(isoDia(ds[k]))) return "noutra obra";
  }
  if (outras.some((o) => o.tec === tecId && sobrepostas(o, t))) return "noutra tarefa desta obra";
  return null;
}

/**
 * Os técnicos das tarefas: o escolhido à mão (se o houver); senão o do ofício livre nesses dias, primeiro os da equipa da obra, sem férias
 * e sem outra obra (as outras obras e as tarefas deste plano que já têm o técnico nesses dias). Sem nenhum livre, o primeiro do ofício
 * (marcado como ocupado); sem ninguém do ofício, null. Devolve os avisos (a tarefa → porque é que o técnico não está livre).
 */
export function escolherTecnicos(plano: Plano, ocupados: Map<string, Set<string>>, escolhas: EscolhasEquipa = {}): Map<Tarefa, string> {
  const avisos = new Map<Tarefa, string>();
  if (!plano.inicio) return avisos;
  const feitas: Tarefa[] = [];
  const equipa = escolhas.equipa ?? [];
  const vem = new Set(escolhas.equipas ?? []);
  // o técnico escolhido à mão que é de uma equipa traz a equipa
  for (const id of Object.values(escolhas.tecnicos ?? {})) { const e = equipaDe(id); if (e) vem.add(e.id); }
  for (const t of [...plano.tasks].sort((a, b) => a.dia - b.dia)) {
    if (t.exec?.estado === "validada") continue;
    const mao = escolhas.tecnicos?.[chaveTarefa(t)];
    if (mao && TECS.some((x) => x.id === mao)) {
      t.tec = mao;
      const m = motivoOcupado(mao, t, plano, ocupados, feitas);
      if (m) avisos.set(t, m);
      feitas.push(t);
      continue;
    }
    // 9/11: os técnicos isolados e os das equipas que já vêm a esta obra (a equipa vem toda, ou nenhum membro); os da equipa primeiro
    const todos = [...tecnicosDoOficio(t)];
    if (!todos.length) { t.tec = null; continue; }
    const podeVir = (id: string) => { const e = equipaDe(id); return !e || vem.has(e.id); };
    const doOficio = todos.filter((x) => podeVir(x.id))
      .sort((a, b) => Number(!(equipa.includes(a.id) || !!equipaDe(a.id))) - Number(!(equipa.includes(b.id) || !!equipaDe(b.id))));
    let livre = doOficio.find((x) => motivoOcupado(x.id, t, plano, ocupados, feitas) == null);
    // ninguém livre: uma equipa que tenha alguém do ofício livre vem toda
    if (!livre) {
      const daEquipa = todos.find((x) => !podeVir(x.id) && motivoOcupado(x.id, t, plano, ocupados, feitas) == null);
      if (daEquipa) { vem.add(equipaDe(daEquipa.id)!.id); livre = daEquipa; }
    }
    const escolhido = livre ?? doOficio[0] ?? todos[0];
    if (equipaDe(escolhido.id)) vem.add(equipaDe(escolhido.id)!.id);
    t.tec = escolhido.id;
    if (!livre) avisos.set(t, motivoOcupado(escolhido.id, t, plano, ocupados, feitas) ?? "ocupado");
    feitas.push(t);
  }
  return avisos;
}

/**
 * 10/11 (Rúben: «queremos certezas»): o plano da obra sem conflitos. A tarefa com o técnico noutra obra ou de férias (e sem outro do ofício
 * livre: escolherTecnicos já o tentou) adia-se até ele estar livre, com as que começam no mesmo dia ou depois (como o «Adiar»). As que
 * as Operações escolheram à mão ficam como estão (com o aviso). Devolve o que adiou (a tarefa e os dias úteis).
 */
export function resolverConflitos(plano: Plano, ocupados: Map<string, Set<string>>, escolhas: EscolhasEquipa = {}): { nome: string; dias: number }[] {
  const feitas: { nome: string; dias: number }[] = [];
  if (!plano.inicio) return feitas;
  const semSaida = new Set<Tarefa>();
  for (let volta = 0; volta < plano.tasks.length * 3; volta++) {
    const t = [...plano.tasks].sort((a, b) => a.dia - b.dia).find((x) => x.tec && !semSaida.has(x) && x.exec?.estado !== "validada"
      && !escolhas.tecnicos?.[chaveTarefa(x)] && motivoOcupado(x.tec, x, plano, ocupados) != null);
    if (!t) break;
    let nd = t.dia;
    while (motivoOcupado(t.tec!, { dia: nd, dur: t.dur }, plano, ocupados) != null && nd < t.dia + 60) nd++;
    if (nd >= t.dia + 60) { semSaida.add(t); continue; }
    const d0 = t.dia, dias = nd - d0;
    for (const x of plano.tasks) if (x === t || (x.dia >= d0 && x.exec?.estado !== "validada")) x.dia += dias;
    feitas.push({ nome: t.nome, dias });
  }
  return feitas;
}

/** 10/11: o plano novo da obra (do orçamento), já sem conflitos de agenda (resolverConflitos). */
export function planoNovoDaObra(d: Negocio, S: Estado): { plano: Plano; adiadas: { nome: string; dias: number }[] } {
  const plano = planoDoOrcamento(d, S);
  const adiadas = plano.inicio ? resolverConflitos(plano, ocupacaoDosTecnicos(S, d.id), escolhasDoNegocio(d.f ?? {})) : [];
  return { plano, adiadas };
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
export const EC_NO_PAGAMENTO = "Emite-se com o pagamento validado, o plano aprovado e o contrato assinado.";

/** O que falta para arrancar a obra (vazio = pode arrancar): o pagamento, a encomenda de cliente, os materiais garantidos no Inventário
 *  (ponteNegocios.ts: faltaMateriais) e o plano aprovado. `db`: o Inventário já lido pelo ecrã (useInventario); sem ele, lê-se aqui. */
export function faltaParaArrancar(d: Negocio, db?: Inventario | null): string[] {
  const p = d.obra.plano, F: string[] = [];
  if (!d.fin.pago) F.push(d.fin.fatura ? "receber o pagamento" : "registar a fatura do ERP e receber o pagamento");
  // 9/11: as medidas, o plano e o contrato antes da encomenda
  else if (!d.obra.ec) {
    if (!retificacaoAceite(d)) F.push("retificar as medidas");
    else if (!planoAprovadoDe(d)) { /* «aprovar o plano» entra no fim, como antes */ }
    else if (!contratoAssinado(d)) F.push("assinar o contrato");
    else F.push("emitir a encomenda de cliente");
  }
  else if (usarProntidao(d.obra.ec)) F.push(...faltaMateriaisReal(prontidaoDe(d.obra.ec.contrato)));
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

/** 10/11 (o fluxo novo de 9/11): porque é que a encomenda de cliente ainda não saiu: o que falta, pela ordem (o pagamento, as medidas,
 *  o plano, o contrato); com tudo pronto e sem encomenda, é porque não chegou ao Inventário (emite-se de novo). */
export function semEncomendaCliente(d: Negocio): string {
  if (!d.fin.pago) return "A encomenda de cliente emite-se quando o pagamento for validado.";
  const direta = !!d.orc?.vendaDireta;
  if (!direta && !retificacaoAceite(d)) return "A encomenda de cliente sai depois das medidas aceites, do plano aprovado e do contrato assinado.";
  if (!direta && !planoAprovadoDe(d)) return "A encomenda de cliente sai com o plano aprovado e o contrato assinado.";
  if (!contratoAssinado(d)) return "A encomenda de cliente sai quando o cliente assinar o contrato.";
  return "A encomenda de cliente não chegou ao Inventário: emita-a de novo no negócio.";
}

/** A frase dos materiais da obra: a encomenda de cliente e o estado dela no Inventário (as obras antigas do exemplo já os têm na obra). */
export function textoMateriais(d: Negocio, r: ResumoEcNeg | null): string {
  if (!d.obra.ec) return semEncomendaCliente(d);
  if (usarProntidao(d.obra.ec)) return textoProntidaoReal(d.obra.ec.n, prontidaoDe(d.obra.ec.contrato));
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
    L.push(d.fin.pago && planoAprovadoDe(d) && contratoAssinado(d)
      ? { id: "ec", trilho: "ec", estado: "agora", who: "financeiro", t: "Emitir a encomenda de cliente", sub: "O pagamento, o plano e o contrato estão prontos mas a encomenda não chegou ao Inventário. Emita-a de novo.", act: "emitirEc", btn: "Emitir no Inventário" }
      : { id: "ec", trilho: "ec", estado: "espera", who: null, t: "Encomenda de cliente", sub: EC_NO_PAGAMENTO });
  } else {
    // 30/10: a da base vem sem valor no negócio: soma-se das linhas (totaisDaEc); sem o documento lido, sem valor
    const nL = linhasDaEc(d, ec).length, { valor } = totaisDaEc(d, ec);
    L.push({ id: "ec", trilho: "ec", estado: "feito", who: ec.ref ? "financeiro" : null, t: `Encomenda de cliente ${ec.n}`,
      sub: `${ec.ref ? `Emitida ao validar o pagamento${ec.emitida ? ` · ${ec.emitida.q}` : ""}` : `De ${ec.criada}`} · ${nL} ${nL === 1 ? "linha" : "linhas"}${ec.contrato && !valor ? "" : ` · ${eur(valor)} € na proposta`}` });
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
  // 9/11: o primeiro passo da Obra é o supervisor retificar as medidas no local; o plano aprova-se depois delas aceites
  if (!d.orc?.vendaDireta) L.push(retificacaoAceite(d)
    ? { id: "ret", trilho: "plano", estado: "feito", who: "operacoes", t: "Medidas retificadas e aceites", sub: d.f.retif_aceite ? `A ${d.f.retif_aceite.split("-").reverse().join("/")}${d.f.retif_por ? `, por ${d.f.retif_por}` : ""}.` : "" }
    : { id: "ret", trilho: "plano", estado: d.fin.pago ? "agora" : "espera", who: "operacoes", t: "Retificar as medidas", sub: d.fin.pago ? "O supervisor confirma as medidas no local." : SO_DEPOIS_DO_PAGAMENTO, act: d.fin.pago ? "abrirRetificacao" : undefined, btn: "Retificar as medidas" });
  L.push(p.estado === "por aprovar" && !d.fin.pago
    ? { id: "pl-ok", trilho: "plano", estado: "espera", who: "operacoes", t: "Aprovar o plano", sub: SO_DEPOIS_DO_PAGAMENTO }
    : p.estado === "por aprovar" && !retificacaoAceite(d)
    ? { id: "pl-ok", trilho: "plano", estado: "espera", who: "operacoes", t: "Aprovar o plano", sub: "Depois de as medidas serem retificadas e aceites." }
    : p.estado === "por aprovar"
    ? { id: "pl-ok", trilho: "plano", estado: "agora", who: "operacoes", t: nc ? "Resolver o conflito e aprovar o plano" : "Aprovar o plano", sub: nc ? `${nc} ${nc === 1 ? "técnico de férias" : "técnicos de férias"} numa tarefa.` : "Os técnicos recebem as tarefas na app.", act: "aprovarPlano", btn: "Aprovar o plano" }
    : { id: "pl-ok", trilho: "plano", estado: "feito", who: "operacoes", t: "Plano aprovado", sub: "Técnicos avisados." });
  // 9/11: o contrato assina-se com o plano aprovado (as medidas e as datas certas), antes da encomenda
  if (!d.orc?.vendaDireta) {
    const c = d.orc?.contrato;
    L.push(c === "assinado"
      ? { id: "ct", trilho: "plano", estado: "feito", who: "comercial", t: "Contrato assinado", sub: "" }
      : !planoAprovadoDe(d)
      ? { id: "ct", trilho: "plano", estado: "espera", who: "comercial", t: "Contrato", sub: "Depois de o plano ser aprovado." }
      : c === "enviado"
      ? { id: "ct", trilho: "plano", estado: "espera", who: null, t: "À espera da assinatura do contrato", sub: "No portal do cliente." }
      : { id: "ct", trilho: "plano", estado: "agora", who: "comercial", t: "Gerar e enviar o contrato", sub: "Com o plano aprovado: vai ao portal do cliente, por assinar.", act: "enviarContrato", btn: "Gerar o contrato" });
  }

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
