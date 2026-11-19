// 19/11/2026 (auditoria, lote 2 da obra): os sítios onde a obra ficava presa no motor do browser.
//  1. as medidas aceites vêm antes do plano (o atalho da encomenda de cliente só nos negócios antigos);
//  2. sem a permissão das encomendas, o arranque diz isso em vez de ficar «a ler»;
//  3. as parcelas «a meio da obra» (30-40-30, «Por fases») só caem com a fase delas feita ou passada;
//  4. quem vai medir é uma pessoa do RH, com o passo no Hoje dela, e fica quem aceitou;
//  5. «Faltou material» e «O cliente pediu uma alteração» no Hoje do técnico são ações.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { esquecerInventario } from "./inventario/loja";
import { TECS, acoes, definirPessoaLigada, minhas, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { aprovarPos, receberTudo } from "./testeObra";
import {
  MEDIDAS_ANTES_DO_PLANO, SO_DEPOIS_DAS_MEDIDAS, diaDaData, ecDoFluxoAntigo, faltaParaArrancar, medicoesDe, passosPreparacao, retificacaoAceite, textoMateriais,
} from "./preparacaoObra";
import { devidaNoMomento, faseAcabou, fimDaFase, momentoDe, parcelasDoContrato } from "./parcelas";
import { PAGAMENTO_50_25_25, PAGAMENTO_FASES, prestacoes } from "./planoObra";
import { SEM_PERMISSAO_MATERIAIS, erroDePermissao, falhaProntidao, lerProntidoes, limparFalhasProntidao } from "./real/inventarioReal";
import { limparProntidoes } from "./inventario/prontidaoReal";
import { obraDaEc } from "./real/negocioReal";
import { avisosPorVer } from "./tarefasValidador";
import { verPainelPedido, tomarPainelObra } from "./estudioObra/painelPedido";

type Ac = ReturnType<typeof acoes>;
const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
const SUP = () => TECS[0].id;
/** 1027 (contrato assinado), com o pagamento validado: as medidas e o plano por fazer. */
function pago(pagamento?: string) {
  esquecerInventario();
  const S = seed(), avisos: { msg: string; sub?: string }[] = [];
  const A = acoes(S, (a) => avisos.push({ msg: a.msg, sub: a.sub }), (fn) => fn());
  const d = S.deals.find((x) => x.id === 1027)!;
  if (pagamento) d.f.pagamento = pagamento;
  preencher(d, FINANCEIRO); preencher(d, [OBRA[0]]);
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
  A.role("operacoes");
  return { S, A, d, avisos };
}
/** Pronta a arrancar: quem mede escolhido, medidas aceites, plano aprovado, materiais no armazém. */
function prontaAArrancar(pagamento?: string) {
  const r = pago(pagamento);
  r.A.supervisorMedidas(r.d.id, SUP());
  r.A.retificarMedidas(r.d.id);
  r.A.aprovarPlano(r.d.id);
  expect(r.d.obra.plano!.estado).toBe("aprovado");
  expect(aprovarPos("CT 2026/1027")).toBe("");
  expect(receberTudo("CT 2026/1027")).toBe("");
  return r;
}
/** Arranca a obra hoje (como com o relógio real: arrancarHoje), para as datas das fases ficarem à frente. */
const emCurso = <T extends { A: Ac; d: Negocio }>(r: T): T => {
  r.A.arrancar(r.d.id);
  expect(r.d.obra.plano!.estado).toBe("em curso");
  const h = new Date(); r.d.obra.plano!.inicio = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
  return r;
};
const feitas = (d: Negocio, fase: (f: number | undefined) => boolean) => { for (const t of d.obra.plano!.tasks) if (fase(t.fase)) t.exec = { estado: "feita" } as never; };

afterEach(() => { definirPessoaLigada(null); limparProntidoes(); limparFalhasProntidao(); tomarPainelObra(1022); tomarPainelObra(1027); });

/* ------------------------------------------------------------------ 1 */
describe("1. as medidas aceites vêm antes do plano", () => {
  it("com o pagamento validado, o plano não se aprova sem as medidas e diz o que falta", () => {
    const { A, d, avisos, S } = pago();
    A.aprovarPlano(d.id);
    expect(d.obra.plano!.estado).toBe("por aprovar");
    expect(avisos.at(-1)).toMatchObject({ msg: "Primeiro, as medidas" });
    expect(avisos.at(-1)!.sub).toMatch(/escolher quem vai medir/);
    // o passo do plano espera; o das medidas é a vez do gestor (escolher quem mede)
    const P = passosPreparacao(d, S);
    expect(P.find((x) => x.id === "pl-ok")).toMatchObject({ estado: "espera", sub: SO_DEPOIS_DAS_MEDIDAS });
    expect(P.find((x) => x.id === "ret")).toMatchObject({ estado: "agora", t: "Escolher quem vai medir", act: "abrirRetificacao" });
    const acts = minhas(S, "operacoes").filter((x) => x.d.id === d.id).map((x) => x.p.act);
    expect(acts).toContain("abrirRetificacao");
    expect(acts).not.toContain("aprovarPlano");
    // com quem mede escolhido, o aviso diz quem
    A.supervisorMedidas(d.id, SUP());
    A.aprovarPlano(d.id);
    expect(avisos.at(-1)!.sub).toContain(`Falta ${TECS[0].n} medir no local`);
  });

  it("com as medidas aceites, aprova-se e sai a encomenda de cliente", () => {
    const { A, d } = pago();
    A.supervisorMedidas(d.id, SUP());
    A.retificarMedidas(d.id);
    A.aprovarPlano(d.id);
    expect(d.obra.plano!.estado).toBe("aprovado");
    expect(d.obra.ec?.ref).toBeTruthy();
    expect(retificacaoAceite(d)).toBe(true);
  });

  it("a encomenda de cliente do fluxo novo não dá as medidas como aceites; a do fluxo antigo sim", () => {
    const { d } = pago();
    expect(retificacaoAceite(d)).toBe(false);
    // emitida agora no protótipo («hoje …»): fluxo novo
    d.obra.ec = { n: "EC-1027", estado: "emitida", criada: "hoje 10:00", linhas: [], valor: 0, custo: 0, ref: "CT 2026/1027", emitida: { por: "Sandra", q: "hoje 10:00" } };
    expect(ecDoFluxoAntigo(d)).toBe(false);
    expect(retificacaoAceite(d)).toBe(false);
    // as obras antigas do exemplo (sem origem no Inventário): fluxo antigo
    d.obra.ec = { n: "EC 2026/001", estado: "emitida", criada: "17/09", linhas: [], valor: 0, custo: 0 };
    expect(retificacaoAceite(d)).toBe(true);
    // a da base: emitida antes de 19/11 é do fluxo antigo; depois, não
    d.obra.ec = obraDaEc({ contract_id: "c-1", order_number: "EC-1", emitida_em: "2026-11-10T09:00:00", emitida_por: "Sandra" }).ec!;
    expect(retificacaoAceite(d)).toBe(true);
    d.obra.ec = obraDaEc({ contract_id: "c-2", order_number: "EC-2", emitida_em: "2026-11-25T09:00:00", emitida_por: "Sandra" }).ec!;
    expect(retificacaoAceite(d)).toBe(false);
    d.obra.ec = obraDaEc({ contract_id: "c-3", order_number: "EC-3", emitida_em: "2027-01-05T09:00:00", emitida_por: "Sandra" }).ec!;
    expect(retificacaoAceite(d)).toBe(false);
  });

  it("as datas: com ano, sem ano (setembro a dezembro de 2026, o resto de 2027) e «hoje»", () => {
    expect(MEDIDAS_ANTES_DO_PLANO).toBe("2026-11-19");
    expect(diaDaData("2026-11-18T23:00:00")).toBe("2026-11-18");
    expect(diaDaData("18/11 10:00")).toBe("2026-11-18");
    expect(diaDaData("ter 14/10 11:20")).toBe("2026-10-14");
    expect(diaDaData("05/01 09:00")).toBe("2027-01-05");
    expect(diaDaData("hoje 10:00")).toBeNull();
    expect(diaDaData("")).toBeNull();
  });

  it("um plano aprovado antes das medidas (de antes de 19/11): aceites, a encomenda que esperava por elas sai", () => {
    const { A, d } = pago();
    d.obra.plano!.estado = "aprovado"; // como ficava antes desta regra
    expect(d.obra.ec).toBeFalsy();
    A.supervisorMedidas(d.id, SUP());
    A.retificarMedidas(d.id);
    expect(d.obra.ec?.ref).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ 2 */
describe("2. sem a permissão das encomendas, o arranque não fica «a ler»", () => {
  const sbCom = (resposta: { data: unknown; error: unknown }) => ({ rpc: async () => resposta }) as unknown as SupabaseClient;
  const comEcReal = () => {
    const S = seed();
    const d = S.deals.find((x) => x.fin.pago && x.obra.plano)!;
    d.obra.ec = obraDaEc({ contract_id: "c-9", order_number: "EC-9", emitida_em: null, emitida_por: null }).ec!;
    return { S, d };
  };
  beforeEach(() => { limparProntidoes(); limparFalhasProntidao(); });

  it("o erro de permissão fica guardado e o passo diz a quem pedir", async () => {
    const { d, S } = comEcReal();
    expect(faltaParaArrancar(d).join(" ")).toContain("(a ler)");
    await lerProntidoes(sbCom({ data: null, error: { code: "42501", hint: "no_permission", message: "Sem permissão para esta operação (client_orders.view)" } }), "org", ["c-9"]);
    expect(falhaProntidao("c-9")).toBe("sem-permissao");
    const F = faltaParaArrancar(d).join(" ");
    expect(F).not.toContain("(a ler)");
    expect(F).toContain("peça a permissão Encomendas de cliente ao administrador");
    expect(textoMateriais(d, null, S)).toContain(SEM_PERMISSAO_MATERIAIS);
  });

  it("outro erro diz que a leitura falhou; uma leitura boa a seguir apaga a falha", async () => {
    const { d } = comEcReal();
    await lerProntidoes(sbCom({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }), "org", ["c-9"]);
    expect(falhaProntidao("c-9")).toBe("erro");
    expect(faltaParaArrancar(d).join(" ")).toContain("a leitura falhou");
    await lerProntidoes(sbCom({ data: [{ contract_id: "c-9", units_in_stock_reserved: 6, units_on_po: 0, units_missing: 0, units_needed: 6 }], error: null }), "org", ["c-9"]);
    expect(falhaProntidao("c-9")).toBeUndefined();
    expect(faltaParaArrancar(d).some((x) => /permissão|falhou|a ler/.test(x))).toBe(false);
  });

  it("reconhece o erro de permissão da base", () => {
    expect(erroDePermissao({ code: "42501" })).toBe(true);
    expect(erroDePermissao({ hint: "no_permission" })).toBe(true);
    expect(erroDePermissao({ message: "Sem permissão para esta operação (client_orders.view)" })).toBe(true);
    expect(erroDePermissao({ code: "57014", message: "timeout" })).toBe(false);
    expect(erroDePermissao(null)).toBe(false);
  });
});

/* ------------------------------------------------------------------ 3 */
describe("3. as parcelas «a meio da obra» só caem com a fase delas", () => {
  beforeEach(() => esquecerInventario());

  it("30% + 40% + 30%: a do meio não cai no arranque; cai com as tarefas da fase 2 feitas", () => {
    const r = emCurso(prontaAArrancar("30% + 40% + 30%"));
    const { S, d } = r;
    const meio = () => parcelasDoContrato(S, d)[1];
    expect(meio()).toMatchObject({ momento: "obra", devida: false });
    expect(minhas(S, "financeiro").some((x) => x.d.id === d.id && /parcela/i.test(x.p.t) && /40/.test(x.p.t))).toBe(false);
    // a fase 2 feita no plano (ou, sem tarefas na fase 2, as anteriores)
    const temFase2 = d.obra.plano!.tasks.some((t) => t.fase === 2);
    feitas(d, (f) => (temFase2 ? f === 2 : f != null && f < 2));
    expect(meio().devida).toBe(true);
    // a final continua à espera do fim
    expect(parcelasDoContrato(S, d)[2]).toMatchObject({ momento: "fim", devida: false });
  });

  it("30% + 40% + 30%: passada a data do fim da fase 2, cai mesmo sem as tarefas feitas", () => {
    const { d } = emCurso(prontaAArrancar("30% + 40% + 30%"));
    const fim = fimDaFase(d, 2);
    expect(fim).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(devidaNoMomento(d, "obra", 2, fim!)).toBe(false);
    const depois = new Date(fim! + "T12:00:00"); depois.setDate(depois.getDate() + 1);
    const dia = `${depois.getFullYear()}-${String(depois.getMonth() + 1).padStart(2, "0")}-${String(depois.getDate()).padStart(2, "0")}`;
    expect(devidaNoMomento(d, "obra", 2, dia)).toBe(true);
    expect(faseAcabou(d, 2, "2000-01-01")).toBe(false);
  });

  it("«Por fases»: cada parcela cai com a fase dela, uma de cada vez", () => {
    const r = pago(PAGAMENTO_FASES);
    r.d.orc!.pagFases = [
      { l: "Na adjudicação", p: 0.3, fase: 0 }, { l: "No fim da fase 1", p: 0.3, fase: 1 },
      { l: "No fim da fase 3", p: 0.2, fase: 3 }, { l: "No fim da obra", p: 0.2, fase: "fim" },
    ];
    r.A.supervisorMedidas(r.d.id, SUP()); r.A.retificarMedidas(r.d.id); r.A.aprovarPlano(r.d.id);
    expect(aprovarPos("CT 2026/1027")).toBe(""); expect(receberTudo("CT 2026/1027")).toBe("");
    emCurso(r);
    const { S, d } = r;
    const P = () => parcelasDoContrato(S, d);
    expect(P().map((x) => x.momento)).toEqual(["inicio", "obra", "obra", "fim"]);
    expect(P().map((x) => x.devida)).toEqual([true, false, false, false]);
    feitas(d, (f) => f === 1);
    expect(P().map((x) => x.devida)).toEqual([true, true, false, false]);
    feitas(d, (f) => f != null && f <= 3);
    expect(P()[2].devida).toBe(true);
  });

  it("o 100%, o 50-50 e o 50-25-25 continuam iguais", () => {
    const m = (pg: string) => prestacoes(pg).map((_, i, L) => momentoDe(L, i));
    expect(m("100% na adjudicação")).toEqual(["inicio"]);
    expect(m("50% + 50% no fim")).toEqual(["inicio", "fim"]);
    expect(m(PAGAMENTO_50_25_25)).toEqual(["inicio", "arranque", "fim"]);
    const r = prontaAArrancar(PAGAMENTO_50_25_25);
    expect(parcelasDoContrato(r.S, r.d).map((x) => x.devida)).toEqual([true, false, false]);
    r.A.arrancar(r.d.id); // manda a do arranque ao Financeiro
    expect(r.d.obra.plano!.estado).toBe("aprovado");
    expect(parcelasDoContrato(r.S, r.d).map((x) => x.devida)).toEqual([true, true, false]);
  });
});

/* ------------------------------------------------------------------ 4 */
describe("4. quem vai medir é uma pessoa, avisada no Hoje dela", () => {
  it("escolher quem mede grava a pessoa (não o «Responsável de obra»), avisa-a e dá-lhe o passo «Medir no local»", () => {
    const { A, d, S } = pago();
    const resp = d.f.responsavel;
    A.supervisorMedidas(d.id, SUP());
    expect(d.f.supervisor_medidas).toBe(SUP());
    expect(d.f.responsavel).toBe(resp);
    expect(avisosPorVer(d.obra.plano!, SUP()).map((x) => x.a.t).join(" ")).toContain("Medir no local");
    expect(medicoesDe(S.deals, SUP()).map((x) => x.id)).toEqual([d.id]);
    expect(passosPreparacao(d, S).find((x) => x.id === "ret")?.t).toBe(`Medir no local · ${TECS[0].n}`);
    // aceites, sai do Hoje dela
    A.retificarMedidas(d.id);
    expect(medicoesDe(S.deals, SUP())).toEqual([]);
  });

  it("aceitar as medidas exige quem vai medir", () => {
    const { A, d, avisos } = pago();
    A.retificarMedidas(d.id);
    expect(d.f.retif_aceite).toBeFalsy();
    expect(avisos.at(-1)?.msg).toBe("Falta escolher quem vai medir");
  });

  it("fica quem aceitou (a pessoa, não o papel)", () => {
    const a = pago();
    a.A.supervisorMedidas(a.d.id, SUP()); a.A.retificarMedidas(a.d.id);
    expect(a.d.f.retif_por).toBe("Filipe Rocha");
    expect(a.d.f.retif_por).not.toMatch(/Operações/);
    // numa conta real: a pessoa da conta
    const b = pago();
    definirPessoaLigada({ id: "p-77", nome: "Ana Supervisora" });
    b.A.supervisorMedidas(b.d.id, SUP()); b.A.retificarMedidas(b.d.id);
    expect(b.d.f.retif_por).toBe("Ana Supervisora");
    expect(b.d.f.retif_por_id).toBe("p-77");
    expect(b.d.hist[0].t).toContain("aceites por Ana Supervisora");
  });

  it("só quem planeia a obra escolhe quem mede; uma pessoa fora da lista não", () => {
    const { A, d, S } = pago();
    S.role = "comercial";
    A.supervisorMedidas(d.id, SUP());
    expect(d.f.supervisor_medidas).toBeFalsy();
    S.role = "operacoes";
    A.supervisorMedidas(d.id, "nao-existe");
    expect(d.f.supervisor_medidas).toBeFalsy();
  });
});

/* ------------------------------------------------------------------ 5 */
describe("5. «Faltou material» e «O cliente pediu uma alteração» são ações", () => {
  /** 1022: a obra em curso do exemplo; a tarefa de hoje e o técnico dela. */
  function obra() {
    const S: Estado = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1022)!;
    const p = d.obra.plano!;
    const ti = p.tasks.findIndex((t) => !t.exec && t.tec);
    S.role = "tecnico"; S.tec = p.tasks[ti].tec!;
    return { S, A, d, ti };
  }

  it("«Faltou material»: um imprevisto de material da tarefa, que o gestor vê no Hoje dele (e o cliente não)", () => {
    const { S, A, d, ti } = obra();
    const alt = (d.obra.alteracoes ?? []).length;
    const id = A.registarImprevisto(d.id, { texto: "Faltam 2 caixas de cola", onde: "", grav: "impede", tarefas: [ti], tipo: "material" });
    expect(id).toBeTruthy();
    const im = d.obra.imprevistos!.find((x) => x.id === id)!;
    expect(im).toMatchObject({ tipo: "material", estado: "aberto", grav: "impede", tarefas: [d.obra.plano!.tasks[ti].nome] });
    expect((d.obra.alteracoes ?? []).length).toBe(alt);
    const doGestor = minhas(S, "operacoes").filter((x) => x.d.id === d.id).map((x) => x.p.t);
    expect(doGestor.some((t) => t.startsWith("Faltou material · "))).toBe(true);
    // o gestor resolve: o material chegou; o cliente não é avisado
    S.role = "operacoes";
    A.decidirImprevisto(d.id, id!, "seguir", "material encomendado");
    expect(im.estado).toBe("fechado");
    expect(im.decisao).toMatch(/^Material resolvido/);
    expect((d.obra.alteracoes ?? []).length).toBe(alt);
  });

  it("«O cliente pediu uma alteração» do técnico vai ao Hoje do gestor; abri-lo abre a tarefa no Estúdio da obra", () => {
    const { S, A, d, ti } = obra();
    const pid = A.pedidoDoCliente(d.id, ti, "Quer o nicho 20 cm mais largo");
    expect(pid).toBe(`PC-${d.id}-1`);
    const e = d.obra.diario!.at(-1)!;
    expect(e).toMatchObject({ k: "ocorrencia", pedido: { id: pid, tarefa: d.obra.plano!.tasks[ti].nome, texto: "Quer o nicho 20 cm mais largo" } });
    const item = minhas(S, "operacoes").find((x) => x.d.id === d.id && x.p.act === "abrirPedidoCliente");
    expect(item?.p).toMatchObject({ t: `O cliente pediu uma alteração · ${d.obra.plano!.tasks[ti].nome}`, arg: pid, btn: "Abrir a tarefa" });
    S.role = "operacoes";
    A.abrirPedidoCliente(d.id, pid!);
    expect(e.pedido!.tratado).toBeTruthy();
    expect(S.view).toBe("operacoes");
    expect(S.op).toBe(d.id);
    expect(verPainelPedido()).toEqual({ obra: d.id, painel: `tarefa-${ti}` });
    expect(minhas(S, "operacoes").some((x) => x.d.id === d.id && x.p.act === "abrirPedidoCliente")).toBe(false);
  });

  it("quem planeia a obra abre logo a tarefa no Estúdio (sem pedido); sem texto, o técnico não envia", () => {
    const { S, A, d, ti } = obra();
    expect(A.pedidoDoCliente(d.id, ti, "  ")).toBeNull();
    S.role = "operacoes";
    expect(A.pedidoDoCliente(d.id, ti, "")).toBe("");
    expect(S.op).toBe(d.id);
    expect(verPainelPedido()?.painel).toBe(`tarefa-${ti}`);
    expect((d.obra.diario ?? []).some((x) => x.pedido)).toBe(false);
  });
});
