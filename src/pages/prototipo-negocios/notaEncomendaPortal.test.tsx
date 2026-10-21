// 21/10: a nota de encomenda que o cliente vê no portal não mostra o estado das linhas cuja encomenda ao fornecedor está por aprovar.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { esquecerInventario } from "./inventario/loja";
import { acoes, seed } from "./motor";
import { FINANCEIRO, emFalta } from "./campos";
import { NotaEncomendaDoc } from "./DocsCliente";

afterEach(cleanup);
beforeEach(() => { esquecerInventario(); });

describe("nota de encomenda no portal do cliente", () => {
  it("esconde «encomenda a fornecedor por aprovar» e mostra os outros estados", () => {
    const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
    for (let i = 0; i < 5; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
    A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
    render(<NotaEncomendaDoc d={d} />);
    const moveis = screen.getByText("Conjunto de móveis de cozinha").closest("li")!;
    expect(moveis.textContent).not.toMatch(/por aprovar/);
    expect(moveis.textContent).toMatch(/escolhido na visita|do modelo/);
    expect(screen.getByText("Bancada em pedra").closest("li")!.textContent).toMatch(/reservado em armazém/);
  });
  it("21/10: as linhas das encomendas de ajuste aparecem como ajuste à obra, incluídas (não somam ao valor)", () => {
    const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
    for (let i = 0; i < 5; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
    A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
    A.role("operacoes"); A.novaTarefaPlano(d.id, { sid: "revest", q: 20, fase: 3 });
    render(<NotaEncomendaDoc d={d} />);
    const li = screen.getByText("Cimento-cola C2TE").closest("li")!;
    expect(li.textContent).toMatch(/ajuste à obra/);
    expect(li.textContent).toMatch(/incluído/);
    expect(li.textContent).not.toMatch(/por aprovar/);
  });
});
