// O cabeçalho fixo da Lista real não tapa o que recebe o foco, e nenhum cabeçalho parte o texto («WhatsApp» em duas linhas).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { pessoaLista } from "./fabricaLista";
import { COLUNAS_POR_OMISSAO } from "./colunasPessoas";
import { TabelaListaReal } from "./TabelaListaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

const desenhar = () => render(
  <MemoryRouter>
    <TabelaListaReal linhas={[pessoaLista("p1", { nome: "Ana Lopes" })]} ocupada={false} aoAbrir={vi.fn()} />
  </MemoryRouter>,
);

describe("TabelaListaReal: cabeçalho fixo", () => {
  it("a região com scroll reserva espaço no topo (scroll-pt) para o cabeçalho fixo não tapar o elemento focado ao navegar por teclado", () => {
    desenhar();
    expect(screen.getByRole("region").className).toMatch(/\bscroll-pt-(10|11|12)\b/);
  });

  it("todos os cabeçalhos ficam numa só linha (whitespace-nowrap)", () => {
    desenhar();
    const cabecalhos = screen.getAllByRole("columnheader");
    expect(cabecalhos).toHaveLength(COLUNAS_POR_OMISSAO.length);
    for (const c of cabecalhos) expect(c.className, c.textContent ?? "").toContain("whitespace-nowrap");
  });
});
