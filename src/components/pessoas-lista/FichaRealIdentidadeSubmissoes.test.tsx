// A ficha REAL com as submissões de formulário, o aviso «Voltou a contactar» e a identidade (empresa ou pessoa singular), de ponta a ponta:
// a leitura (neg_ficha_pessoa), as escritas (neg_registar_contacto, neg_guardar_identidade_pessoa) e a ficha a refazer-se. Só o Supabase é
// simulado (rpc) e a leitura das submissões (que tem testes próprios).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { SubmissaoFicha } from "@/hooks/pessoas/adaptarSubmissoes";
import { fichaDb, PESSOA_ID, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { respostaErro, respostaOk, rpcMock } from "@/hooks/pessoas/fichaTestUtil";
import { FontePessoasContext, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { FichaReal } from "./FichaReal";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
const lerMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/lerSubmissoesPessoa", () => ({ lerSubmissoesPessoa: (...args: unknown[]) => lerMock(...args) }));

beforeAll(prepararRadixNoJsdom);

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", momentoGanho: null };
const cartao = (sobre: Partial<SubmissaoFicha> = {}): SubmissaoFicha => ({
  chave: "submissao:s1", tipo: "submissao", id: "s1", criadoEm: "2026-10-12T09:00:00Z", campanha: "Remodelações", origem: null, etapa: null, revisao: "pending",
  conflito: null, emailNaoGravado: null, telefoneNaoGravado: null, coincidencia: null, campos: [{ chave: "tipo_obra", rotulo: "Tipo de obra", valor: "Cozinha" }], ...sobre,
});
const fichaCom = (pessoa: Parameters<typeof pessoaDb>[0] = {}, sobre: Partial<FichaDb> = {}): FichaDb =>
  fichaDb({ pessoa: pessoaDb({ tipo: "person", voltou_a_contactar: false, ...pessoa }), ...sobre });

let ficha: FichaDb;
const chamadas = (nome: string) => rpcMock.mock.calls.filter((c) => c[0] === nome);
const params = (nome: string, n = 0) => chamadas(nome)[n][1] as Record<string, unknown>;

beforeEach(() => {
  rpcMock.mockReset();
  lerMock.mockReset();
  lerMock.mockResolvedValue([]);
  ficha = fichaCom();
  rpcMock.mockImplementation((nome: string) => (nome === "neg_ficha_pessoa" ? respostaOk(ficha) : respostaOk({ mudou: true })));
  let n = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `novo-${++n}` });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
// A identidade e a qualificação vivem em «Dados da pessoa», uma secção recolhível e fechada ao entrar.
const abrirDados = async () => { fireEvent.click(await screen.findByRole("button", { name: /^Dados da pessoa/ })); };
const AVISO = "Voltou a contactar";

describe("FichaReal: aviso «Voltou a contactar»", () => {
  it("aparece quando a base diz que a pessoa voltou a contactar, mesmo sem submissões por rever", async () => {
    ficha = fichaCom({ voltou_a_contactar: true });
    desenhar();
    await aberta();
    expect(await screen.findByText(AVISO)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver submissões/ })).toBeNull();
  });

  it("não aparece quando não voltou (nem quando a leitura é anterior ao campo)", async () => {
    desenhar();
    await aberta();
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it("oferece ver as submissões por rever e o botão leva ao separador", async () => {
    ficha = fichaCom({ voltou_a_contactar: true });
    lerMock.mockResolvedValue([cartao()]);
    desenhar();
    await aberta();
    fireEvent.click(await screen.findByRole("button", { name: "Ver submissões (1)" }));
    expect(await screen.findByText("Cozinha")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Submissões/ })).toHaveAttribute("aria-selected", "true");
  });

  it("apaga-se ao registar um contacto em Pessoas: a ficha refaz-se e o aviso desaparece", async () => {
    ficha = fichaCom({ voltou_a_contactar: true });
    rpcMock.mockImplementation((nome: string) => {
      if (nome === "neg_ficha_pessoa") return respostaOk(ficha);
      if (nome === "neg_registar_contacto") ficha = fichaCom({ voltou_a_contactar: false });
      return respostaOk({ mudou: true });
    });
    desenhar();
    await aberta();
    expect(await screen.findByText(AVISO)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Registar a chamada/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Não atendeu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(chamadas("neg_registar_contacto")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(AVISO)).toBeNull());
  });
});

describe("FichaReal: separador Submissões", () => {
  it("existe em modo real, com o número de submissões, e mostra um cartão por submissão, só para ler", async () => {
    lerMock.mockResolvedValue([cartao(), cartao({ chave: "lead:l1", tipo: "lead", id: "l1", revisao: null, etapa: "novo", campos: [{ chave: "x", rotulo: "Outro", valor: "Valor" }] })]);
    desenhar();
    await aberta();
    const aba = await screen.findByRole("tab", { name: /Submissões.*2/ });
    fireEvent.mouseDown(aba, { button: 0 });
    fireEvent.click(aba);
    expect(await screen.findByText("Cozinha")).toBeInTheDocument();
    expect(screen.getByText("Valor")).toBeInTheDocument();
    expect(screen.getByText("Por rever")).toBeInTheDocument();
    const painel = screen.getByRole("tabpanel");
    expect(within(painel).queryByRole("button")).toBeNull();
  });

  it("sem submissões diz-o; a aba Notas continua escondida", async () => {
    desenhar();
    await aberta();
    const aba = await screen.findByRole("tab", { name: /Submissões/ });
    fireEvent.mouseDown(aba, { button: 0 });
    fireEvent.click(aba);
    expect(await screen.findByText("Sem submissões de formulário associadas a esta pessoa.")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Notas/ })).toBeNull();
  });

  it("lê com a organização e a pessoa da ficha aberta", async () => {
    desenhar();
    await aberta();
    await waitFor(() => expect(lerMock).toHaveBeenCalledWith("org-1", PESSOA_ID));
  });

  it("uma falha da leitura diz-se no separador, sem afetar o resto da ficha", async () => {
    lerMock.mockRejectedValue({ code: "42501" });
    desenhar();
    await aberta();
    const aba = await screen.findByRole("tab", { name: /Submissões/ });
    fireEvent.mouseDown(aba, { button: 0 });
    fireEvent.click(aba);
    expect(await screen.findByText("Não foi possível carregar as submissões.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Registar a chamada/ })).toBeInTheDocument();
  });
});

describe("FichaReal: identidade", () => {
  it("mostra o tipo e o nome de uma pessoa singular e oferece editar", async () => {
    desenhar();
    await aberta();
    await abrirDados();
    const seccao = await screen.findByRole("region", { name: "Identidade" });
    expect(within(seccao).getByText("Pessoa singular")).toBeInTheDocument();
    expect(within(seccao).getByText("Ana Lopes")).toBeInTheDocument();
    expect(within(seccao).getByRole("button", { name: "Editar identidade" })).toBeInTheDocument();
  });

  it("mostra o nome da empresa de uma empresa", async () => {
    ficha = fichaCom({ tipo: "organization", nome: "Obras Lda", empresa_nome: "Obras Lda" });
    desenhar();
    await abrirDados();
    const seccao = await screen.findByRole("region", { name: "Identidade" });
    expect(within(seccao).getByText("Empresa")).toBeInTheDocument();
    expect(within(seccao).getByText("Nome da empresa")).toBeInTheDocument();
  });

  it("sem permissão para editar (permissoes.editar falso) não há botão", async () => {
    ficha = fichaCom({}, { permissoes: { editar: false, criar: true } });
    desenhar();
    await abrirDados();
    await screen.findByRole("region", { name: "Identidade" });
    expect(screen.queryByRole("button", { name: "Editar identidade" })).toBeNull();
  });

  it("numa leitura sem o tipo mostra o nome e não deixa editar", async () => {
    ficha = fichaCom({ tipo: null });
    desenhar();
    await abrirDados();
    await screen.findByRole("region", { name: "Identidade" });
    expect(screen.queryByRole("button", { name: "Editar identidade" })).toBeNull();
  });

  it("passar de pessoa singular a empresa chama a base com a assinatura exata, refaz a ficha e mostra o nome novo", async () => {
    rpcMock.mockImplementation((nome: string) => {
      if (nome === "neg_ficha_pessoa") return respostaOk(ficha);
      if (nome === "neg_guardar_identidade_pessoa") {
        ficha = fichaCom({ tipo: "organization", nome: "Lopes e Filhos", empresa_nome: "Lopes e Filhos" });
        return respostaOk({ tipo: "organization", nome: "Lopes e Filhos", empresa_nome: "Lopes e Filhos", mudou: true });
      }
      return respostaOk({ mudou: true });
    });
    desenhar();
    await aberta();
    await abrirDados();
    fireEvent.click(await screen.findByRole("button", { name: "Editar identidade" }));
    fireEvent.click(screen.getByRole("radio", { name: "Empresa" }));
    fireEvent.change(screen.getByLabelText("Nome da empresa"), { target: { value: "Lopes e Filhos" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(chamadas("neg_guardar_identidade_pessoa")).toHaveLength(1));
    expect(params("neg_guardar_identidade_pessoa")).toEqual({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_tipo: "organization", p_nome_empresa: "Lopes e Filhos", p_nome_proprio: null, p_apelido: null,
    });
    expect(await screen.findByRole("dialog", { name: "Lopes e Filhos" })).toBeInTheDocument();
    const seccao = screen.getByRole("region", { name: "Identidade" });
    expect(within(seccao).getByText("Empresa")).toBeInTheDocument();
  });

  it("uma pessoa partilhada (NG003) mostra a mensagem traduzida e deixa o formulário aberto", async () => {
    rpcMock.mockImplementation((nome: string) => (nome === "neg_ficha_pessoa" ? respostaOk(ficha) : respostaErro("NG003")));
    desenhar();
    await aberta();
    await abrirDados();
    fireEvent.click(await screen.findByRole("button", { name: "Editar identidade" }));
    fireEvent.change(screen.getByLabelText("Apelido"), { target: { value: "Gomes" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const seccao = screen.getByRole("region", { name: "Identidade" });
    expect(await within(seccao).findByRole("alert")).toHaveTextContent("não pode ser editada aqui");
    expect(screen.getByLabelText("Apelido")).toHaveValue("Gomes");
  });

  it("nunca pede nem mostra NIF", async () => {
    ficha = fichaCom({ tem_nif: true });
    desenhar();
    await abrirDados();
    fireEvent.click(await screen.findByRole("button", { name: "Editar identidade" }));
    const seccao = screen.getByRole("region", { name: "Identidade" });
    expect(within(seccao).queryByText(/nif/i)).toBeNull();
  });
});
