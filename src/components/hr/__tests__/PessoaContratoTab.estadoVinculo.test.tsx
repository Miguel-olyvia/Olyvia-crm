/**
 * O estado do vinculo passou a editar-se aqui (ver o comentario de topo de
 * `PessoaContratoTab.tsx`). Dois testes fecham o lado que a migracao nao
 * pode provar: o selector respeita `podeEditar`, e terminar sem data de fim
 * fica bloqueado no cliente -- a mesma perda que o backfill da base recusa
 * fazer em silencio.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

import { PessoaContratoTab } from "@/components/hr/PessoaContratoTab";
import type { PessoaVinculo } from "@/types/hr";

const VINCULO_ACTIVO: PessoaVinculo = {
  id: "v1",
  pessoa_id: "p1",
  organization_id: "org",
  tipo_contrato: "sem_termo",
  regime: "tempo_inteiro",
  horas_periodo: 40,
  data_inicio: "2024-01-01",
  data_fim: null,
  motivo_termo: null,
  periodo_experimental_ate: null,
  entidade_legal_org_id: null,
  estado: "activo",
  tipo_trabalho: null,
  horas_frequencia: "semanal",
  horas_semanais_equivalentes: 40,
  tempo_trabalho_pct: null,
  dias_uteis: null,
  politica_feriados: "nao_laboral",
  horas_anuais_maximas: null,
  horas_semanais_maximas: null,
  periodo_experimental_dias: null,
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  toastError.mockClear();
});

type OnGuardarVinculo = (
  vinculoId: string | null,
  patch: Partial<PessoaVinculo>,
) => Promise<string | null>;

function montar(overrides: { podeEditar?: boolean; onGuardarVinculo?: OnGuardarVinculo } = {}) {
  const onGuardarVinculo = overrides.onGuardarVinculo ?? vi.fn().mockResolvedValue(null);
  render(
    <PessoaContratoTab
      vinculos={[VINCULO_ACTIVO]}
      retribuicao={null}
      podeEditar={overrides.podeEditar ?? true}
      podeVerRetribuicao={false}
      saving={false}
      onGuardarVinculo={onGuardarVinculo}
    />,
  );
  return { onGuardarVinculo };
}

describe("PessoaContratoTab -- estado do vinculo", () => {
  it("o selector de estado fica desactivado sem podeEditar", () => {
    montar({ podeEditar: false });

    expect(screen.getByLabelText("hr.contrato.estado")).toBeDisabled();
  });

  it("escolher terminado sem data de fim bloqueia a gravacao e avisa", async () => {
    const { onGuardarVinculo } = montar();

    const selector = screen.getByLabelText("hr.contrato.estado");
    fireEvent.keyDown(selector, { key: "Enter" });
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("hr.estadoVinculo.terminado"));

    fireEvent.click(screen.getByText("employees.form.update"));

    expect(onGuardarVinculo).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("hr.contrato.erroTerminadoSemDataFim");
  });
});
