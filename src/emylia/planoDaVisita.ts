// 9/11 (Rúben: «depois do Estúdio, no passo de escolha dos serviços, gerar logo o plano da obra com tudo direitinho, técnicos etc., para
// seguir o fluxo já com o mapa de datas»; «ligar ao Estúdio o catálogo de serviços, com os materiais, os consumíveis e os técnicos»).
// O plano da obra já na visita: é o MESMO que a obra vai ter. O orçamento nasce da visita (criarOrc) e o plano da obra nasce do orçamento
// (planoDoOrcamento): aqui faz-se o mesmo caminho, antes do tempo, com o dia de início escolhido. Cada tarefa leva o ofício (o perfil da
// receita do serviço no Catálogo), o técnico do RH desse ofício que está livre nesses dias (sem férias e sem outra obra marcada), os
// materiais e consumíveis da receita e as datas, só em dias úteis (sem fins de semana nem feriados).
// O dia de início fica no negócio (f.plano_inicio) e passa ao orçamento quando a visita fecha (inicioObra): o fluxo segue com estas datas.
// Funções puras, sem React.
import { TECS, criarOrc, custoUnLinha, garantirServico, ligarDemolicao, r2, sincronizarDemolicao, sincronizarEfeitos, temModeloDeObra, type Estado, type LinhaOrc, type Negocio, type Orcamento, type Plano, type SvcId } from "./motor";
import { custosDe, receitaDe } from "./v2/custosModelo";
import { deIso, diasDaObra, isoDia, proximoUtil } from "./planoObra";
import { chaveTarefa, escolherTecnicos, escolhasDoNegocio, ocupacaoDosTecnicos, planoDoOrcamento } from "./preparacaoObra";
export { escolherTecnicos, ocupacaoDosTecnicos } from "./preparacaoObra";
import { FASES_OBRA } from "./fasesObra";
import { equipaDe, type EquipaObra } from "./equipa/equipasObra";
import type { FaseObra } from "./fasesObra";

/** Um material ou consumível da receita, para a quantidade do serviço. */
/** `porUn`: a quantidade por unidade do serviço (a da receita), para mostrar a conta. */
export interface MaterialPlano { n: string; q: number; un: string; porUn: number }

/** Uma tarefa do plano, em datas: quem a faz, quando e com quê. */
export interface TarefaDatas {
  /** A chave para as escolhas (a fase e o nome): preparacaoObra.chaveTarefa. */
  chave: string;
  /** O técnico foi escolhido à mão. */
  aMao?: boolean;
  nome: string;
  fase: FaseObra;
  /** O ofício (o perfil do Catálogo: «Canalizador», «Ladrilhador»…). */
  oficio: string;
  /** O técnico do RH (id) e o nome; null: o RH não tem ninguém desse ofício livre (fica por atribuir). */
  tec: string | null;
  tecNome: string;
  /** O técnico tem férias ou outra obra num destes dias (não havia outro do ofício livre). */
  ocupado?: string;
  /** Dias úteis desde o início (0 = o primeiro) e a duração, em dias úteis. */
  dia: number;
  dur: number;
  h: number;
  inicio: Date;
  fim: Date;
  materiais: MaterialPlano[];
  /** A medida do serviço que conta para as horas e os materiais (ex.: 22,5 m²). */
  qtd?: { q: number; un: string };
  /** 9/11 (Rúben: «o que faz nos pontos elétricos?»): o que o técnico faz, os passos da receita do serviço, com as horas desta obra. */
  passos: { n: string; oficio: string; h: number }[];
}

export interface PlanoDatas {
  tarefas: TarefaDatas[];
  /** Os dias úteis da obra, a data do primeiro e do último. */
  dias: number;
  inicio: Date | null;
  fim: Date | null;
  /** As tarefas sem técnico (o RH não tem ninguém do ofício). */
  porAtribuir: number;
  /** As pessoas da obra, sem repetir, pela ordem em que entram (as das equipas que vêm, todas). */
  equipa: { id: string; n: string; oficio: string; equipa?: string }[];
  /** 9/11: as equipas que vêm a esta obra (vêm todas as pessoas delas). */
  equipas: EquipaObra[];
  /** O plano como o motor o guarda (para comparar com o da obra). */
  plano: Plano;
  /** O orçamento de onde saiu (o que a visita gera ao fechar), com o dia de início. */
  orc: Orcamento | null;
}

const INTEIRAS = /^(un|uni|unid|unidade|unidades|cx|caixa|saco|sacos|rolo|rolos|lata|latas|balde|baldes|pç|pc|pcs)$/i;

/** Os materiais e consumíveis da receita do serviço no Catálogo, para `q` unidades (os opcionais não entram). */
export function materiaisDaReceita(S: Estado, sid: SvcId, q: number): MaterialPlano[] {
  const R = receitaDe(custosDe(S), sid, S.svc[sid], S.cfg.alvo);
  return (R?.cons ?? []).filter((c) => !c.opcional && c.q > 0).map((c) => {
    const x = c.q * q;
    return { n: c.n, q: INTEIRAS.test(c.un) ? Math.max(1, Math.ceil(x - 1e-9)) : r2(x), un: c.un, porUn: c.q };
  });
}

/** Os passos da mão de obra da receita (o que se faz, o ofício e as horas por unidade), para mostrar o serviço do Catálogo. */
export function passosDaReceita(S: Estado, sid: SvcId): { n: string; oficio: string; h: number }[] {
  const C = custosDe(S), R = receitaDe(C, sid, S.svc[sid], S.cfg.alvo);
  return (R?.mo ?? []).filter((m) => m.h > 0).map((m) => ({ n: m.n, oficio: C.perfis.find((p) => p.id === m.perfil)?.n ?? m.perfil, h: m.h }));
}


/** Os passos da receita de uma tarefa, com as horas para a quantidade do serviço; numa parte de um «MO Modelo», só os do seu ofício. */
export function passosDaTarefa(S: Estado, sid: SvcId | undefined, q: number, oficio: string, parte: boolean): TarefaDatas["passos"] {
  if (!sid || !(q > 0)) return [];
  const ps = passosDaReceita(S, sid);
  const meus = parte ? ps.filter((x) => x.oficio === oficio) : ps;
  return (meus.length ? meus : ps).map((x) => ({ n: x.n, oficio: x.oficio, h: r2(x.h * q) }));
}

/** O plano em datas a partir de um negócio que já tem o orçamento (o da visita, ou um feito das linhas do Estúdio). */
export function planoEmDatas(d: Negocio, S: Estado, inicioIso: string): PlanoDatas {
  const inicio = isoDia(proximoUtil(deIso(inicioIso)));
  const dx = { ...d, orc: d.orc ? { ...d.orc, inicioObra: inicio } : null } as Negocio;
  const plano = planoDoOrcamento(dx, S);
  plano.inicio = inicio;
  const escolhas = escolhasDoNegocio(dx.f ?? {});
  const avisos = escolherTecnicos(plano, ocupacaoDosTecnicos(S, d.id), escolhas);
  const fimDias = plano.tasks.reduce((a, t) => Math.max(a, t.dia + t.dur), 0);
  const ds = diasDaObra(deIso(inicio), Math.max(1, fimDias));
  const tarefas: TarefaDatas[] = plano.tasks.map((t) => {
    const sid = t.svcs[0];
    const l = sid ? dx.orc?.linhas.find((x) => x.t === "svc" && x.sid === sid) : undefined;
    // as partes de um «MO Modelo» repartem os materiais pelas horas (as horas da parte sobre as horas do serviço)
    const s = sid ? S.svc[sid] : undefined;
    const q = l && l.t === "svc" ? (s && s.h > 0 && plano.tasks.filter((x) => x.svcs[0] === sid).length > 1 ? t.h / s.h : l.q) : 0;
    const tec = t.tec ? TECS.find((x) => x.id === t.tec) : undefined;
    return {
      chave: chaveTarefa(t), ...(escolhas.tecnicos?.[chaveTarefa(t)] ? { aMao: true } : {}),
      nome: t.nome, fase: (t.fase ?? 1) as FaseObra, oficio: t.sk || "Por definir", tec: t.tec, tecNome: tec?.n ?? "Por atribuir",
      ...(avisos.has(t) ? { ocupado: avisos.get(t) } : {}),
      dia: t.dia, dur: t.dur, h: t.h, inicio: ds[t.dia] ?? ds[0], fim: ds[Math.min(ds.length - 1, t.dia + t.dur - 1)] ?? ds[0],
      materiais: sid && q > 0 ? materiaisDaReceita(S, sid, q) : [],
      passos: passosDaTarefa(S, sid, l && l.t === "svc" ? l.q : 0, t.sk, plano.tasks.filter((x) => x.svcs[0] === sid).length > 1),
      ...(sid && q > 0 && s ? { qtd: { q: r2(q), un: s.un } } : {}),
    };
  });
  const equipa: PlanoDatas["equipa"] = [];
  const equipas: EquipaObra[] = [];
  for (const t of tarefas) {
    if (!t.tec || equipa.some((x) => x.id === t.tec)) continue;
    const e = equipaDe(t.tec);
    if (!e) { equipa.push({ id: t.tec, n: t.tecNome, oficio: t.oficio }); continue; }
    if (equipas.some((x) => x.id === e.id)) continue;
    equipas.push(e);
    // a equipa vem toda: também os membros sem tarefas nesta obra
    for (const m of e.membros) { const tec = TECS.find((x) => x.id === m); if (tec && !equipa.some((x) => x.id === m)) equipa.push({ id: m, n: tec.n, oficio: tec.sk, equipa: e.nome }); }
  }
  return {
    tarefas, dias: fimDias, inicio: tarefas.length ? ds[0] : null, fim: tarefas.length ? ds[Math.max(0, fimDias - 1)] : null,
    porAtribuir: tarefas.filter((t) => !t.tec).length, equipa, equipas, plano, orc: dx.orc,
  };
}

/** O plano da obra de um negócio na visita: o orçamento que a visita vai dar (criarOrc, sem mexer no negócio) e o plano dele. */
export function planoDaVisita(d: Negocio, S: Estado, inicioIso: string): PlanoDatas {
  // os mesmos passos de quando a visita fecha (motor: fecharVisita), numa cópia: o orçamento, a demolição e os efeitos da ficha do local
  const dc = structuredClone(d) as Negocio;
  const orc = criarOrc(dc, S);
  if (!temModeloDeObra(orc)) ligarDemolicao(orc);
  dc.orc = orc;
  sincronizarEfeitos(dc, S); sincronizarDemolicao(dc, S);
  return planoEmDatas(dc, S, inicioIso);
}

/** Um serviço do Catálogo escolhido no Estúdio, com a quantidade. */
export interface ServicoEscolhido { sid: SvcId; q: number }

/** O plano da obra das linhas do Estúdio (os serviços do Catálogo, sem o negócio): um orçamento só com esses serviços. */
export function planoDoEstudio(servicos: readonly ServicoEscolhido[], S: Estado, inicioIso: string, negocio?: number, escolhas?: { tecnicos?: Record<string, string>; equipa?: string[]; equipas?: string[] }): PlanoDatas {
  const linhas: LinhaOrc[] = [];
  for (const x of servicos) {
    const s = garantirServico(S, x.sid);
    if (s && x.q > 0) linhas.push({ t: "svc", sid: x.sid, q: x.q, cu: custoUnLinha(s, S), pu: s.preco, ...(s.iva === 23 ? { iva: 23 as const } : {}) });
  }
  const orc: Orcamento = { modelo: "", linhas, desconto: 0, vendaDireta: false, verif: false, aprov: null, enviada: null, aceite: null, contrato: null, avisosVistos: {} } as Orcamento;
  const f: Record<string, string> = {};
  if (escolhas?.tecnicos) f.plano_tecnicos = JSON.stringify(escolhas.tecnicos);
  if (escolhas?.equipa) f.plano_equipa = JSON.stringify(escolhas.equipa);
  if (escolhas?.equipas) f.plano_equipas = JSON.stringify(escolhas.equipas);
  const d = { id: negocio ?? -1, f, orc, obra: { plano: null } } as unknown as Negocio;
  return planoEmDatas(d, S, inicioIso);
}

/** O nome da fase (curto) para os cabeçalhos do mapa de datas. */
export const nomeFaseCurto = (f: FaseObra) => FASES_OBRA[f - 1]?.curto ?? `Fase ${f}`;

/** O plano para guardar no negócio (f.plano_estimado): as tarefas com o técnico e as datas. */
export const planoParaGuardar = (P: PlanoDatas) => JSON.stringify(P.tarefas.map((t) => ({
  n: t.nome, fase: t.fase, oficio: t.oficio, tec: t.tec, tecNome: t.tecNome, dias: t.dur, inicio: isoDia(t.inicio), fim: isoDia(t.fim),
})));
