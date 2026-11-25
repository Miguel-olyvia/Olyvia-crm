// 25/11 (Rúben, no «+» de uma fase com a obra em curso): «no fim pede se foi o cliente ou imprevisto, e não deve: eu devia preencher
// logo direto». O «Porquê?» (quem paga) vem no próprio formulário da tarefa nova, no lugar do botão de juntar.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(cleanup);

function montar() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, d, p: d.obra.plano! };
}

describe("a tarefa nova com a obra em curso", () => {
  it("o «Porquê?» está no formulário: escolhe-se o serviço e logo quem paga, sem passo à parte", async () => {
    const { d, p } = montar();
    expect(p.estado).toBe("em curso");
    const n0 = p.tasks.length;
    fireEvent.click(screen.getAllByRole("button", { name: /Nova tarefa na fase 1/ })[0]);
    const form = screen.getByRole("region", { name: "Nova tarefa" });
    fireEvent.click(within(within(form).getByRole("list", { name: "Serviços" })).getAllByRole("button")[0]);
    // o botão de juntar dá lugar à escolha de quem paga, no mesmo formulário
    expect(within(form).queryByRole("button", { name: /Juntar à fase/ })).toBeNull();
    const quem = within(form).getByRole("radiogroup", { name: "Quem paga" });
    fireEvent.click(within(quem).getByRole("radio", { name: /Atraso ou erro nosso/ }));
    fireEvent.click(within(form).getByRole("button", { name: /Aplicar: paga a empresa/ }));
    expect(d.obra.plano!.tasks.length).toBe(n0 + 1);
    // o painel fecha (depois da animação de saída) e não abre outro «Porquê?» a seguir
    await waitFor(() => expect(screen.queryByRole("region", { name: "Nova tarefa" })).toBeNull());
    expect(screen.queryAllByRole("region", { name: "Porquê?" }).length).toBe(0);
  });
});
