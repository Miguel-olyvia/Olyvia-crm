// O funil da abordagem: as pessoas por contactar, contactadas e com visita, e os negócios em Levantamento. Conta à parte das metas (que só
// contam a partir do Orçamento). É informação: não leva ações.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FunilAbordagem } from "./FunilAbordagem";

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

const funil = { porContactar: 4, contactado: 3, visita: 2, levantamento: 1 };

describe("FunilAbordagem", () => {
  it("é uma secção com título e uma lista de quatro etapas, cada uma com o nome e o número", () => {
    render(<FunilAbordagem funil={funil} />);
    const secao = screen.getByRole("heading", { level: 2, name: "Abordagem" }).closest("section")!;
    const itens = within(secao).getAllByRole("listitem");
    expect(itens.map((i) => i.textContent)).toEqual(["Por contactar4", "Contactado3", "Visita2", "Levantamento1"]);
  });

  it("explica que não conta para as metas, em texto visível", () => {
    render(<FunilAbordagem funil={funil} />);
    expect(screen.getByText("Conta à parte: as metas só contam a partir do Orçamento.")).toBeInTheDocument();
  });

  it("com tudo a zero mostra os zeros (o funil vazio também é informação)", () => {
    render(<FunilAbordagem funil={{ porContactar: 0, contactado: 0, visita: 0, levantamento: 0 }} />);
    expect(screen.getAllByRole("listitem").map((i) => i.textContent)).toEqual(["Por contactar0", "Contactado0", "Visita0", "Levantamento0"]);
  });
});
