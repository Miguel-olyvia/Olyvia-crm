/**
 * `useCriarAcessoPessoa`: o que o RH ve quando a Edge Function `criar-acesso-pessoa`
 * recusa. Nunca o codigo em bruto; as recusas de negocio nao vao para o Sentry;
 * `ficha_incompleta` devolve a lista do que falta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import { codigosEmFalta, mensagemDoCodigo, useCriarAcessoPessoa } from "@/hooks/useCriarAcessoPessoa";
import { getLocalizedFallback } from "@/utils/friendlyError";

async function criar(opcoes?: { forcarNovaPassword?: boolean }) {
  const { result } = renderHook(() => useCriarAcessoPessoa());
  let resultado!: Awaited<ReturnType<typeof result.current.criarAcesso>>;
  await act(async () => {
    resultado = await result.current.criarAcesso("pessoa-1", "papel-1", opcoes);
  });
  return resultado;
}

function erroHttp(corpo: unknown, status: number) {
  return { name: "FunctionsHttpError", context: new Response(JSON.stringify(corpo), { status }) };
}

beforeEach(() => {
  invoke.mockReset();
  captureFlowError.mockReset();
});

describe("useCriarAcessoPessoa", () => {
  it("envia pessoa, papel e forcar_nova_password", async () => {
    invoke.mockResolvedValue({ data: { email_enviado: true }, error: null });
    await criar({ forcarNovaPassword: true });
    expect(invoke).toHaveBeenCalledWith("criar-acesso-pessoa", {
      body: { pessoa_id: "pessoa-1", role_id: "papel-1", forcar_nova_password: true },
    });
  });

  it("sucesso: ok, com o aviso se o servidor o der", async () => {
    invoke.mockResolvedValue({ data: { email_enviado: false, aviso: "email nao saiu" }, error: null });
    const r = await criar();
    expect(r).toMatchObject({ ok: true, emailEnviado: false, aviso: "email nao saiu", erro: null, faltam: null });
  });

  it("ficha_incompleta (409) lista o que falta e nao vai para o Sentry", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: erroHttp({ error: "ficha_incompleta", pendencias: [{ codigo: "nif" }, { codigo: "cargo" }] }, 409),
    });
    const r = await criar();
    expect(r.ok).toBe(false);
    expect(r.faltam).toEqual(["nif", "cargo"]);
    expect(r.erro).toBe(getLocalizedFallback("hr.acesso.erroFichaIncompleta"));
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it.each([
    ["sem_sessao", "friendlyError.sessionExpired"],
    ["insufficient_privilege", "friendlyError.forbidden"],
    ["papel_obrigatorio", "hr.acesso.erroPapelObrigatorio"],
    ["pessoa_ja_tem_conta_activa", "hr.conta.erroPessoaJaTemConta"],
    ["conta_sem_email", "hr.acesso.erroContaSemEmail"],
  ])("%s mostra o texto proprio e nao vai para o Sentry", async (codigo, chave) => {
    invoke.mockResolvedValue({ data: null, error: erroHttp({ error: codigo }, 400) });
    const r = await criar();
    expect(r.erro).toBe(getLocalizedFallback(chave));
    expect(r.erro).not.toContain(codigo);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it.each(["papel_fora_da_organizacao", "papel_nao_permitido", "sem_email_pessoal"])(
    "%s (recusa sem texto proprio): texto generico de criar acesso, nunca o codigo",
    async (codigo) => {
      invoke.mockResolvedValue({ data: { error: codigo }, error: null });
      const r = await criar();
      expect(r.erro).toBe(getLocalizedFallback("hr.acesso.erroCriar"));
      expect(r.erro).not.toContain(codigo);
      expect(captureFlowError).not.toHaveBeenCalled();
    },
  );

  it("erro_inesperado (por exemplo a consulta das pendencias falhou) e defeito: regista sem corpo", async () => {
    invoke.mockResolvedValue({ data: null, error: erroHttp({ error: "erro_inesperado" }, 500) });
    const r = await criar();
    expect(r.erro).toBe(getLocalizedFallback("hr.acesso.erroInesperado"));
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    expect(captureFlowError.mock.calls[0][0]).not.toHaveProperty("context");
  });

  it("falha de rede sem corpo e defeito; uma excepcao tambem, sem mensagem crua", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("Failed to fetch") });
    expect((await criar()).erro).toBe(getLocalizedFallback("hr.acesso.erroCriar"));
    invoke.mockRejectedValueOnce(new Error("kaboom"));
    const r = await criar();
    expect(r.erro).toBe(getLocalizedFallback("hr.acesso.erroCriar"));
    expect(r.erro).not.toContain("kaboom");
    expect(captureFlowError).toHaveBeenCalledTimes(2);
  });
});

describe("codigosEmFalta e mensagemDoCodigo", () => {
  it("campos[] tem prioridade e descarta o que nao e texto", () => {
    expect(codigosEmFalta({ error: "x", campos: ["a", 3, "", "b"], pendencias: [{ codigo: "z" }] })).toEqual(["a", "b"]);
  });

  it("sem campos[], le pendencias[].codigo e ignora lixo", () => {
    expect(codigosEmFalta({ error: "x", pendencias: [{ codigo: "a" }, null, { codigo: 1 }, "s"] })).toEqual(["a"]);
  });

  it("sem nada, devolve lista vazia", () => {
    expect(codigosEmFalta({ error: "x" })).toEqual([]);
  });

  it("mensagemDoCodigo(null) e o texto generico", () => {
    expect(mensagemDoCodigo(null)).toBe(getLocalizedFallback("hr.acesso.erroCriar"));
  });
});
