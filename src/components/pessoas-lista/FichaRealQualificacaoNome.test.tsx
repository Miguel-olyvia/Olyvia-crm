// A ficha REAL com a classificação MQL/SQL à mão e com o nome em duas partes (first_name e last_name), de ponta a ponta: a leitura
// (neg_ficha_pessoa), a gravação pela rpc_update_lead e a ficha a refazer-se. O Supabase é simulado (rpc e a leitura da linha da lead).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { fichaDb, LEAD_ID, PESSOA_ID, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { respostaOk, rpcMock } from "@/hooks/pessoas/fichaTestUtil";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { FichaReal } from "./FichaReal";

const lerLead = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => {
  const cadeia: Record<string, unknown> = {};
  cadeia.select = () => cadeia;
  cadeia.eq = () => cadeia;
  cadeia.maybeSingle = () => lerLead();
  return { supabase: { rpc: (...args: unknown[]) => rpcMock(...args), from: () => cadeia } };
});
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/pessoas/lerSubmissoesPessoa", () => ({ lerSubmissoesPessoa: async () => [] }));

beforeAll(prepararRadixNoJsdom);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null, utilizadorId: "u-1" };
const fichaCom = (pessoa: Parameters<typeof pessoaDb>[0] = {}, sobre: Partial<FichaDb> = {}): FichaDb =>
  fichaDb({ pessoa: pessoaDb({ tipo: "person", voltou_a_contactar: false, ...pessoa }), ...sobre });

let ficha: FichaDb;
const chamadas = (nome: string) => rpcMock.mock.calls.filter((c) => c[0] === nome);

beforeEach(() => {
  rpcMock.mockReset();
  lerLead.mockReset();
  lerLead.mockResolvedValue({ data: { id: LEAD_ID, field_values: {}, status: "new", source: null, notes: null, assigned_to: null }, error: null });
  ficha = fichaCom();
  rpcMock.mockImplementation((nome: string) => (nome === "neg_ficha_pessoa" ? respostaOk(ficha) : respostaOk(null)));
});
afterEach(() => { cleanup(); });

function desenhar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <FontePessoasContext.Provider value={REAL}>
        <MemoryRouter>
          <FichaReal pessoaId={PESSOA_ID} idsVisiveis={[PESSOA_ID]} aoFechar={vi.fn()} aoIrPara={vi.fn()} aoLimpar={vi.fn()} />
        </MemoryRouter>
      </FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
}
const aberta = () => screen.findByRole("dialog", { name: "Ana Lopes" });

describe("FichaReal: classificação MQL/SQL à mão", () => {
  it("uma lead sem classificação oferece MQL e SQL; classificar grava por neg_classificar_lead e a ficha mostra o selo", async () => {
    rpcMock.mockImplementation((nome: string) => {
      if (nome === "neg_ficha_pessoa") return respostaOk(ficha);
      if (nome === "neg_classificar_lead") ficha = fichaCom({ qualificacao_tipo: "mql" });
      return respostaOk(null);
    });
    desenhar();
    await aberta();
    fireEvent.click(await screen.findByRole("button", { name: "Classificar como MQL" }));
    await waitFor(() => expect(chamadas("neg_classificar_lead")).toHaveLength(1));
    expect(chamadas("neg_classificar_lead")[0][1]).toEqual({ p_organization_id: "org-1", p_lead_id: LEAD_ID, p_tipo: "mql" });
    expect(chamadas("rpc_update_lead")).toHaveLength(0);
    expect(await screen.findByRole("button", { name: "Promover a SQL" })).toBeInTheDocument();
  });

  it("o selo aparece com a lead em qualquer estado (aqui «new»), sem a condição «qualified»", async () => {
    ficha = fichaCom({ qualificacao_tipo: "SQL" });
    desenhar();
    await aberta();
    expect(await screen.findByRole("button", { name: "Limpar classificação" })).toBeInTheDocument();
    expect(screen.getAllByText(/SQL - já falou com um comercial/).length).toBeGreaterThan(0);
  });

  it("sem lead (uma pessoa que só é cliente) não há classificação para fazer", async () => {
    ficha = fichaCom({ lead_id: null }, { lead: null });
    desenhar();
    await aberta();
    await screen.findByRole("region", { name: "Identidade" });
    expect(screen.queryByRole("heading", { name: "Qualificação comercial" })).toBeNull();
  });

  it("sem permissão para editar não aparece", async () => {
    ficha = fichaCom({}, { permissoes: { editar: false, criar: true } });
    desenhar();
    await aberta();
    await screen.findByRole("region", { name: "Identidade" });
    expect(screen.queryByRole("heading", { name: "Qualificação comercial" })).toBeNull();
  });
});

describe("FichaReal: nome em duas partes", () => {
  it("abre o formulário com first_name e last_name (Ana Maria e Silva), sem partir o nome visível", async () => {
    ficha = fichaCom({ nome: "Ana Maria Silva", first_name: "Ana Maria", last_name: "Silva" });
    desenhar();
    fireEvent.click(await screen.findByRole("button", { name: "Editar identidade" }));
    expect(screen.getByLabelText("Nome próprio")).toHaveValue("Ana Maria");
    expect(screen.getByLabelText("Apelido")).toHaveValue("Silva");
  });
});
