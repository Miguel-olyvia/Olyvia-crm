// A ficha REAL com o negócio completo (P3), de ponta a ponta: a leitura (neg_ficha_pessoa), as escritas (neg_*) e a ficha a refazer-se depois
// de cada uma. Só o Supabase é simulado (rpc). Cobre perder, ligar um registo e criar um negócio, e o que se vê a seguir. O «Dar como ganho»
// antigo já não existe: o ganho é o fecho v4 (BlocoFechoNegocio.test.tsx).
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { contactoDb, fichaDb, LEAD_ID, negocioDb, PESSOA_ID, seccaoDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { respostaOk, rpcMock } from "@/hooks/pessoas/fichaTestUtil";
import { FontePessoasContext, type FontePessoas, type MomentoGanho } from "@/hooks/pessoas/useFontePessoas";
import { FichaReal } from "./FichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);

const fonte = (momentoGanho: MomentoGanho | null = "manual"): FontePessoas => ({ modo: "real", organizationId: "org-1", momentoGanho });
const orcamento = { id: "o1", numero: "O-1", estado: "enviado", total: 1000, criado_em: "2026-10-11T09:00:00Z" };
const FICHA_BASE = fichaDb({
  negocios: { total: 1, itens: [negocioDb({ id: "n1", titulo: "Casa de banho", orcamentos: [orcamento], valor: 1000, pronto_a_ganhar: true })] },
  leads_abertas: [{ id: LEAD_ID, status: "new", created_at: "2026-09-01T10:00:00Z", closure_result: null }],
  contactos: seccaoDb([contactoDb({ id: "c1", em: "2026-10-12T09:30:00Z" })]),
});

let ficha: FichaDb;
const chamadas = (nome: string) => rpcMock.mock.calls.filter((c) => c[0] === nome);
const params = (nome: string, n = 0) => chamadas(nome)[n][1] as Record<string, unknown>;

beforeEach(() => {
  rpcMock.mockReset();
  ficha = FICHA_BASE;
  rpcMock.mockImplementation((nome: string) => {
    if (nome === "neg_ficha_pessoa") return respostaOk(ficha);
    if (nome === "neg_criar_negocio") {
      ficha = fichaDb({
        ...FICHA_BASE,
        negocios: { total: 2, itens: [negocioDb({ id: "novo-1", titulo: "Quarto" }), ...(FICHA_BASE.negocios?.itens ?? [])] },
      });
      return respostaOk({ negocio_id: "novo-1", mudou: true, ligados: [], recusados: [], lead_escolhida: LEAD_ID });
    }
    return respostaOk({ mudou: true });
  });
  let n = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `novo-${++n}` });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function desenhar(momento: MomentoGanho | null = "manual", sobre: Partial<Parameters<typeof FichaReal>[0]> = {}) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <FontePessoasContext.Provider value={fonte(momento)}>
        <MemoryRouter>
          <FichaReal pessoaId={PESSOA_ID} idsVisiveis={[PESSOA_ID]} aoFechar={vi.fn()} aoIrPara={vi.fn()} aoLimpar={vi.fn()} negocioInicial="n1" {...sobre} />
        </MemoryRouter>
      </FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
}
const detalhe = () => screen.findByRole("heading", { level: 3, name: "Casa de banho" });

describe("FichaReal com o negócio completo", () => {
  it("abre já no negócio pedido e oferece perder, sem o «Dar como ganho» antigo", async () => {
    desenhar();
    await detalhe();
    expect(screen.getByRole("button", { name: "Perder negócio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dar como ganho" })).toBeNull();
  });

  it("seja qual for a regra da organização não há «Dar como ganho» e nunca se chama neg_ganhar_negocio", async () => {
    for (const regra of ["manual", "proposta_aceite", "contrato_assinado"] as const) {
      desenhar(regra);
      await detalhe();
      expect(screen.queryByRole("button", { name: "Dar como ganho" })).toBeNull();
      cleanup();
    }
    expect(chamadas("neg_ganhar_negocio")).toHaveLength(0);
  });

  it("perder vai para a base com a fase e o motivo", async () => {
    desenhar();
    await detalhe();
    fireEvent.click(screen.getByRole("button", { name: "Perder negócio" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    await waitFor(() => expect(chamadas("neg_perder_negocio")).toHaveLength(1));
    expect(params("neg_perder_negocio")).toEqual({ p_negocio_id: "n1", p_fase: "orcamento", p_motivo: "Preço" });
  });

  it("ligar um registo por ligar vai para a base com o tipo e o id", async () => {
    desenhar();
    await detalhe();
    fireEvent.click(within(screen.getByRole("heading", { level: 4, name: /^Registos ligados/ })).getByRole("button"));
    fireEvent.click(await screen.findByRole("button", { name: /^Ligar a este negócio: Contacto de/ }));
    await waitFor(() => expect(chamadas("neg_ligar_registo")).toHaveLength(1));
    expect(params("neg_ligar_registo")).toEqual({ p_negocio_id: "n1", p_tipo: "contacto", p_registo_id: "c1" });
  });

  it("«Criar negócio» abre o painel, cria na base com a lead e abre o negócio novo", async () => {
    desenhar("manual", { negocioInicial: null });
    await screen.findByRole("dialog", { name: "Ana Lopes" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Criar negócio/ }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.change(within(painel).getByRole("textbox", { name: /^Título do negócio/ }), { target: { value: "Quarto" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar o negócio" }));
    await waitFor(() => expect(chamadas("neg_criar_negocio")).toHaveLength(1));
    expect(params("neg_criar_negocio")).toMatchObject({
      p_id: "novo-1", p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_titulo: "Quarto", p_lead_id: LEAD_ID, p_reabrir_abordagem: false, p_fecho: "contrato",
    });
    expect(await screen.findByRole("heading", { level: 3, name: "Quarto" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo negócio" })).toBeNull());
  });

  it("sem permissões (editar e criar a falso) não há ações de escrita sobre o negócio nem «Criar negócio»", async () => {
    ficha = fichaDb({ ...FICHA_BASE, permissoes: { editar: false, criar: false } });
    desenhar();
    await detalhe();
    expect(screen.queryByRole("button", { name: "Perder negócio" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Criar negócio/ })).toBeNull();
  });
});

describe("FichaReal: o foco depois de criar um negócio", () => {
  it("vai para o título do negócio novo, e não para o botão «Mais»", async () => {
    desenhar("manual", { negocioInicial: null });
    await screen.findByRole("dialog", { name: "Ana Lopes" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Criar negócio/ }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.change(within(painel).getByRole("textbox", { name: /^Título do negócio/ }), { target: { value: "Quarto" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Criar o negócio" }));
    const titulo = await screen.findByRole("heading", { level: 3, name: "Quarto" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo negócio" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(titulo));
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Mais" }));
  });

  it("cancelar o painel continua a devolver o foco ao botão «Mais»", async () => {
    desenhar("manual", { negocioInicial: null });
    await screen.findByRole("dialog", { name: "Ana Lopes" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Mais" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Criar negócio/ }));
    const painel = await screen.findByRole("dialog", { name: "Novo negócio" });
    fireEvent.click(within(painel).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Novo negócio" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mais" })));
  });
});
