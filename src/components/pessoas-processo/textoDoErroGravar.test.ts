// O texto do erro de gravar o painel «Visita e levantamento»: sempre pela chave (nunca o texto cru), e numa falha a meio diz o que ficou gravado e o que
// falhou, seguido da mensagem do código que falhou.
import { describe, expect, it, vi } from "vitest";

// useGuardarRegistos importa o cliente da base (que exige variáveis de ambiente que os testes não têm): nunca se chama.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { moduloTraducao } from "@/components/pessoas-lista/traducaoTeste";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { ErroGuardarParcial } from "@/hooks/pessoas/useGuardarRegistos";
import { textoDoErroGravar } from "./textoDoErroGravar";

const { t } = moduloTraducao().useTranslation();

describe("textoDoErroGravar", () => {
  it("um erro da base lê-se pela chave dele", () => {
    expect(textoDoErroGravar(new ErroNeg(null, "NG010", "pessoasPagina.real.visit.err.marcar.ng010"), t)).toMatch(/já tem uma marcação/);
  });

  it("o que não é um erro conhecido vira a mensagem geral, nunca o texto cru", () => {
    const texto = textoDoErroGravar(new Error("PGRST302: segredo interno"), t);
    expect(texto).not.toMatch(/PGRST|segredo/);
    expect(texto.length).toBeGreaterThan(0);
  });

  it("uma falha a meio diz o que ficou e o que falhou, e acrescenta a mensagem do código", () => {
    const causa = new ErroNeg(null, "NG009", "pessoasPagina.erroNeg.ng009");
    const texto = textoDoErroGravar(new ErroGuardarParcial(causa, ["criarVisita", "criarVisita", "concluirVisita"], "levantamento"), t);
    expect(texto).toMatch(/Ficou gravado: a visita nova, a visita dada como feita\. Não foi possível gravar: o levantamento\./);
    expect(texto).toContain(t("pessoasPagina.erroNeg.ng009"));
  });

  it("sem código conhecido na causa não acrescenta nada à mensagem de parcial", () => {
    const texto = textoDoErroGravar(new ErroGuardarParcial(new Error("x"), ["criarVisita"], "alterarVisita"), t);
    expect(texto).toBe(t("pessoasPagina.real.records.partialDetail", { done: "a visita nova", failed: "a alteração da visita" }));
  });
});
