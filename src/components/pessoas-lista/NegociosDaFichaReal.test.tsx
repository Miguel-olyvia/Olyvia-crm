// O contentor do negócio na ficha real (`NegociosDaFichaReal`): o que acontece a seguir a criar um negócio. Abrir o negócio novo só se a pessoa
// aberta ainda for a dele; os avisos saem também por uma região viva (o painel e o diálogo ficam fora da região da ficha); e o negócio acabado
// de criar só manda no que se abre enquanto o endereço não se mexe. As mutações são falsas (o Supabase não entra aqui).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { mutacoesFalsas, pendente } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio, ResultadoCriar } from "@/components/negocio-metas/mutacoesNegocio";
import { fichaDb, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { NegociosDaFichaReal } from "./NegociosDaFichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
const { atual } = vi.hoisted(() => ({ atual: { mutacoes: null as unknown, opcoes: undefined as undefined | { aoIndisponivel?: (chave: string) => void } } }));
vi.mock("@/hooks/pessoas/useMutacoesNegocio", () => ({
  useMutacoesNegocio: (_pessoa: string, _ficha: unknown, opcoes?: { aoIndisponivel?: (chave: string) => void }) => { atual.opcoes = opcoes; return atual.mutacoes; },
}));
const { sucesso, info, erro } = vi.hoisted(() => ({ sucesso: vi.fn(), info: vi.fn(), erro: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info, error: erro, success: sucesso } }));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => { vi.stubGlobal("crypto", { randomUUID: () => "id-1" }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sucesso.mockReset(); info.mockReset(); erro.mockReset(); });

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const FONTE: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: "manual" };
const fichaDe = (id: string, nome: string): FichaDb => fichaDb({ pessoa: pessoaDb({ id, nome }) });
const FICHA_A = fichaDe(A, "Ana Lopes");
const FICHA_B = fichaDe(B, "Bruno Reis");

interface Props {
  ficha: FichaDb;
  aberta: string | null;
  endereco?: string | null;
  aoAbrirNegocio?: (negocioId: string, pessoaId: string) => void;
  aoFecharFicha?: () => void;
}

function Montar({ ficha, aberta, endereco = null, aoAbrirNegocio, aoFecharFicha }: Props) {
  const cliente = new QueryClient();
  return (
    <QueryClientProvider client={cliente}>
      <FontePessoasContext.Provider value={FONTE}>
        <MemoryRouter>
          <NegociosDaFichaReal ficha={ficha} pessoaAberta={aberta} negocioDoEndereco={endereco} aoAbrirNegocio={aoAbrirNegocio} aoFecharFicha={aoFecharFicha}>
            {({ aoCriarNegocio, negocioInicial }) => (
              <div>
                <button type="button" onClick={aoCriarNegocio}>Abrir criar</button>
                <output data-testid="inicial">{negocioInicial ?? "nenhum"}</output>
              </div>
            )}
          </NegociosDaFichaReal>
        </MemoryRouter>
      </FontePessoasContext.Provider>
    </QueryClientProvider>
  );
}

const inicial = () => screen.getByTestId("inicial").textContent;
const montar = (mutacoes: MutacoesNegocio, props: Props) => {
  atual.mutacoes = mutacoes;
  return render(<Montar {...props} />);
};

function criarNegocio(titulo: string) {
  fireEvent.click(screen.getByRole("button", { name: "Abrir criar" }));
  const painel = screen.getByRole("dialog", { name: "Novo negócio" });
  fireEvent.change(within(painel).getByRole("textbox", { name: /^Título do negócio/ }), { target: { value: titulo } });
  fireEvent.click(within(painel).getByRole("button", { name: "Criar o negócio" }));
}
const regioesVivas = () => screen.getAllByRole("status", { hidden: true }).map((e) => e.textContent ?? "");

describe("NegociosDaFichaReal: criar um negócio e trocar de pessoa a meio da gravação", () => {
  it("se a pessoa aberta já não é a do negócio, o negócio novo não se abre (nem se escreve no endereço da outra pessoa)", async () => {
    const acao = pendente<ResultadoCriar>();
    const aoAbrirNegocio = vi.fn();
    const r = montar(mutacoesFalsas({ criar: vi.fn(() => acao.promessa) }), { ficha: FICHA_A, aberta: A, aoAbrirNegocio });
    criarNegocio("Sala");
    r.rerender(<Montar ficha={FICHA_B} aberta={B} aoAbrirNegocio={aoAbrirNegocio} />);
    await acao.terminar({ negocioId: "novo-1", mudou: true, recusados: [] });
    expect(aoAbrirNegocio).not.toHaveBeenCalled();
    expect(inicial()).toBe("nenhum");
  });

  it("com a mesma pessoa aberta abre o negócio novo, dizendo a que pessoa pertence", async () => {
    const aoAbrirNegocio = vi.fn();
    montar(mutacoesFalsas(), { ficha: FICHA_A, aberta: A, aoAbrirNegocio });
    criarNegocio("Sala");
    await waitFor(() => expect(aoAbrirNegocio).toHaveBeenCalledWith("id-1", A));
    expect(inicial()).toBe("id-1");
  });
});

describe("NegociosDaFichaReal: os avisos saem também por uma região viva", () => {
  it("«negócio criado» e «registos recusados» chegam à região viva (não só ao toast)", async () => {
    const criarMock = vi.fn(async (p: { id: string }): Promise<ResultadoCriar> => ({ negocioId: p.id, mudou: true, recusados: [{ tipo: "contacto", id: "c1" }] }));
    montar(mutacoesFalsas({ criar: criarMock as MutacoesNegocio["criar"] }), { ficha: FICHA_A, aberta: A });
    criarNegocio("Sala");
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Negócio «Sala» criado para Ana Lopes."));
    await waitFor(() => expect(regioesVivas().join(" | ")).toContain("Negócio «Sala» criado para Ana Lopes."));
    expect(regioesVivas().join(" | ")).toContain("1 registo não pôde ser ligado e fica por ligar na ficha.");
  });
});

describe("NegociosDaFichaReal: o negócio acabado de criar e o ?negocio= do endereço", () => {
  it("enquanto o endereço não se mexe, manda o negócio criado (e não o que lá estava antes)", async () => {
    montar(mutacoesFalsas(), { ficha: FICHA_A, aberta: A, endereco: "antigo" });
    expect(inicial()).toBe("antigo");
    criarNegocio("Sala");
    await waitFor(() => expect(inicial()).toBe("id-1"));
  });

  it("quando o endereço passa a outro negócio, manda o endereço; e a voltar à lista, não se reabre o criado", async () => {
    const r = montar(mutacoesFalsas(), { ficha: FICHA_A, aberta: A, endereco: "antigo" });
    criarNegocio("Sala");
    await waitFor(() => expect(inicial()).toBe("id-1"));
    r.rerender(<Montar ficha={FICHA_A} aberta={A} endereco="id-1" />);
    expect(inicial()).toBe("id-1");
    r.rerender(<Montar ficha={FICHA_A} aberta={A} endereco="outro" />);
    expect(inicial()).toBe("outro");
    r.rerender(<Montar ficha={FICHA_A} aberta={A} endereco={null} />);
    expect(inicial()).toBe("nenhum");
  });
});

describe("NegociosDaFichaReal: a pessoa ou a funcionalidade já não estão disponíveis (NG003 e NG008)", () => {
  it("o erro das mutações fecha a ficha (volta à Lista) e diz porquê, por toast e pela região viva", () => {
    const aoFecharFicha = vi.fn();
    montar(mutacoesFalsas(), { ficha: FICHA_A, aberta: A, aoFecharFicha });
    act(() => atual.opcoes?.aoIndisponivel?.("pessoasPagina.erroNeg.ng003"));
    expect(aoFecharFicha).toHaveBeenCalledTimes(1);
    expect(erro).toHaveBeenCalledWith("Esta pessoa já não está disponível.");
    expect(regioesVivas().join(" | ")).toContain("Esta pessoa já não está disponível.");
  });
});
