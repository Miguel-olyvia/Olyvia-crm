// Dentro de «Detalhes do negócio» (o diálogo da ficha com o guia): quando o botão «Mudar o tipo de fecho» desaparece (o negócio já não está aberto), o foco
// não pode cair no corpo do diálogo: passa para o título do diálogo.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ComCostura, dadosFalsos, erroNegFalso, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: () => ({ comerciais: [], isLoading: false, isError: false, repetir: vi.fn() }),
}));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const HOJE = "2026-10-19";
const aberto = negocioBase("n1", {
  pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto", fecho: "contrato", orcamentos: [{ id: "o", valor: 100, escolhido: true }], proposta: { estado: "enviada" },
});

describe("o foco dentro de «Detalhes do negócio»", () => {
  it("com o negócio já não aberto (NG022), cancelar o diálogo de mudar o fecho deixa o foco no título do diálogo de detalhes", async () => {
    const mudarFecho = vi.fn(async () => { throw erroNegFalso("pessoasPagina.erroNeg.ng022", "NG022"); });
    const mutacoes = mutacoesFalsas({ mudarFecho });
    const arvore = (negocio: typeof aberto) => (
      <MemoryRouter>
        <ComCostura mutacoes={mutacoes} dados={dadosFalsos()}>
          <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} comGuia apoioAberto aoFecharApoio={vi.fn()} />
        </ComCostura>
      </MemoryRouter>
    );
    const { rerender } = render(arvore(aberto));
    const detalhes = screen.getByRole("dialog", { name: "Detalhes do negócio" });
    fireEvent.click(within(detalhes).getByRole("button", { name: "Mudar o tipo de fecho" }));
    const mudar = screen.getByRole("dialog", { name: "Mudar o tipo de fecho" });
    fireEvent.click(within(mudar).getByRole("button", { name: "Passar a fechar na proposta" }));
    await within(mudar).findByRole("alert");
    rerender(arvore({ ...aberto, estadoReal: "ganho" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mudar o tipo de fecho" })).toBeNull());
    const titulo = within(screen.getByRole("dialog", { name: "Detalhes do negócio" })).getByRole("heading", { name: "Detalhes do negócio" });
    await waitFor(() => expect(titulo).toHaveFocus());
  });
});
