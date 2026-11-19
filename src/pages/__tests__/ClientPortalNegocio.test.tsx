// O negócio por dentro no portal do cliente: os avisos e o código por SMS (receber a obra e adenda), nos dois idiomas.
// O ecrã da V1 (src/emylia/PortalCliente) é do CRM e aqui é simulado: só interessa o que a página lhe entrega.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const rpc = vi.fn();

function cadeia(resultado: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(resultado).then(res);
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => cadeia({ data: [], error: null }),
  },
}));
vi.mock("@/components/portal/ClientPortalLayout", () => ({
  ClientPortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/portal/PortalOrgsErrorState", () => ({ PortalOrgsErrorState: () => <p>erro</p> }));
vi.mock("@/components/portal/negocio/ConversaDoNegocio", () => ({ ConversaDoNegocio: () => <p>conversa</p> }));
vi.mock("@/contexts/PortalCompanyContext", () => ({
  usePortalCompany: () => ({ activeOrg: { organizationId: "o1", entityId: "e1", proposalId: null, name: "Empresa" }, isLoading: false, isError: false }),
}));

// A V1 simulada: um botão para cada coisa que a página lhe entrega.
vi.mock("@/emylia/PortalCliente", () => ({
  PortalCliente: ({ ctx, real }: { ctx: { A: Record<string, () => void> }; real: Record<string, any> }) => (
    <div>
      <button onClick={() => real.abrirProposta()}>abrir-proposta</button>
      <button onClick={() => ctx.A.qualquerAcao()}>acao-sem-caminho</button>
      <p data-testid="aviso">{real.aviso}</p>
      <div data-testid="receber">{real.receberObra("tudo bem", () => {})}</div>
      <div data-testid="adenda">
        {real.assinarComSms({ titulo: "Aceitar a adenda", texto: "Texto da V1.", acao: "Aceitar e assinar", fim: "adenda_aceitar", ref: "A1", voltar: () => {} })}
      </div>
    </div>
  ),
}));
vi.mock("@/emylia/motor", () => ({ seed: () => ({ deals: [], clientes: [], svc: [] }), acoes: () => ({}) }));
vi.mock("@/emylia/acessosPortal", () => ({ definirModoReal: () => {} }));
vi.mock("@/emylia/obraOps", () => ({ RESPONSAVEL_OBRA: {} }));
vi.mock("@/emylia/real/encomendaReal", () => ({ definirEncomendasReais: () => {} }));
vi.mock("@/emylia/pagamentoCliente", () => ({ definirDadosPagamento: () => {}, lerDadosPagamento: (d: unknown) => d }));
vi.mock("@/emylia/real/vistaCliente", () => ({
  lerVista: (d: unknown) => d,
  comEstadoReal: (d: unknown) => d,
  aplicarRececao: () => {},
  aplicarResposta: () => {},
}));

import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";
import ClientPortalNegocio from "../ClientPortalNegocio";

const vista = {
  d: { id: "d1", obra: { auto: { n: 7 } } },
  svc: [],
  empresa: { nome: "Empresa", nomeFiscal: "Empresa, Lda", nif: "500000000" },
  responsavel: { n: "" },
  respostas: [],
  rececao: null,
  ec: null,
};

function mostrar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/client-portal/negocios/n1"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/client-portal/negocios/:id" element={<ClientPortalNegocio />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const enviarCodigo = async (rotulo: RegExp | string, dentro: string) => {
  const caixa = screen.getByTestId(dentro);
  const botao = Array.from(caixa.querySelectorAll("button")).find((b) => (typeof rotulo === "string" ? b.textContent === rotulo : rotulo.test(b.textContent ?? "")))!;
  await act(async () => { fireEvent.click(botao); });
};

beforeEach(() => {
  window.localStorage.clear();
  reporIdiomaEmMemoria();
  invoke.mockReset();
  rpc.mockReset();
  rpc.mockImplementation((f: string) => Promise.resolve({ data: f === "portal_neg_vista" ? vista : null, error: null }));
});
afterEach(() => reporIdiomaEmMemoria());

describe("ClientPortalNegocio: avisos", () => {
  it("em português: a proposta ainda indisponível e a ação sem caminho", async () => {
    mostrar();
    fireEvent.click(await screen.findByText("abrir-proposta"));
    expect(screen.getByTestId("aviso")).toHaveTextContent("A proposta ainda não está disponível. Tente daqui a pouco.");
    fireEvent.click(screen.getByText("acao-sem-caminho"));
    expect(screen.getByTestId("aviso")).toHaveTextContent("Isto ainda não se faz por aqui. Escreva-nos na conversa e tratamos consigo.");
  });

  it("em inglês: os mesmos avisos, e mudar de idioma muda o aviso já visível", async () => {
    definirIdioma("en");
    mostrar();
    fireEvent.click(await screen.findByText("abrir-proposta"));
    expect(screen.getByTestId("aviso")).toHaveTextContent("The proposal is not available yet. Please try again shortly.");
    fireEvent.click(screen.getByText("acao-sem-caminho"));
    expect(screen.getByTestId("aviso")).toHaveTextContent("This cannot be done here yet. Write to us in the conversation and we will take care of it.");
    act(() => definirIdioma("pt"));
    expect(screen.getByTestId("aviso")).toHaveTextContent("Isto ainda não se faz por aqui.");
  });
});

describe("ClientPortalNegocio: o código por SMS", () => {
  it("receber a obra, em português", async () => {
    mostrar();
    await screen.findByText("abrir-proposta");
    const caixa = screen.getByTestId("receber");
    expect(caixa).toHaveTextContent("Receber o serviço · auto 7");
    expect(caixa).toHaveTextContent("Assinar o auto de receção");
    expect(caixa).toHaveTextContent("Fica escrita a sua observação: «tudo bem». Para confirmar, enviamos um código por SMS para o seu telemóvel.");
    expect(caixa).toHaveTextContent("Enviar o código por SMS");
    expect(caixa).toHaveTextContent("Voltar ao auto");
  });

  it("receber a obra, em inglês", async () => {
    definirIdioma("en");
    mostrar();
    await screen.findByText("abrir-proposta");
    const caixa = screen.getByTestId("receber");
    expect(caixa).toHaveTextContent("Receive the service · report 7");
    expect(caixa).toHaveTextContent("Sign the acceptance report");
    expect(caixa).toHaveTextContent("Your remark is recorded: \"tudo bem\". To confirm, we will send a code by SMS to your mobile phone.");
    expect(caixa).toHaveTextContent("Send the code by SMS");
    expect(caixa).toHaveTextContent("Back to the report");
  });

  it("a adenda: o que vem da V1 fica como vem; o resto segue o idioma", async () => {
    definirIdioma("en");
    mostrar();
    await screen.findByText("abrir-proposta");
    const caixa = screen.getByTestId("adenda");
    expect(caixa).toHaveTextContent("Additional work · addendum A1");
    expect(caixa).toHaveTextContent("Aceitar a adenda");
    expect(caixa).toHaveTextContent("Texto da V1. To confirm, we will send a code by SMS to your mobile phone.");
    expect(caixa).toHaveTextContent("Back to the addendum");
  });

  it("sem mensagem do servidor, o erro de envio é o da chave e muda com o idioma", async () => {
    invoke.mockResolvedValue({ data: { error: true }, error: null });
    mostrar();
    await screen.findByText("abrir-proposta");
    await enviarCodigo("Enviar o código por SMS", "receber");
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Não foi possível enviar o código.");
    act(() => definirIdioma("en"));
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("We could not send the code.");
  });

  it("a mensagem do servidor fica como vem, em qualquer idioma", async () => {
    definirIdioma("en");
    invoke.mockResolvedValue({ data: { error: true, message: "Número sem telemóvel registado." }, error: null });
    mostrar();
    await screen.findByText("abrir-proposta");
    await enviarCodigo("Send the code by SMS", "receber");
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Número sem telemóvel registado.");
  });

  it("depois de enviado, pede o código, com o telemóvel mascarado, e verifica", async () => {
    definirIdioma("en");
    invoke.mockResolvedValue({ data: { masked_phone: "+351 9** *** 123" }, error: null });
    mostrar();
    await screen.findByText("abrir-proposta");
    await enviarCodigo("Send the code by SMS", "receber");
    const caixa = screen.getByTestId("receber");
    expect(caixa).toHaveTextContent("Code you received on +351 9** *** 123");
    expect(caixa).toHaveTextContent("Send another code");
    expect(caixa).toHaveTextContent("Sign the report");
  });
});
