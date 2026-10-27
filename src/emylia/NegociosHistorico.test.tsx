import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { NegociosSimples } from "./NegociosSimples";

/** Como a aplicação: o Estado muda no sítio e `run` volta a desenhar a página. */
function Pagina({ S }: { S: Estado }) {
  const [, desenhar] = useState(0);
  const [q, setQ] = useState("");
  const run = (fn: () => void): void => { fn(); desenhar((n) => n + 1); };
  const A = acoes(S, () => desenhar((n) => n + 1), run);
  return <NegociosSimples S={S} A={A} run={run} go={(fn) => () => run(fn)} q={q} setQ={setQ} repor={vi.fn()} />;
}
const pagina = (S: Estado = seed()) => { S.filtro = "todos"; return { S, ...render(<Pagina S={S} />) }; };
const modo = (nome: string): void => { fireEvent.click(screen.getByRole("button", { name: nome, pressed: false })); };
const contagem = (): string => screen.getByRole("region", { name: "Lista de negócios" }).querySelector("[aria-live]")?.textContent ?? "";

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

describe("Negócios simples · Quadro, Lista e Painel", () => {
  it("abre no Quadro e a Lista mostra todos os negócios de sempre, perdidos incluídos", () => {
    const { S } = pagina();
    expect(screen.getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "true");
    modo("Lista");
    expect(contagem()).toContain(`${S.deals.length} negócio`);
    expect(localStorage.getItem("emylia-negocios-modo")).toBe("lista");
  });

  it("o estado filtra e o histórico abre na linha", () => {
    const S0 = seed(), um = S0.deals[1];
    um.perdido = true; um.motivoPerda = "Achou caro"; um.hist.unshift({ t: "Marcado como perdido · Achou caro", q: "20/10", k: "x" });
    const { S } = pagina(S0);
    modo("Lista");
    const perdidos = S.deals.filter((d) => d.perdido).length;
    const grupo = screen.getByRole("group", { name: "Estado" });
    fireEvent.click(within(grupo).getByRole("button", { name: /^Perdido/ }));
    expect(contagem()).toContain(`${perdidos} negócio`);
    fireEvent.click(screen.getByRole("button", { name: `Histórico de ${um.nome}` }));
    // a tabela (computador) e os cartões (telemóvel) abrem o mesmo histórico
    for (const h of screen.getAllByRole("list", { name: `Histórico de ${um.nome}` })) expect(h).toHaveTextContent(um.hist[0].t);
  });

  it("a procura vai ao histórico e Limpar tira tudo", () => {
    const { S } = pagina();
    modo("Lista");
    const d = S.deals.find((x) => x.hist.some((e) => e.t.includes("Proposta enviada")))!;
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "proposta enviada" } });
    expect(screen.getAllByRole("button", { name: d.nome }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Limpar os filtros/ }));
    expect(contagem()).toContain(`${S.deals.length} negócio`);
  });

  it("no Painel, tocar em Em aberto passa para a Lista já filtrada", () => {
    const { S } = pagina();
    modo("Painel");
    expect(screen.getByRole("region", { name: "Números dos negócios" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver os abertos na lista/ }));
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    expect(contagem()).toContain(`${S.deals.filter((d) => !d.perdido && d.fase < 4 && d.orc?.contrato !== "assinado" && !(d.orc?.vendaDireta && d.orc.aceite)).length} negócio`);
  });

  it("abrir um negócio da lista vai para a página do negócio", () => {
    const { S } = pagina();
    modo("Lista");
    const d = S.deals[0];
    fireEvent.click(screen.getAllByRole("button", { name: d.nome })[0]);
    expect(S.view).toBe("negocio");
    expect(S.deal).toBe(d.id);
  });
});
