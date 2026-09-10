/**
 * O estado do contrato deixou de ser um enum escrito a mao neste separador:
 * passou a texto so-leitura, derivado do vinculo. Este e o teste-ancora --
 * fecha o defeito concreto que motivou a mudanca ("Sem contrato" nunca pode
 * aparecer como "Em curso") e prova que o campo deixou de ser editavel e de
 * ir no patch de gravar.
 *
 * Usa `fireEvent` e nao `user-event`: `@testing-library/user-event` nao e
 * dependencia deste projecto.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string) => {
      const traducoes: Record<string, string> = {
        "hr.estadoContrato.sem_contrato": "Sem contrato",
        "hr.estadoContrato.em_curso": "Em curso",
      };
      return traducoes[chave] ?? chave;
    },
    language: "pt",
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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
  email_pessoal: null,
  telefone_trabalho: null,
  cargo: "Gestora",
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
      entidadeLegalNome="Organizacao Nike"
      estadoContratoDerivado="sem_contrato"
      podeEditar
      saving={false}
      onGuardar={onGuardar}
    />,
  );
  return { onGuardar };
}

describe("PessoaLaboraisTab -- estado do contrato derivado", () => {
  it("uma ficha sem contrato mostra 'Sem contrato', nunca 'Em curso'", () => {
    montar();

    expect(screen.getByDisplayValue("Sem contrato")).toBeInTheDocument();
    expect(screen.queryByText(/Em curso/i)).toBeNull();
  });

  it("o campo deixou de ser editavel -- nao ha combobox de estado do contrato", () => {
    montar();

    expect(
      screen.queryByRole("combobox", { name: /estado do contrato/i }),
    ).toBeNull();
  });

  it("gravar outro campo nao leva estado_contrato no patch", () => {
    const { onGuardar } = montar();

    fireEvent.change(screen.getByLabelText("hr.columns.cargo"), {
      target: { value: "Directora" },
    });
    fireEvent.click(screen.getByText("employees.form.update"));

    expect(onGuardar).toHaveBeenCalledTimes(1);
    const patch = onGuardar.mock.calls[0][0];
    expect(patch).not.toHaveProperty("estado_contrato");
  });
});
