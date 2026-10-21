// A chave de tradução do erro de gravar uma consequência: NG008, NG009 e 42501 como no separador «Negócios»; NG026 (que o mapa geral ainda não conhece)
// reconhece-se na causa. Qualquer outra coisa é a mensagem genérica, nunca o texto da base.
import { describe, expect, it, vi } from "vitest";
import { ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO } from "../errosNeg";
import { chaveErroConsequencias } from "./errosConsequencias";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const N = "pessoasPagina.real.workflow.neg.";

describe("chaveErroConsequencias", () => {
  it("NG008, NG009 e 42501 usam as mensagens do separador", () => {
    expect(chaveErroConsequencias(new ErroNeg(null, "NG008", "x"))).toBe(`${N}error.ng008`);
    expect(chaveErroConsequencias(new ErroNeg(null, "NG009", "x"))).toBe(`${N}error.ng009`);
    expect(chaveErroConsequencias(new ErroNeg(null, "42501", "x"))).toBe(`${N}error.permission`);
  });

  it("NG026 reconhece-se no código ou na mensagem da causa", () => {
    expect(chaveErroConsequencias(new ErroNeg({ code: "NG026", message: "m" }, null, CHAVE_ERRO_GENERICO))).toBe(`${N}cons.error.ng026`);
    expect(chaveErroConsequencias(new ErroNeg({ message: "Pertence ... NG026" }, null, CHAVE_ERRO_GENERICO))).toBe(`${N}cons.error.ng026`);
    expect(chaveErroConsequencias(new ErroNeg(new Error("NG026"), null, CHAVE_ERRO_GENERICO))).toBe(`${N}cons.error.ng026`);
  });

  it("NG0260 ou xNG026 não são NG026", () => {
    expect(chaveErroConsequencias(new ErroNeg({ message: "NG0260" }, null, CHAVE_ERRO_GENERICO))).toBe(CHAVE_ERRO_GENERICO);
    expect(chaveErroConsequencias(new ErroNeg({ message: "xNG026" }, null, CHAVE_ERRO_GENERICO))).toBe(CHAVE_ERRO_GENERICO);
  });

  it("o resto é genérico, e o que não é ErroNeg também", () => {
    expect(chaveErroConsequencias(new ErroNeg(new Error("boom"), null, CHAVE_ERRO_GENERICO))).toBe(CHAVE_ERRO_GENERICO);
    expect(chaveErroConsequencias(new Error("NG026"))).toBe(CHAVE_ERRO_GENERICO);
    expect(chaveErroConsequencias(null)).toBe(CHAVE_ERRO_GENERICO);
    expect(chaveErroConsequencias("NG026")).toBe(CHAVE_ERRO_GENERICO);
  });
});
