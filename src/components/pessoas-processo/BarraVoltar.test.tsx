// A barra «Voltar à pessoa» dos ecrãs partilhados (orçamentos, propostas, contratos): só aparece quando o endereço traz um `?voltar=` seguro,
// isto é, um caminho que começa por /pessoas. Qualquer outro valor (um sítio externo, outra página) é ignorado: seria um redirecionamento aberto.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BarraVoltar } from "./BarraVoltar";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
afterEach(cleanup);

const montar = (endereco: string) => render(<MemoryRouter initialEntries={[endereco]}><BarraVoltar /></MemoryRouter>);
const voltar = (caminho: string) => `/proposals?open=p1&voltar=${encodeURIComponent(caminho)}`;

describe("BarraVoltar", () => {
  it("com um regresso seguro mostra uma ligação «Voltar à pessoa» para a ficha", () => {
    montar(voltar("/pessoas?open=a&negocio=n1"));
    const ligacao = screen.getByRole("link", { name: "Voltar à pessoa" });
    expect(ligacao).toHaveAttribute("href", "/pessoas?open=a&negocio=n1");
    expect(screen.getByRole("navigation", { name: "Regresso à ficha" })).toContainElement(ligacao);
  });

  it.each([
    ["sem o parâmetro", "/proposals?open=p1"],
    ["um sítio externo", voltar("https://evil.com")],
    ["sem protocolo", voltar("//evil.com")],
    ["outra página da aplicação", voltar("/leads")],
    ["javascript", voltar("javascript:alert(1)")],
    ["um domínio que começa por pessoas", voltar("/pessoas.evil.com")],
    ["vazio", "/proposals?voltar="],
  ])("não desenha nada com %s", (_nome, endereco) => {
    montar(endereco);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
