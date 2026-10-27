// O Portal do colaborador LIGADO: um link que não é de demonstração fala com a Edge Function `convite-admissao` (estado, otp_pedir,
// otp_verificar, ler, rascunho, submeter, sair). Supabase simulado: só se mexe em `functions.invoke`. A página é pública, por isso o simulado não tem
// `auth` nenhum: se o código tentasse ler a sessão da aplicação, o teste rebentava (é a prova de que corre como visitante).
// Os valores (token, sessão, código) são inventados para o teste e não valem em lado nenhum.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

// A faixa de demonstração usa a organização ativa do CRM, que não é o assunto deste teste.
vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({
  useCompany: () => ({ activeCompany: { name: "Organizacao de Teste" } }),
}));

import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { limparSessao } from "@/lib/hr/portalSessao";
import { translations } from "@/translations/index";
import RhPortalColaborador from "./RhPortalColaborador";

const TOKEN = "token-ficticio-do-teste-com-mais-de-vinte-caracteres";
const SESSAO = "T".repeat(43);
// O botão do cabeçalho da moldura da pré-visualização (`rhPortal.sair`, em pt).
const BOTAO_SAIR = "Sair";
const CODIGO_FICTICIO = "000000";

const tabela = translations as unknown as Record<string, Record<string, string>>;
const txt = (chave: string): string => {
  const texto = tabela.pt[chave];
  expect(texto, `falta a chave ${chave}`).toBeTruthy();
  return texto;
};

const erroHttp = (status: number, corpo: Record<string, unknown>) => ({
  data: null,
  error: { name: "FunctionsHttpError", message: "non-2xx", context: new Response(JSON.stringify(corpo), { status }) },
});

const convite = (extra: Record<string, unknown> = {}) => ({
  existe: true,
  estado: "convidada",
  estado_portal: "ativo",
  valid_until: "2099-10-30T10:00:00Z",
  primeiro_nome: "Joana",
  organizacao_nome: "Organizacao de Teste",
  bloqueado: false,
  precisa_otp: true,
  ...extra,
});

const lerOk = {
  data: {
    ok: true,
    estado: "em_preenchimento",
    rascunho: { telefone_pessoal: "912345678" },
    campos_obrigatorios: [],
    campos_editaveis: ["telefone_pessoal", "niss", "iban"],
    documentos_editaveis: [],
    niss_ultimos4: null,
    iban_ultimos4: null,
    devolucao: null,
    anexos: [],
    rejeicao_mensagem: null,
  },
  error: null,
};

type Resposta = { data: unknown; error: unknown };
function ligar(r: Record<string, Resposta>) {
  invoke.mockImplementation(async (_nome: string, o: { body: { action: string } }) => r[o.body.action] ?? erroHttp(500, { error: "erro_inesperado" }));
}
const base = (): Record<string, Resposta> => ({
  estado: { data: { ok: true, convite: convite() }, error: null },
  otp_pedir: { data: { ok: true, expira_em: "2099-10-16T10:10:00Z" }, error: null },
  otp_verificar: { data: { ok: true, sessao: SESSAO, sessao_expira_em: "2099-10-16T14:00:00Z" }, error: null },
  ler: lerOk,
  sair: { data: { ok: true, terminada: true }, error: null },
});
const chamadas = (accao: string) =>
  invoke.mock.calls.filter(([, o]) => (o as { body: { action: string } }).body.action === accao) as Array<
    [string, { body: Record<string, unknown>; headers?: Record<string, string> }]
  >;

function abrir(token: string) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[`/rh-exemplo/portal-colaborador/${token}`]}>
        <Routes>
          <Route path="/rh-exemplo/portal-colaborador/:token" element={<RhPortalColaborador />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

async function entrarComCodigo() {
  fireEvent.click(await screen.findByRole("button", { name: txt("portal.consulta.botao") }));
  const campo = await screen.findByLabelText(txt("portal.otp.rotulo"));
  await waitFor(() => expect(campo).toBeEnabled());
  fireEvent.change(campo, { target: { value: CODIGO_FICTICIO } });
  fireEvent.click(screen.getByRole("button", { name: txt("portal.otp.confirmar") }));
  return screen.findByRole("button", { name: BOTAO_SAIR });
}

beforeEach(() => {
  cleanup();
  repor();
  invoke.mockReset();
  captureFlowError.mockReset();
  limparSessao();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "languages", { value: ["pt-PT"], configurable: true });
  (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  ligar(base());
});
afterEach(() => {
  limparSessao();
});

describe("Portal do colaborador ligado à Edge convite-admissao", () => {
  it("abre o link como visitante: só a ação «estado», com o token do endereço, e a consulta limitada", async () => {
    abrir(TOKEN);
    expect(await screen.findByRole("button", { name: txt("portal.consulta.botao") })).toBeInTheDocument();
    expect(screen.getByText("Organizacao de Teste")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("convite-admissao");
    expect(chamadas("estado")[0][1].body).toEqual({ action: "estado", token: TOKEN });
    expect(chamadas("estado")[0][1].headers).toBeUndefined();
    expect(chamadas("ler")).toHaveLength(0);
    // Sem sessão não há dados pessoais nem campos.
    expect(document.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });

  it("um link que a Edge não reconhece mostra o cartão de link inválido (o visitante não tem organização ativa)", async () => {
    ligar({ ...base(), estado: erroHttp(404, { error: "convite_invalido" }) });
    abrir(TOKEN);
    expect(await screen.findByRole("heading", { level: 1, name: /Este link j[aá] n[aã]o [eé] v[aá]lido/ })).toBeInTheDocument();
    expect(screen.getByText(txt("hr.convite.motivo.inexistente"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: txt("portal.consulta.botao") })).not.toBeInTheDocument();
  });

  it.each([
    ["convite_expirado", "hr.convite.motivo.expirado"],
    ["convite_revogado", "hr.convite.motivo.substituido"],
    ["convite_ja_usado", "hr.convite.motivo.usado"],
  ])("o erro «%s» da Edge diz o motivo «%s»", async (codigo, chave) => {
    ligar({ ...base(), estado: erroHttp(410, { error: codigo }) });
    abrir(TOKEN);
    expect(await screen.findByText(txt(chave))).toBeInTheDocument();
  });

  it("confirmar a identidade pede o código (otp_pedir), verifica-o (otp_verificar) e lê o portal (ler) com a sessão no cabeçalho", async () => {
    abrir(TOKEN);
    await entrarComCodigo();
    expect(chamadas("otp_pedir")).toHaveLength(1);
    expect(chamadas("otp_verificar")[0][1].body).toEqual({ action: "otp_verificar", token: TOKEN, codigo: CODIGO_FICTICIO });
    await waitFor(() => expect(chamadas("ler")).toHaveLength(1));
    expect(chamadas("ler")[0][1].headers).toEqual({ "x-portal-sessao": SESSAO });
    // A sessão vive só em memória: nunca em armazenamento do navegador.
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(SESSAO);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(SESSAO);
  });

  it("«Terminar sessão» chama «sair» com a sessão e volta à consulta limitada", async () => {
    abrir(TOKEN);
    fireEvent.click(await entrarComCodigo());
    await waitFor(() => expect(chamadas("sair")).toHaveLength(1));
    expect(chamadas("sair")[0][1].headers).toEqual({ "x-portal-sessao": SESSAO });
    expect(await screen.findByRole("button", { name: txt("portal.consulta.botao") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: BOTAO_SAIR })).not.toBeInTheDocument();
  });

  it("uma sessão recusada pela Edge na leitura acaba a sessão e pede o código de novo", async () => {
    ligar({ ...base(), ler: erroHttp(401, { error: "sessao_expirada" }) });
    abrir(TOKEN);
    fireEvent.click(await screen.findByRole("button", { name: txt("portal.consulta.botao") }));
    const campo = await screen.findByLabelText(txt("portal.otp.rotulo"));
    await waitFor(() => expect(campo).toBeEnabled());
    fireEvent.change(campo, { target: { value: CODIGO_FICTICIO } });
    fireEvent.click(screen.getByRole("button", { name: txt("portal.otp.confirmar") }));
    await waitFor(() => expect(chamadas("ler")).toHaveLength(1));
    expect(await screen.findByRole("button", { name: txt("portal.consulta.botao") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: BOTAO_SAIR })).not.toBeInTheDocument();
  });

  it("desenha a moldura da pré-visualização com dados reais: organização, nome, acesso temporário, navegação e os quatro passos", async () => {
    abrir(TOKEN);
    await screen.findByRole("button", { name: txt("portal.consulta.botao") });
    expect(screen.getByText("Portal do colaborador")).toBeInTheDocument();
    expect(screen.getByText("Joana", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByTestId("portal-selo")).toHaveTextContent("Acesso temporário · termina a 30/10");
    expect(screen.getByTestId("convite-faixa-prazo")).toHaveTextContent("O teu acesso temporário termina a 30/10");
    const nav = screen.getByRole("navigation", { name: "Secções do portal" });
    expect(nav).toHaveTextContent("Ficha de admissão");
    expect(nav).toHaveTextContent("A preencher");
    expect(screen.getByRole("link", { name: /Ficha de admissão/ })).toHaveAttribute("aria-current", "page");
    // A troca de documentos não existe na base: não há entrada nem números inventados.
    expect(screen.queryByRole("link", { name: /Documentos/ })).not.toBeInTheDocument();
    const passos = screen.getByRole("navigation", { name: "Passos da admissão" });
    expect(passos.querySelectorAll("li")).toHaveLength(4);
    expect(passos.querySelector('[aria-current="step"]')).toHaveTextContent("Ficha");
    expect(passos).toHaveTextContent("Neste passo");
    expect(passos).toHaveTextContent("Por fazer");
    // Sem sessão não se escreve: não há rascunho guardado nem se finge que há.
    expect(screen.queryByText(/Rascunho guardado/)).not.toBeInTheDocument();
    expect(screen.queryByText("Pré-visualização de exemplo")).not.toBeInTheDocument();
  });

  it("com sessão, diz que o formulário grava sozinho (sem o aviso antigo nem o botão do NISS) e mostra o botão «Sair» no cabeçalho", async () => {
    abrir(TOKEN);
    await entrarComCodigo();
    expect(await screen.findByText(txt("portal.formulario.aviso"))).toBeInTheDocument();
    expect(screen.getByTestId("portal-colaborador-real")).toBeInTheDocument();
    expect(screen.getByText(txt("portal.ligado.aviso"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar niss|guardar iban/i })).not.toBeInTheDocument();
  });

  it("grava o rascunho com a sessão e mostra «Rascunho guardado às» com a hora que a Edge devolveu", async () => {
    ligar({ ...base(), rascunho: { data: { ok: true, guardado_em: "2099-10-16T10:42:00.000Z" }, error: null } });
    abrir(TOKEN);
    await entrarComCodigo();
    fireEvent.change(document.getElementById("convite-telefone-pessoal") as HTMLInputElement, { target: { value: "913000000" } });
    fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
    await waitFor(() => expect(chamadas("rascunho")).toHaveLength(1));
    const [, opcoes] = chamadas("rascunho")[0];
    expect(opcoes.headers).toEqual({ "x-portal-sessao": SESSAO });
    expect((opcoes.body.rascunho as Record<string, unknown>).telefone_pessoal).toBe("913000000");
    const d = new Date("2099-10-16T10:42:00.000Z");
    const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    await waitFor(() => expect(screen.getByTestId("portal-rascunho-estado")).toHaveTextContent(txt("portal.rascunho.guardado").replace("{{hora}}", hora)));
  });

  it("submete e mostra o ecrã de sucesso na moldura do portal, sem formulário nem sessão", async () => {
    ligar({ ...base(), submeter: { data: { ok: true }, error: null } });
    abrir(TOKEN);
    await entrarComCodigo();
    fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
    await screen.findByText(txt("hr.pessoais.bancarios"));
    fireEvent.change(document.getElementById("convite-assinatura-nome") as HTMLInputElement, { target: { value: "Joana Silva" } });
    fireEvent.click(document.getElementById("convite-aceite") as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.submeter") }));

    const titulo = await screen.findByRole("heading", { level: 1, name: txt("portal.sucesso.titulo") });
    await waitFor(() => expect(titulo).toHaveFocus());
    expect(screen.getByText("Portal do colaborador")).toBeInTheDocument();
    expect(document.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(chamadas("submeter")).toHaveLength(1);
    expect(chamadas("submeter")[0][1].body).toMatchObject({ assinatura_nome: "Joana Silva", declaracao: true });
    expect(chamadas("sair")).toHaveLength(0);
  });

  it("um processo submetido mostra a mesma moldura, a Aprovação do RH como passo atual e nenhum formulário", async () => {
    ligar({ ...base(), estado: { data: { ok: true, convite: convite({ estado: "submetida", precisa_otp: false }) }, error: null } });
    abrir(TOKEN);
    const passos = await screen.findByRole("navigation", { name: "Passos da admissão" });
    expect(passos.querySelector('[aria-current="step"]')).toHaveTextContent("Aprovação do RH");
    expect(screen.getByText(txt("portal.vista.analise.titulo"))).toBeInTheDocument();
    expect(document.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });

  it("os links de demonstração (as fichas de exemplo em memória) continuam na pré-visualização, sem o percurso do código", () => {
    abrir("exemplo");
    expect(screen.getByTestId("faixa-previsualizacao")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: txt("portal.consulta.botao") })).not.toBeInTheDocument();
    expect(chamadas("otp_pedir")).toHaveLength(0);
  });
});
