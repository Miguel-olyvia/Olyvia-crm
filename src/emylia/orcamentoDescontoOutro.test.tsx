// 24/11 (contratos reais da Mudelar com 2% e 2,5% de desconto): o orçamento aceita um desconto à medida no campo «Outro».
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, tot, type Estado, type Negocio } from "./motor";
import { OrcamentoSimples } from "./OrcamentoSimples";

afterEach(cleanup);

function Pagina({ S, d }: { S: Estado; d: Negocio }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  const ctx = { S, A: acoes(S, vi.fn(), run), run, go: (fn: () => void) => () => run(fn), q: "", setQ: vi.fn() };
  return <OrcamentoSimples {...ctx} d={d} />;
}

describe("desconto «Outro» no orçamento", () => {
  it("escreve-se 2,5 e o total desce 2,5%; um valor fora de 0 a 50 não entra", () => {
    const S = seed();
    const d = S.deals.find((x) => x.orc && x.orc.linhas.length >= 3) as Negocio;
    d.orc!.enviada = null;
    d.orc!.desconto = 0;
    const antes = tot(d, S).pf;
    render(<Pagina S={S} d={d} />);
    const campo = screen.getAllByLabelText("Outro desconto, em percentagem")[0] as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "2,5" } });
    fireEvent.blur(campo);
    expect(d.orc!.desconto).toBe(2.5);
    expect(tot(d, S).pf).toBeCloseTo(antes * 0.975, 2);
    const outro = screen.getAllByLabelText("Outro desconto, em percentagem")[0] as HTMLInputElement;
    expect(outro.value).toBe("2,5");
    fireEvent.change(outro, { target: { value: "80" } });
    fireEvent.blur(outro);
    expect(d.orc!.desconto).toBe(2.5);
    // os botões fixos continuam a valer
    fireEvent.click(screen.getAllByRole("button", { name: "3%" })[0]);
    expect(d.orc!.desconto).toBe(3);
  });
});
