/**
 * `useConviteAdmissaoPublico` (portal temporario da admissao, V3a) contra os contratos
 * EXACTOS da Edge `convite-admissao` (accoesPortal.ts, handler.ts, erros.ts):
 *  - estado: { ok, convite: { existe, estado, estado_portal, valid_until, primeiro_nome,
 *    organizacao_nome, bloqueado, precisa_otp } }
 *  - otp_pedir: { ok, expira_em }
 *  - otp_verificar: { ok, sessao, sessao_expira_em } | erro otp_invalido (401, restantes),
 *    otp_bloqueado (429), otp_expirado (410)
 *  - ler: { ok, estado, rascunho, campos_obrigatorios, ... } | sessao_* (401)
 *  - sensiveis: { ok, niss_ultimos4, iban_ultimos4 }
 *  - sair: { ok, terminada }
 * A sessao vai no cabecalho `x-portal-sessao`, nunca no corpo nem no URL, e vive so em memoria
 * (nem localStorage nem sessionStorage): recarregar ou fechar o separador obriga a novo codigo.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import { useConviteAdmissaoPublico } from "../useConviteAdmissaoPublico";
import { lerSessao, limparSessao } from "@/lib/hr/portalSessao";

const TOKEN = "token-do-link-com-mais-de-vinte-caracteres";
const SESSAO = "S".repeat(43);

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

const lerOk = (extra: Record<string, unknown> = {}) => ({
  ok: true,
  estado: "em_preenchimento",
  rascunho: { morada_linha1: "Rua A" },
  campos_obrigatorios: ["nif", "genero"],
  campos_editaveis: ["nif", "genero"],
  documentos_editaveis: [],
  niss_ultimos4: null,
  iban_ultimos4: null,
  devolucao: null,
  anexos: [],
  rejeicao_mensagem: null,
  ...extra,
});

type Resposta = { data: unknown; error: unknown };
type Respostas = Partial<Record<string, Resposta | Resposta[] | (() => Resposta)>>;
let respostas: Respostas = {};

function ligar(r: Respostas) {
  respostas = r;
  invoke.mockImplementation(async (_nome: string, opcoes: { body: { action: string } }) => {
    const r1 = respostas[opcoes.body.action];
    if (!r1) return { data: null, error: { message: "sem resposta simulada", context: new Response("{}", { status: 500 }) } };
    if (typeof r1 === "function") return r1();
    if (Array.isArray(r1)) return r1.length > 1 ? r1.shift() : r1[0];
    return r1;
  });
}

const estadoOk = (extra: Record<string, unknown> = {}) => ({ data: { ok: true, convite: conviteBase(extra) }, error: null });
const otpPedirOk = { data: { ok: true, expira_em: "2099-10-16T10:10:00Z" }, error: null };
const otpVerificarOk = (sessao = SESSAO) => ({ data: { ok: true, sessao, sessao_expira_em: "2099-10-16T14:00:00Z" }, error: null });

const chamadas = (accao: string) =>
  invoke.mock.calls.filter(([, o]) => (o as { body: { action: string } }).body.action === accao) as Array<
    [string, { body: Record<string, unknown>; headers?: Record<string, string> }]
  >;

async function abrir(token: string | undefined = TOKEN) {
  const r = renderHook(() => useConviteAdmissaoPublico(token));
  await waitFor(() => expect(r.result.current.carregando).toBe(false));
  return r;
}

async function entrar(r: Awaited<ReturnType<typeof abrir>>, codigo = "123456") {
  await act(async () => {
    await r.result.current.pedirCodigo();
  });
  let ok = false;
  await act(async () => {
    ok = await r.result.current.verificarCodigo(codigo);
  });
  return ok;
}

describe("useConviteAdmissaoPublico", () => {
  beforeEach(() => {
    invoke.mockReset();
    captureFlowError.mockReset();
    limparSessao();
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("consulta limitada (sem sessao)", () => {
    it("abre com a accao estado, so com o token, SEM cabecalho de sessao, e fica sem dados sensiveis", async () => {
      ligar({ estado: estadoOk() });
      const r = await abrir();

      expect(chamadas("estado")).toHaveLength(1);
      const [nome, opcoes] = chamadas("estado")[0];
      expect(nome).toBe("convite-admissao");
      expect(opcoes.body).toEqual({ action: "estado", token: TOKEN });
      expect(opcoes.headers).toBeUndefined();

      expect(r.result.current.convite).toEqual(conviteBase());
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.dados).toBeNull();
      expect(chamadas("ler")).toHaveLength(0);
    });

    it("nao pede a leitura completa sem sessao", async () => {
      ligar({ estado: estadoOk({ estado: "em_preenchimento" }) });
      await abrir();
      expect(chamadas("ler")).toHaveLength(0);
      expect(chamadas("sensiveis")).toHaveLength(0);
    });

    it.each([
      [401, "convite_invalido"],
      [401, "convite_revogado"],
      [401, "convite_expirado"],
      [401, "convite_ja_usado"],
      [401, "convite_bloqueado"],
      [429, "demasiadas_tentativas"],
    ])("o erro %i %s fica em erroInicial (lido de error.context)", async (status, codigo) => {
      ligar({ estado: erroHttp(status, { error: codigo }) });
      const r = await abrir();
      expect(r.result.current.erroInicial).toBe(codigo);
      expect(r.result.current.convite).toBeNull();
    });

    it("um erro sem corpo e invalido e vai para o registo SEM token nem corpo", async () => {
      ligar({ estado: { data: null, error: { message: "falha de rede" } } });
      const r = await abrir();
      expect(r.result.current.erroInicial).toBe("convite_invalido");
      expect(captureFlowError).toHaveBeenCalledTimes(1);
      const registado = captureFlowError.mock.calls[0][0] as Error;
      expect(registado.message).not.toContain(TOKEN);
      expect(registado.message).toBe("estado: falha_de_rede");
    });

    it("sem token no endereco: invalido, sem chamar a Edge", async () => {
      ligar({ estado: estadoOk() });
      const r = await abrir("");
      expect(r.result.current.erroInicial).toBe("convite_invalido");
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("pedir o codigo", () => {
    it("chama otp_pedir so com o token; o e-mail do convite nunca e do pedido", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk });
      const r = await abrir();
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      expect(chamadas("otp_pedir")[0][1].body).toEqual({ action: "otp_pedir", token: TOKEN });
      expect(r.result.current.otp.pedido).toBe(true);
      expect(r.result.current.otp.erro).toBeNull();
    });

    it("a resposta com e-mail ja mascarado e mostrada; o que viesse por inteiro e mascarado aqui", async () => {
      ligar({
        estado: estadoOk(),
        otp_pedir: { data: { ok: true, expira_em: "2099-10-16T10:10:00Z", email_mascarado: "joana.pires@exemplo.pt" }, error: null },
      });
      const r = await abrir();
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      expect(r.result.current.otp.emailMascarado).toBe("j***@exemplo.pt");
    });

    it("sem e-mail na resposta (contrato actual da Edge) nao inventa nenhum", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk });
      const r = await abrir();
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      expect(r.result.current.otp.emailMascarado).toBeNull();
    });

    it("o reenvio so fica livre depois de 60 s", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk });
      const r = await abrir();
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      expect(r.result.current.otp.reenviarApos).toBe(new Date("2026-10-16T10:01:00Z").getTime());
    });

    it.each([
      [429, "otp_espera"],
      [429, "otp_limite_diario"],
      [503, "otp_indisponivel"],
      [502, "email_nao_enviado"],
      [429, "demasiadas_tentativas"],
    ])("o erro %i %s fica em otp.erro e nao abre a sessao", async (status, codigo) => {
      ligar({ estado: estadoOk(), otp_pedir: erroHttp(status, { error: codigo }) });
      const r = await abrir();
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      expect(r.result.current.otp.erro).toBe(codigo);
      expect(r.result.current.sessaoAtiva).toBe(false);
    });

    it("otp_espera conta como pedido ja feito: pode-se escrever o codigo que chegou", async () => {
      ligar({ estado: estadoOk(), otp_pedir: erroHttp(429, { error: "otp_espera" }) });
      const r = await abrir();
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      expect(r.result.current.otp.pedido).toBe(true);
    });

    it("um convite_* no pedido leva o ecra a vista sem acesso", async () => {
      ligar({ estado: estadoOk(), otp_pedir: erroHttp(401, { error: "convite_expirado" }) });
      const r = await abrir();
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      expect(r.result.current.erroInicial).toBe("convite_expirado");
    });
  });

  describe("verificar o codigo", () => {
    it("o codigo certo abre a sessao: otp_verificar so com o codigo, e a leitura segue com o cabecalho", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const r = await abrir();
      const ok = await entrar(r, "123456");

      expect(ok).toBe(true);
      expect(chamadas("otp_verificar")[0][1].body).toEqual({ action: "otp_verificar", token: TOKEN, codigo: "123456" });
      expect(chamadas("otp_verificar")[0][1].headers).toBeUndefined();

      expect(chamadas("ler")).toHaveLength(1);
      expect(chamadas("ler")[0][1].headers).toEqual({ "x-portal-sessao": SESSAO });
      expect(chamadas("ler")[0][1].body).toEqual({ action: "ler", token: TOKEN });

      expect(r.result.current.sessaoAtiva).toBe(true);
      expect(r.result.current.dados?.campos_obrigatorios).toEqual(["nif", "genero"]);
      expect(r.result.current.dados?.rascunho).toEqual({ morada_linha1: "Rua A" });
    });

    it("o codigo nunca fica no estado do hook", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const r = await abrir();
      await entrar(r, "654321");
      expect(JSON.stringify(r.result.current.otp)).not.toContain("654321");
    });

    it("um codigo que nao tem 6 algarismos nem chega a Edge", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk });
      const r = await abrir();
      let ok = true;
      await act(async () => {
        ok = await r.result.current.verificarCodigo("12a456");
      });
      expect(ok).toBe(false);
      expect(chamadas("otp_verificar")).toHaveLength(0);
      expect(r.result.current.otp.erro).toBe("pedido_invalido");
    });

    it("espacos e hifenes colados do e-mail sao retirados", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const r = await abrir();
      await entrar(r, " 123 456 ");
      expect(chamadas("otp_verificar")[0][1].body.codigo).toBe("123456");
    });

    it("otp_invalido: continua em consulta e diz quantas tentativas restam", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: erroHttp(401, { error: "otp_invalido", restantes: 3 }) });
      const r = await abrir();
      const ok = await entrar(r);
      expect(ok).toBe(false);
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.otp.erro).toBe("otp_invalido");
      expect(r.result.current.otp.restantes).toBe(3);
      expect(sessionStorage.length).toBe(0);
    });

    it("otp_bloqueado: bloqueia a escrita ate pedir um codigo novo", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: erroHttp(429, { error: "otp_bloqueado" }) });
      const r = await abrir();
      await entrar(r);
      expect(r.result.current.otp.erro).toBe("otp_bloqueado");
      expect(r.result.current.otp.bloqueado).toBe(true);
      // um pedido novo (a base repoe as tentativas) desbloqueia
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk });
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      expect(r.result.current.otp.bloqueado).toBe(false);
      expect(r.result.current.otp.restantes).toBeNull();
    });

    it("otp_expirado fica em otp.erro", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: erroHttp(410, { error: "otp_expirado" }) });
      const r = await abrir();
      await entrar(r);
      expect(r.result.current.otp.erro).toBe("otp_expirado");
    });
  });

  describe("onde vive a sessao", () => {
    it("so em memoria: nem localStorage, nem sessionStorage, nem o URL, nem o corpo dos pedidos", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const escrita = vi.spyOn(Storage.prototype, "setItem");
      const href = window.location.href;
      const r = await abrir();
      await entrar(r);

      expect(r.result.current.sessaoAtiva).toBe(true);
      expect(escrita).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
      expect(localStorage.length).toBe(0);
      expect(window.location.href).toBe(href);
      expect(window.location.href).not.toContain(SESSAO);
      for (const [, opcoes] of invoke.mock.calls as Array<[string, { body: unknown }]>) {
        expect(JSON.stringify(opcoes.body)).not.toContain(SESSAO);
      }
    });

    it("o segredo da sessao nao aparece em nada do que o hook devolve ao ecra", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const r = await abrir();
      await entrar(r);
      expect(JSON.stringify(r.result.current)).not.toContain(SESSAO);
      expect(JSON.stringify(r.result.current)).not.toContain(TOKEN);
    });

    it("nem a sessao nem o token chegam ao registo de erros", async () => {
      ligar({
        estado: estadoOk(),
        otp_pedir: otpPedirOk,
        otp_verificar: otpVerificarOk(),
        ler: erroHttp(500, { error: "erro_inesperado" }),
      });
      const r = await abrir();
      await entrar(r);
      for (const [erro] of captureFlowError.mock.calls as Array<[Error]>) {
        expect(erro.message).not.toContain(SESSAO);
        expect(erro.message).not.toContain(TOKEN);
      }
    });

    it("ao recarregar a pagina (ou abrir noutro separador) nao ha sessao: pede-se o codigo de novo", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const primeiro = await abrir();
      await entrar(primeiro);
      expect(primeiro.result.current.sessaoAtiva).toBe(true);
      // Recarregar: o React e a memoria do modulo recomecam do zero.
      primeiro.unmount();
      invoke.mockClear();
      const segundo = await abrir();

      expect(segundo.result.current.sessaoAtiva).toBe(false);
      expect(segundo.result.current.dados).toBeNull();
      expect(chamadas("estado")).toHaveLength(1);
      expect(chamadas("estado")[0][1].headers).toBeUndefined();
      expect(chamadas("ler")).toHaveLength(0);
    });

    it("uma sessao que sobrou em sessionStorage (versao anterior) nunca e usada nem mandada a Edge", async () => {
      sessionStorage.setItem("portal-admissao-sessao", SESSAO);
      ligar({ estado: estadoOk({ estado: "em_preenchimento", precisa_otp: true }) });
      const r = await abrir();
      expect(chamadas("estado")[0][1].headers).toBeUndefined();
      expect(chamadas("ler")).toHaveLength(0);
      expect(r.result.current.sessaoAtiva).toBe(false);
    });

    it("sair do ecra (desmontar) apaga a sessao da memoria: o proximo ecra nao a herda", async () => {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const r = await abrir();
      await entrar(r);
      r.unmount();
      expect(lerSessao()).toBeNull();
    });
  });

  describe("sessao perdida volta a consulta com a mensagem", () => {
    async function comSessao(extra: Respostas = {}) {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null }, ...extra });
      const r = await abrir();
      await entrar(r);
      expect(r.result.current.sessaoAtiva).toBe(true);
      return r;
    }

    it.each([
      ["sessao_expirada", "expirada"],
      ["sessao_substituida", "substituida"],
      ["sessao_ausente", "expirada"],
    ])("%s ao manter a sessao: limpa tudo e avisa (%s)", async (codigo, aviso) => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), ler: erroHttp(401, { error: codigo }) });
      await act(async () => {
        await r.result.current.manterSessao();
      });
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.dados).toBeNull();
      expect(r.result.current.aviso).toBe(aviso);
      expect(sessionStorage.length).toBe(0);
      // o estado volta a pedir-se SEM a sessao morta
      const estados = chamadas("estado");
      const ultimoEstado = estados[estados.length - 1];
      expect(ultimoEstado?.[1].headers).toBeUndefined();
    });

    it("sessao_substituida ao gravar NISS/IBAN tambem volta a consulta", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), sensiveis: erroHttp(401, { error: "sessao_substituida" }) });
      let resultado: unknown;
      await act(async () => {
        resultado = await r.result.current.gravarSensiveis({ niss: "12345678901" });
      });
      expect(resultado).toEqual({ ok: false, codigo: "sessao_substituida" });
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.aviso).toBe("substituida");
    });

    it("uma sessao recusada logo na leitura que se segue ao codigo (sessao_substituida) nao deixa sessao activa", async () => {
      ligar({
        estado: estadoOk(),
        otp_pedir: otpPedirOk,
        otp_verificar: otpVerificarOk(),
        ler: erroHttp(401, { error: "sessao_substituida" }),
      });
      const r = await abrir();
      await entrar(r);
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.aviso).toBe("substituida");
      expect(sessionStorage.length).toBe(0);
    });

    it("a inatividade de 30 min acaba a sessao no cliente, sem esperar pela Edge", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const r = renderHook(() => useConviteAdmissaoPublico(TOKEN));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      await act(async () => {
        await r.result.current.verificarCodigo("123456");
      });
      expect(r.result.current.sessaoAtiva).toBe(true);
      expect(r.result.current.sessaoAExpirar).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(26 * 60_000);
      });
      expect(r.result.current.sessaoAtiva).toBe(true);
      expect(r.result.current.sessaoAExpirar).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5 * 60_000);
      });
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.aviso).toBe("expirada");
      expect(sessionStorage.length).toBe(0);
    });

    it("manter a sessao com sucesso volta a dar 30 min", async () => {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
      vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const r = renderHook(() => useConviteAdmissaoPublico(TOKEN));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await r.result.current.pedirCodigo();
      });
      await act(async () => {
        await r.result.current.verificarCodigo("123456");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(27 * 60_000);
      });
      expect(r.result.current.sessaoAExpirar).toBe(true);
      await act(async () => {
        await r.result.current.manterSessao();
      });
      expect(r.result.current.sessaoAExpirar).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10 * 60_000);
      });
      expect(r.result.current.sessaoAtiva).toBe(true);
    });
  });

  describe("terminar a sessao", () => {
    it("chama sair com o cabecalho, limpa o armazenamento e os dados, e avisa", async () => {
      ligar({
        estado: estadoOk(),
        otp_pedir: otpPedirOk,
        otp_verificar: otpVerificarOk(),
        ler: { data: lerOk({ niss_ultimos4: "1234" }), error: null },
        sair: { data: { ok: true, terminada: true }, error: null },
      });
      const r = await abrir();
      await entrar(r);
      expect(r.result.current.dados?.niss_ultimos4).toBe("1234");

      await act(async () => {
        await r.result.current.terminarSessao();
      });

      expect(chamadas("sair")[0][1].headers).toEqual({ "x-portal-sessao": SESSAO });
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.dados).toBeNull();
      expect(r.result.current.aviso).toBe("terminada");
      expect(sessionStorage.length).toBe(0);
      expect(r.result.current.otp.pedido).toBe(false);
    });

    it("mesmo que a Edge falhe, a sessao local acaba", async () => {
      ligar({
        estado: estadoOk(),
        otp_pedir: otpPedirOk,
        otp_verificar: otpVerificarOk(),
        ler: { data: lerOk(), error: null },
        sair: erroHttp(500, { error: "erro_inesperado" }),
      });
      const r = await abrir();
      await entrar(r);
      await act(async () => {
        await r.result.current.terminarSessao();
      });
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(sessionStorage.length).toBe(0);
    });
  });

  describe("NISS e IBAN (sensiveis)", () => {
    async function comSessao() {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const r = await abrir();
      await entrar(r);
      return r;
    }

    it("grava com o cabecalho, so as chaves pedidas, e fica com os 4 ultimos digitos", async () => {
      const r = await comSessao();
      ligar({
        estado: estadoOk(),
        sensiveis: { data: { ok: true, niss_ultimos4: "8901", iban_ultimos4: "4321" }, error: null },
      });
      let resultado: unknown;
      await act(async () => {
        resultado = await r.result.current.gravarSensiveis({ niss: "12345678901", iban: "PT50000201231234567890154" });
      });
      expect(resultado).toEqual({ ok: true });
      const [, opcoes] = chamadas("sensiveis")[0];
      expect(opcoes.headers).toEqual({ "x-portal-sessao": SESSAO });
      expect(opcoes.body).toEqual({ action: "sensiveis", token: TOKEN, niss: "12345678901", iban: "PT50000201231234567890154" });
      expect(r.result.current.dados?.niss_ultimos4).toBe("8901");
      expect(r.result.current.dados?.iban_ultimos4).toBe("4321");
      // os valores completos nunca ficam no estado do hook
      expect(JSON.stringify(r.result.current.dados)).not.toContain("12345678901");
      expect(JSON.stringify(r.result.current.dados)).not.toContain("PT5000020123");
    });

    it("so o NISS: nao manda a chave iban", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), sensiveis: { data: { ok: true, niss_ultimos4: "8901", iban_ultimos4: null }, error: null } });
      await act(async () => {
        await r.result.current.gravarSensiveis({ niss: "12345678901" });
      });
      expect(chamadas("sensiveis")[0][1].body).toEqual({ action: "sensiveis", token: TOKEN, niss: "12345678901" });
    });

    it("sem nenhum dos dois nem chega a Edge", async () => {
      const r = await comSessao();
      let resultado: unknown;
      await act(async () => {
        resultado = await r.result.current.gravarSensiveis({});
      });
      expect(resultado).toEqual({ ok: false, codigo: "pedido_invalido" });
      expect(chamadas("sensiveis")).toHaveLength(0);
    });

    it.each([
      [400, "niss_invalido"],
      [400, "iban_invalido"],
      [409, "campo_bloqueado"],
      [409, "estado_invalido"],
    ])("o erro %i %s volta como codigo e a sessao continua", async (status, codigo) => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), sensiveis: erroHttp(status, { error: codigo }) });
      let resultado: unknown;
      await act(async () => {
        resultado = await r.result.current.gravarSensiveis({ niss: "1" });
      });
      expect(resultado).toEqual({ ok: false, codigo });
      expect(r.result.current.sessaoAtiva).toBe(true);
    });

    it("sem sessao nao ha chamada", async () => {
      ligar({ estado: estadoOk() });
      const r = await abrir();
      let resultado: unknown;
      await act(async () => {
        resultado = await r.result.current.gravarSensiveis({ niss: "12345678901" });
      });
      expect(resultado).toEqual({ ok: false, codigo: "sessao_ausente" });
      expect(chamadas("sensiveis")).toHaveLength(0);
    });
  });

  it("nunca expoe error.details: nada do hook leva o campo details de um erro", async () => {
    ligar({
      estado: estadoOk(),
      otp_pedir: erroHttp(500, { error: "erro_inesperado", details: "linha com o token_hash e o e-mail" }),
    });
    const r = await abrir();
    await act(async () => {
      await r.result.current.pedirCodigo();
    });
    expect(JSON.stringify(r.result.current)).not.toContain("token_hash");
    expect(JSON.stringify(r.result.current)).not.toContain("linha com");
  });

  it("mudar de link no mesmo ecra deita fora a sessao do link anterior", async () => {
    ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
    const r = renderHook(({ token }) => useConviteAdmissaoPublico(token), { initialProps: { token: TOKEN } });
    await waitFor(() => expect(r.result.current.carregando).toBe(false));
    await entrar(r as unknown as Awaited<ReturnType<typeof abrir>>);
    expect(r.result.current.sessaoAtiva).toBe(true);

    invoke.mockClear();
    r.rerender({ token: `${TOKEN}-outro` });
    await waitFor(() => expect(chamadas("estado")).toHaveLength(1));
    await waitFor(() => expect(r.result.current.carregando).toBe(false));
    expect(chamadas("estado")[0][1].headers).toBeUndefined();
    expect(r.result.current.sessaoAtiva).toBe(false);
    expect(r.result.current.dados).toBeNull();
  });
});
