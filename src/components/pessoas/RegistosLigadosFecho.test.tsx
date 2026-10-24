// «Registos ligados» (ficha real): os documentos por ligar (orçamentos, propostas e contratos sem negócio) não se oferecem, nem com fecho
// «proposta» nem com «contrato»: a ligação deles faz-se no fim, fora desta lista.
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

describe("documentos por ligar: nenhum se oferece, seja qual for o fecho", () => {
  it.each([["proposta" as const], ["contrato" as const], [undefined]])("fecho %s: nem a proposta nem o contrato têm botão de ligar", (fecho) => {
    mostrar(negocioBase("n1", { estadoReal: "aberto", ...(fecho ? { fecho } : {}) }));
    expect(ligarProposta()).toBeNull();
    expect(ligarContrato()).toBeNull();
    expect(screen.queryByRole("group", { name: "Documentos por ligar" })).toBeNull();
  });
});
