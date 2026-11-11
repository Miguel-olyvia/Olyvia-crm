/**
 * Decisao 4 (RH): «Maximo de horas semanais», «Tempo de trabalho %» e «Formacao comeca / termina» saem do contrato.
 * As colunas ficam na base; o ecra deixa de as mostrar, de as pedir e de as enviar. Estes testes fecham tres coisas:
 *  1. nenhum dos grupos do separador Contratos mostra os campos;
 *  2. gravar manda o patch SEM estas colunas (um UPDATE nao lhes toca, e o CHECK cruzado nao as compara);
 *  3. gravar nao as EXIGE: um contrato antigo com valores desses campos fora do que se validava grava na mesma.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }) }));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: toastError, success: vi.fn() } }));

import { renderRh as render, reporRhTeste } from "@/test/rhExemploProviders";
import { CamposTocadosProvider } from "@/components/rh-exemplo/form/Campos";
import { ContratoGrupoDatas } from "@/components/rh-exemplo/contrato/ContratoGrupoDatas";
import { ContratoGrupoTempoTrabalho } from "@/components/rh-exemplo/contrato/ContratoGrupoTempoTrabalho";
import { rascunhoDe } from "@/components/rh-exemplo/contrato/rascunhoVinculo";
import { PessoaContratoTab } from "@/components/rh-exemplo/PessoaContratoTab";
import type { PessoaVinculo } from "@/components/rh-exemplo/tipos";

const COLUNAS_RETIRADAS = ["tempo_trabalho_pct", "horas_semanais_maximas", "formacao_inicio", "formacao_fim"] as const;

const VINCULO = {
  id: "v1", pessoa_id: "p1", organization_id: "org", tipo_contrato: "sem_termo", regime: "tempo_inteiro", horas_periodo: 40,
  data_inicio: "2024-01-01", data_fim: null, motivo_termo: null, periodo_experimental_ate: null, entidade_legal_org_id: null,
  estado: "activo", tipo_trabalho: null, horas_frequencia: "semanal", horas_semanais_equivalentes: 40, tempo_trabalho_pct: null,
  dias_uteis: null, politica_feriados: "nao_laboral", horas_anuais_maximas: null, horas_semanais_maximas: null,
  periodo_experimental_dias: null, categoria_funcao: null, periodo_experimental_origem: null, categoria_profissional: null,
  renovavel: null, isencao_horario: false, formacao_inicio: null, formacao_fim: null,
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
});

function montarTab(vinculo: PessoaVinculo) {
  const onGuardarVinculo = vi.fn().mockResolvedValue(null);
  render(
    <PessoaContratoTab
      pessoaId="p1" organizationId="org" vinculos={[vinculo]} retribuicao={null} podeEditar podeVerRetribuicao={false}
      podeEditarRetribuicao={false} podeCorrigirRetribuicao={false} cargo={null} periodosDosCargos={[]} podeCorrigirHoras={false}
      podeAnexarContratoAssinado={false} vinculosOpcoesDocumento={[]} saving={false} onGuardarVinculo={onGuardarVinculo}
    />,
  );
  return onGuardarVinculo;
}

describe("contrato (rh-exemplo): os campos retirados deixam de aparecer", () => {
  it("o grupo das datas ja nao tem «Formacao comeca / termina»", () => {
    render(
      <CamposTocadosProvider onTocar={() => {}}>
        <ContratoGrupoDatas
          rascunho={rascunhoDe(null)} definir={() => {}} podeEditar temExperimental={false} onAlternarExperimental={() => {}}
          sugestaoExperimental={null} onAceitarSugestao={() => {}} onDefinirCampoExperimental={() => {}} erroDe={() => null}
        />
      </CamposTocadosProvider>,
    );
    expect(screen.queryByText("hr.contrato.formacaoInicio")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.contrato.formacaoFim")).not.toBeInTheDocument();
    expect(document.getElementById("hr-contrato-formacao-inicio")).toBeNull();
    expect(document.getElementById("hr-contrato-formacao-fim")).toBeNull();
    // O resto do grupo continua la.
    expect(document.getElementById("hr-contrato-data-inicio")).not.toBeNull();
  });

  it("o grupo do tempo de trabalho ja nao tem «Tempo de trabalho %» nem «Maximo de horas semanais»", () => {
    render(
      <CamposTocadosProvider onTocar={() => {}}>
        <ContratoGrupoTempoTrabalho rascunho={rascunhoDe(null)} definir={() => {}} podeEditar criandoContrato pessoaId="p1" erroDe={() => null} />
      </CamposTocadosProvider>,
    );
    expect(screen.queryByText("hr.contrato.tempoTrabalhoPct")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.contrato.horasSemanaisMaximas")).not.toBeInTheDocument();
    expect(document.getElementById("hr-contrato-tempo-trabalho-pct")).toBeNull();
    expect(document.getElementById("hr-contrato-horas-semanais-maximas")).toBeNull();
    expect(document.getElementById("hr-contrato-politica-feriados")).not.toBeNull();
  });

  it("o rascunho do contrato ja nao carrega essas colunas", () => {
    const rascunho = rascunhoDe({
      ...VINCULO, horas_semanais_maximas: 48, tempo_trabalho_pct: 75, formacao_inicio: "2024-02-01", formacao_fim: "2024-03-01",
    } as PessoaVinculo);
    for (const coluna of COLUNAS_RETIRADAS) expect(rascunho).not.toHaveProperty(coluna);
  });
});

describe("contrato (rh-exemplo): gravar sem as colunas retiradas", () => {
  it("o patch nao leva nenhuma das quatro colunas (nem como null)", async () => {
    const onGuardarVinculo = montarTab(VINCULO);
    fireEvent.click(screen.getByText("employees.form.update"));
    await vi.waitFor(() => expect(onGuardarVinculo).toHaveBeenCalledTimes(1));
    const patch = onGuardarVinculo.mock.calls[0][1] as Record<string, unknown>;
    for (const coluna of COLUNAS_RETIRADAS) expect(patch).not.toHaveProperty(coluna);
    // E o que continua a ser do contrato continua a ir.
    expect(patch).toMatchObject({ tipo_contrato: "sem_termo", data_inicio: "2024-01-01", politica_feriados: "nao_laboral" });
  });

  it("nao exige nem valida o que ja nao se ve: valores antigos fora dos limites nao bloqueiam a gravacao", async () => {
    // Maximo (10h) abaixo do contratado (40h), FTE acima de 100 e formacao a acabar antes de comecar: antes bloqueava, agora nao se le.
    const onGuardarVinculo = montarTab({
      ...VINCULO, horas_semanais_maximas: 10, tempo_trabalho_pct: 250, formacao_inicio: "2024-05-01", formacao_fim: "2024-04-01",
    } as PessoaVinculo);
    fireEvent.click(screen.getByText("employees.form.update"));
    await vi.waitFor(() => expect(onGuardarVinculo).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });
});
