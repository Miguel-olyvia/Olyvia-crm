// «Registos ligados» num negócio de fecho «proposta» (ficha real): os contratos por ligar não se oferecem. Com fecho «contrato» (ou sem tipo)
// oferecem-se como sempre.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { ComCostura, dadosFalsos, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { repor } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { negocioBase } from "./fabricaTestes";
import { RegistosLigadosNegocio } from "./RegistosLigadosNegocio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); });

const documentosPorLigar: DadosNegocio["documentosPorLigar"] = [
  { tipo: "proposta", id: "p1", numero: "P-1", temBase: true },
  { tipo: "contrato", id: "k1", numero: "C-1", temBase: true },
];

function mostrar(negocio: NegocioMes) {
  render(
    <AnuncioFichaContext.Provider value={vi.fn()}>
      <ComCostura mutacoes={mutacoesFalsas()} dados={dadosFalsos({ documentosPorLigar })}>
        <RegistosLigadosNegocio negocio={negocio} aberto />
      </ComCostura>
    </AnuncioFichaContext.Provider>,
  );
}
const ligarContrato = () => screen.queryByRole("button", { name: /Contrato C-1/ });
const ligarProposta = () => screen.queryByRole("button", { name: /Proposta P-1/ });

describe("documentos por ligar, segundo o tipo de fecho", () => {
  it("fecho «proposta»: a proposta liga-se, o contrato não se oferece", () => {
    mostrar(negocioBase("n1", { estadoReal: "aberto", fecho: "proposta" }));
    expect(ligarProposta()).not.toBeNull();
    expect(ligarContrato()).toBeNull();
  });

  it("fecho «contrato»: os dois oferecem-se", () => {
    mostrar(negocioBase("n1", { estadoReal: "aberto", fecho: "contrato" }));
    expect(ligarProposta()).not.toBeNull();
    expect(ligarContrato()).not.toBeNull();
  });

  it("sem tipo conhecido: tudo como estava", () => {
    mostrar(negocioBase("n1", { estadoReal: "aberto" }));
    expect(ligarContrato()).not.toBeNull();
  });
});
