// A lista de negócios da ficha marca os de venda directa («Fecha na proposta (venda directa)»); os de fecho «contrato» (a omissão) não levam
// etiqueta para não encher a lista, e sem tipo conhecido (o exemplo) nada aparece.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FichaNegocios } from "./FichaNegocios";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

afterEach(cleanup);

describe("FichaNegocios: a etiqueta da venda directa", () => {
  it("marca só o negócio de fecho «proposta»", () => {
    render(
      <FichaNegocios
        hoje="2026-10-19"
        negocios={[
          negocioBase("n1", { servico: "Cozinha", estadoReal: "aberto", fecho: "proposta" }),
          negocioBase("n2", { servico: "Sala", estadoReal: "aberto", fecho: "contrato" }),
          negocioBase("n3", { servico: "Quarto", estadoReal: "aberto" }),
        ]}
      />,
    );
    expect(screen.getAllByText("Fecha na proposta (venda directa)")).toHaveLength(1);
    expect(screen.queryByText("Fecha no contrato")).toBeNull();
  });
});
