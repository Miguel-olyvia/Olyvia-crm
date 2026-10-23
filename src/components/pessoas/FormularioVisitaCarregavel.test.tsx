// FormularioVisitaCarregavel: o formulário da visita carrega-se à parte; se o pacote falhar a carregar (rede, deploy novo) o erro fica contido no
// diálogo, traduzido, com «Tentar de novo», em vez de partir a ficha toda.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return { useTranslation: () => ({ language: "pt", t: (key: string) => textos[key] ?? key }) };
});

import { FormularioVisitaCarregavel } from "./FormularioVisitaCarregavel";

function Formulario({ nome }: { nome: string }) {
  return <p>Formulário de {nome}</p>;
}

describe("FormularioVisitaCarregavel", () => {
  it("carrega o formulário e passa-lhe as propriedades", async () => {
    const importar = vi.fn(() => Promise.resolve({ default: Formulario }));
    render(<FormularioVisitaCarregavel importar={importar} propriedades={{ nome: "Ana" }} />);
    expect(await screen.findByText("Formulário de Ana")).toBeInTheDocument();
  });

  it("se o pacote falha, o erro fica dentro do diálogo (role alert, traduzido) e a página não parte; «Tentar de novo» volta a pedir o pacote", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const importar = vi.fn()
      .mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"))
      .mockResolvedValueOnce({ default: Formulario });
    render(
      <div>
        <p>Resto da ficha</p>
        <FormularioVisitaCarregavel importar={importar} propriedades={{ nome: "Ana" }} />
      </div>,
    );
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível carregar este formulário");
    expect(alerta.textContent).not.toMatch(/Failed to fetch/);
    expect(screen.getByText("Resto da ficha")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Formulário de Ana")).toBeInTheDocument();
    expect(importar).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    consola.mockRestore();
  });
});
