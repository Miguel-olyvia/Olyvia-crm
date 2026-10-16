/**
 * `ConviteAdmissao`: o PORTAL temporario da pessoa (pagina PUBLICA /admissao/:token, sem sessao
 * da app), V3a. Substitui o formulario antigo (que gravava rascunho e submetia directo) por:
 * consulta limitada ao abrir o link, passo de OTP por e-mail, sessao activa com o que o estado
 * permite, e vistas sem acesso. Supabase simulado: so se mexe na Edge `convite-admissao`, com os
 * contratos exactos (ver `useConviteAdmissaoPublico.test.tsx`).
 *
 * Os textos lem-se da tabela real de traducoes (pt/en), para o teste dizer o que a pessoa le.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let idiomaDoTeste: "pt" | "en" = "pt";

vi.mock("@/hooks/useTranslation", async () => {
  const { translations } = await import("@/translations/index");
  const { useIdiomaForcado } = await import("@/contexts/IdiomaForcadoContext");
  const tabela = translations as unknown as Record<string, Record<string, string>>;
  return {
    useTranslation: (idioma?: string) => {
      const forcado = useIdiomaForcado();
      const lingua = idioma ?? forcado ?? "pt";
      return {
        language: lingua,
        t: (chave: string, params?: Record<string, string | number>) => {
          let texto = tabela[lingua]?.[chave] ?? tabela.en[chave] ?? chave;
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
import { translations } from "@/translations/index";
import { limparSessao } from "@/lib/hr/portalSessao";

const TOKEN = "token-de-teste-com-mais-de-vinte-caracteres";
const SESSAO = "S".repeat(43);
const NISS_VALIDO = "12345678902";
const IBAN_VALIDO = "PT50000201231234567890154";

const tabela = translations as unknown as Record<string, Record<string, string>>;
const txt = (chave: string, params: Record<string, string | number> = {}, lingua = idiomaDoTeste): string => {
  let texto = tabela[lingua][chave];
  expect(texto, `falta a chave ${chave} em ${lingua}`).toBeTruthy();
  Object.entries(params).forEach(([k, v]) => {
    texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
  });
  return texto;
};

const erroHttp = (status: number, corpo: Record<string, unknown>) => ({
  data: null,
  error: {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: new Response(JSON.stringify(corpo), { status }),
  },
});

const conviteBase = (extra: Record<string, unknown> = {}) => ({
  existe: true,
  estado: "convidada",
  estado_portal: "ativo",
  valid_until: "2099-10-30T10:00:00Z",
  primeiro_nome: "Joana",
  organizacao_nome: "Mudelar Teste",
  bloqueado: false,
  precisa_otp: true,
  ...extra,
});
const estadoOk = (extra: Record<string, unknown> = {}) => ({ data: { ok: true, convite: conviteBase(extra) }, error: null });
const CAMPOS_EDITAVEIS_TODOS = [
  "data_nascimento", "genero", "nacionalidade", "telefone_pessoal", "email_pessoal", "estado_civil", "dependentes",
  "dependentes_deficientes", "conjuge_situacao_profissional", "naturalidade_freguesia", "naturalidade_concelho",
  "naturalidade_pais", "habilitacao_academica", "habilitacao_data_conclusao", "tipo_documento", "numero_documento",
  "validade_documento", "nif", "niss", "iban", "linha1", "linha2", "codigo_postal", "localidade", "distrito", "pais",
  "morada_linha1", "morada_linha2", "morada_codigo_postal", "morada_localidade", "morada_distrito", "morada_pais",
  "conta_titular", "conta_banco", "conta_bic", "conta_swift", "tamanho_cima", "tamanho_baixo", "tamanho_calcado",
  "tamanho_cima_detalhe", "tamanho_baixo_detalhe", "tamanho_calcado_detalhe", "assinatura_nome",
  "carta_conducao_numero", "carta_conducao_categorias", "carta_conducao_validade", "conta_formato",
];

const porId = (id: string) => document.getElementById(id) as HTMLInputElement;

const lerOk = (extra: Record<string, unknown> = {}) => ({
  data: {
    ok: true,
    estado: "em_preenchimento",
    // O rascunho traz as duas formas de chave (a do ecra e a do contrato); o formulario reutilizado
    // entende ambas. Os campos obrigatorios e editaveis seguem a `ler` da base: codigos do ecra e,
    // em editaveis, as 45 chaves da lista branca mais niss e iban.
    rascunho: { morada_linha1: "Rua das Flores 12", telefone_pessoal: "912345678" },
    campos_obrigatorios: ["linha1", "genero"],
    campos_editaveis: CAMPOS_EDITAVEIS_TODOS,
    documentos_editaveis: [],
    niss_ultimos4: null,
    iban_ultimos4: null,
    devolucao: null,
    anexos: [],
    rejeicao_mensagem: null,
    ...extra,
  },
  error: null,
});

type Resposta = { data: unknown; error: unknown };
let respostas: Record<string, Resposta | (() => Resposta)> = {};
function ligar(r: Record<string, Resposta | (() => Resposta)>) {
  respostas = r;
  invoke.mockImplementation(async (_n: string, o: { body: { action: string } }) => {
    const x = respostas[o.body.action];
    if (!x) return erroHttp(500, { error: "erro_inesperado" });
    return typeof x === "function" ? x() : x;
  });
}
const base = () => ({
  estado: estadoOk(),
  otp_pedir: { data: { ok: true, expira_em: "2099-10-16T10:10:00Z" }, error: null },
  otp_verificar: { data: { ok: true, sessao: SESSAO, sessao_expira_em: "2099-10-16T14:00:00Z" }, error: null },
  ler: lerOk(),
});
const chamadas = (accao: string) =>
  invoke.mock.calls.filter(([, o]) => (o as { body: { action: string } }).body.action === accao) as Array<
    [string, { body: Record<string, unknown>; headers?: Record<string, string> }]
  >;

function renderPortal() {
  return render(
    <MemoryRouter initialEntries={[`/admissao/${TOKEN}`]}>
      <Routes>
        <Route path="/admissao/:token" element={<ConviteAdmissao />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function abrirConsulta() {
  renderPortal();
  return screen.findByRole("button", { name: txt("portal.consulta.botao") });
}

async function pedirCodigo() {
  fireEvent.click(await abrirConsulta());
  const campo = await screen.findByLabelText(txt("portal.otp.rotulo"));
  // O campo so liga quando o codigo ja foi pedido (a Edge respondeu).
  await waitFor(() => expect(campo).toBeEnabled());
  return campo;
}

async function entrarComCodigo(codigo = "123456") {
  const campo = await pedirCodigo();
  fireEvent.change(campo, { target: { value: codigo } });
  fireEvent.click(screen.getByRole("button", { name: txt("portal.otp.confirmar") }));
}

async function abrirSessao() {
  ligar(base());
  await entrarComCodigo();
  return screen.findByRole("button", { name: txt("portal.sair") });
}

describe("ConviteAdmissao (portal temporario)", () => {
  beforeEach(() => {
    idiomaDoTeste = "pt";
    invoke.mockReset();
    captureFlowError.mockReset();
    limparSessao();
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window.navigator, "languages", { value: ["pt-PT"], configurable: true });
    ligar(base());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("consulta limitada ao abrir o link", () => {
    it("o carregamento e uma regiao de estado com texto", () => {
      invoke.mockImplementation(() => new Promise(() => undefined));
      renderPortal();
      expect(screen.getByRole("status")).toHaveTextContent(txt("portal.carregando"));
    });

    it("mostra a organizacao, o primeiro nome, o estado e o prazo, e SO a accao estado", async () => {
      await abrirConsulta();

      expect(screen.getByText("Mudelar Teste")).toBeInTheDocument();
      // A saudacao e a do convite que ja existia (ConviteSaudacao): titulo de nivel 1 e o nome.
      expect(screen.getByRole("heading", { level: 1, name: txt("hr.convite.tituloPagina") })).toBeInTheDocument();
      expect(screen.getByText(txt("hr.convite.saudacao", { nome: "Joana" }))).toBeInTheDocument();
      expect(screen.getByText(txt("hr.convite.estadoAdmissao.convidada"), { exact: false })).toBeInTheDocument();
      expect(screen.getByTestId("portal-selo-prazo")).toBeInTheDocument();
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(chamadas("estado")).toHaveLength(1);
      expect(chamadas("ler")).toHaveLength(0);
    });

    it("tem um so h1 e nao mostra nenhum dado sensivel nem campos de dados", async () => {
      await abrirConsulta();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      // Sem sessao nao ha formulario nenhum: nem campos, nem NISS/IBAN, nem a nota da saudacao com dados.
      expect(document.querySelectorAll("input, select, textarea")).toHaveLength(0);
      expect(screen.queryByText(txt("hr.campos.niss"), { exact: false })).toBeNull();
      expect(screen.queryByText(txt("hr.convite.jaRegistado"))).toBeNull();
      expect(screen.queryByRole("button", { name: txt("portal.sair") })).toBeNull();
      expect(document.body.textContent).not.toMatch(/\d{9,}/);
    });

    it("a faixa de progresso diz o passo actual com texto e nao so com cor", async () => {
      ligar({ ...base(), estado: estadoOk({ estado: "em_preenchimento" }) });
      await abrirConsulta();
      const faixa = screen.getByRole("list", { name: txt("portal.progresso.titulo") });
      const itens = within(faixa).getAllByRole("listitem");
      expect(itens).toHaveLength(4);
      expect(itens[0]).toHaveTextContent(txt("portal.progresso.feito"));
      expect(itens[1]).toHaveAttribute("aria-current", "step");
      expect(itens[1]).toHaveTextContent(txt("portal.progresso.atual"));
      expect(itens[2]).toHaveTextContent(txt("portal.progresso.porFazer"));
    });

    it("com menos de 2 dias para o prazo o selo fica ambar E diz porque", async () => {
      const amanha = new Date(Date.now() + 30 * 3600_000).toISOString();
      ligar({ ...base(), estado: estadoOk({ valid_until: amanha }) });
      await abrirConsulta();
      const selo = screen.getByTestId("portal-selo-prazo");
      expect(selo).toHaveAttribute("data-aviso", "sim");
      expect(selo).toHaveTextContent(txt("portal.selo.aviso"));
    });

    it("com prazo largo nao ha aviso", async () => {
      await abrirConsulta();
      const selo = screen.getByTestId("portal-selo-prazo");
      expect(selo).toHaveAttribute("data-aviso", "nao");
      expect(selo).not.toHaveTextContent(txt("portal.selo.aviso"));
    });

    it("o botao pede a confirmacao da identidade e ainda nao pediu nenhum codigo", async () => {
      await abrirConsulta();
      expect(chamadas("otp_pedir")).toHaveLength(0);
    });
  });

  describe("o passo do codigo (OTP)", () => {
    it("o botao pede o codigo e abre o dialogo; o campo e de um codigo numerico de 6 algarismos", async () => {
      const campo = await pedirCodigo();

      expect(chamadas("otp_pedir")).toHaveLength(1);
      expect(chamadas("otp_pedir")[0][1].body).toEqual({ action: "otp_pedir", token: TOKEN });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(campo).toHaveAttribute("autocomplete", "one-time-code");
      expect(campo).toHaveAttribute("inputmode", "numeric");
      expect(campo).toHaveAttribute("maxlength", "6");
      expect(campo).toHaveAttribute("pattern", "[0-9]*");
      expect(campo).toHaveAccessibleDescription(txt("portal.otp.ajuda"));
    });

    it("diz o e-mail MASCARADO quando a Edge o devolve; nunca por inteiro", async () => {
      ligar({
        ...base(),
        otp_pedir: { data: { ok: true, expira_em: "2099-10-16T10:10:00Z", email_mascarado: "joana.pires@exemplo.pt" }, error: null },
      });
      await pedirCodigo();
      const dialogo = screen.getByRole("dialog");
      expect(dialogo).toHaveTextContent("j***@exemplo.pt");
      expect(document.body.textContent).not.toContain("joana.pires");
    });

    it("sem e-mail na resposta diz 'o e-mail do convite', sem inventar endereco", async () => {
      await pedirCodigo();
      expect(screen.getByRole("dialog")).toHaveTextContent(txt("portal.otp.descricao"));
    });

    it("conta as tentativas: 5 ao inicio", async () => {
      await pedirCodigo();
      expect(screen.getByRole("dialog")).toHaveTextContent(txt("portal.otp.tentativas", { n: 5 }));
    });

    it("o codigo certo abre a sessao: o dialogo fecha e aparece o portal com 'Terminar sessao'", async () => {
      await abrirSessao();
      expect(screen.queryByRole("dialog")).toBeNull();
      // O formulario do convite (o que a pessoa ja preenchia) abre preenchido com o que a `ler` devolveu.
      expect(porId("convite-linha1")).toHaveValue("Rua das Flores 12");
      expect(porId("convite-telefone-pessoal")).toHaveValue("912345678");
    });

    it("depois do OTP certo, as chamadas seguintes levam o cabecalho x-portal-sessao (e o estado, sem)", async () => {
      await abrirSessao();
      expect(chamadas("estado")[0][1].headers).toBeUndefined();
      expect(chamadas("ler")[0][1].headers).toEqual({ "x-portal-sessao": SESSAO });
      expect(chamadas("otp_verificar")[0][1].body).toEqual({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
    });

    it("o codigo escrito nunca fica no ecra depois de confirmado", async () => {
      await abrirSessao();
      expect(document.body.innerHTML).not.toMatch(/(?<!\d)123456(?!\d)/);
      for (const campo of document.querySelectorAll("input")) expect((campo as HTMLInputElement).value).not.toBe("123456");
    });

    it("o codigo errado: mensagem com as tentativas que restam, anunciada, campo limpo e com o foco", async () => {
      ligar({ ...base(), otp_verificar: erroHttp(401, { error: "otp_invalido", restantes: 3 }) });
      await entrarComCodigo("000000");
      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent(txt("portal.erro.otpInvalido", { n: 3 }));
      const campo = screen.getByLabelText(txt("portal.otp.rotulo"));
      expect(campo).toHaveValue("");
      expect(campo).toHaveAttribute("aria-invalid", "true");
      await waitFor(() => expect(document.activeElement).toBe(campo));
      expect(screen.getByRole("dialog")).toHaveTextContent(txt("portal.otp.tentativasRestantes", { n: 3 }));
      expect(screen.queryByRole("button", { name: txt("portal.sair") })).toBeNull();
    });

    it("uma tentativa que resta diz-o no singular", async () => {
      ligar({ ...base(), otp_verificar: erroHttp(401, { error: "otp_invalido", restantes: 1 }) });
      await entrarComCodigo("000000");
      expect(await screen.findByRole("alert")).toHaveTextContent(txt("portal.erro.otpInvalidoUma"));
    });

    it("o codigo bloqueado: mensagem de bloqueio, campo e confirmacao inactivos, e novo pedido possivel", async () => {
      ligar({ ...base(), otp_verificar: erroHttp(429, { error: "otp_bloqueado" }) });
      await entrarComCodigo("000000");
      expect(await screen.findByRole("alert")).toHaveTextContent(txt("portal.erro.otpBloqueado"));
      expect(screen.getByLabelText(txt("portal.otp.rotulo"))).toBeDisabled();
      expect(screen.getByRole("button", { name: txt("portal.otp.confirmar") })).toBeDisabled();
      expect(screen.getByRole("button", { name: txt("portal.otp.reenviar") })).toBeInTheDocument();
    });

    it("so aceita 6 algarismos: letras sao ignoradas ao escrever e a confirmacao so liga com 6", async () => {
      const campo = await pedirCodigo();
      fireEvent.change(campo, { target: { value: "12ab34" } });
      expect(campo).toHaveValue("1234");
      expect(screen.getByRole("button", { name: txt("portal.otp.confirmar") })).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(screen.getByRole("button", { name: txt("portal.otp.confirmar") }));
      expect(chamadas("otp_verificar")).toHaveLength(0);
    });

    it("o reenvio fica bloqueado durante 60 s, com a contagem; depois liberta-se e anuncia-o", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
      await pedirCodigo();
      const reenviar = screen.getByRole("button", { name: txt("portal.otp.reenviar") });
      expect(reenviar).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("dialog")).toHaveTextContent(txt("portal.otp.reenviarEm", { n: 60 }));

      fireEvent.click(reenviar);
      expect(chamadas("otp_pedir")).toHaveLength(1);

      vi.setSystemTime(new Date("2026-10-16T10:01:01Z"));
      await waitFor(
        () => expect(screen.getByRole("button", { name: txt("portal.otp.reenviar") })).not.toHaveAttribute("aria-disabled", "true"),
        { timeout: 3000 },
      );
      fireEvent.click(screen.getByRole("button", { name: txt("portal.otp.reenviar") }));
      await waitFor(() => expect(chamadas("otp_pedir")).toHaveLength(2));
    });

    it.each([
      ["otp_espera", "portal.erro.otpEspera"],
      ["otp_limite_diario", "portal.erro.otpLimiteDiario"],
      ["otp_indisponivel", "portal.erro.emailNaoEnviado"],
      ["email_nao_enviado", "portal.erro.emailNaoEnviado"],
      ["demasiadas_tentativas", "hr.convite.motivo.demasiadasTentativas"],
    ])("o pedido falha com %s: mensagem clara e anunciada", async (codigo, chave) => {
      ligar({ ...base(), otp_pedir: erroHttp(429, { error: codigo }) });
      fireEvent.click(await abrirConsulta());
      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent(txt(chave));
      expect(alerta.textContent).not.toContain(codigo);
    });

    it("cancelar fecha o dialogo e devolve o foco ao botao que o abriu", async () => {
      const botao = await abrirConsulta();
      botao.focus();
      fireEvent.click(botao);
      await screen.findByLabelText(txt("portal.otp.rotulo"));
      fireEvent.click(screen.getByRole("button", { name: txt("portal.otp.cancelar") }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: txt("portal.consulta.botao") })));
    });
  });

  describe("sessao activa", () => {
    it("mostra o formulario reutilizado, o aviso da sessao e um so h1 (o da saudacao que ja existia)", async () => {
      await abrirSessao();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(txt("hr.convite.tituloPagina"));
      expect(screen.getByText(txt("hr.convite.saudacao", { nome: "Joana" }))).toBeInTheDocument();
      // As secções da pagina 1 do convite (dados pessoais, naturalidade, documento, morada).
      for (const chave of ["hr.pessoais.geral", "hr.convite.naturalidadeHabilitacao", "hr.pessoais.documento", "hr.pessoais.morada"]) {
        expect(screen.getByText(txt(chave))).toBeInTheDocument();
      }
      expect(screen.getByText(txt("portal.ligado.aviso"))).toBeInTheDocument();
      expect(screen.getByText(txt("hr.convite.paginaDe", { atual: 1, total: 2 }))).toBeInTheDocument();
    });

    it("os campos pedidos pela organizacao (`campos_obrigatorios`) levem o asterisco e aria-required; os outros nao", async () => {
      await abrirSessao();
      // A `ler` pede linha1 e genero; o NIF, a nacionalidade e o telefone nao (ficam por preencher sem travar nada).
      expect(porId("convite-linha1")).toHaveAttribute("aria-required", "true");
      expect(porId("convite-genero")).toHaveAttribute("aria-required", "true");
      expect(porId("convite-telefone-pessoal")).not.toHaveAttribute("aria-required");
      expect(porId("convite-data-nascimento")).not.toHaveAttribute("aria-required");
      // O leitor de ecra ouve "(Obrigatorio)" na lingua do ecra, nao so o asterisco a vermelho.
      expect(porId("convite-linha1").closest("div")?.textContent).toContain(txt("hr.campos.obrigatorio"));
    });

    it("uma lista vazia de campos obrigatorios e uma resposta: nada e obrigatorio (nao cai na lista fixa)", async () => {
      ligar({ ...base(), ler: lerOk({ campos_obrigatorios: [] }) });
      await entrarComCodigo();
      await screen.findByRole("button", { name: txt("portal.sair") });
      expect(document.querySelectorAll('[aria-required="true"]')).toHaveLength(0);
    });

    it("as chaves do contrato do rascunho (morada_*) preenchem os campos do ecra; o que nao e do formulario nao aparece solto", async () => {
      ligar({
        ...base(),
        ler: lerOk({
          rascunho: { morada_linha1: "Rua das Flores 12", morada_codigo_postal: "4000-001", conta_formato: "iban", tamanho_cima_detalhe: "M", chave_estranha: "segredo-x" },
        }),
      });
      await entrarComCodigo();
      await screen.findByRole("button", { name: txt("portal.sair") });
      expect(porId("convite-linha1")).toHaveValue("Rua das Flores 12");
      expect(porId("convite-codigo-postal")).toHaveValue("4000-001");
      expect(document.body.innerHTML).not.toContain("segredo-x");
    });

    it("seguinte e anterior mudam de pagina sem chamar a Edge, e a pagina 2 traz o IBAN e a assinatura", async () => {
      await abrirSessao();
      const antes = invoke.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
      expect(await screen.findByText(txt("hr.pessoais.bancarios"))).toBeInTheDocument();
      expect(porId("convite-conta-numero")).toBeInTheDocument();
      expect(screen.getByText(txt("hr.convite.paginaDe", { atual: 2, total: 2 }))).toBeInTheDocument();
      expect(invoke.mock.calls.length).toBe(antes);
      fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.anterior") }));
      expect(await screen.findByText(txt("hr.pessoais.geral"))).toBeInTheDocument();
      expect(porId("convite-linha1")).toHaveValue("Rua das Flores 12");
    });

    it("o foco volta ao topo ao mudar de pagina (o botao que o tinha desapareceu)", async () => {
      await abrirSessao();
      fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
      await screen.findByText(txt("hr.pessoais.bancarios"));
      await waitFor(() => expect(document.getElementById("portal-topo")).toHaveFocus());
    });

    it("um NIF com digito de controlo errado diz porque, sem chamar a Edge", async () => {
      await abrirSessao();
      fireEvent.change(porId("convite-nif"), { target: { value: "123456780" } });
      fireEvent.blur(porId("convite-nif"));
      expect(await screen.findByText(txt("hr.convite.erro.nifInvalido"))).toBeInTheDocument();
      expect(porId("convite-nif")).toHaveAttribute("aria-invalid", "true");
    });

    it("o BIC escreve-se em maiusculas, sem espacos e com no maximo 11 caracteres (pagina 2)", async () => {
      await abrirSessao();
      fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
      await screen.findByText(txt("hr.pessoais.bancarios"));
      fireEvent.change(porId("convite-conta-bic"), { target: { value: "bcom pt pl xxx yyy" } });
      expect(porId("convite-conta-bic")).toHaveValue("BCOMPTPLXXX");
    });

    it("o foco vai para o topo (saudacao) quando a sessao abre (o botao que o tinha desapareceu)", async () => {
      await abrirSessao();
      await waitFor(() => expect(document.getElementById("portal-topo")).toHaveFocus());
    });

    it("em devolvida mostra a nota do RH e os campos a corrigir, e so esses campos se editam", async () => {
      ligar({
        ...base(),
        ler: lerOk({
          estado: "devolvida",
          devolucao: { campos: { genero: "Falta indicar o género" }, documentos: ["cartao_cidadao"], observacao: "Reveja o género" },
          campos_editaveis: ["genero"],
        }),
      });
      await entrarComCodigo();
      await screen.findByRole("button", { name: txt("portal.sair") });
      expect(screen.getByText("Reveja o género")).toBeInTheDocument();
      expect(screen.getByText("Falta indicar o género")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: txt("portal.proxima.corrigir") })).toHaveAttribute("aria-disabled", "true");
      // So o campo devolvido (genero) esta activo; o resto diz-se bloqueado, com a razao em texto.
      expect(porId("convite-genero")).toBeEnabled();
      expect(porId("convite-linha1")).toBeDisabled();
      expect(porId("convite-nif")).toBeDisabled();
      expect(screen.getByText(txt("portal.formulario.bloqueados"))).toBeInTheDocument();
    });

    it("em preenchimento nao ha nota de campos bloqueados", async () => {
      await abrirSessao();
      expect(screen.queryByText(txt("portal.formulario.bloqueados"))).toBeNull();
    });

    it("o formulario diz que o que se escreve ainda nao se guarda (so o NISS e o IBAN)", async () => {
      await abrirSessao();
      expect(screen.getByText(txt("portal.formulario.aviso"))).toBeInTheDocument();
    });

    it("Terminar sessao: chama sair com o cabecalho, volta a consulta, avisa e esconde os dados", async () => {
      await abrirSessao();
      ligar({ ...base(), sair: { data: { ok: true, terminada: true }, error: null }, estado: estadoOk() });
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sair") }));

      expect(await screen.findByRole("button", { name: txt("portal.consulta.botao") })).toBeInTheDocument();
      expect(chamadas("sair")[0][1].headers).toEqual({ "x-portal-sessao": SESSAO });
      expect(screen.getByText(txt("portal.sessao.terminada"))).toBeInTheDocument();
      expect(porId("convite-linha1")).toBeNull();
      expect(document.querySelectorAll("input, select, textarea")).toHaveLength(0);
      expect(sessionStorage.length).toBe(0);
    });

    it("sessao substituida (outro dispositivo): volta a consulta com a mensagem, anunciada, sem o formulario", async () => {
      await abrirSessao();
      ligar({ ...base(), estado: estadoOk(), sensiveis: erroHttp(401, { error: "sessao_substituida" }) });
      fireEvent.change(porId("convite-niss"), { target: { value: NISS_VALIDO } });
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sensiveis.guardarNiss") }));

      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent(txt("portal.erro.sessaoSubstituida"));
      expect(await screen.findByRole("button", { name: txt("portal.consulta.botao") })).toBeInTheDocument();
      expect(porId("convite-linha1")).toBeNull();
      expect(document.body.innerHTML).not.toContain(NISS_VALIDO);
    });

    it("sessao expirada: 'confirme de novo o codigo'", async () => {
      await abrirSessao();
      ligar({ ...base(), estado: estadoOk(), sensiveis: erroHttp(401, { error: "sessao_expirada" }) });
      fireEvent.change(porId("convite-niss"), { target: { value: NISS_VALIDO } });
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sensiveis.guardarNiss") }));
      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent(txt("portal.erro.sessaoExpirada"));
      expect(alerta.textContent).toMatch(/confirme de novo o código/i);
    });

    it("o aviso discreto de sessao a expirar aparece e 'Manter sessao' volta a pedir a leitura", async () => {
      const dateNow = Date.now();
      await abrirSessao();
      vi.spyOn(Date, "now").mockReturnValue(dateNow + 27 * 60_000);
      await screen.findByText(txt("portal.sessao.aExpirar"), {}, { timeout: 4000 });
      const antes = chamadas("ler").length;
      vi.spyOn(Date, "now").mockReturnValue(dateNow + 27 * 60_000);
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sessao.manter") }));
      await waitFor(() => expect(chamadas("ler").length).toBe(antes + 1));
      await waitFor(() => expect(screen.queryByText(txt("portal.sessao.aExpirar"))).toBeNull());
    });
  });

  describe("NISS e IBAN (accao sensiveis), nos campos do formulario onde aparecem", () => {
    const irParaPagina2 = async () => {
      fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
      await screen.findByText(txt("hr.pessoais.bancarios"));
    };

    it("o NISS esta na pagina 1 e o IBAN na pagina 2, cada um com o seu botao de guardar", async () => {
      await abrirSessao();
      expect(porId("convite-niss")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: txt("portal.sensiveis.guardarNiss") })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: txt("portal.sensiveis.guardarIban") })).toBeNull();
      await irParaPagina2();
      expect(porId("convite-conta-numero")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: txt("portal.sensiveis.guardarIban") })).toBeInTheDocument();
    });

    it("um NISS invalido mostra o erro ligado ao campo, leva-lhe o foco e nao chama a Edge", async () => {
      await abrirSessao();
      fireEvent.change(porId("convite-niss"), { target: { value: "12345678901" } });
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sensiveis.guardarNiss") }));
      expect(await screen.findByText(txt("hr.convite.erro.nissInvalido"))).toBeInTheDocument();
      expect(porId("convite-niss")).toHaveAttribute("aria-invalid", "true");
      await waitFor(() => expect(porId("convite-niss")).toHaveFocus());
      expect(chamadas("sensiveis")).toHaveLength(0);
    });

    it("um IBAN invalido faz o mesmo", async () => {
      await abrirSessao();
      await irParaPagina2();
      fireEvent.change(porId("convite-conta-numero"), { target: { value: "PT51000201231234567890154" } });
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sensiveis.guardarIban") }));
      expect(await screen.findByText(txt("hr.convite.erro.ibanInvalido"))).toBeInTheDocument();
      expect(chamadas("sensiveis")).toHaveLength(0);
    });

    it("sem escrever nada, diz que falta escrever e nao chama a Edge", async () => {
      await abrirSessao();
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sensiveis.guardarNiss") }));
      expect(await screen.findByText(txt("portal.sensiveis.nadaPreenchido"))).toBeInTheDocument();
      expect(chamadas("sensiveis")).toHaveLength(0);
    });

    it("grava o NISS so com a chave niss, limpa o campo, mostra so os 4 ultimos digitos e anuncia o resultado", async () => {
      await abrirSessao();
      ligar({ ...base(), sensiveis: { data: { ok: true, niss_ultimos4: "8902", iban_ultimos4: null }, error: null } });
      fireEvent.change(porId("convite-niss"), { target: { value: NISS_VALIDO } });
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sensiveis.guardarNiss") }));

      expect(await screen.findByText(txt("portal.sensiveis.okNiss"))).toBeInTheDocument();
      expect(chamadas("sensiveis")[0][1].headers).toEqual({ "x-portal-sessao": SESSAO });
      expect(chamadas("sensiveis")[0][1].body).toEqual({ action: "sensiveis", token: TOKEN, niss: NISS_VALIDO });
      expect(porId("convite-niss")).toHaveValue("");
      // A saudacao do convite que ja existia diz o que ja esta registado, so com os 4 ultimos.
      expect(screen.getByText(txt("hr.convite.jaRegistadoNiss", { ultimos4: "8902" }))).toBeInTheDocument();
      expect(document.body.innerHTML).not.toContain(NISS_VALIDO);
    });

    it("grava o IBAN so com a chave iban (sem espacos, como no convite antigo) e limpa o campo", async () => {
      await abrirSessao();
      await irParaPagina2();
      ligar({ ...base(), sensiveis: { data: { ok: true, niss_ultimos4: null, iban_ultimos4: "0154" }, error: null } });
      fireEvent.change(porId("convite-conta-numero"), { target: { value: "PT50 0002 0123 1234 5678 9015 4" } });
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sensiveis.guardarIban") }));

      expect(await screen.findByText(txt("portal.sensiveis.okIban"))).toBeInTheDocument();
      expect(chamadas("sensiveis")[0][1].body).toEqual({ action: "sensiveis", token: TOKEN, iban: IBAN_VALIDO });
      expect(porId("convite-conta-numero")).toHaveValue("");
      expect(screen.getByText(txt("hr.convite.jaRegistadoConta", { ultimos4: "0154" }))).toBeInTheDocument();
      expect(document.body.innerHTML).not.toContain(IBAN_VALIDO);
    });

    it("um NISS ja guardado conta como preenchido: basta um de NIF e NISS, por isso o NIF deixa de ser obrigatorio", async () => {
      ligar({ ...base(), ler: lerOk({ campos_obrigatorios: ["nif", "niss"], niss_ultimos4: null }) });
      await entrarComCodigo();
      await screen.findByRole("button", { name: txt("portal.sair") });
      // Sem nada guardado, os dois sao pedidos (um deles basta; a regra do convite, que ja existia).
      expect(porId("convite-nif")).toHaveAttribute("aria-required", "true");
      expect(porId("convite-niss")).toHaveAttribute("aria-required", "true");
      cleanup();

      ligar({ ...base(), ler: lerOk({ campos_obrigatorios: ["nif", "niss"], niss_ultimos4: "8902" }) });
      await entrarComCodigo();
      await screen.findByRole("button", { name: txt("portal.sair") });
      expect(porId("convite-nif")).not.toHaveAttribute("aria-required");
    });

    it("um erro da base (campo_bloqueado) mostra texto traduzido, anunciado, nunca o codigo", async () => {
      await abrirSessao();
      ligar({ ...base(), sensiveis: erroHttp(409, { error: "campo_bloqueado" }) });
      fireEvent.change(porId("convite-niss"), { target: { value: NISS_VALIDO } });
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sensiveis.guardarNiss") }));
      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent(txt("portal.erro.campoBloqueado"));
      expect(alerta.textContent).not.toContain("campo_bloqueado");
    });

    it("em devolvida sem o NISS devolvido, o campo e o botao do NISS ficam inactivos; o IBAN devolvido fica activo", async () => {
      ligar({
        ...base(),
        ler: lerOk({ estado: "devolvida", devolucao: { campos: { iban: "Falta o comprovativo" }, documentos: [], observacao: null }, campos_editaveis: ["iban"] }),
      });
      await entrarComCodigo();
      await screen.findByRole("button", { name: txt("portal.sair") });
      expect(porId("convite-niss")).toBeDisabled();
      expect(screen.getByRole("button", { name: txt("portal.sensiveis.guardarNiss") })).toBeDisabled();
      await irParaPagina2();
      expect(porId("convite-conta-numero")).toBeEnabled();
      expect(screen.getByRole("button", { name: txt("portal.sensiveis.guardarIban") })).toBeEnabled();
    });
  });

  describe("o que fica para a V3b: desenhado e desactivado, com a razao", () => {
    it.each([
      "portal.proxima.gravar",
      "portal.proxima.submeter",
      "portal.proxima.documentos",
      "portal.proxima.contrato",
      "portal.proxima.pedidos",
    ])("%s esta com aria-disabled e explica 'disponivel na proxima fase'", async (chave) => {
      await abrirSessao();
      // Os documentos ficam na pagina 2 do formulario, onde o convite sempre os teve.
      if (chave === "portal.proxima.documentos") {
        fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
        await screen.findByText(txt("hr.pessoais.bancarios"));
      }
      const botao = screen.getByRole("button", { name: txt(chave) });
      expect(botao).toHaveAttribute("aria-disabled", "true");
      expect(botao).not.toBeDisabled();
      expect(botao).toHaveAccessibleDescription(txt("portal.proxima.razao"));
    });

    it("clicar nao chama a Edge (nem rascunho, nem submeter, nem anexos)", async () => {
      await abrirSessao();
      fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
      await screen.findByText(txt("hr.pessoais.bancarios"));
      const antes = invoke.mock.calls.length;
      for (const chave of ["portal.proxima.gravar", "portal.proxima.submeter", "portal.proxima.documentos"]) {
        fireEvent.click(screen.getByRole("button", { name: txt(chave) }));
      }
      expect(invoke.mock.calls.length).toBe(antes);
      for (const accao of ["rascunho", "submeter", "anexo_pedir", "anexo_confirmar"]) expect(chamadas(accao)).toHaveLength(0);
    });

    it("nunca se chama rascunho nem submeter em todo o percurso (a Edge actual nao exige sessao nelas)", async () => {
      await abrirSessao();
      // Nem a escrever no formulario, nem a mudar de pagina, nem a fechar a aba.
      fireEvent.change(porId("convite-telefone-pessoal"), { target: { value: "913000000" } });
      fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
      await screen.findByText(txt("hr.pessoais.bancarios"));
      window.dispatchEvent(new Event("pagehide"));
      expect(chamadas("rascunho")).toHaveLength(0);
      expect(chamadas("submeter")).toHaveLength(0);
    });

    it("a assinatura e a declaracao de veracidade (da submissao) estao inactivas na pagina 2", async () => {
      await abrirSessao();
      fireEvent.click(screen.getByRole("button", { name: txt("hr.convite.seguinte") }));
      await screen.findByText(txt("hr.pessoais.bancarios"));
      expect(porId("convite-assinatura-nome")).toBeDisabled();
      expect(porId("convite-aceite")).toBeDisabled();
    });

    it("o botao de submeter do convite antigo nao existe: so o desactivado, com a razao", async () => {
      await abrirSessao();
      expect(screen.queryByRole("button", { name: txt("hr.convite.submeter") })).toBeNull();
      expect(screen.getByRole("button", { name: txt("portal.proxima.submeter") })).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("vistas sem acesso", () => {
    // Link invalido, revogado, encerrado, expirado e bloqueado usam o cartao de link invalido que ja
    // existia (ConviteCartaoLinkInvalido), com o titulo de nivel 1 dele e o motivo que ja tinha.
    it.each([
      [401, "convite_invalido", "tokenInvalidoTitulo", "inexistente"],
      [401, "convite_revogado", "tokenInvalidoTitulo", "substituido"],
      [401, "convite_ja_usado", "tokenInvalidoTitulo", "usado"],
      [401, "convite_expirado", "tokenInvalidoTitulo", "expirado"],
      [401, "convite_bloqueado", "tokenInvalidoTitulo", "bloqueado"],
      [429, "demasiadas_tentativas", "demasiadasTentativasTitulo", "demasiadasTentativas"],
    ])("o erro %i %s mostra o cartao de link invalido (%s, motivo %s): um so h1, texto, sem codigo", async (status, codigo, titulo, motivo) => {
      ligar({ ...base(), estado: erroHttp(status, { error: codigo }) });
      renderPortal();
      expect(await screen.findByRole("heading", { level: 1, name: txt(`hr.convite.${titulo}`) })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByText(txt(`hr.convite.motivo.${motivo}`))).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: txt("portal.consulta.botao") })).toBeNull();
      expect(document.body.innerHTML).not.toContain(codigo);
    });

    it.each([
      ["expirado", "expirado", "hr.convite.motivo.expirado"],
      ["revogado", "substituido", "hr.convite.motivo.substituido"],
      ["encerrado", "usado", "hr.convite.motivo.usado"],
    ])("estado_portal %s, sem erro, tambem mostra o cartao (%s)", async (estadoPortal, _motivo, chave) => {
      ligar({ ...base(), estado: estadoOk({ estado_portal: estadoPortal, precisa_otp: false }) });
      renderPortal();
      expect(await screen.findByRole("heading", { level: 1, name: txt("hr.convite.tokenInvalidoTitulo") })).toBeInTheDocument();
      expect(screen.getByText(txt(chave))).toBeInTheDocument();
    });

    it("um convite bloqueado, devolvido pela `estado`, mostra o cartao de bloqueado", async () => {
      ligar({ ...base(), estado: estadoOk({ bloqueado: true, precisa_otp: false }) });
      renderPortal();
      expect(await screen.findByText(txt("hr.convite.motivo.bloqueado"))).toBeInTheDocument();
    });

    it("um link expirado nao mostra dados sensiveis nem o nome da pessoa", async () => {
      ligar({ ...base(), estado: erroHttp(401, { error: "convite_expirado" }) });
      renderPortal();
      await screen.findByRole("heading", { level: 1, name: txt("hr.convite.tokenInvalidoTitulo") });
      expect(document.body.textContent).not.toContain("Joana");
      expect(document.body.textContent).not.toMatch(/\d{9,}/);
    });

    it("processo em analise: a pessoa ve so o estado e e mandada contactar o RH, sem pedir codigo", async () => {
      ligar({ ...base(), estado: estadoOk({ estado: "submetida", precisa_otp: false }) });
      renderPortal();
      expect(await screen.findByRole("heading", { level: 1, name: txt("portal.vista.analise.titulo") })).toBeInTheDocument();
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByText(txt("portal.vista.analise.estado", { estado: txt("hr.convite.estadoAdmissao.submetida") }))).toBeInTheDocument();
      expect(screen.getByText(txt("portal.vista.contactarRh"))).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: txt("portal.consulta.botao") })).toBeNull();
      expect(chamadas("ler")).toHaveLength(0);
      expect(document.querySelectorAll("input, select, textarea")).toHaveLength(0);
    });

    it("uma falha de rede a abrir mostra o cartao de link invalido, em texto, sem o codigo", async () => {
      ligar({ ...base(), estado: { data: null, error: { message: "Failed to fetch" } } });
      renderPortal();
      expect(await screen.findByRole("heading", { level: 1, name: txt("hr.convite.tokenInvalidoTitulo") })).toBeInTheDocument();
      expect(screen.getByText(txt("hr.convite.motivo.inexistente"))).toBeInTheDocument();
    });

    it("o cartao esta na lingua do navegador (en), com o texto que ja existia", async () => {
      idiomaDoTeste = "en";
      Object.defineProperty(window.navigator, "languages", { value: ["en-GB"], configurable: true });
      ligar({ ...base(), estado: erroHttp(401, { error: "convite_expirado" }) });
      renderPortal();
      expect(await screen.findByText(tabela.en["hr.convite.motivo.expirado"])).toBeInTheDocument();
    });
  });

  describe("seguranca", () => {
    it("percurso completo: nada em localStorage, o URL nao muda, e sessao e token nunca vao para log nem registo", async () => {
      const consola = [
        vi.spyOn(console, "log").mockImplementation(() => undefined),
        vi.spyOn(console, "error").mockImplementation(() => undefined),
        vi.spyOn(console, "warn").mockImplementation(() => undefined),
      ];
      const href = window.location.href;
      await abrirSessao();

      // A sessao so vive em memoria: nem localStorage, nem sessionStorage.
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
      expect(window.location.href).toBe(href);
      expect(document.body.innerHTML).not.toContain(SESSAO);
      expect(document.body.innerHTML).not.toContain(TOKEN);
      for (const c of consola) for (const args of c.mock.calls) expect(JSON.stringify(args)).not.toMatch(new RegExp(`${SESSAO}|${TOKEN}`));
      for (const [erro] of captureFlowError.mock.calls as Array<[Error]>) expect(erro.message).not.toMatch(new RegExp(`${SESSAO}|${TOKEN}`));
    });

    it("o token do link so vai no corpo das chamadas a Edge e nunca para armazenamento", async () => {
      const escrita = vi.spyOn(Storage.prototype, "setItem");
      await abrirSessao();
      expect(escrita).not.toHaveBeenCalled();
      for (const [, opcoes] of invoke.mock.calls as Array<[string, { body: Record<string, unknown>; headers?: Record<string, string> }]>) {
        expect(opcoes.body.token).toBe(TOKEN);
        expect(JSON.stringify(opcoes.headers ?? {})).not.toContain(TOKEN);
      }
    });

    it("recarregar o ecra (novo render) perde a sessao: volta a consulta e pede o codigo de novo", async () => {
      const primeiro = await abrirSessao();
      expect(primeiro).toBeInTheDocument();
      cleanup();
      invoke.mockClear();
      ligar(base());
      renderPortal();
      expect(await screen.findByRole("button", { name: txt("portal.consulta.botao") })).toBeInTheDocument();
      expect(chamadas("ler")).toHaveLength(0);
      expect(chamadas("estado")[0][1].headers).toBeUndefined();
    });

    it("terminar a sessao limpa o NISS e o IBAN escritos (o estado sensivel nao sobrevive ao fim da sessao)", async () => {
      await abrirSessao();
      fireEvent.change(porId("convite-niss"), { target: { value: NISS_VALIDO } });
      ligar({ ...base(), sair: { data: { ok: true, terminada: true }, error: null }, estado: estadoOk() });
      fireEvent.click(screen.getByRole("button", { name: txt("portal.sair") }));
      await screen.findByRole("button", { name: txt("portal.consulta.botao") });
      expect(document.body.innerHTML).not.toContain(NISS_VALIDO);
      // Reabrir a sessao traz o formulario limpo, sem o que se tinha escrito.
      ligar(base());
      await entrarComCodigo();
      await screen.findByRole("button", { name: txt("portal.sair") });
      expect(porId("convite-niss")).toHaveValue("");
    });
  });

  describe("lingua", () => {
    it("o portal segue a lingua do navegador (en)", async () => {
      idiomaDoTeste = "en";
      Object.defineProperty(window.navigator, "languages", { value: ["en-GB"], configurable: true });
      renderPortal();
      expect(await screen.findByRole("button", { name: tabela.en["portal.consulta.botao"] })).toBeInTheDocument();
      expect(tabela.en["portal.consulta.botao"]).not.toBe(tabela.pt["portal.consulta.botao"]);
    });
  });
});
