import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DealNeedDiagnostic } from "../DealNeedDiagnostic";
import { DIAGNOSTICO_PLANEAMENTO_VAZIO } from "@/lib/deals/diagnosticoPlaneamento";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/components/quote/DiagnosticServicePicker", () => ({ default: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const base = {
  organizationId: "org",
  areaM2: "",
  onAreaM2Change: vi.fn(),
  demolirDescricao: "",
  onDemolirDescricaoChange: vi.fn(),
  demolirM2: "",
  onDemolirM2Change: vi.fn(),
  protegerDescricao: "",
  onProtegerDescricaoChange: vi.fn(),
  intervencaoTipo: "",
  onIntervencaoTipoChange: vi.fn(),
  intervencaoDescricao: "",
  onIntervencaoDescricaoChange: vi.fn(),
  services: [],
  onServiceAccepted: vi.fn(),
  onRemoveService: vi.fn(),
  materials: [],
  onRemoveMaterial: vi.fn(),
};

describe("Diagnóstico: secção para o planeamento da obra", () => {
  it("escolhe a divisão em botões e mostra os m² de parede", () => {
    const onPlanoChange = vi.fn();
    render(
      <DealNeedDiagnostic
        {...base}
        plano={{ ...DIAGNOSTICO_PLANEAMENTO_VAZIO, perimetro_m: "9", altura_revestimento: "teto", pe_direito_m: "2,5" }}
        onPlanoChange={onPlanoChange}
      />
    );
    expect(screen.getByText("Para o planeamento da obra")).toBeInTheDocument();
    expect(screen.getByText("= 22,5 m² de parede")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Casa de banho" }));
    expect(onPlanoChange).toHaveBeenCalledWith(expect.objectContaining({ tipo_area: "casa_banho", perimetro_m: "9" }));
  });

  it("sem plano (base antes da migração), a secção não aparece", () => {
    render(<DealNeedDiagnostic {...base} />);
    expect(screen.queryByText("Para o planeamento da obra")).not.toBeInTheDocument();
  });
});
