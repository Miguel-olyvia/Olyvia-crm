// Abrir um negócio a partir do Quadro, na página real: o cartão de um negócio abre a ficha da pessoa JÁ com esse negócio aberto
// (com o percurso), e o de uma pessoa em abordagem abre só a pessoa.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { repor } from "@/components/negocio-metas/negociosNovos";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { repor as reporPessoas } from "@/components/pessoas/pessoasNovas";
import { CHAVE_PREFS_PESSOAS } from "@/components/pessoas/preferenciasPessoas";
import PessoasCrm from "./PessoasCrm";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

/** A ficha abre num painel lateral e o Quadro é grande: com a máquina ocupada passa dos 5 s por omissão. */
const TEMPO = 30_000;

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt, "sidebar.crm": "CRM" };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true }) }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  window.localStorage.clear();
  repor();
  reporRegistos();
  reporPessoas();
});
afterEach(() => cleanup());

const abrirQuadro = () => {
  window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ vista: "quadro" }));
  render(<MemoryRouter initialEntries={["/pessoas"]}><PessoasCrm /></MemoryRouter>);
};
const coluna = (titulo: string) => screen.getByRole("heading", { level: 3, name: new RegExp(`^${titulo}`) }).closest("section")!;
/** O botão que abre o cartão: o primeiro do primeiro cartão da coluna (o outro é o botão do passo). */
const abrirPrimeiroCartao = (titulo: string) => {
  const [cartao] = within(coluna(titulo)).getAllByRole("listitem");
  fireEvent.click(within(cartao).getAllByRole("button")[0]);
};

describe("Pessoas: abrir um negócio a partir do Quadro", () => {
  it("o cartão de um negócio em Proposta abre a ficha já com esse negócio aberto, com o percurso", async () => {
    abrirQuadro();
    abrirPrimeiroCartao("Proposta");
    expect(await screen.findByRole("button", { name: /voltar aos negócios/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /percurso/i })).toBeInTheDocument();
  }, TEMPO);

  it("o negócio aberto mostra as fases (a atual e as que faltam) e o botão do passo seguinte, como no Quadro", async () => {
    abrirQuadro();
    abrirPrimeiroCartao("Proposta");
    await screen.findByRole("button", { name: /voltar aos negócios/i });
    const fases = screen.getByRole("heading", { level: 4, name: /fases do negócio/i }).closest("section")!;
    const itens = within(fases).getAllByRole("listitem").map((i) => i.textContent ?? "");
    // Orçamento já passou, a Proposta é a atual e o Contrato ainda falta.
    expect(itens).toEqual(expect.arrayContaining(["Orçamento, concluída", "Proposta, atual", "Contrato, por fazer"]));
    const passo = screen.getByRole("heading", { level: 4, name: /próximo passo/i }).closest("section")!;
    expect(within(passo).getAllByRole("button").length).toBeGreaterThan(0);
  }, TEMPO);

  it("o cartão de um negócio em Orçamento também abre a ficha no negócio certo", async () => {
    abrirQuadro();
    abrirPrimeiroCartao("Orçamento");
    expect(await screen.findByRole("button", { name: /voltar aos negócios/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: /percurso/i })).toBeInTheDocument();
  }, TEMPO);

  it("o cartão de uma pessoa em abordagem abre só a pessoa, sem nenhum negócio aberto", async () => {
    abrirQuadro();
    abrirPrimeiroCartao("Por contactar");
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: /voltar aos negócios/i })).toBeNull();
  }, TEMPO);
});
