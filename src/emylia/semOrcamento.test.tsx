// 11/11: um negócio na fase Negócio (ou mais à frente) sem orçamento (ex.: as versões de `quotes` apagadas na base) não pode rebentar a
// lista de Negócios nem o Hoje para toda a gente: o próximo passo diz o que se passa e os outros negócios abrem como sempre.
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEM_ORCAMENTO, acoes, proximo, seed, semOrcamento, type Estado } from "./motor";
import { NegociosSimples } from "./NegociosSimples";
import { HojeSimples } from "./HojeSimples";
import { passosDaFase } from "./PaginaNegocio";

function estadoComUmSemOrcamento(): { S: Estado; id: number } {
  const S = seed();
  const d = S.deals.find((x) => x.fase === 3 && x.orc && !x.perdido)!;
  d.orc = null as never;
  return { S, id: d.id };
}

function Lista({ S }: { S: Estado }) {
  const [, desenhar] = useState(0);
  const [q, setQ] = useState("");
  const run = (fn: () => void): void => { fn(); desenhar((n) => n + 1); };
  const A = acoes(S, () => desenhar((n) => n + 1), run);
  return <NegociosSimples S={S} A={A} run={run} go={(fn) => () => run(fn)} q={q} setQ={setQ} repor={vi.fn()} />;
}
function Hoje({ S }: { S: Estado }) {
  const [, desenhar] = useState(0);
  const run = (fn: () => void): void => { fn(); desenhar((n) => n + 1); };
  const A = acoes(S, () => desenhar((n) => n + 1), run);
  return <HojeSimples S={S} A={A} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />;
}

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

describe("negócio na fase Negócio sem orçamento", () => {
  it("o próximo passo é o aviso, sem passos de orçamento", () => {
    const { S, id } = estadoComUmSemOrcamento();
    const d = S.deals.find((x) => x.id === id)!;
    expect(semOrcamento(d)).toBe(true);
    expect(proximo(d, S)).toMatchObject({ t: SEM_ORCAMENTO, wait: true });
    const passos = passosDaFase({ S, A: acoes(S, vi.fn(), (f) => f()), run: (f) => f(), go: (f) => f, q: "" } as never, d, true);
    expect(passos.map((p) => p.id)).toEqual(["sem-orcamento"]);
  });

  it("a lista de Negócios abre e mostra os outros negócios", () => {
    const { S, id } = estadoComUmSemOrcamento();
    S.filtro = "todos";
    render(<Lista S={S} />);
    expect(screen.getAllByText(SEM_ORCAMENTO).length).toBeGreaterThan(0);
    const outro = S.deals.find((x) => x.id !== id && !x.perdido && x.fase < 3)!;
    expect(screen.getAllByText(outro.nome).length).toBeGreaterThan(0);
  });

  it("o Hoje abre", () => {
    const { S } = estadoComUmSemOrcamento();
    S.role = "comercial";
    expect(() => render(<Hoje S={S} />)).not.toThrow();
  });
});
