import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DealNeedDiagnostic } from "../DealNeedDiagnostic";
import { DIAGNOSTICO_PLANEAMENTO_VAZIO } from "@/lib/deals/diagnosticoPlaneamento";
import { combinarFicha } from "@/lib/campos/definicoes";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/components/quote/DiagnosticServicePicker", () => ({ default: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const base = {
  organizationId: "org",
  areaM2: "", onAreaM2Change: vi.fn(),
  demolirDescricao: "", onDemolirDescricaoChange: vi.fn(),
  demolirM2: "", onDemolirM2Change: vi.fn(),
  protegerDescricao: "", onProtegerDescricaoChange: vi.fn(),
  intervencaoTipo: "", onIntervencaoTipoChange: vi.fn(),
  intervencaoDescricao: "", onIntervencaoDescricaoChange: vi.fn(),
  services: [], onServiceAccepted: vi.fn(), onRemoveService: vi.fn(),
  materials: [], onRemoveMaterial: vi.fn(),
  plano: DIAGNOSTICO_PLANEAMENTO_VAZIO,
  onPlanoChange: vi.fn(),
};

const ficha = combinarFicha("diagnostico", [
  { chave: "diag_mobilada", sistema: true, rotulo: "Espaço ocupado", obrigatorio: true },
  { chave: "diag_toalheiro", sistema: true, ativo: false },
  { chave: "diag_tipo_area", sistema: true, opcoes: [{ valor: "cozinha", rotulo: "Copa" }] },
  { chave: "urgencia", sistema: false, tipo: "escolha", rotulo: "Urgência",
    opcoes: [{ valor: "normal", rotulo: "Normal" }, { valor: "urgente", rotulo: "Urgente" }] },
  { chave: "so_cozinha", sistema: false, tipo: "texto", rotulo: "Exaustor",
    condicao: { campo: "diag_tipo_area", valores: ["cozinha"] } },
]);

describe("Diagnóstico com a configuração da empresa", () => {
  it("rótulos da empresa, campo escondido e rótulo de opção", () => {
    render(<DealNeedDiagnostic {...base} fichaDiagnostico={ficha} extra={{}} onExtraChange={vi.fn()} />);
    expect(screen.getByText("Espaço ocupado")).toBeInTheDocument();
    expect(screen.queryByText("Casa mobilada no caminho")).not.toBeInTheDocument();
    expect(screen.queryByText("Toalheiro elétrico")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cozinha" })).not.toBeInTheDocument();
  });

  it("campos da empresa aparecem, com a condição sobre um campo de sistema", () => {
    const onExtraChange = vi.fn();
    const { rerender } = render(
      <DealNeedDiagnostic {...base} fichaDiagnostico={ficha} extra={{}} onExtraChange={onExtraChange} />,
    );
    expect(screen.getByTestId("diag-campos-empresa")).toBeInTheDocument();
    expect(screen.getByText("Urgência")).toBeInTheDocument();
    expect(screen.queryByText("Exaustor")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Urgente"));
    expect(onExtraChange).toHaveBeenCalledWith({ urgencia: "urgente" });

    rerender(
      <DealNeedDiagnostic {...base} plano={{ ...DIAGNOSTICO_PLANEAMENTO_VAZIO, tipo_area: "cozinha" }}
        fichaDiagnostico={ficha} extra={{}} onExtraChange={onExtraChange} />,
    );
    expect(screen.getByText("Exaustor")).toBeInTheDocument();
  });

  it("sem configuração fica como sempre e sem secção da empresa", () => {
    render(<DealNeedDiagnostic {...base} fichaDiagnostico={combinarFicha("diagnostico", [])} extra={{}} onExtraChange={vi.fn()} />);
    expect(screen.getByText("Casa mobilada no caminho")).toBeInTheDocument();
    expect(screen.getByText("Toalheiro elétrico")).toBeInTheDocument();
    expect(screen.queryByTestId("diag-campos-empresa")).not.toBeInTheDocument();
  });
});
