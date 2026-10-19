// A Lista real: depois de criar um negócio na ficha, o negócio novo vai para o endereço, mas só na pessoa a que pertence. Se entretanto se
// abriu outra pessoa, o endereço não se mexe (o negócio de uma pessoa nunca se abre na ficha de outra). A ficha é simulada: só interessa o
// `aoAbrirNegocio` que a página lhe dá.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import type { ListaPessoas } from "@/hooks/pessoas/useListaPessoas";
import { listaBase, pessoaLista } from "./fabricaLista";
import { PessoasReal } from "./PessoasReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
// Estes testes são do foco, do endereço e da ficha, não das leituras em lote por página (têm o seu ficheiro: PessoasRealColunas.test.tsx).
const semLeituras = vi.hoisted(() => new Map());
vi.mock("@/hooks/pessoas/useContactosPessoas", () => ({ useContactosPessoas: () => semLeituras }));
vi.mock("@/hooks/pessoas/useNomesResponsaveis", () => ({ useNomesResponsaveis: () => semLeituras }));
const listaMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useListaPessoas", () => ({ useListaPessoas: (f: FiltrosLista) => listaMock(f) }));
const fichaProps = vi.hoisted(() => ({ atual: null as null | { aoAbrirNegocio?: (negocioId: string, pessoaId: string) => void } }));
vi.mock("./FichaReal", () => ({ FichaReal: (p: { aoAbrirNegocio?: (negocioId: string, pessoaId: string) => void }) => { fichaProps.atual = p; return null; } }));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };

function Local() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}
const url = () => screen.getByTestId("url").textContent;

beforeEach(() => {
  fichaProps.atual = null;
  listaMock.mockReset();
  listaMock.mockReturnValue(listaBase({ linhas: [pessoaLista(A, { nome: "Ana" }), pessoaLista(B, { nome: "Bruno" })] } as Partial<ListaPessoas>));
});

const desenhar = (inicial: string) => render(
  <FontePessoasContext.Provider value={REAL}><MemoryRouter initialEntries={[inicial]}><PessoasReal /><Local /></MemoryRouter></FontePessoasContext.Provider>,
);

describe("PessoasReal: abrir o negócio criado", () => {
  it("na pessoa que está aberta, leva o negócio ao endereço", () => {
    desenhar(`/pessoas?open=${A}`);
    act(() => fichaProps.atual?.aoAbrirNegocio?.("n-novo", A));
    expect(url()).toBe(`/pessoas?open=${A}&negocio=n-novo`);
  });

  it("se a pessoa aberta já é outra, o endereço fica como estava", () => {
    desenhar(`/pessoas?open=${B}`);
    act(() => fichaProps.atual?.aoAbrirNegocio?.("n-novo", A));
    expect(url()).toBe(`/pessoas?open=${B}`);
  });
});
