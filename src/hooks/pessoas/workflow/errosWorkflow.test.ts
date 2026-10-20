// Os três erros que a função da base dá (NG008, NG009 e 42501) têm mensagem própria do Workflow; os outros caem na mensagem de código.
import { describe, expect, it, vi } from "vitest";
import { ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "../errosNeg";
import { chaveErroWorkflow } from "./errosWorkflow";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const W = "pessoasPagina.real.workflow.";
const erro = (codigo: string | null) => new ErroNeg(new Error("texto da base"), codigo, codigo ? CHAVES_ERRO_NEG[codigo] : CHAVE_ERRO_GENERICO);

describe("chaveErroWorkflow", () => {
  it.each([
    ["NG008", `${W}error.ng008`],
    ["NG009", `${W}error.ng009`],
    ["42501", `${W}error.permission`],
  ])("%s tem a mensagem do Workflow", (codigo, chave) => {
    expect(chaveErroWorkflow(erro(codigo))).toBe(chave);
  });

  it("outro código conhecido (NG006) fica com a mensagem de código", () => {
    expect(chaveErroWorkflow(erro("NG006"))).toBe(CHAVES_ERRO_NEG.NG006);
  });

  it("sem código (avaria) fica com a mensagem genérica", () => {
    expect(chaveErroWorkflow(erro(null))).toBe(CHAVE_ERRO_GENERICO);
  });

  it("qualquer coisa que não seja um ErroNeg dá a mensagem genérica", () => {
    for (const lixo of [new Error("x"), "x", null, undefined, { codigo: "NG008" }]) expect(chaveErroWorkflow(lixo)).toBe(CHAVE_ERRO_GENERICO);
  });
});
