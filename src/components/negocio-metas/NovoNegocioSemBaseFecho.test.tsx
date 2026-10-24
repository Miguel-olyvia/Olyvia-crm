// O protótipo sem base («Novo negócio» do exemplo) não leva «Como fecha este negócio?»: o tipo de fecho é uma coluna da base e o exemplo não a tem.
// Só o «Novo negócio» da ficha real (FormularioNovoNegocioReal) pergunta.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import { repor } from "./registosPessoa";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); });

const abrir = () => {
  render(<NovoNegocioDialogo pessoas={[{ id: "p1", nome: "Marta Silveira" }]} aoCriar={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
  return screen.getByRole("dialog", { name: "Novo negócio" });
};

describe("o protótipo sem base não pergunta como fecha o negócio", () => {
  it("nenhuma das abas tem o grupo «Como fecha este negócio?» nem as suas opções", () => {
    abrir();
    for (const nome of ["Geral", "Qualificação", "Registos"]) {
      fireEvent.mouseDown(screen.getByRole("tab", { name: new RegExp(`^${nome}`) }), { button: 0 });
      expect(screen.queryByRole("radiogroup", { name: /Como fecha/ })).toBeNull();
      expect(screen.queryByText(/Como fecha este negócio/)).toBeNull();
      expect(screen.queryByRole("radio", { name: "Na proposta (venda directa)" })).toBeNull();
    }
  });
});
