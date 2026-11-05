/**
 * O separador "Detalhes pessoais" da ficha de /rh-exemplo só mostra o cartão «Outros dados» (sindicalização) a quem tem
 * `hr.pessoas.sindicalizacao.view`, como a saúde. A policy `pessoas_sindicalizacao_select` já devolve 0 linhas a quem não a
 * tem; aqui garante-se a guarda no ecrã mesmo que a ficha traga dados.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ language: "pt", t: (k: string) => k }) }));
// Os detalhes pessoais têm os seus próprios testes: aqui interessa só o cartão que a aba junta.
vi.mock("@/components/rh-exemplo/PessoaPessoaisTab", () => ({ PessoaPessoaisTab: () => <div data-testid="pessoais" /> }));

import { AbaPessoais, type AbaProps } from "./AbasPessoa";

const SINDICALIZACAO = {
  id: "s1", pessoa_id: "p1", organization_id: "org-1", sindicalizado: true, sindicato: "SINDEL", quota_percentagem: 1,
};

function montar(sindicalizacaoView: boolean) {
  const props = {
    ficha: { sindicalizacao: SINDICALIZACAO, saving: false },
    pessoa: { id: "p1", organization_id: "org-1", nome_completo: "Rui Amaral", email_pessoal: null },
    ctx: { permissoes: { sindicalizacaoView } },
  } as unknown as AbaProps;
  return render(<AbaPessoais {...props} />);
}

describe("AbaPessoais (rh-exemplo): cartão da sindicalização", () => {
  it("sem hr.pessoas.sindicalizacao.view, o cartão não aparece mesmo que haja dados", () => {
    montar(false);
    expect(screen.getByTestId("pessoais")).toBeInTheDocument();
    expect(screen.queryByText("rhNova.ficha.outrosDados")).toBeNull();
    expect(screen.queryByText("SINDEL")).toBeNull();
  });

  it("com hr.pessoas.sindicalizacao.view, o cartão aparece com a resposta", () => {
    montar(true);
    expect(screen.getByText("rhNova.ficha.outrosDados")).toBeInTheDocument();
    expect(screen.getByText("SINDEL")).toBeInTheDocument();
  });
});
