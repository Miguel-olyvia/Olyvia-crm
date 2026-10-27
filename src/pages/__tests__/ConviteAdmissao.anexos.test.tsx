/**
 * `ConviteAdmissao`: os documentos (cartao de cidadao, comprovativo de IBAN, fotografia) no
 * portal temporario. Os anexos ficam para a fase 2 (a Edge responde 410 `portal_em_atualizacao`),
 * por isso o portal NAO os liga: a zona de documentos esta desenhada e desactivada, com a razao
 * ("chega numa proxima fase"), e nunca chama `anexo_*`. Os anexos que a `ler` devolve mostram-se so como lista
 * (so o nome), sem abrir nem descarregar nada.
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

const ANEXOS = [
  { id: "a1", tipo: "cartao_cidadao", nome: "cartao.pdf", estado: "ligado" },
  { id: "a2", tipo: "comprovativo_iban", nome: "iban.png", estado: "ligado" },
];

function ligar(anexos: unknown[]) {
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
            campos_editaveis: [],
            documentos_editaveis: ["cartao_cidadao", "comprovativo_iban", "fotografia"],
            niss_ultimos4: null,
            iban_ultimos4: null,
            devolucao: null,
            anexos,
            rejeicao_mensagem: null,
          },
          error: null,
        };
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
  // Os documentos ficam na pagina 2 do formulario do convite (o sitio que ja tinham: entre o fardamento e a assinatura).
  fireEvent.click(screen.getByRole("button", { name: pt["hr.convite.seguinte"] }));
  await screen.findByText(pt["hr.pessoais.bancarios"]);
}

const accoesChamadas = () => invoke.mock.calls.map(([, o]) => (o as { body: { action: string } }).body.action);

describe("ConviteAdmissao: documentos no portal da V3a", () => {
  beforeEach(() => {
    invoke.mockReset();
    limparSessao();
    sessionStorage.clear();
  });

  it("a zona de documentos esta desactivada e diz que fica para a proxima fase", async () => {
    ligar([]);
    await entrar();
    const botao = screen.getByRole("button", { name: pt["portal.proxima.documentos"] });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAccessibleDescription(pt["portal.proxima.razao"]);
  });

  it("nao ha seletor de ficheiros no portal", async () => {
    ligar([]);
    await entrar();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("os anexos que a leitura devolveu aparecem so como lista (nome e estado), sem ligacoes", async () => {
    ligar(ANEXOS);
    await entrar();
    const lista = screen.getByRole("list", { name: pt["portal.documentos.titulo"] });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent("cartao.pdf");
    expect(itens[1]).toHaveTextContent("iban.png");
    expect(within(lista).queryByRole("link")).toBeNull();
  });

  it("a zona de documentos esta entre o fardamento e a assinatura, onde o convite sempre a teve", async () => {
    ligar(ANEXOS);
    await entrar();
    const fardamento = screen.getByText(pt["hr.fardamento.titulo"]);
    const documentos = screen.getByText(pt["portal.documentos.titulo"]);
    const assinatura = screen.getByText(pt["hr.convite.assinatura"]);
    expect(fardamento.compareDocumentPosition(documentos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(documentos.compareDocumentPosition(assinatura) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sem anexos diz que ainda nao ha documentos", async () => {
    ligar([]);
    await entrar();
    expect(screen.getByText(pt["portal.documentos.vazio"])).toBeInTheDocument();
  });

  it("nunca chama as accoes de anexos, mesmo clicando", async () => {
    ligar(ANEXOS);
    await entrar();
    fireEvent.click(screen.getByRole("button", { name: pt["portal.proxima.documentos"] }));
    expect(accoesChamadas().filter((a) => a.startsWith("anexo"))).toEqual([]);
    expect(accoesChamadas()).toEqual(["estado", "otp_pedir", "otp_verificar", "ler"]);
  });
});
