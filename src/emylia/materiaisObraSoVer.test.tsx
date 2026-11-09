// 4/11/2026: negocios.obra.materiais ("obra.materiais") é só VER os materiais da obra, e na obra já não se encomendam materiais
// (decisão do utilizador): o bloco dos Materiais e o editor da tarefa mostram o que falta, sem botão de encomendar. Quem não tem a
// permissão vê, no separador "Equipa e meios", só o aviso. Encomendar (o motor, obra_encomendar_materiais) pede purchase_orders.create
// ou negocios.obra.planear (20270106650000: o pedido automático da tarefa nova).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, emFalta } from "./campos";
import { esquecerInventario } from "./inventario/loja";
import { porEncomendar } from "./encomendasAjuste";
import { materiaisDaTarefa } from "./tarefasValidador";
import { MateriaisObra } from "./MateriaisObra";
import { ExtrasTarefa } from "./PlanoInterativo";
import { PaginaObra } from "./ObraOperacoes";
import { PERMS_PAPEL, SEM_PERM, definirPermissoesReais, podeNeg } from "./permissoes";
import { Montar } from "./v2/testeV2";
import type { Papel } from "./motor";

afterEach(() => { cleanup(); definirPermissoesReais(null); localStorage.clear(); window.history.replaceState(null, "", "/"); });
beforeEach(() => { esquecerInventario(); });

/** 1027 pago (EC-1027 no Inventário); o gestor junta silicone a mais a uma tarefa do orçamento: fica por encomendar. */
function preparar() {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  for (let i = 0; i < 5; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  let A!: Parameters<Parameters<typeof Montar>[0]["children"]>[0]["A"];
  render(<Montar S={S}>{(ctx) => { A = ctx.A; return null; }}</Montar>);
  cleanup();
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id); A.role("operacoes"); A.aprovarPlano(d.id); A.role("financeiro"); /* 9/11: a encomenda só com o plano aprovado */
  A.role("operacoes");
  const p = d.obra.plano!, ti = p.tasks.findIndex((t) => t.svcs.includes("revest"));
  const base = materiaisDaTarefa(p.tasks[ti], S.svc).map((m) => ({ ...m }));
  A.matsTarefa(d.id, ti, [...base, { n: "Silicone sanitário", q: 3, un: "tubo", preco: 6 }]);
  expect(porEncomendar(p).map((x) => x.m.n)).toEqual(["Silicone sanitário"]);
  return { S, d, ti };
}

describe("materiais da obra: só ver", () => {
  it("todos os papéis que abrem a obra veem os materiais; encomendar a Direção e quem planeia (o quadro por papel; 20270106650000)", () => {
    const papeis = Object.keys(PERMS_PAPEL) as Papel[];
    expect(papeis.filter((p) => !podeNeg(p, "obra.materiais"))).toEqual([]);
    expect(papeis.filter((p) => podeNeg(p, "obra.encomendar"))).toEqual(["direcao", "operacoes"]);
  });

  it("o bloco dos Materiais mostra o que falta encomendar, sem botão de encomendar", () => {
    const { S, d } = preparar();
    render(<Montar S={S}>{(ctx) => <MateriaisObra {...ctx} d={d} />}</Montar>);
    const sec = screen.getByRole("region", { name: "Materiais novos ainda não encomendados" });
    expect(sec.textContent).toMatch(/Silicone sanitário · 3 tubo/);
    expect(screen.queryByRole("button", { name: /Encomendar/ })).toBeNull();
    expect(screen.queryByText(SEM_PERM["obra.materiais"].sub)).toBeNull();
  });

  it("o editor da tarefa (plano) diz o que ainda não está encomendado, sem o botão «Encomendar»", () => {
    const { S, d, ti } = preparar();
    render(<Montar S={S}>{(ctx) => <ExtrasTarefa ctx={ctx} d={d} ti={ti} />}</Montar>);
    expect(screen.getByText(/^Ainda não encomendado: Silicone sanitário \(3 tubo\)$/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Encomendar" })).toBeNull();
  });

  it("no separador «Equipa e meios» da página da obra: com negocios.obra.materiais vê o bloco; sem ela, só o aviso", () => {
    const { S, d } = preparar();
    definirPermissoesReais({ codigos: new Set(["negocios.obra.materiais"]), simular: false });
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    fireEvent.click(screen.getByRole("tab", { name: "Equipa e meios" }));
    // o bloco dos materiais da obra (por fase), na página da obra
    expect(document.getElementById("obra-mat")?.textContent).toMatch(/Encomenda de cliente EC-1027/);
    expect(screen.queryByText(SEM_PERM["obra.materiais"].msg)).toBeNull();
    cleanup();
    definirPermissoesReais({ codigos: new Set(["purchase_orders.create"]), simular: false });
    render(<Montar S={S}>{(ctx) => <PaginaObra ctx={ctx} d={d} />}</Montar>);
    fireEvent.click(screen.getByRole("tab", { name: "Equipa e meios" }));
    expect(screen.getByText("Sem permissão para ver os materiais da obra")).toBeTruthy();
    expect(document.getElementById("obra-mat")).toBeNull();
  });
});
