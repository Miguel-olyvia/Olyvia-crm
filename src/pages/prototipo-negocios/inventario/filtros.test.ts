// A pesquisa e os filtros das listas do Inventário, com os números da base de exemplo (medidos no motor original).
import { describe, expect, it } from "vitest";
import { fresca } from "./ajudaTestes";
import { FILTROS_VAZIOS, contaGuias, filtrarContagens, filtrarEcs, filtrarForn, filtrarGuias, filtrarMovs, filtrarPos, filtrarStock } from "./filtros";

const f = FILTROS_VAZIOS;
const ids = (l: { id: string }[]): string[] => l.map((x) => x.id);

describe("filtros das Encomendas (POs)", () => {
  const db = fresca();
  it("sem filtros mostra todas menos as eliminadas; com 'ver eliminadas', todas", () => {
    expect(filtrarPos(db, f.po)).toHaveLength(13);
    expect(filtrarPos(db, { ...f.po, eliminadas: true })).toHaveLength(14);
  });
  it("por estado, por atrasadas e por 'no portal'", () => {
    expect(ids(filtrarPos(db, { ...f.po, status: "pending" }))).toEqual(["PO-2026-0143", "PO-2026-0144", "PO-2026-0145"]);
    expect(filtrarPos(db, { ...f.po, status: "partial" })).toHaveLength(2);
    expect(filtrarPos(db, { ...f.po, status: "late" })).toHaveLength(4);
    expect(ids(filtrarPos(db, { ...f.po, status: "portal" }))).toEqual(["PO-2026-0137", "PO-2026-0141", "PO-2026-0142"]);
  });
  it("pesquisa por número, fornecedor, cliente, produto e EAN", () => {
    expect(ids(filtrarPos(db, { ...f.po, q: "0137" }))).toEqual(["PO-2026-0137"]);
    expect(filtrarPos(db, { ...f.po, q: "zeta" })).toHaveLength(1);
    expect(ids(filtrarPos(db, { ...f.po, q: "silva" }))).toContain("PO-2026-0137");
    expect(filtrarPos(db, { ...f.po, q: "5601234000028" }).length).toBeGreaterThan(2);
    expect(filtrarPos(db, { ...f.po, q: "isolamentos" }).every((p) => p.sup === "delta")).toBe(true);
  });
  it("por fornecedor e por datas (da encomenda ou da entrega real)", () => {
    expect(filtrarPos(db, { ...f.po, sup: "alfa" }).every((p) => p.sup === "alfa")).toBe(true);
    expect(ids(filtrarPos(db, { ...f.po, de: "2026-10-07" }))).toEqual(["PO-2026-0141", "PO-2026-0143", "PO-2026-0144", "PO-2026-0145"]);
    expect(ids(filtrarPos(db, { ...f.po, campoData: "real", de: "2026-10-01" }))).toEqual(["PO-2026-0136", "PO-2026-0137"]);
  });
});

describe("filtros do Stock e dos Movimentos", () => {
  const db = fresca();
  it("por estado: abaixo do ponto de encomenda considera as reservas", () => {
    expect(filtrarStock(db, f.stock)).toHaveLength(18);
    expect(filtrarStock(db, { ...f.stock, state: "high" })).toHaveLength(2);
    expect(filtrarStock(db, { ...f.stock, state: "low" }).length).toBeGreaterThan(10);
  });
  it("por categoria, armazém e texto (inclui os códigos associados)", () => {
    expect(filtrarStock(db, { ...f.stock, wh: "POR" }).every((r) => r.wh === "POR")).toBe(true);
    expect(filtrarStock(db, { ...f.stock, cat: "Solar" }).every((r) => ["PV-450", "INV-H5", "CS-6", "ST-04"].includes(r.sku))).toBe(true);
    expect(filtrarStock(db, { ...f.stock, q: "CX-10" }).map((r) => r.sku).sort()).toEqual(["RA-600", "RA-600", "VT-15"]);
  });
  it("o livro vem do mais recente para o mais antigo e filtra por tipo, armazém, documento e datas", () => {
    const todos = filtrarMovs(db, f.mov);
    expect(todos).toHaveLength(25);
    expect(todos[0].id).toBeGreaterThan(todos[24].id);
    expect(filtrarMovs(db, { ...f.mov, type: "out" }).every((m) => m.type === "out")).toBe(true);
    expect(filtrarMovs(db, { ...f.mov, doc: "po-2026-0136" }).length).toBeGreaterThan(0);
    expect(filtrarMovs(db, { ...f.mov, de: "2026-10-09" }).every((m) => m.at >= "2026-10-09")).toBe(true);
  });
});

describe("filtros das ECs, Fornecedores, Guias e Contagens", () => {
  const db = fresca();
  it("ECs: por estado, prontas a sair e texto; a mais recente primeiro", () => {
    expect(ids(filtrarEcs(db, f.ec))[0]).toBe("EC-0093");
    expect(filtrarEcs(db, { ...f.ec, status: "nosup" }).map((e) => e.id)).toEqual(["EC-0092", "EC-0090"]);
    expect(filtrarEcs(db, { ...f.ec, prontas: true })).toHaveLength(7);
    expect(filtrarEcs(db, { ...f.ec, q: "CT-2026-041" }).map((e) => e.id)).toEqual(["EC-0087"]);
    expect(filtrarEcs(db, { ...f.ec, q: "manual" })).toHaveLength(2);
  });
  it("Fornecedores: sem eliminados, por portal à espera, com preços por aprovar e catálogo por ligar", () => {
    expect(filtrarForn(db, f.forn)).toHaveLength(6);
    expect(filtrarForn(db, { ...f.forn, eliminados: true })).toHaveLength(7);
    expect(filtrarForn(db, { ...f.forn, aguardam: true }).map((s) => s.id)).toEqual(["beta"]);
    expect(filtrarForn(db, { ...f.forn, precos: true }).map((s) => s.id)).toEqual(["alfa", "beta", "zeta"]);
    expect(filtrarForn(db, { ...f.forn, catalogo: true }).map((s) => s.id)).toEqual(["alfa", "zeta"]);
  });
  it("Guias: abertas, com divergências, fechadas e canceladas, com os números dos botões", () => {
    expect([contaGuias(db, "all"), contaGuias(db, "open"), contaGuias(db, "div"), contaGuias(db, "closed"), contaGuias(db, "cancelled")]).toEqual([6, 3, 2, 2, 1]);
    expect(filtrarGuias(db, { estado: "div" }).map((g) => g.id)).toEqual(["GR 2026/311", "GR 2026/305"]);
  });
  it("Contagens: por estado, a mais recente primeiro", () => {
    expect(ids(filtrarContagens(db, { estado: "" }))).toEqual(["INV-2026-014", "INV-2026-013", "INV-2026-012"]);
    expect(ids(filtrarContagens(db, { estado: "open" }))).toEqual(["INV-2026-014"]);
  });
});
