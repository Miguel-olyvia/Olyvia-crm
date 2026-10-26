// A ficha REAL com o contacto editável (telefone, email, preferências, idioma) e o tipo de cliente com condomínio, de ponta a ponta: a leitura
// (neg_ficha_pessoa) e as escritas (neg_substituir_contacto, neg_guardar_contacto_pessoa, neg_guardar_identidade_pessoa). Só o Supabase é simulado.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { fichaDb, PESSOA_ID, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { respostaErro, respostaOk, rpcMock } from "@/hooks/pessoas/fichaTestUtil";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { abrirApoio } from "./apoioFichaTeste";
import { FichaReal } from "./FichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
const lerMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/lerSubmissoesPessoa", () => ({ lerSubmissoesPessoa: (...args: unknown[]) => lerMock(...args) }));

beforeAll(prepararRadixNoJsdom);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const fichaCom = (pessoa: Parameters<typeof pessoaDb>[0] = {}, sobre: Partial<FichaDb> = {}): FichaDb =>
  fichaDb({ pessoa: pessoaDb({ tipo: "person", voltou_a_contactar: false, ...pessoa }), ...sobre });

let ficha: FichaDb;
const chamadas = (nome: string) => rpcMock.mock.calls.filter((c) => c[0] === nome);
const params = (nome: string, n = 0) => chamadas(nome)[n][1] as Record<string, unknown>;

beforeEach(() => {
  rpcMock.mockReset();
  lerMock.mockReset();
  lerMock.mockResolvedValue([]);
  ficha = fichaCom({ preferred_contact: "email", preferred_time: "tarde", locale: "es" });
  rpcMock.mockImplementation((nome: string) => (nome === "neg_ficha_pessoa" ? respostaOk(ficha) : respostaOk({ mudou: true })));
});
afterEach(() => cleanup());

function desenhar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <FontePessoasContext.Provider value={REAL}>
        <MemoryRouter>
          <FichaReal comGuia pessoaId={PESSOA_ID} idsVisiveis={[PESSOA_ID]} aoFechar={vi.fn()} aoIrPara={vi.fn()} aoLimpar={vi.fn()} />
        </MemoryRouter>
      </FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
}
const abrirDados = async () => {
  await screen.findByRole("region", { name: "Ana Lopes" });
  await screen.findByRole("button", { name: "Mais" });
  abrirApoio("Registos e dados");
  fireEvent.click(await screen.findByRole("button", { name: /^Dados da pessoa/ }));
  return screen.findByRole("region", { name: "Contacto e preferências" });
};

describe("FichaReal: contacto editável", () => {
  it("mostra o telefone, o email e as preferências que a base devolve (idioma desconhecido tal como está)", async () => {
    desenhar();
    const seccao = await abrirDados();
    expect(within(seccao).getByText("912345678")).toBeInTheDocument();
    expect(within(seccao).getByText("ana@exemplo.pt")).toBeInTheDocument();
    expect(within(seccao).getByText("Tarde")).toBeInTheDocument();
    expect(within(seccao).getByText("es")).toBeInTheDocument();
  });

  it("mudar o email chama neg_substituir_contacto e mais nada (as preferências não se tocam)", async () => {
    desenhar();
    const seccao = await abrirDados();
    fireEvent.click(within(seccao).getByRole("button", { name: "Editar contacto" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nova@exemplo.pt" } });
    fireEvent.click(within(seccao).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(chamadas("neg_substituir_contacto")).toHaveLength(1));
    expect(params("neg_substituir_contacto")).toEqual({ p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_email: "nova@exemplo.pt", p_telefone: null });
    expect(chamadas("neg_guardar_contacto_pessoa")).toHaveLength(0);
  });

  it("mudar a hora e o contacto preferido chama neg_guardar_contacto_pessoa, com a língua desconhecida a null", async () => {
    desenhar();
    const seccao = await abrirDados();
    fireEvent.click(within(seccao).getByRole("button", { name: "Editar contacto" }));
    fireEvent.change(screen.getByLabelText("Melhor hora"), { target: { value: "manha" } });
    fireEvent.change(screen.getByLabelText("Prefere ser contactado"), { target: { value: "whatsapp" } });
    fireEvent.click(within(seccao).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(chamadas("neg_guardar_contacto_pessoa")).toHaveLength(1));
    expect(params("neg_guardar_contacto_pessoa")).toEqual({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_preferred_contact: "whatsapp", p_preferred_time: "manha", p_locale: null,
    });
    expect(chamadas("neg_substituir_contacto")).toHaveLength(0);
  });

  it("um email que já é de outra pessoa (NG019) mostra a mensagem e deixa o formulário aberto, sem tocar nas preferências", async () => {
    rpcMock.mockImplementation((nome: string) => {
      if (nome === "neg_ficha_pessoa") return respostaOk(ficha);
      return nome === "neg_substituir_contacto" ? respostaErro("NG019") : respostaOk({ mudou: true });
    });
    desenhar();
    const seccao = await abrirDados();
    fireEvent.click(within(seccao).getByRole("button", { name: "Editar contacto" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "outra@exemplo.pt" } });
    fireEvent.change(screen.getByLabelText("Melhor hora"), { target: { value: "manha" } });
    fireEvent.click(within(seccao).getByRole("button", { name: "Guardar" }));
    expect(await within(seccao).findByRole("alert")).toHaveTextContent("já pertence a outra pessoa");
    expect(chamadas("neg_guardar_contacto_pessoa")).toHaveLength(0);
    expect(screen.getByLabelText("Email")).toHaveValue("outra@exemplo.pt");
  });

  it("sem permissão para editar não há botão", async () => {
    ficha = fichaCom({}, { permissoes: { editar: false, criar: true } });
    desenhar();
    const seccao = await abrirDados();
    expect(within(seccao).queryByRole("button", { name: "Editar contacto" })).toBeNull();
  });
});

describe("FichaReal: tipo de cliente", () => {
  it("um condomínio mostra «Condomínio» e editar o nome manda p_tipo condominio", async () => {
    ficha = fichaCom({ tipo: "organization", nome: "Edifício Sol", empresa_nome: "Edifício Sol", organization_kind: "condominio", tipo_cliente: "condominio" });
    desenhar();
    await screen.findByRole("button", { name: "Mais" });
    abrirApoio("Registos e dados");
    fireEvent.click(await screen.findByRole("button", { name: /^Dados da pessoa/ }));
    const identidade = await screen.findByRole("region", { name: "Identidade" });
    expect(within(identidade).getByText("Condomínio")).toBeInTheDocument();
    fireEvent.click(within(identidade).getByRole("button", { name: "Editar identidade" }));
    fireEvent.change(screen.getByLabelText("Nome do condomínio"), { target: { value: "Edifício Lua" } });
    fireEvent.click(within(identidade).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(chamadas("neg_guardar_identidade_pessoa")).toHaveLength(1));
    expect(params("neg_guardar_identidade_pessoa")).toMatchObject({ p_tipo: "condominio", p_nome_empresa: "Edifício Lua" });
  });
});
