/**
 * Detalhes laborais (rh-exemplo): a contratacao, a antiguidade e a saida da pessoa passam a ser CALCULADAS pelo servidor a
 * partir dos contratos. Aqui so se leem, com uma ligacao «editar em Contratos»; saem do rascunho e do patch de gravacao
 * (nunca se envia uma das tres colunas, nem como null: o servidor recusa a escrita directa, 23514).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }) }));
const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: toastError, success: toastSuccess } }));
// Os tres cartoes de baixo tem os seus proprios testes e os seus proprios dados.
vi.mock("@/components/rh-exemplo/PessoaCargoCard", () => ({ PessoaCargoCard: () => <div /> }));
vi.mock("@/components/rh-exemplo/PessoaAfectacoesSeccao", () => ({ PessoaAfectacoesSeccao: () => <div /> }));
vi.mock("@/components/rh-exemplo/PessoaColocacaoOrganogramaSeccao", () => ({ PessoaColocacaoOrganogramaSeccao: () => <div /> }));

import { PessoaLaboraisTab } from "@/components/rh-exemplo/PessoaLaboraisTab";
import { tabelaFundida } from "@/translations/tabelaFundida";
import type { Pessoa } from "@/components/rh-exemplo/tipos";

const TRES_DATAS = ["data_admissao", "data_antiguidade", "data_saida"] as const;

const PESSOA = {
  id: "p1", organization_id: "org", numero_interno: "7", email_trabalho: null, telefone_trabalho: null, cargo: null,
  reporta_a_pessoa_id: null, local_id: null, local_trabalho: null,
  data_admissao: "2023-05-01", data_antiguidade: "2018-01-01", data_saida: "2024-12-31",
} as unknown as Pessoa;

type Propriedades = Partial<Parameters<typeof PessoaLaboraisTab>[0]>;

function montar(extra: Propriedades = {}, pessoa: Pessoa = PESSOA) {
  const onGuardar = (extra.onGuardar as ReturnType<typeof vi.fn> | undefined) ?? vi.fn().mockResolvedValue(null);
  render(
    <PessoaLaboraisTab
      pessoa={pessoa} colegas={[]} locais={[]} locaisALoad={false} cargos={[]} periodosDosCargos={[]} podeVerRetribuicao={false}
      podeEditarRetribuicao={false} temRetribuicao={false} salarioActual={null} onCargoMudou={() => {}} entidadeLegalNome="Org"
      estadoContratoDerivado={null} podeEditar saving={false} vinculoActivoId={null} podeVerAfectacoes={false}
      podeEditarAfectacoes={false} podeCorrigirAfectacoes={false} podeVerColocacao={false} podeEditarColocacao={false}
      podeCorrigirColocacao={false}
      {...extra}
      onGuardar={onGuardar}
    />,
  );
  return onGuardar;
}

beforeEach(() => {
  toastError.mockClear();
  toastSuccess.mockClear();
  localStorage.setItem("language", "pt");
});

describe("Detalhes laborais (rh-exemplo): as tres datas so em leitura", () => {
  it("mostra a contratacao, a antiguidade e a saida da pessoa formatadas (DD/MM/AAAA), so de leitura", () => {
    montar();
    for (const [coluna, valor] of [["data_admissao", "01/05/2023"], ["data_antiguidade", "01/01/2018"], ["data_saida", "31/12/2024"]] as const) {
      const campo = document.getElementById(`hr-laborais-${coluna}`) as HTMLInputElement;
      expect(campo).not.toBeNull();
      expect(campo.value).toBe(valor);
      expect(campo).toHaveAttribute("readonly");
    }
  });

  it("ficam focaveis (readOnly, nunca disabled) e ligados por aria-describedby ao texto «calculadas a partir dos contratos»", () => {
    montar({ podeEditar: true });
    const texto = screen.getByText("hr.laborais.datasDosContratos");
    expect(texto.id).not.toBe("");
    for (const coluna of TRES_DATAS) {
      const campo = document.getElementById(`hr-laborais-${coluna}`) as HTMLInputElement;
      expect(campo).not.toBeDisabled();
      expect(campo).toHaveAttribute("aria-describedby", expect.stringContaining(texto.id));
    }
  });

  it("datas vazias mostram «sem valor» em vez de um campo de data vazio", () => {
    montar({}, { ...PESSOA, data_antiguidade: null, data_saida: null } as unknown as Pessoa);
    expect((document.getElementById("hr-laborais-data_saida") as HTMLInputElement).value).toBe("hr.campos.semValor");
    expect((document.getElementById("hr-laborais-data_antiguidade") as HTMLInputElement).value).toBe("hr.campos.semValor");
  });

  it("tem a ligacao «editar em Contratos», que abre o separador Contratos", () => {
    const abrir = vi.fn();
    montar({ onAbrirContratos: abrir });
    fireEvent.click(screen.getByRole("button", { name: "hr.laborais.editarEmContratos" }));
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("sem acesso aos contratos (sem ligacao para abrir) nao ha ligacao", () => {
    montar();
    expect(screen.queryByRole("button", { name: "hr.laborais.editarEmContratos" })).toBeNull();
  });

  it("sem contrato, a contratacao diz que e provisoria", () => {
    montar({ semContrato: true });
    expect(screen.getByText("hr.laborais.contratacaoProvisoria")).toBeInTheDocument();
  });

  it("enquanto os contratos carregam, nao se diz que e provisoria (nao pisca)", () => {
    montar({ semContrato: true, contratosACarregar: true });
    expect(screen.queryByText("hr.laborais.contratacaoProvisoria")).toBeNull();
  });

  it("com contrato, nao ha aviso de provisoria", () => {
    montar({ semContrato: false });
    expect(screen.queryByText("hr.laborais.contratacaoProvisoria")).toBeNull();
  });
});

describe("Detalhes laborais (rh-exemplo): o patch de gravacao nunca leva as tres datas", () => {
  it("mudar outro campo envia so esse campo e os restantes laborais, sem nenhuma das tres colunas (nem como null)", async () => {
    const onGuardar = montar();
    fireEvent.change(document.getElementById("hr-laborais-numero_interno") as HTMLInputElement, { target: { value: "99" } });
    fireEvent.click(screen.getByText("employees.form.update"));
    await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1));
    const patch = onGuardar.mock.calls[0][0] as Record<string, unknown>;
    for (const coluna of TRES_DATAS) expect(patch).not.toHaveProperty(coluna);
    expect(patch).toMatchObject({ numero_interno: "99", reporta_a_pessoa_id: null });
    expect(toastSuccess).toHaveBeenCalledWith("hr.sucesso.guardado");
  });

  it("uma pessoa sem as tres datas (sem contrato) tambem grava sem elas", async () => {
    const onGuardar = montar({}, { ...PESSOA, data_admissao: null, data_antiguidade: null, data_saida: null } as unknown as Pessoa);
    fireEvent.change(document.getElementById("hr-laborais-numero_interno") as HTMLInputElement, { target: { value: "5" } });
    fireEvent.click(screen.getByText("employees.form.update"));
    await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1));
    for (const coluna of TRES_DATAS) expect(onGuardar.mock.calls[0][0]).not.toHaveProperty(coluna);
  });

  it("mostra a frase que o hook devolveu (ja traduzida pelo friendlyError)", async () => {
    const onGuardar = vi.fn().mockResolvedValue(tabelaFundida.pt["hr.erro.datas.calculadas"]);
    montar({ onGuardar: onGuardar as never });
    fireEvent.change(document.getElementById("hr-laborais-numero_interno") as HTMLInputElement, { target: { value: "1" } });
    fireEvent.click(screen.getByText("employees.form.update"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(tabelaFundida.pt["hr.erro.datas.calculadas"]));
  });
});
