// O contentor do negócio na ficha real passa aos ecrãs se se pode apagar negócios (vem da fonte da página) e dá-lhes as escritas diretas.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import { mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { fichaDb, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { NegociosDaFichaReal } from "./NegociosDaFichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
const { atual } = vi.hoisted(() => ({ atual: { mutacoes: null as unknown } }));
vi.mock("@/hooks/pessoas/useMutacoesNegocio", () => ({ useMutacoesNegocio: () => atual.mutacoes }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
afterEach(cleanup);

const FICHA = fichaDb({ pessoa: pessoaDb({ id: "11111111-1111-4111-8111-111111111111", nome: "Ana Lopes" }) });

function Sonda() {
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  return <p data-testid="s">{`apagar:${String(dados?.podeApagar)} lixo:${typeof mutacoes?.enviarParaLixo}`}</p>;
}

const montar = (fonte: FontePessoas) => {
  atual.mutacoes = mutacoesFalsas({ enviarParaLixo: vi.fn(async () => undefined) });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FontePessoasContext.Provider value={fonte}>
        <MemoryRouter>
          <NegociosDaFichaReal ficha={FICHA} pessoaAberta={FICHA.pessoa.id} negocioDoEndereco={null}>{() => <Sonda />}</NegociosDaFichaReal>
        </MemoryRouter>
      </FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
  return screen.getByTestId("s").textContent;
};

describe("NegociosDaFichaReal: podeApagar", () => {
  it("vem da fonte real", () => {
    expect(montar({ modo: "real", organizationId: "org-1", momentoGanho: "manual", podeApagarNegocios: true })).toBe("apagar:true lixo:function");
  });

  it("sem a indicação da fonte é falso", () => {
    expect(montar({ modo: "real", organizationId: "org-1", momentoGanho: "manual" })).toBe("apagar:false lixo:function");
  });
});
