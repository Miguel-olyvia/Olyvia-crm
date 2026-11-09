// 09/11/2026 (20270111870000): Operações › obra › Materiais para quem não vê as encomendas de cliente (sem client_orders.view) e tem
// negocios.obra.materiais: as linhas vêm de obra_materiais_ler (sem preços nem fornecedores). Quem vê as encomendas fica como estava.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("../acessosPortal", async (orig) => ({ ...(await orig<typeof import("../acessosPortal")>()), orgDoModoReal: () => "org-1" }));

import { seed, type Estado, type Negocio } from "../motor";
import { FINANCEIRO, emFalta } from "../campos";
import { esquecerInventario } from "../inventario/loja";
import { PaginaObra } from "../ObraOperacoes";
import { definirPermissoesReais } from "../permissoes";
import { materiaisPorFase } from "../obraOps";
import { Montar } from "../v2/testeV2";
import { esquecerMateriaisObra, materiaisDaBase, type MateriaisBase } from "./materiaisObraReal";

const BASE: MateriaisBase = {
  negocio_id: "neg-uuid", ecs: [{ ec: "EC-2026-0007", adenda: null }],
  linhas: [
    { id: "p1", produto: "p1", linha: "l1", componente: 0, n: "Base de duche", q: 1, un: "un", ec: "EC-2026-0007", pronto: 1, saida: 0, a_chegar: 0, estado: "reservado", st: "ready", po_por_aprovar: null },
    { id: "p2", produto: "p2", linha: "l2", componente: 0, n: "Torneira", q: 2, un: "un", ec: "EC-2026-0007", pronto: 0, saida: 0, a_chegar: 2, estado: "a caminho", st: "waitpo", po_por_aprovar: true },
    { id: "p3", produto: "p3", linha: "l3", componente: 0, n: "Cerâmico", q: 11, un: "m2", ec: "EC-2026-0007", pronto: 0, saida: 0, a_chegar: 11, estado: "a caminho", st: "waitpo", po_por_aprovar: false, prometida: "2026-11-20" },
    { id: "p4", produto: "p4", linha: "l4", componente: 0, n: "Silicone", q: 3, un: "tubo", ec: "EC-2026-0007", pronto: 0, saida: 3, a_chegar: 0, estado: "chegou", st: "served", po_por_aprovar: null },
    { id: "p5", produto: "p5", linha: "l5", componente: 0, n: "Rufo", q: 1, un: "un", ec: "EC-2026-0007", pronto: 0, saida: 0, a_chegar: 0, estado: "em falta", st: "missing", po_por_aprovar: null },
  ],
};

afterEach(() => { cleanup(); definirPermissoesReais(null); esquecerMateriaisObra(); rpc.mockReset(); localStorage.clear(); window.history.replaceState(null, "", "/"); });
beforeEach(() => { esquecerInventario(); });

/** 1027 pago, com a obra (EC-1027 no Inventário do exemplo). */
function preparar() {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  for (let i = 0; i < 5; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  let A!: Parameters<Parameters<typeof Montar>[0]["children"]>[0]["A"];
  render(<Montar S={S}>{(ctx) => { A = ctx.A; return null; }}</Montar>);
  cleanup();
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id); A.role("operacoes"); A.aprovarPlano(d.id); A.role("financeiro"); /* 9/11: a encomenda só com o plano aprovado */
  A.role("operacoes");
  return { S, d };
}

describe("materiais da obra pela base (obra_materiais_ler)", () => {
  it("monta as linhas e o estado de cada uma como materiaisPorFase os mostra, sem fornecedor", () => {
    const { d } = preparar();
    const m = materiaisDaBase(BASE);
    expect(m.ecs).toEqual(["EC-2026-0007"]);
    expect(m.inv.pos).toEqual([]);
    const itens = materiaisPorFase(d, m.inv, m.linhas).flatMap((g) => g.itens);
    const por = Object.fromEntries(itens.map((x) => [x.n, x]));
    expect(por["Base de duche"].estado).toBe("reservado");
    expect(por["Torneira"].estado).toBe("por encomendar");
    expect(por["Cerâmico"]).toMatchObject({ estado: "a chegar", quando: "20/11" });
    expect(por["Silicone"].estado).toBe("na obra");
    expect(por["Rufo"].estado).toBe("em falta");
    expect(itens.every((x) => !x.forn)).toBe(true);
  });

  it("sem client_orders.view e com negocios.obra.materiais: lê a base pelo id do negócio e mostra a lista", async () => {
    const { S, d } = preparar();
    rpc.mockResolvedValue({ data: BASE, error: null });
    definirPermissoesReais({ codigos: new Set(["negocios.obra.materiais", "negocios.obra.executar"]), simular: false });
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={{ ...ctx, podeVerInventario: false, podeVerNegocio: false, idNegocioBase: () => "neg-uuid" }} d={d} />}</Montar>);
    fireEvent.click(screen.getByRole("tab", { name: "Equipa e meios" }));
    await waitFor(() => expect(document.getElementById("obra-mat")?.textContent).toMatch(/Encomenda de cliente EC-2026-0007/));
    const sec = document.getElementById("obra-mat")!;
    expect(sec.textContent).toMatch(/Torneira.*por encomendar/);
    expect(sec.textContent).not.toMatch(/Abrir a encomenda no Inventário|Ver o negócio/);
    expect(rpc).toHaveBeenCalledWith("obra_materiais_ler", { p_org: "org-1", p_negocio: "neg-uuid" });
  });

  it("um erro da base: só a nota discreta na secção", async () => {
    const { S, d } = preparar();
    rpc.mockResolvedValue({ data: null, error: { message: "Sem permissão", code: "CT001" } });
    definirPermissoesReais({ codigos: new Set(["negocios.obra.materiais"]), simular: false });
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={{ ...ctx, podeVerInventario: false, idNegocioBase: () => "neg-uuid" }} d={d} />}</Montar>);
    fireEvent.click(screen.getByRole("tab", { name: "Equipa e meios" }));
    await waitFor(() => expect(document.getElementById("obra-mat")?.textContent).toMatch(/Não foi possível ler os materiais/));
  });

  it("com client_orders.view, ou sem negocios.obra.materiais: não chama a base", () => {
    const { S, d } = preparar();
    definirPermissoesReais({ codigos: new Set(["negocios.obra.materiais"]), simular: false });
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={{ ...ctx, podeVerInventario: true, idNegocioBase: () => "neg-uuid" }} d={d} />}</Montar>);
    fireEvent.click(screen.getByRole("tab", { name: "Equipa e meios" }));
    expect(document.getElementById("obra-mat")?.textContent).toMatch(/Encomenda de cliente EC-1027/);
    cleanup();
    definirPermissoesReais({ codigos: new Set(["negocios.obra.executar"]), simular: false });
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={{ ...ctx, podeVerInventario: false, idNegocioBase: () => "neg-uuid" }} d={d} />}</Montar>);
    fireEvent.click(screen.getByRole("tab", { name: "Equipa e meios" }));
    expect(document.getElementById("obra-mat")).toBeNull();
    expect(rpc).not.toHaveBeenCalledWith("obra_materiais_ler", expect.anything());
  });
});
