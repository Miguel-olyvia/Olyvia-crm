// A base de exemplo tem de ser igual à do mockup (os números foram medidos a correr o motor original do HTML com a mesma seed).
import { describe, expect, it } from "vitest";
import { HOJE } from "./base";
import { contadores } from "./contadores";
import { ecEstado, reservas } from "./ec";
import { poStatus } from "./po";
import { criarSeed } from "./seed";

describe("seed do Inventário", () => {
  const db = criarSeed();

  it("o dia de hoje é fixo (09/10/2026) e a base fecha com o relógio solto", () => {
    expect(HOJE).toBe("2026-10-09");
    expect(db.relogio).toBeNull();
  });

  it("tem os mesmos números do mockup (fila de trabalho e KPI)", () => {
    const c = contadores(db);
    expect(c).toMatchObject({
      pending: 3, ordered: 5, partialPO: 2, late: 4, portalUnseen: 1, portalConfirmed: 1, ecOpen: 8, ecReady: 7, ecNoSup: 2, ecWaiting: 0, ecPartial: 6, transfers: 2,
      awaiting: 1, catUnlinked: 6, prices: 7, low: 13, stalled: 1, countsOpen: 1, guiasOpen: 3, guiasDiv: 2, reservedUnits: 588, excess: 2,
    });
    expect(Math.round(c.openValue * 1000) / 1000).toBe(14039.712);
    expect(Math.round(c.stockValue * 100) / 100).toBe(28233.8);
  });

  it("as POs ficam nos estados do mockup (o estado calcula-se pelas receções)", () => {
    const estados = db.pos.map((p) => `${p.id}:${poStatus(p)}`);
    expect(estados).toEqual([
      "PO-2026-0132:received", "PO-2026-0133:received", "PO-2026-0134:cancelled", "PO-2026-0135:pending", "PO-2026-0136:partial", "PO-2026-0137:partial", "PO-2026-0138:ordered",
      "PO-2026-0139:ordered", "PO-2026-0140:ordered", "PO-2026-0141:ordered", "PO-2026-0142:ordered", "PO-2026-0143:pending", "PO-2026-0144:pending", "PO-2026-0145:pending",
    ]);
  });

  it("as ECs ficam nos estados do mockup", () => {
    expect(db.ecs.map((e) => `${e.id}:${ecEstado(db, e)}`)).toEqual([
      "EC-0085:full", "EC-0086:partial", "EC-0087:partial", "EC-0088:partial", "EC-0089:partial", "EC-0090:nosup", "EC-0091:partial", "EC-0092:nosup", "EC-0093:partial",
    ]);
  });

  it("o stock vem só de movimentos (25) e o custo médio não mexe sem custo novo", () => {
    expect(db.moves).toHaveLength(25);
    expect(db.seq).toBe(112);
    expect(db.n).toEqual({ po: 145, ec: 93, tr: 8, inv: 14 });
    const q = (sku: string, wh: string): number => db.stocks.find((s) => s.sku === sku && s.wh === wh)?.qty ?? -1;
    expect([q("PV-450", "LIS"), q("PV-450", "POR"), q("CS-6", "POR"), q("LR-50", "POR"), q("VT-15", "LIS"), q("INV-H5", "LIS"), q("KF-10", "POR")]).toEqual([28, 90, 18, 60, 36, 4, 40]);
    expect(db.products.find((p) => p.sku === "PV-450")?.avg).toBe(118);
  });

  it("a reserva FIFO do mockup", () => {
    expect(reservas(db).res).toEqual({
      "LR-50|POR": 60, "ST-04|LIS": 2, "PV-450|LIS": 28, "CS-6|LIS": 150, "RA-600|LIS": 8, "INV-H5|LIS": 1, "CD-80|LIS": 10, "BC-08|LIS": 1, "VT-15|LIS": 18, "KF-10|POR": 10, "TM-16|LIS": 300,
    });
  });

  it("as guias, contagens e transferências do mockup", () => {
    expect(db.guias.map((g) => `${g.id}:${g.state}`)).toEqual(["GR 2026/290:closed", "GR 2026/298:closed", "GR 2026/305:open", "GR 2026/311:open", "GR 2026/312:open", "GR 2026/284:cancelled"]);
    expect(db.counts.map((c) => `${c.id}:${c.state}`)).toEqual(["INV-2026-012:cancelled", "INV-2026-013:final", "INV-2026-014:open"]);
    expect(db.transfers.map((t) => `${t.id}:${t.sku}:${t.state}`)).toEqual(["TR-0007:AQS-200:pending", "TR-0008:RA-600:pending"]);
  });
});
