import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useFontePessoas, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { NegociosAtivos } from "@/hooks/pessoas/useNegociosAtivos";
import { PessoasRota } from "./PessoasRota";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

const ativosMock = vi.hoisted(() => vi.fn());
const repetirMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useNegociosAtivos", () => ({
  useNegociosAtivos: () => ativosMock(),
  useRepetirNegociosAtivos: () => repetirMock,
}));
let empresa: { id: string } | null = { id: "org-nike" };
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: empresa, isLoading: false }) }));

const vistas: FontePessoas[] = [];
function Sonda({ n = 0 }: { n?: number }) {
  const fonte = useFontePessoas();
  vistas.push(fonte);
  return <p data-n={n}>PAGINA {fonte.modo === "real" ? `${fonte.modo}:${fonte.organizationId}:${fonte.momentoGanho}` : fonte.modo}</p>;
}

const estado = (sobre: Partial<NegociosAtivos>): NegociosAtivos => ({
  ativo: false, momentoGanho: null, isLoading: false, isError: false, erroSemResposta: false, aRepetir: false, ...sobre,
});
const arvore = (n: number) => (
  <MemoryRouter initialEntries={["/pessoas"]}>
    <Routes>
      <Route path="/pessoas" element={<PessoasRota><Sonda n={n} /></PessoasRota>} />
      <Route path="/leads" element={<p>LEADS</p>} />
    </Routes>
  </MemoryRouter>
);
const desenhar = (sobre: Partial<NegociosAtivos>) => {
  ativosMock.mockReturnValue(estado(sobre));
  return render(arvore(0));
};

beforeEach(() => {
  ativosMock.mockReset();
  repetirMock.mockReset();
  vistas.length = 0;
  empresa = { id: "org-nike" };
});

describe("PessoasRota", () => {
  it("a carregar: contentor status com texto, imagem escondida, sem redirecionar nem montar", () => {
    desenhar({ isLoading: true });
    const caixa = screen.getByRole("status");
    expect(caixa).toHaveTextContent("A carregar pessoas...");
    const imagem = caixa.querySelector("img");
    expect(imagem?.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByText("LEADS")).toBeNull();
    expect(screen.queryByText(/PAGINA/)).toBeNull();
  });

  it("ativo: monta a página em modo real com a organização certa e o momento de ganho", () => {
    desenhar({ ativo: true, momentoGanho: "contrato_assinado" });
    expect(screen.getByText("PAGINA real:org-nike:contrato_assinado")).toBeInTheDocument();
  });

  it("ativo com momento de ganho desconhecido: usa null", () => {
    desenhar({ ativo: true, momentoGanho: "qualquer_coisa" });
    expect(screen.getByText("PAGINA real:org-nike:null")).toBeInTheDocument();
  });

  it("ativo sem organização ativa: não monta, vai para /leads", () => {
    empresa = null;
    desenhar({ ativo: true });
    expect(screen.getByText("LEADS")).toBeInTheDocument();
    expect(screen.queryByText(/PAGINA/)).toBeNull();
  });

  it("inativo: navega para /leads sem montar a página", () => {
    desenhar({ ativo: false });
    expect(screen.getByText("LEADS")).toBeInTheDocument();
    expect(screen.queryByText(/PAGINA/)).toBeNull();
  });

  it("erro sem nenhuma resposta: aviso com role alert, não redireciona e não monta", () => {
    desenhar({ isError: true, erroSemResposta: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível confirmar se esta página está disponível.");
    expect(screen.queryByText("LEADS")).toBeNull();
    expect(screen.queryByText(/PAGINA/)).toBeNull();
  });

  it("erro de uma repetição COM dados antigos: a página mantém-se", () => {
    desenhar({ isError: true, erroSemResposta: false, ativo: true });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/PAGINA real/)).toBeInTheDocument();
  });

  it("o botão «Tentar de novo» repete a leitura do interruptor", () => {
    desenhar({ isError: true, erroSemResposta: true });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(repetirMock).toHaveBeenCalledTimes(1);
  });

  it("enquanto repete, o botão fica desativado com aria-busy", () => {
    desenhar({ isError: true, erroSemResposta: true, aRepetir: true });
    const botao = screen.getByRole("button", { name: "Tentar de novo" });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("aria-busy", "true");
  });

  it("o valor do contexto é estável entre renders (useMemo)", () => {
    const ui = desenhar({ ativo: true, momentoGanho: "manual" });
    ui.rerender(arvore(1));
    const reais = vistas.filter((v) => v.modo === "real");
    expect(reais.length).toBeGreaterThanOrEqual(2);
    expect(reais[reais.length - 1]).toBe(reais[0]);
  });
});
