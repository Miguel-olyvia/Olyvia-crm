/**
 * `useConviteAdmissaoPublico` (portal temporario da admissao, V3a) contra os contratos
 * EXACTOS da Edge `convite-admissao` (accoesPortal.ts, handler.ts, erros.ts):
 *  - estado: { ok, convite: { existe, estado, estado_portal, valid_until, primeiro_nome,
 *    organizacao_nome, bloqueado, precisa_otp } }
 *  - otp_pedir: { ok, expira_em }
 *  - otp_verificar: { ok, sessao, sessao_expira_em } | erro otp_invalido (401, restantes),
 *    otp_bloqueado (429), otp_expirado (410)
 *  - ler: { ok, estado, rascunho, campos_obrigatorios, ... } | sessao_* (401)
 *  - rascunho: { ok, guardado_em, niss_ultimos4?, iban_ultimos4?, sensivel_recusado? } (exige sessao)
 *  - submeter: { ok } (exige sessao; NISS e IBAN so chegam a Edge por ela, nunca em claro no rascunho)
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
const NISS_VALIDO = "12345678902";
const IBAN_VALIDO = "PT50000201231234567890154";

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

    it("sessao_substituida ao gravar o rascunho tambem volta a consulta", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: erroHttp(401, { error: "sessao_substituida" }) });
      let resultado: { ok: boolean; codigo?: string } | undefined;
      await act(async () => {
        resultado = await r.result.current.gravarRascunho({ genero: "f" });
      });
      expect(resultado).toMatchObject({ ok: false, codigo: "sessao_substituida" });
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.aviso).toBe("substituida");
    });

    it("sessao_expirada ao submeter tambem volta a consulta e nao marca concluido", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), submeter: erroHttp(401, { error: "sessao_expirada" }) });
      await act(async () => {
        await r.result.current.submeter({ genero: "f" }, "Joana Silva");
      });
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.aviso).toBe("expirada");
      expect(r.result.current.concluido).toBe(false);
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

  describe("gravar o rascunho (accao rascunho, exige sessao)", () => {
    async function comSessao(extra: Respostas = {}) {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null }, ...extra });
      const r = await abrir();
      await entrar(r);
      return r;
    }
    const guardadoOk = (extra: Record<string, unknown> = {}) => ({
      data: { ok: true, guardado_em: "2099-10-16T10:42:00.000Z", ...extra },
      error: null,
    });

    it("manda o rascunho com o cabecalho da sessao, sem niss nem iban, e expoe a hora que a Edge devolveu", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: guardadoOk() });
      let resultado: { ok: boolean; guardadoEm?: string } | undefined;
      await act(async () => {
        resultado = await r.result.current.gravarRascunho({ genero: "f", nif: "123456789" });
      });
      expect(resultado).toMatchObject({ ok: true, guardadoEm: "2099-10-16T10:42:00.000Z" });
      const [nome, opcoes] = chamadas("rascunho")[0];
      expect(nome).toBe("convite-admissao");
      expect(opcoes.headers).toEqual({ "x-portal-sessao": SESSAO });
      expect(opcoes.body).toEqual({ action: "rascunho", token: TOKEN, rascunho: { genero: "f", nif: "123456789" } });
      expect(r.result.current.rascunhoGuardadoEm).toBe("2099-10-16T10:42:00.000Z");
      expect(r.result.current.erroRascunho).toBeNull();
      expect(r.result.current.aGravar).toBe(false);
    });

    it("nunca manda niss, iban nem conta_numero dentro do rascunho, mesmo que o ecra os entregue", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: guardadoOk() });
      await act(async () => {
        await r.result.current.gravarRascunho({ genero: "f", niss: NISS_VALIDO, iban: IBAN_VALIDO, conta_numero: IBAN_VALIDO, aceite: true });
      });
      const rascunho = chamadas("rascunho")[0][1].body.rascunho as Record<string, unknown>;
      expect(Object.keys(rascunho)).toEqual(["genero"]);
    });

    it("sem sessao nao ha chamada", async () => {
      ligar({ estado: estadoOk() });
      const r = await abrir();
      let resultado: unknown;
      await act(async () => {
        resultado = await r.result.current.gravarRascunho({ genero: "f" });
      });
      expect(resultado).toMatchObject({ ok: false, codigo: "sessao_ausente" });
      expect(chamadas("rascunho")).toHaveLength(0);
    });

    it("com NISS e IBAN validos manda-os a parte, fica com os 4 ultimos digitos e diz que ficaram guardados", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: guardadoOk({ niss_ultimos4: "8902", iban_ultimos4: "0154" }) });
      let resultado: { ok: boolean; nissGuardado?: boolean; ibanGuardado?: boolean } | undefined;
      await act(async () => {
        resultado = await r.result.current.gravarRascunho({ genero: "f" }, { niss: ` ${NISS_VALIDO} `, iban: IBAN_VALIDO });
      });
      const body = chamadas("rascunho")[0][1].body;
      expect(body.niss).toBe(NISS_VALIDO);
      expect(body.iban).toBe(IBAN_VALIDO);
      expect(body.rascunho).toEqual({ genero: "f" });
      expect(resultado).toMatchObject({ ok: true, nissGuardado: true, ibanGuardado: true });
      expect(r.result.current.dados?.niss_ultimos4).toBe("8902");
      expect(r.result.current.dados?.iban_ultimos4).toBe("0154");
      // os valores completos nunca ficam no estado do hook nem em nenhum armazenamento
      const estado = JSON.stringify(r.result.current);
      expect(estado).not.toContain(NISS_VALIDO);
      expect(estado).not.toContain(IBAN_VALIDO);
      expect(JSON.stringify({ ...sessionStorage })).not.toContain(NISS_VALIDO);
      expect(JSON.stringify({ ...localStorage })).not.toContain(IBAN_VALIDO);
    });

    it("um NISS ou IBAN com formato errado nao segue (o ecra ja mostra o erro no campo)", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: guardadoOk() });
      let resultado: { nissGuardado?: boolean; ibanGuardado?: boolean } | undefined;
      await act(async () => {
        resultado = await r.result.current.gravarRascunho({ genero: "f" }, { niss: "12345678901", iban: "PT50123" });
      });
      const body = chamadas("rascunho")[0][1].body;
      expect(body).not.toHaveProperty("niss");
      expect(body).not.toHaveProperty("iban");
      expect(resultado?.nissGuardado).toBeFalsy();
      expect(resultado?.ibanGuardado).toBeFalsy();
    });

    it("o IBAN vai sem espacos e em maiusculas", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: guardadoOk({ iban_ultimos4: "0154" }) });
      await act(async () => {
        await r.result.current.gravarRascunho({}, { iban: "pt50 0002 0123 1234 5678 9015 4" });
      });
      expect(chamadas("rascunho")[0][1].body.iban).toBe(IBAN_VALIDO);
    });

    it("um valor igual ao ultimo enviado nao volta a ser enviado, mas continua a contar como guardado", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: guardadoOk({ niss_ultimos4: "8902" }) });
      await act(async () => {
        await r.result.current.gravarRascunho({ genero: "f" }, { niss: NISS_VALIDO });
      });
      let segunda: { nissGuardado?: boolean } | undefined;
      await act(async () => {
        segunda = await r.result.current.gravarRascunho({ genero: "m" }, { niss: NISS_VALIDO });
      });
      expect(chamadas("rascunho")).toHaveLength(2);
      expect(chamadas("rascunho")[1][1].body).not.toHaveProperty("niss");
      expect(segunda?.nissGuardado).toBe(true);
    });

    it("sensivel recusado pela base: o rascunho fica gravado, mas o erro aparece (nunca engolido)", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: guardadoOk({ sensivel_recusado: "niss_invalido" }) });
      let resultado: { ok: boolean; sensivelRecusado?: string; nissGuardado?: boolean } | undefined;
      await act(async () => {
        resultado = await r.result.current.gravarRascunho({ genero: "f" }, { niss: NISS_VALIDO });
      });
      expect(resultado).toMatchObject({ ok: true, sensivelRecusado: "niss_invalido" });
      expect(resultado?.nissGuardado).toBeFalsy();
      expect(r.result.current.rascunhoGuardadoEm).toBe("2099-10-16T10:42:00.000Z");
      expect(r.result.current.erroRascunho).toBe("niss_invalido");
    });

    it.each([
      [409, "estado_invalido"],
      [409, "campo_bloqueado"],
      [400, "rascunho_demasiado_grande"],
      [429, "demasiadas_tentativas"],
    ])("o erro %i %s fica em erroRascunho, devolve o codigo e a sessao continua", async (status, codigo) => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: erroHttp(status, { error: codigo }) });
      let resultado: unknown;
      await act(async () => {
        resultado = await r.result.current.gravarRascunho({ genero: "f" });
      });
      expect(resultado).toMatchObject({ ok: false, codigo });
      expect(r.result.current.erroRascunho).toBe(codigo);
      expect(r.result.current.sessaoAtiva).toBe(true);
      expect(r.result.current.aGravar).toBe(false);
    });

    it("um erro sem corpo (rede) tambem fica visivel e vai para o registo sem dados", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: { data: null, error: { message: "falha", context: new Response("", { status: 500 }) } } });
      await act(async () => {
        await r.result.current.gravarRascunho({ genero: "f" });
      });
      expect(r.result.current.erroRascunho).toBe("erro_inesperado");
      expect(captureFlowError).toHaveBeenCalled();
      expect(String(captureFlowError.mock.calls[0][0])).not.toContain(TOKEN);
    });

    it("uma gravacao com sucesso limpa o erro anterior", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), rascunho: erroHttp(409, { error: "estado_invalido" }) });
      await act(async () => {
        await r.result.current.gravarRascunho({ genero: "f" });
      });
      expect(r.result.current.erroRascunho).toBe("estado_invalido");
      ligar({ estado: estadoOk(), rascunho: guardadoOk() });
      await act(async () => {
        await r.result.current.gravarRascunho({ genero: "f" });
      });
      expect(r.result.current.erroRascunho).toBeNull();
    });

    it("fila de um: com uma gravacao em curso, as seguintes esperam e so a ultima vai", async () => {
      const r = await comSessao();
      let libertar: (v: Resposta) => void = () => undefined;
      const primeira = new Promise<Resposta>((res) => {
        libertar = res;
      });
      let n = 0;
      invoke.mockImplementation(async (_nome: string, opcoes: { body: { action: string } }) => {
        if (opcoes.body.action !== "rascunho") return estadoOk();
        n += 1;
        return n === 1 ? primeira : guardadoOk();
      });
      let p1: Promise<unknown> = Promise.resolve();
      let p2: Promise<unknown> = Promise.resolve();
      let p3: Promise<unknown> = Promise.resolve();
      await act(async () => {
        p1 = r.result.current.gravarRascunho({ genero: "a" });
        p2 = r.result.current.gravarRascunho({ genero: "b" });
        p3 = r.result.current.gravarRascunho({ genero: "c" });
      });
      expect(chamadas("rascunho")).toHaveLength(1);
      expect(r.result.current.aGravar).toBe(true);
      await act(async () => {
        libertar(guardadoOk());
        await Promise.all([p1, p2, p3]);
      });
      const enviados = chamadas("rascunho").map(([, o]) => o.body.rascunho);
      expect(enviados).toEqual([{ genero: "a" }, { genero: "c" }]);
      expect(r.result.current.aGravar).toBe(false);
    });

    it("na fila, o NISS pedido numa gravacao ultrapassada nao se perde", async () => {
      const r = await comSessao();
      let libertar: (v: Resposta) => void = () => undefined;
      const primeira = new Promise<Resposta>((res) => {
        libertar = res;
      });
      let n = 0;
      invoke.mockImplementation(async (_nome: string, opcoes: { body: { action: string } }) => {
        if (opcoes.body.action !== "rascunho") return estadoOk();
        n += 1;
        return n === 1 ? primeira : guardadoOk({ niss_ultimos4: "8902" });
      });
      let ps: Array<Promise<unknown>> = [];
      await act(async () => {
        ps = [
          r.result.current.gravarRascunho({ genero: "a" }),
          r.result.current.gravarRascunho({ genero: "b" }, { niss: NISS_VALIDO }),
          r.result.current.gravarRascunho({ genero: "c" }),
        ];
      });
      await act(async () => {
        libertar(guardadoOk());
        await Promise.all(ps);
      });
      expect(chamadas("rascunho")[1][1].body.niss).toBe(NISS_VALIDO);
    });
  });

  describe("gravar ao fechar a pagina", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
      vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-publicavel");
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    async function comSessao() {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null } });
      const r = await abrir();
      await entrar(r);
      return r;
    }

    it("faz um fetch com keepalive, a sessao no cabecalho e o rascunho sem niss nem iban no corpo", async () => {
      const r = await comSessao();
      act(() => {
        r.result.current.gravarRascunhoAoFechar({ genero: "f", niss: NISS_VALIDO, conta_numero: IBAN_VALIDO });
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://exemplo.supabase.co/functions/v1/convite-admissao");
      expect(init.method).toBe("POST");
      expect(init.keepalive).toBe(true);
      const cabecalhos = init.headers as Record<string, string>;
      expect(cabecalhos["x-portal-sessao"]).toBe(SESSAO);
      expect(cabecalhos.apikey).toBe("chave-publicavel");
      const corpo = JSON.parse(String(init.body));
      expect(corpo).toEqual({ action: "rascunho", token: TOKEN, rascunho: { genero: "f" } });
      expect(String(init.body)).not.toContain(NISS_VALIDO);
      expect(String(init.body)).not.toContain(SESSAO);
      expect(String(url)).not.toContain(SESSAO);
    });

    it("sem sessao nao envia nada", async () => {
      ligar({ estado: estadoOk() });
      const r = await abrir();
      act(() => {
        r.result.current.gravarRascunhoAoFechar({ genero: "f" });
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("um fetch que falha ao fechar nao rebenta (ninguem ficou para ver o erro)", async () => {
      const r = await comSessao();
      fetchMock.mockRejectedValue(new Error("rede"));
      expect(() =>
        act(() => {
          r.result.current.gravarRascunhoAoFechar({ genero: "f" });
        }),
      ).not.toThrow();
    });
  });

  describe("submeter", () => {
    async function comSessao(extra: Respostas = {}) {
      ligar({ estado: estadoOk(), otp_pedir: otpPedirOk, otp_verificar: otpVerificarOk(), ler: { data: lerOk(), error: null }, ...extra });
      const r = await abrir();
      await entrar(r);
      return r;
    }

    it("manda dados, assinatura e declaracao com a sessao no cabecalho; no sucesso conclui sem chamar sair", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), submeter: { data: { ok: true }, error: null }, sair: { data: { ok: true }, error: null } });
      let resultado: { ok: boolean } | undefined;
      await act(async () => {
        resultado = await r.result.current.submeter({ genero: "f", nif: "123456789" }, "  Joana Silva ");
      });
      expect(resultado).toEqual({ ok: true });
      const [, opcoes] = chamadas("submeter")[0];
      expect(opcoes.headers).toEqual({ "x-portal-sessao": SESSAO });
      expect(opcoes.body).toEqual({
        action: "submeter",
        token: TOKEN,
        dados: { genero: "f", nif: "123456789" },
        assinatura_nome: "Joana Silva",
        declaracao: true,
      });
      expect(r.result.current.concluido).toBe(true);
      expect(r.result.current.sessaoAtiva).toBe(false);
      expect(r.result.current.dados).toBeNull();
      expect(lerSessao()).toBeNull();
      expect(chamadas("sair")).toHaveLength(0);
    });

    it("depois de concluir, uma gravacao de rascunho atrasada nao chega a Edge", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), submeter: { data: { ok: true }, error: null }, rascunho: { data: { ok: true, guardado_em: "2099-10-16T10:42:00.000Z" }, error: null } });
      await act(async () => {
        await r.result.current.submeter({ genero: "f" }, "Joana Silva");
      });
      let resultado: unknown;
      await act(async () => {
        resultado = await r.result.current.gravarRascunho({ genero: "m" });
      });
      expect(resultado).toMatchObject({ ok: false });
      expect(chamadas("rascunho")).toHaveLength(0);
    });

    it("NISS e IBAN validos e novos seguem dentro de dados; os invalidos e os ja enviados ficam de fora", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), submeter: { data: { ok: true }, error: null } });
      await act(async () => {
        await r.result.current.submeter({ genero: "f", niss: NISS_VALIDO, iban: "PT50123" }, "Joana Silva");
      });
      const dados = chamadas("submeter")[0][1].body.dados as Record<string, unknown>;
      expect(dados.niss).toBe(NISS_VALIDO);
      expect(dados).not.toHaveProperty("iban");
    });

    it("NISS ou IBAN a null ou vazios (ja guardados no cofre) nao vao no pedido", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), submeter: { data: { ok: true }, error: null } });
      await act(async () => {
        await r.result.current.submeter({ genero: "f", niss: null, iban: "" }, "Joana Silva");
      });
      const dados = chamadas("submeter")[0][1].body.dados as Record<string, unknown>;
      expect(dados).not.toHaveProperty("niss");
      expect(dados).not.toHaveProperty("iban");
    });

    it("admissao_incompleta devolve os campos em falta e a sessao continua", async () => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), submeter: erroHttp(400, { error: "admissao_incompleta", campos: ["nif", "genero"] }) });
      let resultado: { ok: boolean; codigo?: string; campos?: string[] } | undefined;
      await act(async () => {
        resultado = await r.result.current.submeter({ genero: null }, "Joana Silva");
      });
      expect(resultado).toEqual({ ok: false, codigo: "admissao_incompleta", campos: ["nif", "genero"] });
      expect(r.result.current.sessaoAtiva).toBe(true);
      expect(r.result.current.concluido).toBe(false);
    });

    it.each([
      [400, "assinatura_obrigatoria"],
      [400, "niss_invalido"],
      [409, "nif_ja_existe"],
      [409, "estado_invalido"],
    ])("o erro %i %s volta como codigo", async (status, codigo) => {
      const r = await comSessao();
      ligar({ estado: estadoOk(), submeter: erroHttp(status, { error: codigo }) });
      let resultado: unknown;
      await act(async () => {
        resultado = await r.result.current.submeter({ genero: "f" }, "Joana Silva");
      });
      expect(resultado).toMatchObject({ ok: false, codigo });
      expect(r.result.current.concluido).toBe(false);
    });

    it("sem sessao nao ha chamada; assinatura vazia nem chega a Edge", async () => {
      ligar({ estado: estadoOk() });
      const r = await abrir();
      let a: unknown;
      await act(async () => {
        a = await r.result.current.submeter({ genero: "f" }, "Joana");
      });
      expect(a).toMatchObject({ ok: false, codigo: "sessao_ausente" });

      const r2 = await comSessao();
      let b: unknown;
      await act(async () => {
        b = await r2.result.current.submeter({ genero: "f" }, "   ");
      });
      expect(b).toMatchObject({ ok: false, codigo: "assinatura_obrigatoria" });
      expect(chamadas("submeter")).toHaveLength(0);
    });

    it("duas submissoes ao mesmo tempo: so a primeira chega a Edge", async () => {
      const r = await comSessao();
      let libertar: (v: Resposta) => void = () => undefined;
      const espera = new Promise<Resposta>((res) => {
        libertar = res;
      });
      invoke.mockImplementation(async (_nome: string, opcoes: { body: { action: string } }) =>
        opcoes.body.action === "submeter" ? espera : estadoOk(),
      );
      let p1: Promise<unknown> = Promise.resolve();
      let p2: Promise<unknown> = Promise.resolve();
      await act(async () => {
        p1 = r.result.current.submeter({ genero: "f" }, "Joana Silva");
        p2 = r.result.current.submeter({ genero: "f" }, "Joana Silva");
      });
      await act(async () => {
        libertar({ data: { ok: true }, error: null });
        await Promise.all([p1, p2]);
      });
      expect(chamadas("submeter")).toHaveLength(1);
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
