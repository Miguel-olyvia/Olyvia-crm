/**
 * O e-mail pessoal saiu de Detalhes laborais para Detalhes pessoais -- este
 * teste fecha o lado que a migracao nao pode provar: que o separador laboral
 * ja nao mostra o campo nem o leva no patch de gravar, mesmo que a pessoa
 * tenha um e-mail pessoal na ficha.
 *
 * Usa `fireEvent` e nao `user-event`: `@testing-library/user-event` nao e
 * dependencia deste projecto.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// A seccao de afectacoes (`PessoaAfectacoesSeccao`) carrega `pessoas_afectacoes`
// ao montar. Sem este mock o teste tentava mesmo chamar o Supabase real.
function buildChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
    },
  };
  return chain;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => buildChain(), rpc: () => Promise.resolve({ data: null, error: null }) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

// A seccao de colocacao no organograma (`PessoaColocacaoOrganogramaSeccao`)
// usa `useFiliaisDaArvore`, que por sua vez precisa de `CompanyProvider`
// (`useCompany`). Este teste renderiza `PessoaLaboraisTab` isolado, sem essa
// arvore de contexto -- mock directo ao hook, tal como a leitura de
// `pessoas_afectacoes` acima e mockada via `supabase`.
vi.mock("@/hooks/useFiliaisDaArvore", () => ({
  useFiliaisDaArvore: () => ({ filiais: [], loading: false }),
}));

import { PessoaLaboraisTab } from "@/components/hr/PessoaLaboraisTab";
import type { Pessoa } from "@/types/hr";

const PESSOA: Pessoa = {
  id: "p1",
  organization_id: "org",
  numero_interno: "123",
  primeiro_nome: "Ana",
  apelido: "Silva",
  nome_completo: "Ana Silva",
  email_trabalho: "ana@empresa.pt",
  email_pessoal: "ana@exemplo.pt",
  telefone_trabalho: null,
  cargo: "Gestora",
  cargo_id: null,
  local_trabalho: null,
  local_id: null,
  entidade_legal_org_id: null,
  reporta_a_pessoa_id: null,
  data_admissao: null,
  data_antiguidade: null,
  data_saida: null,
  estado_registo: "activo",
  notas: null,
};

function montar(onGuardar = vi.fn().mockResolvedValue(null)) {
  render(
    <PessoaLaboraisTab
      pessoa={PESSOA}
      colegas={[]}
      locais={[]}
      locaisALoad={false}
      cargos={[]}
      cargosALoad={false}
      entidadeLegalNome="Organizacao Nike"
      estadoContratoDerivado="em_curso"
      podeEditar
      saving={false}
      onGuardar={onGuardar}
      vinculoActivoId={null}
      podeVerAfectacoes={false}
      podeEditarAfectacoes={false}
      podeCorrigirAfectacoes={false}
      podeVerColocacao={false}
      podeEditarColocacao={false}
      podeCorrigirColocacao={false}
    />,
  );
  return { onGuardar };
}

describe("PessoaLaboraisTab -- sem e-mail pessoal", () => {
  it("nao mostra nenhum campo de e-mail pessoal, mesmo com a ficha preenchida", () => {
    montar();

    expect(document.getElementById("hr-laborais-email_pessoal")).toBeNull();
    expect(screen.queryByDisplayValue("ana@exemplo.pt")).toBeNull();
  });

  it("gravar o cargo nao leva email_pessoal no patch", () => {
    const { onGuardar } = montar();

    fireEvent.change(screen.getByLabelText("hr.columns.cargo"), {
      target: { value: "Directora" },
    });
    fireEvent.click(screen.getByText("employees.form.update"));

    expect(onGuardar).toHaveBeenCalledTimes(1);
    const patch = onGuardar.mock.calls[0][0];
    expect(patch).not.toHaveProperty("email_pessoal");
    expect(patch).toMatchObject({ cargo: "Directora" });
  });
});
