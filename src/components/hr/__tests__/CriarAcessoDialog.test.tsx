/**
 * `CriarAcessoDialog` e `useCriarAcessoPessoa`: as credenciais so se enviam
 * com a ficha completa.
 *
 * O que fecha:
 *  - criar acesso com pendencias: botao desactivado, lista do que falta, e a
 *    Edge Function nem e chamada;
 *  - reenviar credenciais a quem ja tem conta NAO e travado;
 *  - sem pendencias o botao serve;
 *  - quando a Edge Function recusa com 409 `ficha_incompleta`, o hook devolve
 *    a mensagem traduzida e os codigos que faltam (nunca o codigo em bruto),
 *    e nao vai para o Sentry -- e a regra a funcionar, nao um defeito.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";

const TEXTOS: Record<string, string> = {
  "hr.acesso.bloqueadoPendencias": "As credenciais só se enviam com a ficha completa. Faltam {{n}} campos.",
  "hr.acesso.erroFichaIncompleta": "A ficha ainda tem campos por preencher.",
  "hr.acesso.erroInesperado": "Erro inesperado ao criar o acesso.",
  "hr.acesso.criar": "Criar acesso",
  "hr.acesso.reenviar": "Reenviar credenciais",
  "hr.pendencias.campo.data_admissao": "Data de admissão",
  "hr.pendencias.campo.cargo": "Cargo",
  "hr.pendencias.campo.desconhecido": "Campo por identificar",
};

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    language: "pt",
    t: (chave: string, params?: Record<string, string | number>) => {
      let texto = TEXTOS[chave] ?? chave;
      Object.entries(params ?? {}).forEach(([k, v]) => {
        texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      });
      return texto;
    },
  }),
}));

vi.mock("@/hooks/usePapeisDaOrganizacao", () => ({
  usePapeisDaOrganizacao: () => ({ papeis: [{ id: "r1", name: "Colaborador" }], loading: false }),
}));

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

// O texto traduzido vem do ficheiro de traducoes; aqui basta saber que e a
// chave certa que se pede, e que nunca se devolve o codigo em bruto.
vi.mock("@/utils/friendlyError", () => ({
  getFriendlyErrorMessage: vi.fn(async () => "mensagem amigavel"),
  getLocalizedFallback: (chave: string) => TEXTOS[chave] ?? chave,
}));

import { CriarAcessoDialog } from "@/components/hr/CriarAcessoDialog";
import { useCriarAcessoPessoa } from "@/hooks/useCriarAcessoPessoa";
import type { Pendencia } from "@/hooks/useAdmissaoPendencias";

const PENDENCIAS: Pendencia[] = [
  { codigo: "data_admissao", origem: "rh", posicao: "rh" },
  { codigo: "cargo", origem: "rh", posicao: "rh" },
];

function montar(modo: "criar" | "reenviar", pendencias?: Pendencia[]) {
  render(
    <CriarAcessoDialog
      open
      onOpenChange={vi.fn()}
      pessoaId="p1"
      modo={modo}
      pendencias={pendencias}
    />,
  );
}

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

describe("CriarAcessoDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ao criar com pendencias, desactiva o botao e lista o que falta", () => {
    montar("criar", PENDENCIAS);

    expect(
      screen.getByText("As credenciais só se enviam com a ficha completa. Faltam 2 campos."),
    ).toBeInTheDocument();
    expect(screen.getByText("Data de admissão")).toBeInTheDocument();
    expect(screen.getByText("Cargo")).toBeInTheDocument();

    const botao = screen.getByRole("button", { name: "Criar acesso" });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("aria-describedby", "hr-acesso-bloqueado");
    fireEvent.click(botao);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("um codigo de campo que o cliente nao conhece nao aparece como chave crua", () => {
    montar("criar", [{ codigo: "campo_novo_do_servidor", origem: "rh", posicao: "rh" }]);

    expect(screen.getByText("Campo por identificar")).toBeInTheDocument();
    expect(screen.queryByText(/hr\.pendencias\.campo\./)).not.toBeInTheDocument();
  });

  it("o aviso de ficha incompleta e anunciado (role=alert)", () => {
    montar("criar", PENDENCIAS);

    expect(screen.getByRole("alert")).toHaveTextContent("Faltam 2 campos.");
  });

  it("sem pendencias nao ha aviso nem bloqueio", () => {
    montar("criar", []);
    expect(screen.queryByText(/Faltam/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar acesso" })).not.toBeDisabled();
  });

  it("reenviar credenciais a quem ja tem conta nao e travado pelas pendencias", () => {
    montar("reenviar", PENDENCIAS);
    expect(screen.queryByText(/Faltam/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar credenciais" })).not.toBeDisabled();
  });
});

describe("useCriarAcessoPessoa: 409 ficha_incompleta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devolve a mensagem traduzida e os codigos de `campos`, sem ir para o Sentry", async () => {
    invoke.mockResolvedValue(
      erroHttp(409, { error: "ficha_incompleta", campos: ["cargo", "data_admissao"] }),
    );
    const { result } = renderHook(() => useCriarAcessoPessoa());

    const resultado = await result.current.criarAcesso("p1", "r1");

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe("A ficha ainda tem campos por preencher.");
    expect(resultado.erro).not.toContain("ficha_incompleta");
    expect(resultado.faltam).toEqual(["cargo", "data_admissao"]);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("aceita tambem o formato `pendencias: [{codigo}]`", async () => {
    invoke.mockResolvedValue(
      erroHttp(409, {
        error: "ficha_incompleta",
        pendencias: [{ codigo: "cargo", origem: "rh", posicao: "rh" }],
      }),
    );
    const { result } = renderHook(() => useCriarAcessoPessoa());

    const resultado = await result.current.criarAcesso("p1", "r1");
    expect(resultado.faltam).toEqual(["cargo"]);
  });

  it("outro erro HTTP continua a ir para o Sentry e nao traz lista", async () => {
    invoke.mockResolvedValue(erroHttp(500, { error: "erro_inesperado" }));
    const { result } = renderHook(() => useCriarAcessoPessoa());

    const resultado = await result.current.criarAcesso("p1", "r1");

    expect(resultado.ok).toBe(false);
    expect(resultado.faltam).toBeNull();
    expect(resultado.erro).toBe("Erro inesperado ao criar o acesso.");
    await waitFor(() => expect(captureFlowError).toHaveBeenCalledTimes(1));
  });

  it("um sucesso nao traz lista nem erro", async () => {
    invoke.mockResolvedValue({ data: { ok: true, email_enviado: true }, error: null });
    const { result } = renderHook(() => useCriarAcessoPessoa());

    const resultado = await result.current.criarAcesso("p1", "r1");
    expect(resultado).toMatchObject({ ok: true, emailEnviado: true, erro: null, faltam: null });
  });
});
