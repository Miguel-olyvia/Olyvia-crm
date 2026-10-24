import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esquecerInventario, executar, lerInventario, lerPedidoEcInv } from "./inventario/loja";
import { enviarPo } from "./inventario/po";
import { produto } from "./inventario/base";
import { anularEcNoInventario, estadoLinhaNegocio, linhaDoResumo, resumoEcNegocio, sincronizarEcsNegocios, textoResumoEc } from "./inventario/ponteNegocios";
import { TECS, acoes, conflitos, diaDeFerias, minhas, proximo, seed, valorSinal } from "./motor";
import { aprovarPos, posDe, receberTudo } from "./testeObra";

const REF = "CT 2026/1027";
import { isoDia } from "./planoObra";
import { totais, tranches } from "./DocsCliente";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { EC_NO_PAGAMENTO, entregaTarde, faltaParaArrancar, inicioDoPlano, passosPreparacao, rotuloDia, skDaTarefa, tecnicosPara } from "./preparacaoObra";

const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
// 1027 Tiago Almeida: contrato assinado a 08/10 → plano por aprovar (a encomenda de cliente vem com o pagamento)
const preparar = () => { const S = seed(); return { S, A: acoes(S, () => {}, (fn) => fn()), d: S.deals.find((x) => x.id === 1027)! }; };
// o pagamento validado emite a encomenda de cliente no Inventário novo; o plano aprova-se depois
// 19/10: a fatura e o pagamento são do Financeiro (permissoes.ts)
const pagar = (A: ReturnType<typeof preparar>["A"], d: ReturnType<typeof preparar>["d"]) => { preencher(d, FINANCEIRO); A.role("financeiro"); A.emitir(d.id); A.validar(d.id); };
const estados = (S: ReturnType<typeof seed>, d: ReturnType<typeof preparar>["d"]) => Object.fromEntries(passosPreparacao(d, S).map((p) => [p.id, p.estado]));

describe("do contrato à obra (16/10: a encomenda nasce do pagamento, no Inventário novo)", () => {
  beforeEach(() => { esquecerInventario(); });

  it("o contrato gera só o plano do orçamento, por aprovar; encomenda de cliente nenhuma", () => {
    const { S, d } = preparar();
    expect(d.obra.ec ?? null).toBeNull();
    expect(d.obra.plano).toMatchObject({ estado: "por aprovar", origem: "orcamento" });
    expect(d.obra.plano!.tasks.every((t) => t.fase && t.tec)).toBe(true);
    // o pagamento vem primeiro: a encomenda emite-se com ele e o plano espera por ele
    expect(estados(S, d)).toMatchObject({ ec: "espera", pl: "feito", "pl-ok": "espera", ft: "agora", pg: "espera", go: "espera" });
    expect(passosPreparacao(d, S).find((x) => x.id === "ec")!.sub).toBe(EC_NO_PAGAMENTO);
    expect(faltaParaArrancar(d)).toEqual(["emitir a fatura e receber o pagamento", "aprovar o plano"]);
    expect(lerInventario().ecs.some((e) => e.origin.ref === "CT 2026/1027")).toBe(false);
  });

  it("assinar → sem EC; validar o pagamento → EC no Inventário novo, com reserva FIFO e encomenda ao fornecedor do que falta", () => {
    const { S, A, d } = preparar();
    const nEcs = lerInventario().ecs.length, nPos = lerInventario().pos.length;
    pagar(A, d);
    expect(d.fase).toBe(5);
    // a encomenda de cliente foi emitida sozinha (sem aprovação do comercial), com o mesmo número no negócio e no Inventário
    expect(d.obra.ec).toMatchObject({ n: "EC-1027", estado: "emitida", ref: "CT 2026/1027" });
    const db = lerInventario();
    expect(db.ecs).toHaveLength(nEcs + 1);
    const e = db.ecs.find((x) => x.id === "EC-1027")!;
    expect(e).toMatchObject({ origin: { k: "CT", ref: "CT 2026/1027" }, client: d.f.nome_fiscal || d.nome, wh: "LIS", deleted: false });
    expect(e.lines.map((l) => produto(db, l.sku!)!.name)).toEqual(d.obra.ec!.linhas.map((x) => x.n));
    // Cozinha: há 2 bancadas em stock (reservada do stock); os móveis não há (vão ao fornecedor preferencial, Madeiras e Cozinhas)
    const banc = e.lines.find((l) => l.sku === "OB-BANC")!, mov = e.lines.find((l) => l.sku === "OB-MOVC")!;
    expect(banc.stockQty).toBe(1);
    expect(mov.stockQty).toBe(0);
    const po = db.pos.find((p) => p.lines.some((pl) => pl.ecLine === mov.id))!;
    expect(po).toMatchObject({ sup: "madeir", originKey: "CT 2026/1027", auto: true });
    expect(db.pos.length).toBeGreaterThan(nPos);
    // o cartão lê o estado do Inventário
    const r = resumoEcNegocio(db, "CT 2026/1027")!;
    expect(r.id).toBe("EC-1027");
    expect(r.tot.aFornecedor).toBeGreaterThan(0);
    // a encomenda a fornecedor nasce Pendente (por aprovar), sem envio; o fornecedor das obras tem o portal ativo
    expect(po.status).toBe("pending");
    expect(po.portal.state).toBe("none");
    expect(db.suppliers.find((s) => s.id === "madeir")!.portal).toBe("active");
    expect(r.pos.find((x) => x.id === po.id)).toMatchObject({ fase: "por aprovar" });
    expect(textoResumoEc(r)).toMatch(/encomenda a fornecedor por aprovar|encomendas a fornecedor por aprovar/);
    expect(estadoLinhaNegocio(linhaDoResumo(r, "Conjunto de móveis de cozinha")!).t).toBe("encomenda a fornecedor por aprovar");
    // aprovada no Inventário (a regra de sempre, enviarPo com purchase_orders.approve) segue pelo portal do fornecedor
    expect(executar((x) => enviarPo(x, x.pos.find((y) => y.id === po.id)!)).ok).toBe(true);
    const r2 = resumoEcNegocio(lerInventario(), "CT 2026/1027")!;
    expect(lerInventario().pos.find((y) => y.id === po.id)!.portal.state).toBe("sent");
    expect(r2.pos.find((x) => x.id === po.id)).toMatchObject({ fase: "no portal" });
    expect(estadoLinhaNegocio(linhaDoResumo(r2, "Conjunto de móveis de cozinha")!).t).toBe("no portal do fornecedor");
    expect(estadoLinhaNegocio(linhaDoResumo(r, "Bancada em pedra")!)).toEqual({ t: "reservado em armazém", ok: true });
    expect(passosPreparacao(d, S, r).map((x) => x.id)).toContain("ec-inv");
    // 19/10: depois do pagamento, faltam os materiais garantidos (uma encomenda a fornecedor por aprovar, a outra aprovada aqui em cima e por receber) e o plano
    expect(faltaParaArrancar(d)).toEqual([
      expect.stringMatching(/^aprovar a encomenda a fornecedor PO-\S+ no Inventário \(Compras\)$/),
      expect.stringMatching(/^receber no armazém a encomenda PO-\S+ \(prevista a \d\d\/\d\d\)$/),
      "aprovar o plano",
    ]);
    expect(estados(S, d)).toMatchObject({ ec: "feito", "pl-ok": "agora", pg: "feito" });
  });

  it("idempotente: validar outra vez (ou sincronizar) não duplica a encomenda no Inventário", () => {
    const { S, A, d } = preparar();
    pagar(A, d);
    const n = lerInventario().ecs.length;
    A.validar(d.id); A.emitirEc(d.id);
    expect(sincronizarEcsNegocios(S.deals)).toBe(0);
    expect(lerInventario().ecs).toHaveLength(n);
    // os dados do Inventário repostos (como ao recarregar a página): volta a emiti-la, com o mesmo número
    esquecerInventario();
    expect(sincronizarEcsNegocios(S.deals)).toBe(1);
    expect(lerInventario().ecs.filter((e) => e.origin.ref === "CT 2026/1027").map((e) => e.id)).toEqual(["EC-1027"]);
  });

  it("a venda direta aceite também só gera o plano; o pagamento emite a EC com a origem da venda", () => {
    const { S, A } = preparar();
    const v = S.deals.find((x) => x.id === 1030)!;
    A.aceitar(v.id);
    expect(v.fase).toBe(4);
    expect(v.obra.ec ?? null).toBeNull();
    expect(v.obra.plano?.estado).toBe("por aprovar");
    pagar(A, v);
    expect(v.obra.ec).toMatchObject({ n: "EC-1030", ref: "VD 2026/1030" });
    expect(lerInventario().ecs.find((e) => e.id === "EC-1030")!.origin.k).toBe("VD");
  });

  it("cada papel vê no Hoje o seu passo; já não há aprovação da encomenda", () => {
    const { S, A } = preparar();
    const de = (r: Parameters<typeof minhas>[1]) => minhas(S, r).filter((x) => x.d.id === 1027).map((x) => x.p.act);
    expect(de("comercial")).toEqual([]);
    expect(de("operacoes")).toEqual([]);
    expect(de("financeiro")).toEqual(["emitir"]);
    pagar(A, S.deals.find((x) => x.id === 1027)!);
    expect(de("comercial")).toEqual([]);
    expect(de("financeiro")).toEqual([]);
    expect(de("operacoes")).toEqual(["aprovarPlano"]);
    expect("aprovarEc" in A).toBe(false);
    expect("validarEf" in A).toBe(false);
  });

  it("só arranca com o pagamento, o plano aprovado e os materiais no armazém (19/10: as encomendas a fornecedor aprovadas e recebidas)", () => {
    const avisos: string[] = [];
    const S = seed(), A = acoes(S, (a) => avisos.push(`${a.msg} · ${a.sub ?? ""}`), (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
    preencher(d, [OBRA[0]]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("por aprovar");
    A.aprovarPlano(d.id);
    expect(d.obra.plano!.estado).toBe("por aprovar"); // antes do pagamento não se aprova
    pagar(A, d);
    A.aprovarPlano(d.id);
    // as encomendas a fornecedor por aprovar seguram o arranque (e dizem onde se aprovam)
    expect(estados(S, d).go).toBe("espera");
    expect(minhas(S, "operacoes").filter((x) => x.d.id === 1027)).toEqual([]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("aprovado");
    expect(avisos.at(-1)).toMatch(/^Ainda não dá para arrancar · Falta aprovar as encomendas a fornecedor PO-.* no Inventário \(Compras\)$/);
    expect(proximo(d, S)).toMatchObject({ t: "À espera dos materiais", act: "abrirInv" });
    // aprovadas (no portal do fornecedor), ainda por receber: continuam a segurar
    expect(aprovarPos(REF)).toBe("");
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("aprovado");
    expect(avisos.at(-1)).toMatch(/Falta receber no armazém as encomendas PO-.* \(prevista a \d\d\/\d\d\)$/);
    // recebidas no armazém: tudo reservado, arranca
    expect(receberTudo(REF)).toBe("");
    expect(resumoEcNegocio(lerInventario(), REF)!.pronta).toBe(true);
    expect(faltaParaArrancar(d)).toEqual([]);
    expect(estados(S, d).go).toBe("agora");
    expect(minhas(S, "operacoes").filter((x) => x.d.id === 1027).map((x) => x.p.act)).toEqual(["arrancar"]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
  });

  it("a encomenda eliminada no Inventário ou uma linha sem fornecedor também seguram o arranque", () => {
    const { A, d } = preparar();
    pagar(A, d);
    executar((db) => { const l = db.ecs.find((e) => e.id === "EC-1027")!.lines.find((x) => x.sku === "OB-BANC")!; l.stockQty = 0; l.nosupQty = l.qty; });
    expect(faltaParaArrancar(d)[0]).toBe("escolher o fornecedor de 1 material no Inventário");
    expect(anularEcNoInventario(REF, "teste").ok).toBe(true);
    expect(faltaParaArrancar(d)).toEqual(["uma encomenda de cliente válida: a EC-1027 foi eliminada no Inventário", "aprovar o plano"]);
    // as obras antigas do exemplo (sem origem no Inventário) não ficam presas
    const S2 = seed(), m = S2.deals.find((x) => x.id === 1022)!;
    expect(faltaParaArrancar(m)).toEqual([]);
  });

  it("\"Abrir no Inventário\" a partir do negócio pede a encomenda dele", () => {
    const { S, A, d } = preparar();
    pagar(A, d);
    A.abrirInv(d.id);
    expect(S.view).toBe("inventario");
    expect(lerPedidoEcInv()).toBe("EC-1027");
  });

  it("o ofício da tarefa escolhe o tipo de técnico", () => {
    expect(skDaTarefa("Demolições", "Demolição e entulho")).toBe("Servente · demolição");
    expect(skDaTarefa("Canalização", "Canalização")).toBe("Canalizador");
    expect(skDaTarefa("Revestimentos", "Pavimento cerâmico")).toBe("Ladrilhador");
    expect(skDaTarefa("Carpintaria", "Montagem de móveis")).toBe("Montador");
  });
});

// estes exemplos foram escritos a 14/10/2026: o plano começa na segunda seguinte (19/10), com o Sérgio de férias a 21–23 out.
// 19/10: o relógio fica nesse dia (só a data), senão o resultado mudava com o dia em que se correm.
const relogio14 = () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 14, 10)); });
  afterEach(() => { vi.useRealTimers(); });
};

describe("o plano nas Operações", () => {
  relogio14();
  it("datas reais a partir do início (dias úteis), técnicos do ofício e o início mudado", () => {
    const { S, A, d } = preparar();
    const p = d.obra.plano!;
    expect(inicioDoPlano(p, new Date(2026, 9, 14))!.getDay()).toBe(1); // a próxima segunda-feira
    A.inicioPlano(d.id, "2026-10-30"); // sexta
    expect(rotuloDia(p, 0)).toBe("sex, 30 out");
    expect(rotuloDia(p, 1)).toBe("seg, 2 nov"); // salta o fim de semana
    const i = p.tasks.findIndex((t) => t.sk === "Ladrilhador");
    expect(tecnicosPara(p.tasks[i], p).map((x) => x.id)).toEqual(["sf", "hn"]);
    A.trocarTec(d.id, i, "sf");
    expect(p.tasks[i].tec).toBe("sf");
    expect(d.hist[0].t).toMatch(/passa de .* para Sérgio Faria/);
  });
  it("os planos antigos continuam com os dias de exemplo", () => {
    const S = seed(), m = S.deals.find((x) => x.id === 1022)!;
    expect(inicioDoPlano(m.obra.plano!)).toBeNull();
    expect(rotuloDia(m.obra.plano!, 0)).toBe("seg 13/10");
  });
});

describe("os custos da encomenda", () => {
  beforeEach(() => { esquecerInventario(); });
  it("as linhas repartem a linha de materiais do orçamento (custo e preço batem); o Inventário recebe o preço do contrato", () => {
    const { A, d } = preparar();
    pagar(A, d);
    const ec = d.obra.ec!, L = d.orc!.linhas.find((l) => l.t === "mat" && l.d === "móveis, bancada, torneira")!;
    expect(ec.custo).toBeCloseTo(L.t === "mat" ? L.custo : 0, 2);
    expect(ec.valor).toBeCloseTo(L.t === "mat" ? L.preco : 0, 2);
    expect(ec.linhas.every((x) => x.custo > 0 && x.preco > x.custo)).toBe(true);
    // móveis e bancada partilham a parte de 70%
    const mov = ec.linhas.find((x) => /móveis/.test(x.n))!, banc = ec.linhas.find((x) => /Bancada/.test(x.n))!;
    expect(mov.custo * mov.q).toBeCloseTo(banc.custo * banc.q, 2);
    const e = lerInventario().ecs.find((x) => x.id === ec.n)!;
    expect(e.lines.find((l) => l.sku === "OB-MOVC")!.price).toBeCloseTo(mov.preco, 2);
  });
});

describe("o sinal", () => {
  it("o valor recebido por omissão é a primeira prestação com IVA, igual à da fatura", () => {
    const { S, d } = preparar();
    expect(valorSinal(d, S)).toBeCloseTo(tranches(d, totais(d, S).total)[0].v, 2);
    expect(valorSinal(d, S)).toBeLessThan(totais(d, S).total);
  });
});

describe("férias em datas reais e a entrega antes do arranque", () => {
  relogio14();
  it("o técnico de férias a 21–23 out entra em conflito pelas datas; a troca e o adiar resolvem", () => {
    const { A, d } = preparar();
    const p = d.obra.plano!;
    A.inicioPlano(d.id, "2026-10-19");
    const i = p.tasks.findIndex((t) => t.sk === "Ladrilhador");
    expect(p.tasks[i].tec).toBe("hn"); // o plano escolheu quem não está de férias
    A.trocarTec(d.id, i, "sf"); // o Sérgio está de férias a 21–23 out
    const di = diaDeFerias(TECS.find((x) => x.id === "sf")!, p, p.tasks[i].dia, p.tasks[i].dur);
    expect(di).not.toBeNull();
    expect(conflitos(p)).toHaveLength(1);
    expect(tecnicosPara(p.tasks[i], p).find((x) => x.id === "sf")).toMatchObject({ livre: false, ferias: expect.stringMatching(/out$/) });
    A.adiar(d.id, i);
    expect(conflitos(p)).toHaveLength(0);
    expect(rotuloDia(p, p.tasks[i].dia)).toBe("seg, 26 out"); // depois das férias
  });
  it("a entrega no dia do arranque avisa; começar no dia útil a seguir resolve (19/10: as encomendas a fornecedor do Inventário)", () => {
    esquecerInventario();
    const { A, d } = preparar();
    pagar(A, d);
    // a data mais tarde das encomendas a fornecedor ainda por receber (a prometida no portal ou a prevista)
    const tarde = posDe(REF).map((p) => p.portal.promised ?? p.due).sort().at(-1)!;
    A.inicioPlano(d.id, tarde);
    const t = entregaTarde(d)!;
    expect(isoDia(t.entrega)).toBe(tarde);
    expect(t.pos.sort()).toEqual(posDe(REF).map((p) => p.id).sort());
    expect(t.depois.getTime()).toBeGreaterThan(t.entrega.getTime());
    A.inicioPlano(d.id, isoDia(t.depois));
    expect(entregaTarde(d)).toBeNull();
    // recebidas, já não avisa
    A.inicioPlano(d.id, tarde);
    expect(receberTudo(REF)).toBe("");
    expect(entregaTarde(d)).toBeNull();
  });
});
