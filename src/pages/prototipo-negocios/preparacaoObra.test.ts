import { beforeEach, describe, expect, it } from "vitest";
import { esquecerInventario, executar, lerInventario, lerPedidoEcInv } from "./inventario/loja";
import { enviarPo } from "./inventario/po";
import { produto } from "./inventario/base";
import { estadoLinhaNegocio, linhaDoResumo, resumoEcNegocio, sincronizarEcsNegocios, textoResumoEc } from "./inventario/ponteNegocios";
import { TECS, acoes, conflitos, diaDeFerias, minhas, seed, valorSinal } from "./motor";
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
const pagar = (A: ReturnType<typeof preparar>["A"], d: ReturnType<typeof preparar>["d"]) => { preencher(d, FINANCEIRO); A.emitir(d.id); A.validar(d.id); };
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
    // depois do pagamento só pode faltar o plano
    expect(faltaParaArrancar(d)).toEqual(["aprovar o plano"]);
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

  it("só arranca com o pagamento e o plano aprovado (os materiais tratam-se no Inventário)", () => {
    const { S, A, d } = preparar();
    preencher(d, [OBRA[0]]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("por aprovar");
    A.aprovarPlano(d.id);
    expect(d.obra.plano!.estado).toBe("por aprovar"); // antes do pagamento não se aprova
    pagar(A, d);
    A.aprovarPlano(d.id);
    expect(estados(S, d).go).toBe("agora");
    expect(minhas(S, "operacoes").filter((x) => x.d.id === 1027).map((x) => x.p.act)).toEqual(["arrancar"]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
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

describe("o plano nas Operações", () => {
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
  it("a entrega no dia do arranque avisa; começar no dia útil a seguir resolve (encomendas a fornecedor que existam, V2 funcional)", () => {
    const { A, d } = preparar();
    pagar(A, d);
    d.obra.enc = { n: "EF 2026/90", estado: "encomendada", linhas: [], entrega: "seg, 19 out", entregaIso: "2026-10-19" };
    A.inicioPlano(d.id, "2026-10-19");
    const t = entregaTarde(d)!;
    expect(isoDia(t.depois)).toBe("2026-10-20");
    A.inicioPlano(d.id, isoDia(t.depois));
    expect(entregaTarde(d)).toBeNull();
  });
});
