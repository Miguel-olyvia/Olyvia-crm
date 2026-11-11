/**
 * Separador Contratos (rh-exemplo): e AQUI que se editam as datas da pessoa. O contrato tem a «Data de antiguidade» (editavel,
 * nunca depois do inicio) e por baixo ha um resumo SO DE LEITURA da contratacao e da saida calculadas pelos contratos
 * (`datasDaPessoa`). Sem contrato, a contratacao e provisoria. Um erro 23514 das datas chega ao ecra numa frase clara.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }) }));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: toastError, success: vi.fn() } }));

import { renderRh as render, reporRhTeste } from "@/test/rhExemploProviders";
import { PessoaContratoTab } from "@/components/rh-exemplo/PessoaContratoTab";
import { tabelaFundida } from "@/translations/tabelaFundida";
import type { PessoaVinculo } from "@/components/rh-exemplo/tipos";

const VINCULO = {
  id: "v1", pessoa_id: "p1", organization_id: "org", tipo_contrato: "sem_termo", regime: "tempo_inteiro", horas_periodo: 40,
  data_inicio: "2024-01-01", data_fim: null, motivo_termo: null, periodo_experimental_ate: null, entidade_legal_org_id: null,
  estado: "activo", tipo_trabalho: null, horas_frequencia: "semanal", horas_semanais_equivalentes: 40, tempo_trabalho_pct: null,
  dias_uteis: null, politica_feriados: "nao_laboral", horas_semanais_maximas: null, periodo_experimental_dias: null,
  categoria_funcao: null, periodo_experimental_origem: null, categoria_profissional: null, renovavel: null, isencao_horario: false,
  formacao_inicio: null, formacao_fim: null, data_antiguidade: null,
} as unknown as PessoaVinculo;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  reporRhTeste();
  toastError.mockClear();
  localStorage.setItem("language", "pt");
});

function montar(vinculos: PessoaVinculo[], opcoes: { guardar?: ReturnType<typeof vi.fn>; provisoria?: string | null; podeEditar?: boolean; carregando?: boolean; saida?: string | null } = {}) {
  const onGuardarVinculo = opcoes.guardar ?? vi.fn().mockResolvedValue(null);
  render(
    <PessoaContratoTab
      pessoaId="p1" organizationId="org" vinculos={vinculos} retribuicao={null} podeEditar={opcoes.podeEditar ?? true}
      podeVerRetribuicao={false} podeEditarRetribuicao={false} podeCorrigirRetribuicao={false} cargo={null} periodosDosCargos={[]}
      podeCorrigirHoras={false} podeAnexarContratoAssinado={false} vinculosOpcoesDocumento={[]} saving={false}
      onGuardarVinculo={onGuardarVinculo} dataAdmissaoProvisoria={opcoes.provisoria ?? null} carregando={opcoes.carregando} dataSaidaGravada={opcoes.saida ?? null}
    />,
  );
  return onGuardarVinculo;
}

const campoAntiguidade = () => document.getElementById("hr-contrato-data-antiguidade") as HTMLInputElement | null;
const gravar = () => fireEvent.click(screen.getByText("employees.form.update"));

describe("Contratos (rh-exemplo): data de antiguidade do contrato", () => {
  it("mostra o campo «Data de antiguidade», editavel, com o valor do contrato", () => {
    montar([{ ...VINCULO, data_antiguidade: "2020-05-01" } as PessoaVinculo]);
    const campo = campoAntiguidade();
    expect(campo).not.toBeNull();
    expect(campo).toBeEnabled();
    expect(campo?.value).toBe("2020-05-01");
    expect(screen.getByText("hr.contrato.dataAntiguidade")).toBeInTheDocument();
  });

  it("gravar leva a antiguidade escrita no patch do contrato", async () => {
    const onGuardarVinculo = montar([VINCULO]);
    fireEvent.change(campoAntiguidade() as HTMLInputElement, { target: { value: "2019-03-15" } });
    gravar();
    await vi.waitFor(() => expect(onGuardarVinculo).toHaveBeenCalledTimes(1));
    expect(onGuardarVinculo.mock.calls[0][0]).toBe("v1");
    expect(onGuardarVinculo.mock.calls[0][1]).toMatchObject({ data_antiguidade: "2019-03-15", data_inicio: "2024-01-01" });
  });

  it("esvaziar o campo grava null (conta o inicio da cadeia)", async () => {
    const onGuardarVinculo = montar([{ ...VINCULO, data_antiguidade: "2020-05-01" } as PessoaVinculo]);
    fireEvent.change(campoAntiguidade() as HTMLInputElement, { target: { value: "" } });
    gravar();
    await vi.waitFor(() => expect(onGuardarVinculo).toHaveBeenCalledTimes(1));
    expect(onGuardarVinculo.mock.calls[0][1]).toHaveProperty("data_antiguidade", null);
  });

  it("antiguidade posterior ao inicio: nao grava e diz porque", async () => {
    const onGuardarVinculo = montar([VINCULO]);
    fireEvent.change(campoAntiguidade() as HTMLInputElement, { target: { value: "2024-01-02" } });
    gravar();
    expect(await screen.findByText("hr.contrato.erroAntiguidadeDepoisInicio")).toBeInTheDocument();
    expect(onGuardarVinculo).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("hr.contrato.erroAntiguidadeDepoisInicio");
  });

  it("antiguidade igual ao inicio e valida", async () => {
    const onGuardarVinculo = montar([VINCULO]);
    fireEvent.change(campoAntiguidade() as HTMLInputElement, { target: { value: "2024-01-01" } });
    gravar();
    await vi.waitFor(() => expect(onGuardarVinculo).toHaveBeenCalledTimes(1));
  });

  it("a leitura do contrato ainda nao traz a antiguidade: o campo fica so de leitura e o patch nao a leva (nao se apaga o que nao se leu)", async () => {
    const { data_antiguidade: _naoLida, ...semColuna } = VINCULO as unknown as Record<string, unknown>;
    void _naoLida;
    const onGuardarVinculo = montar([semColuna as unknown as PessoaVinculo]);
    expect(campoAntiguidade()).toBeDisabled();
    expect(screen.getByText("hr.contrato.antiguidadeNaoLida")).toBeInTheDocument();
    gravar();
    await vi.waitFor(() => expect(onGuardarVinculo).toHaveBeenCalledTimes(1));
    expect(onGuardarVinculo.mock.calls[0][1]).not.toHaveProperty("data_antiguidade");
  });

  it("sem contrato em vigor (a criar um): a antiguidade escreve-se e segue no patch", async () => {
    const onGuardarVinculo = montar([]);
    expect(campoAntiguidade()).toBeEnabled();
    fireEvent.change(document.getElementById("hr-contrato-data-inicio") as HTMLInputElement, { target: { value: "2026-02-01" } });
    fireEvent.change(campoAntiguidade() as HTMLInputElement, { target: { value: "2025-12-01" } });
    fireEvent.click(screen.getByText("employees.form.create"));
    await vi.waitFor(() => expect(onGuardarVinculo).toHaveBeenCalledTimes(1));
    expect(onGuardarVinculo.mock.calls[0][0]).toBeNull();
    expect(onGuardarVinculo.mock.calls[0][1]).toMatchObject({ data_antiguidade: "2025-12-01", data_inicio: "2026-02-01" });
  });

  it("sem permissao de edicao, a antiguidade fica so de leitura", () => {
    montar([VINCULO], { podeEditar: false });
    expect(campoAntiguidade()).toBeDisabled();
  });
});

describe("Contratos (rh-exemplo): resumo so de leitura da contratacao e da saida", () => {
  it("mostra a contratacao e a saida calculadas pelos contratos, sem campos para as editar", () => {
    montar([
      { ...VINCULO, id: "v1", estado: "terminado", data_inicio: "2020-01-01", data_fim: "2022-06-30" } as PessoaVinculo,
    ]);
    const resumo = screen.getByTestId("resumo-datas-pessoa");
    expect(resumo).toHaveTextContent("hr.contrato.datasPessoa.contratacao");
    expect(resumo).toHaveTextContent("2020-01-01");
    expect(resumo).toHaveTextContent("hr.contrato.datasPessoa.saida");
    expect(resumo).toHaveTextContent("2022-06-30");
    expect(resumo.querySelector("input")).toBeNull();
  });

  it("em vigor: saida sem valor", () => {
    montar([VINCULO]);
    const resumo = screen.getByTestId("resumo-datas-pessoa");
    expect(resumo).toHaveTextContent("2024-01-01");
    expect(screen.getByTestId("resumo-data-saida")).toHaveTextContent("hr.campos.semValor");
  });

  it("readmissao: a contratacao e o inicio da cadeia actual", () => {
    montar([
      { ...VINCULO, id: "v2", data_inicio: "2023-05-01" } as PessoaVinculo,
      { ...VINCULO, id: "v1", estado: "terminado", data_inicio: "2018-01-01", data_fim: "2019-12-31" } as PessoaVinculo,
    ]);
    expect(screen.getByTestId("resumo-datas-pessoa")).toHaveTextContent("2023-05-01");
  });

  it("sem contrato: «contratacao provisoria, falta contrato», com a data provisoria quando existe", () => {
    montar([], { provisoria: "2026-10-01" });
    const resumo = screen.getByTestId("resumo-datas-pessoa");
    expect(resumo).toHaveTextContent("hr.contrato.datasPessoa.provisoria");
    expect(resumo).toHaveTextContent("2026-10-01");
  });

  it("pessoa nova sem contrato e sem admissao provisoria nem saida: tudo vazio e sem aviso de provisoria", () => {
    montar([]);
    const resumo = screen.getByTestId("resumo-datas-pessoa");
    expect(resumo).not.toHaveTextContent("hr.contrato.datasPessoa.provisoria");
    expect(within(resumo).queryByRole("status")).toBeNull();
    expect(resumo.textContent?.split("hr.campos.semValor").length).toBe(3);
  });

  it("pessoa que saiu e a quem se apagaram todos os contratos: mostra a saida gravada, sem contratacao e sem aviso", () => {
    montar([], { saida: "2024-05-01" });
    const resumo = screen.getByTestId("resumo-datas-pessoa");
    expect(screen.getByTestId("resumo-data-saida")).toHaveTextContent("2024-05-01");
    expect(resumo).not.toHaveTextContent("hr.contrato.datasPessoa.provisoria");
  });

  it("com contrato vivo a saida gravada e ignorada", () => {
    montar([VINCULO], { saida: "2020-01-01" });
    expect(screen.getByTestId("resumo-data-saida")).toHaveTextContent("hr.campos.semValor");
  });

  it("o aviso de provisoria e um <p role=status> fora da <dl> (a lista de definicoes so tem termos e definicoes)", () => {
    montar([], { provisoria: "2026-10-01" });
    const aviso = within(screen.getByTestId("resumo-datas-pessoa")).getByRole("status");
    expect(aviso.tagName).toBe("P");
    expect(aviso.closest("dl")).toBeNull();
    expect(aviso).toHaveTextContent("hr.contrato.datasPessoa.provisoria");
  });

  it("enquanto os contratos carregam, nao ha aviso de provisoria nem a contratacao provisoria (nao pisca)", () => {
    montar([], { provisoria: "2026-10-01", carregando: true });
    const resumo = screen.getByTestId("resumo-datas-pessoa");
    expect(resumo).not.toHaveTextContent("hr.contrato.datasPessoa.provisoria");
    expect(within(resumo).queryByRole("status")).toBeNull();
  });
});

describe("Contratos (rh-exemplo): o erro do hook mostra-se tal como vem", () => {
  // O `usePessoa` real ja devolve a frase traduzida (`friendlyError`, que trata o 23514 das datas): o ecra nao a muda.
  it("mostra a frase que o hook devolveu", async () => {
    const frase = tabelaFundida.pt["hr.erro.datas.antiguidadeDepoisInicio"];
    const onGuardarVinculo = vi.fn().mockResolvedValue(frase);
    montar([VINCULO], { guardar: onGuardarVinculo });
    gravar();
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith(frase);
  });
});
