/**
 * `ConviteAdmissao`: o comprovativo de IBAN no portal temporario. So esse tipo esta aberto (cartao de
 * cidadao e fotografia estao fechados e nem aparecem). Quando a pessoa indicou um IBAN o comprovativo e
 * OBRIGATORIO: a linha diz «Obrigatorio» em texto e submeter sem ele mostra o resumo («Falta enviar: ...»,
 * `role="alert"`) com o foco em «Adicionar ficheiro», sem chamar a Edge. O servidor repete a regra
 * (`anexos_em_falta`) e o ecra trata-a da mesma maneira. O envio em si (URL assinado, quarentena,
 * confirmacao) esta em `useConviteAnexos.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/hooks/useTranslation", async () => {
  const { translations } = await import("@/translations/index");
  const pt = (translations as unknown as Record<string, Record<string, string>>).pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (chave: string, params?: Record<string, string | number>) => {
        let texto = pt[chave] ?? chave;
        Object.entries(params ?? {}).forEach(([k, v]) => {
          texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        });
        return texto;
      },
    }),
  };
});

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import ConviteAdmissao from "../ConviteAdmissao";
import { translations } from "@/translations/index";
import { limparSessao } from "@/lib/hr/portalSessao";

const pt = (translations as unknown as Record<string, Record<string, string>>).pt;
const SESSAO = "S".repeat(43);

const IBAN_LIGADO = {
  id: "i1", tipo: "comprovativo_iban", nome: "iban.pdf", estado: "ligado", tamanho_bytes: 2048, mime_type: "application/pdf",
};

const erroHttp = (status: number, corpo: Record<string, unknown>) => ({
  data: null,
  error: {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: new Response(JSON.stringify(corpo), { status }),
  },
});

interface Cenario {
  ler?: Record<string, unknown>;
  submeter?: unknown;
}

function ligar({ ler = {}, submeter = { data: { ok: true }, error: null } }: Cenario = {}) {
  invoke.mockImplementation(async (_n: string, o: { body: { action: string } }) => {
    switch (o.body.action) {
      case "estado":
        return {
          data: {
            ok: true,
            convite: {
              existe: true,
              estado: "em_preenchimento",
              estado_portal: "ativo",
              valid_until: "2099-10-30T10:00:00Z",
              primeiro_nome: "Joana",
              organizacao_nome: "Mudelar Teste",
              bloqueado: false,
              precisa_otp: true,
            },
          },
          error: null,
        };
      case "otp_pedir":
        return { data: { ok: true, expira_em: "2099-10-16T10:10:00Z" }, error: null };
      case "otp_verificar":
        return { data: { ok: true, sessao: SESSAO, sessao_expira_em: "2099-10-16T14:00:00Z" }, error: null };
      case "ler":
        return {
          data: {
            ok: true,
            estado: "em_preenchimento",
            rascunho: {},
            campos_obrigatorios: [],
            campos_editaveis: ["assinatura_nome"],
            documentos_editaveis: ["comprovativo_iban"],
            niss_ultimos4: null,
            iban_ultimos4: null,
            devolucao: null,
            anexos: [],
            anexos_obrigatorios: [],
            anexos_em_falta: [],
            rejeicao_mensagem: null,
            ...ler,
          },
          error: null,
        };
      case "submeter":
        return submeter;
      default:
        return { data: null, error: { message: "inesperado", context: new Response("{}", { status: 500 }) } };
    }
  });
}

async function entrar() {
  render(
    <MemoryRouter initialEntries={["/admissao/token-de-teste-com-mais-de-vinte-caracteres"]}>
      <Routes>
        <Route path="/admissao/:token" element={<ConviteAdmissao />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: pt["portal.consulta.botao"] }));
  const campo = await screen.findByLabelText(pt["portal.otp.rotulo"]);
  await waitFor(() => expect(campo).toBeEnabled());
  fireEvent.change(campo, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: pt["portal.otp.confirmar"] }));
  await screen.findByRole("button", { name: pt["portal.sair"] });
  // Os documentos ficam na pagina 2 do formulario do convite (entre o fardamento e a assinatura).
  fireEvent.click(screen.getByRole("button", { name: pt["hr.convite.seguinte"] }));
  await screen.findByText(pt["hr.pessoais.bancarios"]);
}

const porId = (id: string) => document.getElementById(id) as HTMLInputElement;
const assinarEAceitar = () => {
  fireEvent.change(porId("convite-assinatura-nome"), { target: { value: "Joana Silva" } });
  fireEvent.click(porId("convite-aceite"));
};
const submeter = () => fireEvent.click(screen.getByRole("button", { name: pt["hr.convite.submeter"] }));
const accoesChamadas = () => invoke.mock.calls.map(([, o]) => (o as { body: { action: string } }).body.action);
const RESUMO = "Falta enviar: Comprovativo de IBAN, porque indicou um IBAN.";
const botaoAdicionar = () => screen.getByRole("button", { name: /Adicionar ficheiro/ });

describe("ConviteAdmissao: comprovativo de IBAN no portal", () => {
  beforeEach(() => {
    invoke.mockReset();
    limparSessao();
    sessionStorage.clear();
  });

  it("so ha a linha do comprovativo: o cartao de cidadao e a fotografia estao fechados", async () => {
    ligar();
    await entrar();
    expect(screen.getByRole("group", { name: /Comprovativo de IBAN/ })).toBeInTheDocument();
    expect(screen.queryByText("Cartão de cidadão")).toBeNull();
    expect(screen.queryByText("Fotografia")).toBeNull();
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(document.querySelector('input[type="file"]')).not.toHaveAttribute("capture");
  });

  it("com IBAN indicado a linha diz «Obrigatório» em texto; sem IBAN nao diz", async () => {
    ligar({ ler: { anexos_obrigatorios: ["comprovativo_iban"], anexos_em_falta: ["comprovativo_iban"] } });
    await entrar();
    expect(screen.getByRole("group", { name: /Comprovativo de IBAN/ })).toHaveTextContent("(Obrigatório)");
  });

  it("sem IBAN o comprovativo e opcional", async () => {
    ligar();
    await entrar();
    const grupo = screen.getByRole("group", { name: /Comprovativo de IBAN/ });
    expect(within(grupo).queryByText("(Obrigatório)")).toBeNull();
  });

  it("diz que os ficheiros guardam ao enviar (e nao fala de um botao «Gravar», que nao existe: o rascunho e automatico)", async () => {
    ligar();
    await entrar();
    expect(screen.getByText("Os ficheiros ficam guardados assim que são enviados.")).toBeInTheDocument();
    expect(screen.queryByText(/quando gravar/)).toBeNull();
  });

  it("quem abre sem IBAN e o escreve passa a ver «Obrigatório» e fica bloqueado, sem esperar por outra leitura", async () => {
    ligar({ ler: { campos_editaveis: ["assinatura_nome", "iban", "conta_numero"] } });
    await entrar();
    const grupo = () => screen.getByRole("group", { name: /Comprovativo de IBAN/ });
    expect(within(grupo()).queryByText("(Obrigatório)")).toBeNull();
    fireEvent.change(porId("convite-conta-numero"), { target: { value: "PT50000201231234567890154" } });
    await waitFor(() => expect(within(grupo()).getByText("(Obrigatório)")).toBeInTheDocument());
    assinarEAceitar();
    submeter();
    const alertas = await screen.findAllByRole("alert");
    expect(alertas.some((a) => a.textContent === RESUMO)).toBe(true);
    expect(accoesChamadas()).not.toContain("submeter");
  });

  it("o IBAN ja guardado no cofre (iban_ultimos4) tambem obriga o comprovativo", async () => {
    ligar({ ler: { iban_ultimos4: "0154" } });
    await entrar();
    expect(within(screen.getByRole("group", { name: /Comprovativo de IBAN/ })).getByText("(Obrigatório)")).toBeInTheDocument();
    assinarEAceitar();
    submeter();
    expect((await screen.findAllByRole("alert")).some((a) => a.textContent === RESUMO)).toBe(true);
    expect(accoesChamadas()).not.toContain("submeter");
  });

  it("anexos_em_falta do servidor com a lista vazia usa o comprovativo de IBAN e o resumo NAO desaparece", async () => {
    ligar({ submeter: erroHttp(409, { error: "anexos_em_falta", campos: [] }) });
    await entrar();
    assinarEAceitar();
    submeter();
    const resumo = async () => (await screen.findAllByRole("alert")).find((a) => a.textContent === RESUMO);
    const alerta = await waitFor(async () => {
      const a = await resumo();
      expect(a).toBeDefined();
      return a as HTMLElement;
    });
    // o botao le o resumo, e o cartao passa a dizer «Obrigatório»
    expect(botaoAdicionar().getAttribute("aria-describedby") ?? "").toContain(alerta.id);
    expect(within(screen.getByRole("group", { name: /Comprovativo de IBAN/ })).getByText("(Obrigatório)")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(await resumo()).toBeDefined();
  });

  it("o botao de adicionar liga-se ao resumo (aria-describedby) e ganha o foco depois de montado", async () => {
    ligar({ ler: { anexos_obrigatorios: ["comprovativo_iban"], anexos_em_falta: ["comprovativo_iban"] } });
    await entrar();
    assinarEAceitar();
    submeter();
    await screen.findAllByRole("alert");
    const alerta = document.getElementById("portal-erro-submissao") as HTMLElement;
    expect(alerta).toHaveTextContent(RESUMO);
    await waitFor(() => expect(botaoAdicionar()).toHaveFocus());
    expect(botaoAdicionar().getAttribute("aria-describedby") ?? "").toContain("portal-erro-submissao");
  });

  it("em `convidada` a base nao aceita ficheiros: o cartao de anexos nao aparece", async () => {
    ligar({ ler: { estado: "convidada" } });
    await entrar();
    expect(screen.queryByRole("group", { name: /Comprovativo de IBAN/ })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("submeter sem o comprovativo mostra o resumo (alert), leva o foco a «Adicionar ficheiro» e nao chama a Edge", async () => {
    ligar({ ler: { anexos_obrigatorios: ["comprovativo_iban"], anexos_em_falta: ["comprovativo_iban"] } });
    await entrar();
    assinarEAceitar();
    submeter();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(RESUMO);
    await waitFor(() => expect(botaoAdicionar()).toHaveFocus());
    expect(accoesChamadas()).not.toContain("submeter");
  });

  it("com o comprovativo ja ligado a submissao segue para a Edge", async () => {
    ligar({ ler: { anexos: [IBAN_LIGADO], anexos_obrigatorios: ["comprovativo_iban"], anexos_em_falta: [] } });
    await entrar();
    expect(screen.getByText("iban.pdf")).toBeInTheDocument();
    assinarEAceitar();
    submeter();
    await screen.findByTestId("portal-sucesso");
    expect(accoesChamadas()).toContain("submeter");
  });

  it("o servidor diz anexos_em_falta (409) e o ecra trata-o como falta de documento: resumo e foco", async () => {
    // O ecra achava que nada faltava; o servidor sabe mais.
    ligar({ ler: {}, submeter: erroHttp(409, { error: "anexos_em_falta", campos: ["comprovativo_iban"] }) });
    await entrar();
    assinarEAceitar();
    submeter();
    expect(await screen.findByRole("alert")).toHaveTextContent(RESUMO);
    await waitFor(() => expect(botaoAdicionar()).toHaveFocus());
    expect(accoesChamadas()).toContain("submeter");
    expect(screen.queryByTestId("portal-sucesso")).toBeNull();
    // Nunca o codigo em bruto.
    expect(document.body.textContent).not.toContain("anexos_em_falta");
  });

  it("devolvida com o IBAN devolvido: o comprovativo antigo nao serve, so um enviado agora", async () => {
    ligar({
      ler: {
        estado: "devolvida",
        documentos_editaveis: ["comprovativo_iban"],
        anexos: [{ ...IBAN_LIGADO, id: "velho" }],
        anexos_obrigatorios: ["comprovativo_iban"],
        anexos_em_falta: ["comprovativo_iban"],
      },
    });
    await entrar();
    assinarEAceitar();
    submeter();
    const alertas = await screen.findAllByRole("alert");
    expect(alertas.some((a) => a.textContent === RESUMO)).toBe(true);
    expect(accoesChamadas()).not.toContain("submeter");
  });

  it("devolvida sem pedido de documentos: o cartao de anexos nem aparece", async () => {
    ligar({ ler: { estado: "devolvida", documentos_editaveis: [], campos_editaveis: ["assinatura_nome"] } });
    await entrar();
    expect(screen.queryByRole("group", { name: /Comprovativo de IBAN/ })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("o nome do ficheiro que a pessoa enviou aparece como texto, nunca como HTML", async () => {
    const nome = '<img src=x onerror="alert(1)">.pdf';
    ligar({ ler: { anexos: [{ ...IBAN_LIGADO, nome }], anexos_obrigatorios: ["comprovativo_iban"] } });
    await entrar();
    const grupo = screen.getByRole("group", { name: /Comprovativo de IBAN/ });
    expect(within(grupo).getByText(nome)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
