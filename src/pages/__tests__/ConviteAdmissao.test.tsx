/**
 * `ConviteAdmissao` (pagina PUBLICA do convite de admissao), com o Supabase
 * simulado: so se mexe na Edge Function `convite-admissao`.
 *
 * Os textos novos (motivos do link, recusas, saudacao) vivem em
 * `translations/index.ts`; aqui o `t` leva-os de um dicionario local por cima
 * do portugues real, para o teste dizer o que a pessoa le e nao depender de
 * em que ponto as chaves entraram no ficheiro de traducoes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const NOVAS: Record<string, string> = {
  "hr.convite.motivo.usado": "Este link já foi usado. Peça um novo link ao RH.",
  "hr.convite.motivo.substituido":
    "Este link foi substituído por um mais recente. Use o último email que recebeu ou peça um novo link ao RH.",
  "hr.convite.motivo.expirado": "Este link expirou. Peça um novo link ao RH.",
  "hr.convite.motivo.bloqueado": "Este link foi bloqueado por demasiadas tentativas. Peça um novo link ao RH.",
  "hr.convite.motivo.inexistente": "Este link não é válido. Peça um novo link ao RH.",
  "hr.convite.motivo.demasiadasTentativas": "Demasiadas tentativas seguidas. Aguarde um pouco e tente de novo.",
  "hr.convite.demasiadasTentativasTitulo": "Aguarde um pouco",
  "hr.convite.erro.assinatura": "Escreva o seu nome para assinar a declaração.",
  "hr.convite.erro.nifJaExiste": "Este NIF já está registado. Contacte o RH.",
  "hr.convite.erro.nissJaExiste": "Este NISS já está registado. Contacte o RH.",
  "hr.convite.erro.nifInvalido": "O NIF não é válido. Verifique os números.",
  "hr.convite.erro.nissInvalido": "O número da Segurança Social não é válido. Verifique os números.",
  "hr.convite.erro.ibanInvalido": "O IBAN não é válido. Verifique os números.",
  "hr.convite.erro.bicInvalido": "O BIC não é válido. Tem 8 ou 11 caracteres.",
  "hr.convite.erro.faltaPreencher": "Falta preencher: {{campos}}.",
  "hr.convite.saudacao": "Olá, {{nome}}.",
  "hr.convite.jaRegistado": "Já temos registado:",
  "hr.convite.jaRegistadoNif": "NIF {{nif}}",
  "hr.convite.jaRegistadoNiss": "NISS terminado em {{ultimos4}}",
  "hr.convite.jaRegistadoConta": "Conta terminada em {{ultimos4}}",
  "hr.convite.validoAte": "Este link é válido até {{data}}.",
};

let linguaUsada: string | undefined;

vi.mock("@/hooks/useTranslation", async () => {
  const { translations } = await import("@/translations/index");
  const pt = (translations as unknown as Record<string, Record<string, string>>).pt;
  return {
    useTranslation: (idioma?: string) => {
      if (idioma !== undefined) linguaUsada = idioma;
      return {
        language: idioma ?? "pt",
        t: (chave: string, params?: Record<string, string | number>) => {
          let texto = NOVAS[chave] ?? pt[chave] ?? chave;
          Object.entries(params ?? {}).forEach(([k, v]) => {
            texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
          });
          return texto;
        },
      };
    },
  };
});

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import ConviteAdmissao from "../ConviteAdmissao";

/** O que o supabase-js devolve quando a Edge Function responde nao-2xx: data null, corpo em error.context. */
function erroHttp(status: number, corpo: Record<string, unknown>) {
  return {
    data: null,
    error: {
      name: "FunctionsHttpError",
      message: "Edge Function returned a non-2xx status code",
      context: new Response(JSON.stringify(corpo), { status }),
    },
  };
}

function estadoOk(extra: Record<string, unknown> = {}) {
  return {
    data: {
      convite: {
        pessoa_nome: null,
        email_pessoal: null,
        nif: null,
        niss_ultimos4: null,
        conta_ultimos4: null,
        formato_conta: null,
        rascunho: null,
        valid_until: "2026-10-20T12:00:00Z",
        campos_obrigatorios: [],
        ...extra,
      },
    },
    error: null,
  };
}

let estado: unknown = estadoOk();
let submissao: unknown = { data: { ok: true, avisos: [] }, error: null };

function accoesChamadas(accao: string) {
  return invoke.mock.calls.filter(([, opcoes]) => (opcoes as { body: { action: string } }).body.action === accao);
}

function renderConvite() {
  return render(
    <MemoryRouter initialEntries={["/admissao/token-de-teste"]}>
      <Routes>
        <Route path="/admissao/:token" element={<ConviteAdmissao />} />
      </Routes>
    </MemoryRouter>,
  );
}

function preencher(id: string, valor: string) {
  fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value: valor } });
}

async function esperarFormulario() {
  await screen.findByText("Os seus dados");
}

async function irParaPagina2() {
  fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));
  await screen.findByText("Assinatura");
}

function assinarEAceitar() {
  preencher("convite-assinatura-nome", "Joana Pires");
  fireEvent.click(document.getElementById("convite-aceite") as HTMLElement);
}

describe("ConviteAdmissao (ecra publico)", () => {
  const linguasOriginais = Object.getOwnPropertyDescriptor(window.navigator, "languages");

  beforeEach(() => {
    invoke.mockReset();
    captureFlowError.mockReset();
    estado = estadoOk();
    submissao = { data: { ok: true, avisos: [] }, error: null };
    linguaUsada = undefined;
    Object.defineProperty(window.navigator, "languages", { value: ["pt-PT", "pt"], configurable: true });
    invoke.mockImplementation(async (_nome: string, opcoes: { body: { action: string } }) => {
      if (opcoes.body.action === "estado") return estado;
      if (opcoes.body.action === "submeter") return submissao;
      return { data: { ok: true }, error: null };
    });
  });

  afterEach(() => {
    if (linguasOriginais) Object.defineProperty(window.navigator, "languages", linguasOriginais);
  });

  describe("motivos do link", () => {
    it("convite_expirado num erro HTTP com context mostra o texto de expirado", async () => {
      estado = erroHttp(401, { error: "convite_expirado" });
      renderConvite();

      expect(await screen.findByText("Este link expirou. Peça um novo link ao RH.")).toBeTruthy();
      expect(screen.getByText(/Este link (ja nao e valido|já não é válido)/i)).toBeTruthy();
    });

    it("convite_revogado mostra o texto de substituido", async () => {
      estado = erroHttp(401, { error: "convite_revogado" });
      renderConvite();

      expect(
        await screen.findByText(/Este link foi substituído por um mais recente/),
      ).toBeTruthy();
    });

    it("convite_ja_usado mostra o texto de usado", async () => {
      estado = erroHttp(401, { error: "convite_ja_usado" });
      renderConvite();

      expect(await screen.findByText("Este link já foi usado. Peça um novo link ao RH.")).toBeTruthy();
    });

    it("demasiadas tentativas tem titulo proprio e nao manda pedir novo link", async () => {
      estado = erroHttp(429, { error: "demasiadas_tentativas" });
      renderConvite();

      expect(await screen.findByText("Aguarde um pouco")).toBeTruthy();
      expect(screen.queryByText(/Peça um novo link/)).toBeNull();
    });

    it("um erro sem corpo legivel cai em 'link nao valido' e nunca mostra o codigo", async () => {
      estado = { data: null, error: { name: "FunctionsFetchError", message: "Failed to send a request" } };
      renderConvite();

      expect(await screen.findByText("Este link não é válido. Peça um novo link ao RH.")).toBeTruthy();
    });

    it("o registo de erros nunca recebe o token nem o corpo da resposta", async () => {
      estado = { data: null, error: { name: "FunctionsFetchError", message: "token-de-teste falhou" } };
      renderConvite();
      await screen.findByText("Este link não é válido. Peça um novo link ao RH.");

      for (const chamada of captureFlowError.mock.calls) {
        expect(String((chamada[0] as Error).message)).not.toContain("token-de-teste");
      }
    });

    it("um motivo de convite devolvido ao submeter troca para o cartao de link invalido", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();
      submissao = erroHttp(401, { error: "convite_expirado" });
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      expect(await screen.findByText("Este link expirou. Peça um novo link ao RH.")).toBeTruthy();
    });
  });

  describe("saudacao", () => {
    it("com nome e dados ja registados, diz o nome, o NIF por inteiro e so os ultimos 4 do resto", async () => {
      estado = estadoOk({
        pessoa_nome: "Joana Pires",
        nif: "123456789",
        niss_ultimos4: "8902",
        conta_ultimos4: "4321",
      });
      renderConvite();

      expect(await screen.findByText("Olá, Joana Pires.")).toBeTruthy();
      expect(screen.getByText("Já temos registado:")).toBeTruthy();
      expect(screen.getByText("NIF 123456789")).toBeTruthy();
      expect(screen.getByText("NISS terminado em 8902")).toBeTruthy();
      expect(screen.getByText("Conta terminada em 4321")).toBeTruthy();
      expect(screen.getByText(/Este link é válido até \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\./)).toBeTruthy();
    });

    it("so mostra o que nao e nulo", async () => {
      estado = estadoOk({ pessoa_nome: "Joana Pires", nif: "123456789" });
      renderConvite();

      await screen.findByText("Olá, Joana Pires.");
      expect(screen.queryByText(/NISS terminado/)).toBeNull();
      expect(screen.queryByText(/Conta terminada/)).toBeNull();
    });
  });

  describe("lingua do ecra", () => {
    it("escolhe-se pelo navegador", async () => {
      Object.defineProperty(window.navigator, "languages", { value: ["fr-FR", "en"], configurable: true });
      renderConvite();
      await esperarFormulario().catch(() => undefined);

      expect(linguaUsada).toBe("fr");
    });

    it("com uma lingua nao suportada, fica em portugues", async () => {
      Object.defineProperty(window.navigator, "languages", { value: ["ja-JP"], configurable: true });
      renderConvite();
      await esperarFormulario();

      expect(linguaUsada).toBe("pt");
    });
  });

  describe("obrigatoriedade vinda do servidor", () => {
    it("um campo fora da lista do convite nao tem asterisco e nao trava a submissao", async () => {
      estado = estadoOk({ campos_obrigatorios: [{ codigo: "nif", condicional: true }] });
      renderConvite();
      await esperarFormulario();

      expect(document.getElementById("convite-telefone-pessoal")?.getAttribute("aria-required")).toBeNull();
      expect(document.getElementById("convite-nif")?.getAttribute("aria-required")).toBe("true");

      preencher("convite-nif", "123456789");
      await irParaPagina2();
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      await waitFor(() => expect(accoesChamadas("submeter")).toHaveLength(1));
    });

    it("campos_obrigatorios VAZIO (array) e uma resposta: nada tem asterisco, nao cai na lista estatica", async () => {
      estado = estadoOk({ campos_obrigatorios: [] });
      renderConvite();
      await esperarFormulario();

      expect(document.getElementById("convite-telefone-pessoal")?.getAttribute("aria-required")).toBeNull();
      expect(document.getElementById("convite-nif")?.getAttribute("aria-required")).toBeNull();
    });

    it("so a chave em falta (convite antigo) cai na lista estatica de sempre", async () => {
      estado = estadoOk({ campos_obrigatorios: undefined });
      renderConvite();
      await esperarFormulario();

      expect(document.getElementById("convite-telefone-pessoal")?.getAttribute("aria-required")).toBe("true");
      expect(document.getElementById("convite-nif")?.getAttribute("aria-required")).toBe("true");
    });

    it("um campo da lista, vazio, trava o avanco", async () => {
      estado = estadoOk({ campos_obrigatorios: [{ codigo: "telefone_pessoal", condicional: false }] });
      renderConvite();
      await esperarFormulario();

      fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));

      expect(await screen.findByText(/Este campo (e|é) obrigat(o|ó)rio/)).toBeTruthy();
      expect(screen.queryByText("Assinatura")).toBeNull();
    });
  });

  describe("validacao local de formato", () => {
    it("NIF com digito de controlo errado da erro sem chamar o servidor", async () => {
      renderConvite();
      await esperarFormulario();

      preencher("convite-nif", "123456788");
      fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));

      expect(await screen.findByText("O NIF não é válido. Verifique os números.")).toBeTruthy();
      expect(screen.queryByText("Assinatura")).toBeNull();
      expect(accoesChamadas("submeter")).toHaveLength(0);
    });

    it("NISS com digito de controlo errado da erro", async () => {
      renderConvite();
      await esperarFormulario();

      preencher("convite-niss", "12345678901");
      fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));

      expect(
        await screen.findByText("O número da Segurança Social não é válido. Verifique os números."),
      ).toBeTruthy();
    });

    it("um NIF valido deixa avancar", async () => {
      renderConvite();
      await esperarFormulario();

      preencher("convite-nif", "123456789");
      await irParaPagina2();
    });

    it("IBAN invalido bloqueia a submissao e diz porque", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();

      preencher("convite-conta-numero", "PT50 0000 0000 0000 0000 0000 2");
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      expect(await screen.findByText("O IBAN não é válido. Verifique os números.")).toBeTruthy();
      expect(accoesChamadas("submeter")).toHaveLength(0);
    });
  });

  describe("BIC na conta bancaria", () => {
    function corpoDaSubmissao(): { dados: Record<string, unknown> } {
      const [chamada] = accoesChamadas("submeter");
      return (chamada[1] as { body: { dados: Record<string, unknown> } }).body;
    }

    it("o campo BIC aparece na pagina 2, a seguir ao IBAN", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();

      const iban = document.getElementById("convite-conta-numero") as HTMLElement;
      const bic = document.getElementById("convite-conta-bic") as HTMLElement;
      expect(bic).not.toBeNull();
      expect(iban.compareDocumentPosition(bic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByLabelText(/SWIFT \/ BIC/)).toBe(bic);
    });

    it("escreve-se em maiusculas, sem espacos e com no maximo 11 caracteres", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();

      preencher("convite-conta-bic", "cgdi ptpl xxx yy");

      expect((document.getElementById("convite-conta-bic") as HTMLInputElement).value).toBe(
        "CGDIPTPLXXX",
      );
    });

    it("um BIC malformado mostra a mensagem traduzida e nao submete", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();

      preencher("convite-conta-bic", "ABCD1234");
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      expect(await screen.findByText("O BIC não é válido. Tem 8 ou 11 caracteres.")).toBeTruthy();
      expect(
        document.getElementById("convite-conta-bic")?.getAttribute("aria-invalid"),
      ).toBe("true");
      expect(accoesChamadas("submeter")).toHaveLength(0);
    });

    it("o payload leva conta_swift normalizado, mesmo sem IBAN", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();

      preencher("convite-conta-bic", "cgdiptpl");
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      await waitFor(() => expect(accoesChamadas("submeter")).toHaveLength(1));
      expect(corpoDaSubmissao().dados.conta_swift).toBe("CGDIPTPL");
      expect(corpoDaSubmissao().dados.iban).toBeNull();
    });

    it("sem BIC, conta_swift vai a null (a chave esta sempre presente)", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();

      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      await waitFor(() => expect(accoesChamadas("submeter")).toHaveLength(1));
      expect(Object.prototype.hasOwnProperty.call(corpoDaSubmissao().dados, "conta_swift")).toBe(
        true,
      );
      expect(corpoDaSubmissao().dados.conta_swift).toBeNull();
    });

    it("bic_invalido recusado pelo servidor marca o campo e fica na pagina 2", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();
      submissao = erroHttp(400, { error: "bic_invalido" });
      preencher("convite-conta-bic", "CGDIPTPL");
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      expect(await screen.findByText("O BIC não é válido. Tem 8 ou 11 caracteres.")).toBeTruthy();
      expect(document.getElementById("convite-conta-bic")).not.toBeNull();
      expect(screen.queryByText("bic_invalido")).toBeNull();
    });

    it("o BIC marca-se como obrigatorio quando o servidor o pede", async () => {
      estado = estadoOk({ campos_obrigatorios: [{ codigo: "conta_bic", condicional: false }] });
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();

      expect(document.getElementById("convite-conta-bic")?.getAttribute("aria-required")).toBe(
        "true",
      );
    });
  });

  describe("assinatura", () => {
    it("submeter sem assinatura mostra o erro junto do campo, em vez de ter o botao morto", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();

      const botao = screen.getByRole("button", { name: "Submeter" });
      expect((botao as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(botao);

      expect(await screen.findByText("Escreva o seu nome para assinar a declaração.")).toBeTruthy();
      expect(accoesChamadas("submeter")).toHaveLength(0);
    });
  });

  describe("recusas na submissao", () => {
    async function submeterComResposta(resposta: unknown) {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();
      submissao = resposta;
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));
    }

    it("nif_ja_existe diz que o NIF ja esta registado e leva a pessoa ao campo", async () => {
      await submeterComResposta(erroHttp(409, { error: "nif_ja_existe" }));

      expect(await screen.findByText("Este NIF já está registado. Contacte o RH.")).toBeTruthy();
      expect(document.getElementById("convite-nif")).not.toBeNull();
      expect(screen.queryByText("nif_ja_existe")).toBeNull();
    });

    it("niss_ja_existe diz que o NISS ja esta registado", async () => {
      await submeterComResposta(erroHttp(409, { error: "niss_ja_existe" }));

      expect(await screen.findByText("Este NISS já está registado. Contacte o RH.")).toBeTruthy();
    });

    it("admissao_incompleta com campos[] diz o que falta, com o nome de cada campo", async () => {
      await submeterComResposta(erroHttp(400, { error: "admissao_incompleta", campos: ["telefone_pessoal"] }));

      expect(await screen.findByText("Falta preencher: Telefone pessoal.")).toBeTruthy();
    });

    it("admissao_incompleta no formato antigo tambem se percebe", async () => {
      await submeterComResposta(
        erroHttp(400, { error: "admissao_incompleta: telefone_pessoal, data_nascimento" }),
      );

      expect(
        await screen.findByText(/Falta preencher: Telefone pessoal, .+\./),
      ).toBeTruthy();
    });

    it("um erro inesperado mostra a mensagem generica e nunca o codigo", async () => {
      await submeterComResposta(erroHttp(500, { error: "erro_inesperado" }));

      expect(await screen.findByText(/Ocorreu um erro inesperado/)).toBeTruthy();
      expect(screen.queryByText("erro_inesperado")).toBeNull();
    });

    it("submissao boa mostra o agradecimento", async () => {
      await submeterComResposta({ data: { ok: true, avisos: [] }, error: null });

      expect(await screen.findByText("Dados recebidos")).toBeTruthy();
    });
  });

  describe("gravar o rascunho ao fechar a aba (pagehide / visibilitychange)", () => {
    const fetchMock = vi.fn();

    /** O corpo JSON do unico pedido keepalive feito, ou null se nao houve nenhum. */
    function corpoEnviado(): { action: string; rascunho: Record<string, unknown> } | null {
      if (fetchMock.mock.calls.length === 0) return null;
      const [, opcoes] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, { body: string }];
      return JSON.parse(opcoes.body);
    }

    function fecharAba() {
      window.dispatchEvent(new Event("pagehide"));
    }

    beforeEach(() => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response("{}"));
      vi.stubGlobal("fetch", fetchMock);
      vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
      vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-publica-de-teste");
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    });

    it("antes de o estado carregar, fechar a aba nao envia nada (nao apaga o rascunho herdado)", async () => {
      invoke.mockImplementation(() => new Promise(() => undefined));
      renderConvite();

      fecharAba();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("com o link invalido nao se regista nada: fechar a aba nao envia", async () => {
      estado = erroHttp(401, { error: "convite_expirado" });
      renderConvite();
      await screen.findByText("Este link expirou. Peça um novo link ao RH.");

      fecharAba();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("um rascunho herdado e restaurado e e esse que se envia ao fechar", async () => {
      estado = estadoOk({ rascunho: { nif: "123456789", telefone_pessoal: "912345678" } });
      renderConvite();
      await esperarFormulario();
      await waitFor(() =>
        expect((document.getElementById("convite-nif") as HTMLInputElement).value).toBe("123456789"),
      );

      fecharAba();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const corpo = corpoEnviado();
      expect(corpo?.action).toBe("rascunho");
      expect(corpo?.rascunho.nif).toBe("123456789");
      expect(corpo?.rascunho.telefone_pessoal).toBe("912345678");
      // A declaracao de veracidade nunca viaja num rascunho.
      expect(corpo?.rascunho).not.toHaveProperty("aceite");
    });

    it("nunca envia um rascunho vazio (sem herdar nem escrever nada) por cima de um real", async () => {
      renderConvite();
      await esperarFormulario();

      fecharAba();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("o que a pessoa escreveu envia-se ao fechar, mesmo antes do debounce", async () => {
      renderConvite();
      await esperarFormulario();
      preencher("convite-telefone-pessoal", "912345678");

      fecharAba();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(corpoEnviado()?.rascunho.telefone_pessoal).toBe("912345678");
    });

    it("visibilitychange para 'hidden' tambem grava; para 'visible' nao", async () => {
      renderConvite();
      await esperarFormulario();
      preencher("convite-telefone-pessoal", "912345678");

      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(fetchMock).not.toHaveBeenCalled();

      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("depois de submeter, fechar a aba nao envia nada", async () => {
      renderConvite();
      await esperarFormulario();
      preencher("convite-telefone-pessoal", "912345678");
      await irParaPagina2();
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));
      await screen.findByText("Dados recebidos");
      fetchMock.mockClear();

      fecharAba();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("acessibilidade e foco", () => {
    it("o spinner de carga e uma regiao de estado com texto", () => {
      invoke.mockImplementation(() => new Promise(() => undefined));
      renderConvite();

      const estadoDeCarga = screen.getByRole("status");
      expect(estadoDeCarga).toHaveTextContent(/A carregar/);
    });

    it("o '(obrigatorio)' do leitor de ecra vem da lingua do ecra, nao de texto fixo em portugues", async () => {
      estado = estadoOk({ campos_obrigatorios: [{ codigo: "nif", condicional: false }] });
      renderConvite();
      await esperarFormulario();

      const etiqueta = document.querySelector('label[for="convite-nif"]') as HTMLElement;
      // O texto sai de `t("hr.campos.obrigatorio")` (aqui o dicionario portugues,
      // com maiuscula: prova que nao e a string escrita a mao "(obrigatorio)").
      expect(etiqueta.textContent).toContain("(Obrigatorio)");
      expect(etiqueta.textContent).not.toContain("(obrigatorio)");
    });

    it("o cartao de link invalido tem um titulo de nivel 1", async () => {
      estado = erroHttp(429, { error: "demasiadas_tentativas" });
      renderConvite();

      expect(await screen.findByRole("heading", { level: 1, name: "Aguarde um pouco" })).toBeTruthy();
    });

    it("o agradecimento tem um titulo de nivel 1", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Dados recebidos" })).toBeTruthy();
    });

    it("Seguinte com um NIF invalido leva o foco ao campo invalido", async () => {
      renderConvite();
      await esperarFormulario();
      preencher("convite-nif", "123456788");

      fireEvent.click(screen.getByRole("button", { name: "Seguinte" }));

      await screen.findByText("O NIF não é válido. Verifique os números.");
      await waitFor(() => expect(document.activeElement?.id).toBe("convite-nif"));
    });

    it("mudar de pagina leva o foco ao topo (o botao que tinha o foco desaparece)", async () => {
      renderConvite();
      await esperarFormulario();

      await irParaPagina2();

      await waitFor(() => expect(document.activeElement?.id).toBe("convite-topo"));
    });

    it("Submeter sem assinatura leva o foco ao campo da assinatura", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();

      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      await screen.findByText("Escreva o seu nome para assinar a declaração.");
      await waitFor(() => expect(document.activeElement?.id).toBe("convite-assinatura-nome"));
    });

    it("a declaracao por aceitar fica ligada ao seu erro (aria-invalid + aria-describedby)", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();
      preencher("convite-assinatura-nome", "Joana Pires");

      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));

      const caixa = document.getElementById("convite-aceite") as HTMLElement;
      await waitFor(() => expect(caixa.getAttribute("aria-invalid")).toBe("true"));
      const idDoErro = caixa.getAttribute("aria-describedby");
      expect(idDoErro).toBe("convite-aceite-erro");
      expect(document.getElementById(idDoErro as string)?.textContent).toMatch(/obrigat(o|ó)rio/);
    });

    it("o erro de uma recusa nao fica visivel ao voltar a pagina anterior", async () => {
      renderConvite();
      await esperarFormulario();
      await irParaPagina2();
      submissao = erroHttp(500, { error: "erro_inesperado" });
      assinarEAceitar();
      fireEvent.click(screen.getByRole("button", { name: "Submeter" }));
      await screen.findByText(/Ocorreu um erro inesperado/);

      fireEvent.click(screen.getByRole("button", { name: "Anterior" }));

      expect(screen.queryByText(/Ocorreu um erro inesperado/)).toBeNull();
    });
  });
});
