// O painel de um negócio tem «Perder negócio» enquanto o negócio está em curso (em qualquer fase) e não o tem num negócio já ganho.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AcoesNegocio } from "./AcoesNegocio";
import { faseDoNegocio, isNegocioGanho } from "./negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { perdaDoNegocio, repor } from "./negociosAlterados";
import { PainelNegocio } from "./PainelNegocio";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});
afterEach(() => { cleanup(); repor(); });

const acoes: AcoesNegocio = { abrirPessoa: vi.fn(), criarOrcamento: vi.fn() };
const abrir = (negocio: (typeof DADOS_EXEMPLO.negocios)[number]) =>
  render(<MemoryRouter><PainelNegocio negocio={negocio} hoje={HOJE_EXEMPLO} acoes={acoes} aoFechar={vi.fn()} /></MemoryRouter>);

describe("PainelNegocio: Perder negócio", () => {
  it.each(["orcamento", "proposta", "contrato"] as const)("um negócio em %s tem o botão, na barra de ações", (fase) => {
    const negocio = DADOS_EXEMPLO.negocios.find((n) => faseDoNegocio(n) === fase)!;
    abrir(negocio);
    const barra = screen.getByRole("group", { name: "Ações do negócio" });
    expect(within(barra).getByRole("button", { name: "Perder negócio" })).toBeInTheDocument();
  });

  it("um negócio ganho não o tem", () => {
    abrir(DADOS_EXEMPLO.negocios.find(isNegocioGanho)!);
    expect(screen.queryByRole("button", { name: "Perder negócio" })).toBeNull();
  });

  it("o botão abre o diálogo e perder com um motivo marca o negócio como perdido", () => {
    const negocio = DADOS_EXEMPLO.negocios.find((n) => faseDoNegocio(n) === "proposta")!;
    abrir(negocio);
    fireEvent.click(screen.getByRole("button", { name: "Perder negócio" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    expect(perdaDoNegocio(negocio.id)).toMatchObject({ motivo: "Preço", fase: "proposta" });
  });
});
