// O Inventário do V1 (19/10): os dados da Mudelar, o circuito da obra (pagamento → encomenda de cliente → aprovar → o fornecedor confirma →
// dar entrada → levar à obra) com as regras do Inventário do Rafael, e o ecrã (um só primário, o que fazer, a obra aberta a partir do negócio).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MotionGlobalConfig } from "framer-motion";
import { FINANCEIRO, emFalta, type Grupo } from "./campos";
import { esquecerInventario, lerInventario, usarSeed } from "./inventario/loja";
import { criarSeedComCarrinhas } from "./inventario/seed";
import { InventarioV1, esquecerInventarioV1 } from "./InventarioV1";
import {
  acabarContagem, anularOResto, aprovar, comecarContagem, contar, corrigir, darSaida, decidirPrecoNovo, desfazerSaida, encomendar, entradaAvulsa, juntarArtigo, levarParaCarrinha,
  mudarMinimo, novaEncomenda, novoFornecedor, novoMaterial, pedirOQueFalta, receber, recusar, simularConfirmacao,
} from "./inventarioV1Acoes";
import { armazemInv, contagemAberta, encomendasInv, fornecedorInv, linhasContagem, obraInv, obrasInv, tarefasInv } from "./inventarioV1Docs";
import { criarSeedV1 } from "./inventarioV1Seed";
import { acoes, seed } from "./motor";
import type { Ctx } from "./pecas";
import { pedirObraInv } from "./pedidoInvV1";

MotionGlobalConfig.skipAnimations = true;

const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
const preparar = () => {
  const S = seed();
  const A = acoes(S, () => {}, (fn) => fn());
  return { S, A, d: S.deals.find((x) => x.id === 1027)! };
};
const pagar = ({ A, d }: ReturnType<typeof preparar>) => { preencher(d, FINANCEIRO); A.emitir(d.id); A.validar(d.id); };
const ctxDe = (S: ReturnType<typeof seed>, A: ReturnType<typeof acoes>): Ctx => ({ S, A, run: (fn) => fn(), go: (fn) => () => fn(), q: "", repor: () => {} });
/** Os botões primários à vista (o Button do shadcn por defeito tem bg-primary; as escolhas ligadas têm aria-pressed). */
const primarios = (): HTMLElement[] => screen.getAllByRole("button").filter((b) => /\bbg-primary\b/.test(b.className) && !b.hasAttribute("aria-pressed") && !b.hasAttribute("aria-current") && b.getAttribute("role") !== "tab");

beforeEach(() => { usarSeed(criarSeedV1); esquecerInventario(); esquecerInventarioV1(); });
afterEach(() => { cleanup(); });

describe("os dados do Inventário no V1", () => {
  it("são os da Mudelar: materiais das obras, consumíveis e carrinhas; nada de bombas de calor nem clientes inventados", () => {
    const db = lerInventario();
    const nomes = db.products.map((p) => p.name).join(" | ");
    expect(nomes).toMatch(/Cerâmico de parede/);
    expect(nomes).toMatch(/Sacos de entulho/);
    expect(nomes).not.toMatch(/Bomba de calor|fotovoltaico/);
    expect(db.ecs).toHaveLength(0);
    expect(db.warehouses.filter((w) => w.tipo === "viatura").length).toBeGreaterThan(0);
  });

  it("os materiais das obras não pedem encomenda por estarem abaixo do mínimo (compram-se por obra); os consumíveis sim", () => {
    const { S } = preparar();
    const T = tarefasInv(S, lerInventario());
    expect(T.filter((t) => t.acao.k === "encomendar").map((t) => t.acao.k === "encomendar" && t.acao.sku)).toEqual(["CS-PLA"]);
    // primeiro os preços novos por rever, depois as bases de duche a caminho (confirmadas para 13/10)
    expect(T.map((t) => t.acao.k).slice(0, 3)).toEqual(["preco", "preco", "receber"]);
  });

  it("o resto do protótipo (fora do V1) continua com os dados do mockup", () => {
    usarSeed(criarSeedComCarrinhas);
    expect(lerInventario().products.some((p) => /Bomba de calor/.test(p.name))).toBe(true);
    usarSeed(criarSeedV1);
  });
});

describe("o circuito da obra, do pagamento à obra", () => {
  it("antes do pagamento a obra espera; o pagamento traz os materiais por fase, com o dia em que cada fase começa", () => {
    const P = preparar();
    expect(obraInv(lerInventario(), P.d)).toMatchObject({ estado: "pagamento", ec: null, fases: [] });
    pagar(P);
    const o = obraInv(lerInventario(), P.d);
    expect(o).toMatchObject({ estado: "preparar", ec: "EC-1027" });
    expect(o.fases.length).toBeGreaterThan(0);
    expect(o.fases.every((f) => /^(seg|ter|qua|qui|sex), \d+ \w{3}$/.test(f.quando ?? ""))).toBe(true);
    expect(obrasInv(P.S, lerInventario()).map((x) => x.id)).toContain(1027);
  });

  it("aprovar → o fornecedor confirma → dar entrada → levar à obra: cada passo pela regra do Inventário", () => {
    const P = preparar();
    pagar(P);
    const { S } = P;
    // a encomenda ao fornecedor do que falta nasce por aprovar, ligada à obra
    const t1 = tarefasInv(S, lerInventario()).find((t) => t.acao.k === "aprovar" && t.obra === 1027)!;
    expect(t1).toBeTruthy();
    const po = t1.acao.k === "aprovar" ? t1.acao.po : "";
    expect(aprovar(po).ok).toBe(true);
    expect(encomendasInv(S, lerInventario()).aCaminho.find((p) => p.id === po)).toMatchObject({ estado: "no fornecedor", para: "Obra de Tiago Almeida" });
    expect(simularConfirmacao(po)).toMatchObject({ ok: true });
    expect(encomendasInv(S, lerInventario()).aCaminho.find((p) => p.id === po)!.estado).toBe("confirmada");
    // dar entrada de tudo: fica guardado para a obra
    const p = lerInventario().pos.find((x) => x.id === po)!;
    const r = receber(po, p.lines.map((l) => ({ lineId: l.id, qty: l.packs * l.packN - l.recv })));
    expect(r.ok).toBe(true);
    expect(r.valor).toMatch(/guardado para a obra/);
    // a fase com tudo pronto pede a saída; levar à obra marca os materiais "já na obra"
    const sair = tarefasInv(S, lerInventario()).filter((t) => t.acao.k === "sair" && t.obra === 1027);
    expect(sair.length).toBeGreaterThan(0);
    const a = sair[0].acao.k === "sair" ? sair[0].acao : null!;
    const fase = obraInv(lerInventario(), P.d).fases.find((f) => f.fase === a.fase)!;
    expect(darSaida("EC-1027", fase.itens).ok).toBe(true);
    const depois = obraInv(lerInventario(), P.d).fases.find((f) => f.fase === a.fase)!;
    expect(depois.aSair).toBe(0);
    expect(depois.itens.filter((m) => m.linhaEc).every((m) => m.estado === "na obra")).toBe(true);
  });

  it("encomendar o consumível abaixo do mínimo cria e envia a encomenda; a tarefa sai da lista", () => {
    const { S } = preparar();
    const t = tarefasInv(S, lerInventario()).find((x) => x.acao.k === "encomendar")!;
    const a = t.acao.k === "encomendar" ? t.acao : null!;
    expect(encomendar(a.sku, a.q, a.sup).ok).toBe(true);
    expect(tarefasInv(S, lerInventario()).some((x) => x.id === t.id)).toBe(false);
    expect(armazemInv(S, lerInventario()).find((m) => m.sku === a.sku)!.aChegar).toBe(a.q);
  });

  it("corrigir a quantidade fica no livro com o motivo; uma quebra não pode juntar", () => {
    expect(corrigir("CS-FIT", "LIS", 9999, "quebra")).toMatchObject({ ok: false, erro: expect.stringMatching(/só tira/) });
    const antes = lerInventario().stocks.find((s) => s.sku === "CS-FIT" && s.wh === "LIS")!.qty;
    expect(corrigir("CS-FIT", "LIS", antes - 2, "contagem").ok).toBe(true);
    const m = lerInventario().moves.at(-1)!;
    expect(m).toMatchObject({ sku: "CS-FIT", type: "adjm", qty: -2 });
  });
});

describe("o ecrã do Inventário no V1", () => {
  it("abre no que fazer agora com um só primário; fazer a tarefa diz o que ficou feito e passa à seguinte", () => {
    const { S, A } = preparar();
    render(<InventarioV1 {...ctxDe(S, A)} />);
    expect(screen.getByRole("heading", { level: 1, name: "Inventário" })).toBeInTheDocument();
    const [t1, t2] = tarefasInv(S, lerInventario());
    const agora = screen.getByRole("heading", { name: "O que fazer agora" }).parentElement!;
    expect(within(agora).getByText(t1.t)).toBeInTheDocument();
    expect(primarios().map((b) => b.textContent)).toEqual([t1.btn]);
    fireEvent.click(within(agora).getByRole("button", { name: t1.btn }));
    expect(screen.getAllByRole("status").some((s) => /Preço novo aceite/.test(s.textContent ?? ""))).toBe(true);
    expect(within(agora).getByText(t2.t)).toBeInTheDocument();
  });

  it("o Início explica o caminho do material e leva às secções; o Stock tem a lista toda, procura sem acentos", () => {
    const { S, A } = preparar();
    render(<InventarioV1 {...ctxDe(S, A)} />);
    const caminho = screen.getByRole("heading", { name: "O caminho do material" }).parentElement!;
    for (const t of ["Fornecedores", "Armazém", "Obras"]) expect(within(caminho).getByRole("button", { name: new RegExp("^" + t) })).toBeInTheDocument();
    fireEvent.click(within(caminho).getByRole("button", { name: /^Armazém/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Stock" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Silicone/ }).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar" }), { target: { value: "ceramico" } });
    expect(screen.getAllByRole("button", { name: /Cerâmico de parede/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Silicone/ })).toBeNull();
  });

  it("as secções têm o seu ecrã: movimentos com filtros, fornecedores, carrinhas", () => {
    const { S, A } = preparar();
    render(<InventarioV1 {...ctxDe(S, A)} />);
    const nav = screen.getByRole("navigation", { name: "Secções do Inventário" });
    fireEvent.click(within(nav).getByRole("button", { name: "Movimentos" }));
    expect(screen.getByRole("heading", { level: 1, name: "Movimentos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Saídas/ }));
    expect(screen.getAllByText(/^(Saiu|Saíram)/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/^(Entrou|Entraram)/)).toHaveLength(0);
    fireEvent.click(within(nav).getByRole("button", { name: "Fornecedores" }));
    expect(screen.getByText("Cerâmica do Centro (exemplo)")).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Carrinhas" }));
    expect(screen.getAllByRole("heading", { level: 2, name: /^Carrinha / }).length).toBeGreaterThan(0);
  });

  it("\"Abrir no Inventário\" no negócio abre a obra; o material da obra mostra o estado em palavras", () => {
    const P = preparar();
    pagar(P);
    pedirObraInv(1027);
    render(<InventarioV1 {...ctxDe(P.S, P.A)} />);
    expect(screen.getByRole("heading", { level: 1, name: "Obra de Tiago Almeida" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2, name: /^Fase \d/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pronto no armazém|encomenda por aprovar/).length).toBeGreaterThan(0);
    expect(primarios()).toHaveLength(1);
  });
});

describe("a lógica que o V1 junta (regras do Inventário do Rafael)", () => {
  const qty = (sku: string, wh = "LIS") => lerInventario().stocks.find((s) => s.sku === sku && s.wh === wh)?.qty ?? 0;

  it("contar o armazém: um material de cada vez; no fim as diferenças corrigem o stock e ficam no livro", () => {
    expect(comecarContagem("Consumíveis").ok).toBe(true);
    const c = contagemAberta(lerInventario())!;
    const L = linhasContagem(lerInventario(), c);
    expect(tarefasInv(preparar().S, lerInventario())[0].acao.k).toBe("contar");
    const antes = qty("CS-FIT");
    for (const l of L) expect(contar(c.id, l.idx, l.sku === "CS-FIT" ? l.esperado - 3 : l.esperado).ok).toBe(true);
    expect(linhasContagem(lerInventario(), contagemAberta(lerInventario())!).filter((l) => l.dif)).toHaveLength(1);
    expect(acabarContagem(c.id)).toMatchObject({ ok: true, valor: expect.stringMatching(/1 material corrigido/) });
    expect(qty("CS-FIT")).toBe(antes - 3);
    expect(contagemAberta(lerInventario())).toBeUndefined();
    expect(lerInventario().moves.at(-1)).toMatchObject({ sku: "CS-FIT", type: "adjm", qty: -3, doc: c.id });
  });

  it("encomenda nova a um fornecedor: segue logo, e o material passa a ter quantidade a chegar", () => {
    const { S } = preparar();
    expect(novaEncomenda("consum", []).ok).toBe(false);
    expect(novaEncomenda("consum", [{ sku: "CS-SAC", q: 5 }, { sku: "FT-01", q: 0 }]).ok).toBe(true);
    const p = encomendasInv(S, lerInventario()).aCaminho.find((x) => x.linhas.some((l) => l.sku === "CS-SAC"))!;
    expect(p).toMatchObject({ estado: "no fornecedor", para: "Para o armazém" });
    expect(armazemInv(S, lerInventario()).find((m) => m.sku === "CS-SAC")!.aChegar).toBe(5);
  });

  it("recusar a encomenda de uma obra: o material volta a faltar; Pedir o que falta faz outra, por aprovar", () => {
    const P = preparar();
    pagar(P);
    const t = tarefasInv(P.S, lerInventario()).find((x) => x.acao.k === "aprovar" && x.obra === 1027)!;
    const po = t.acao.k === "aprovar" ? t.acao.po : "";
    expect(recusar(po, "Vou pedir a outro fornecedor").ok).toBe(true);
    expect(obraInv(lerInventario(), P.d).semEncomenda).toBeGreaterThan(0);
    expect(tarefasInv(P.S, lerInventario()).find((x) => x.acao.k === "pedir" && x.obra === 1027)).toMatchObject({ urgente: true, btn: "Pedir o que falta" });
    expect(pedirOQueFalta("EC-1027").ok).toBe(true);
    expect(obraInv(lerInventario(), P.d).semEncomenda).toBe(0);
    expect(encomendasInv(P.S, lerInventario()).porAprovar.some((x) => x.deal === 1027)).toBe(true);
  });

  it("o fornecedor não entrega o resto: a encomenda fecha e o que faltava deixa de estar a chegar", () => {
    const { S } = preparar();
    const p = encomendasInv(S, lerInventario()).aCaminho[0];
    expect(anularOResto(p.id, "Fornecedor sem produto").ok).toBe(true);
    expect(encomendasInv(S, lerInventario()).aCaminho.some((x) => x.id === p.id)).toBe(false);
    expect(armazemInv(S, lerInventario()).find((m) => m.sku === p.linhas[0].sku)!.aChegar).toBe(0);
  });

  it("desfazer uma saída para a obra: o material volta ao armazém, guardado para a obra", () => {
    const P = preparar();
    pagar(P);
    const f = obraInv(lerInventario(), P.d).fases.find((x) => x.aSair)!;
    expect(darSaida("EC-1027", f.itens).ok).toBe(true);
    const m = obraInv(lerInventario(), P.d).fases.find((x) => x.fase === f.fase)!.itens.find((x) => x.estado === "na obra" && x.linhaEc)!;
    expect(desfazerSaida("EC-1027", m.linhaEc!).ok).toBe(true);
    expect(obraInv(lerInventario(), P.d).fases.find((x) => x.fase === f.fase)!.itens.find((x) => x.n === m.n)!.estado).toBe("reservado");
  });

  it("no material: entrada sem encomenda, levar para a carrinha (só o livre), mudar o mínimo (pede para encomendar)", () => {
    const { S } = preparar();
    const antes = qty("VE-12");
    expect(entradaAvulsa("VE-12", 4, "", 5).ok).toBe(true);
    expect(qty("VE-12")).toBe(antes + 4);
    expect(levarParaCarrinha("VE-12", 9999, "VIA-AA-12-BC")).toMatchObject({ ok: false, erro: expect.stringMatching(/livre/) });
    const car = qty("VE-12", "VIA-AA-12-BC");
    expect(levarParaCarrinha("VE-12", 2, "VIA-AA-12-BC").ok).toBe(true);
    expect(qty("VE-12", "VIA-AA-12-BC")).toBe(car + 2);
    expect(mudarMinimo("FT-01", 100).ok).toBe(true);
    expect(tarefasInv(S, lerInventario()).some((t) => t.acao.k === "encomendar" && t.acao.sku === "FT-01")).toBe(true);
  });

  it("material novo e fornecedor novo: recusados sem dados; criados, o material vende-se pelo fornecedor e encomenda-se", () => {
    const { S } = preparar();
    expect(novoMaterial({ nome: "", cat: "", un: "", sup: "", preco: null, minimo: 0, qty: 0 }).ok).toBe(false);
    const f = novoFornecedor({ nome: "Tintas da Margem Sul (exemplo)", email: "encomendas@tintas.exemplo", telefone: "212 000 555", cidade: "Seixal", prazo: 3 });
    expect(f.ok).toBe(true);
    const m = novoMaterial({ nome: "Primário aquoso 5 L", cat: "Consumíveis", un: "un", sup: f.valor, preco: 18.5, minimo: 2, qty: 3 });
    expect(m.ok).toBe(true);
    expect(qty(m.valor)).toBe(3);
    expect(fornecedorInv(S, lerInventario(), f.valor)!.artigos.map((a) => a.n)).toEqual(["Primário aquoso 5 L"]);
    expect(juntarArtigo(f.valor, "CS-FIT", 2.1).ok).toBe(true);
    expect(novaEncomenda(f.valor, [{ sku: m.valor, q: 4 }]).ok).toBe(true);
  });

  it("aceitar o preço novo muda o custo do material; recusar não", () => {
    const { S } = preparar();
    const [a, b] = lerInventario().prices.filter((x) => x.state === "pending");
    expect(decidirPrecoNovo(a.id, true).ok).toBe(true);
    expect(lerInventario().items.find((i) => i.id === a.itemId)!.price).toBe(a.nw);
    expect(decidirPrecoNovo(b.id, false).ok).toBe(true);
    expect(lerInventario().items.find((i) => i.id === b.itemId)!.price).toBe(b.cur);
    expect(tarefasInv(S, lerInventario()).some((t) => t.acao.k === "preco")).toBe(false);
  });
});
