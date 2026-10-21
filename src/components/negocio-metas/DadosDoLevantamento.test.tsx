// Os dados do levantamento (data, estado e comercial): sem visita ligada são do próprio levantamento e editam-se (já vêm preenchidos); com uma visita
// ligada vêm dela e só se leem. Na ficha real o comercial escolhe-se entre os comerciais da organização; no exemplo, entre os de exemplo.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComCostura, dadosFalsos } from "./costuraTestUtil";
import { DadosDoLevantamento } from "./DadosDoLevantamento";
import { levantamentoVazio, type LevantamentoForm } from "./levantamento";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});

beforeAll(prepararRadixNoJsdom);

const levantamento = (sobre: Partial<LevantamentoForm> = {}): LevantamentoForm => ({ ...levantamentoVazio("2026-10-13", "Rita Gomes"), ...sobre });

function montar(
  sobre: { levantamento?: LevantamentoForm; deVisita?: boolean; erro?: "invalido"; dados?: Parameters<typeof dadosFalsos>[0] | null } = {},
) {
  const mudar = vi.fn();
  render(
    <ComCostura dados={sobre.dados === null ? null : dadosFalsos({ comerciais: ["Rita Gomes", "Tomás Reis"], pedirComerciais: vi.fn(), ...sobre.dados })}>
      <DadosDoLevantamento id="x" levantamento={sobre.levantamento ?? levantamento()} deVisita={sobre.deVisita ?? false} erro={sobre.erro} acoes={{ mudar }} />
    </ComCostura>,
  );
  return { mudar };
}
const escolher = async (campo: string, opcao: string) => {
  fireEvent.keyDown(screen.getByRole("combobox", { name: campo }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
};

describe("sem visita ligada: o levantamento tem os seus dados", () => {
  it("vêm preenchidos (data, estado e comercial) e dizem que são do levantamento", () => {
    montar();
    expect(screen.getByRole("group", { name: "Dados do levantamento" })).toBeInTheDocument();
    expect(screen.getByLabelText("Data do levantamento")).toHaveValue("2026-10-13");
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Por fazer");
    expect(screen.getByRole("combobox", { name: "Comercial" })).toHaveTextContent("Rita Gomes");
    expect(screen.getByText(/Sem visita ligada/)).toBeInTheDocument();
  });

  it("corrigem-se: a data, o estado e o comercial", async () => {
    const { mudar } = montar();
    fireEvent.change(screen.getByLabelText("Data do levantamento"), { target: { value: "2026-10-05" } });
    expect(mudar).toHaveBeenLastCalledWith({ data: "2026-10-05" });
    await escolher("Estado", "Feito");
    expect(mudar).toHaveBeenLastCalledWith({ estado: "feito" });
    await escolher("Comercial", "Tomás Reis");
    expect(mudar).toHaveBeenLastCalledWith({ feitoPor: "Tomás Reis" });
  });

  it("na ficha real o comercial escolhe-se entre os da organização (e pede-os ao montar); um já gravado que saiu da lista continua à vista", async () => {
    const pedirComerciais = vi.fn();
    montar({ levantamento: levantamento({ feitoPor: "Ex-colega" }), dados: { comerciais: ["Rita Gomes"], pedirComerciais } });
    expect(pedirComerciais).toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Comercial" })).toHaveTextContent("Ex-colega");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Comercial" }), { key: "Enter" });
    expect(await screen.findByRole("option", { name: "Rita Gomes" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ex-colega" })).toBeInTheDocument();
  });

  it("no exemplo (sem ficha real) oferece os comerciais de exemplo", async () => {
    montar({ dados: null, levantamento: levantamento({ feitoPor: "" }) });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Comercial" }), { key: "Enter" });
    expect((await screen.findAllByRole("option")).length).toBeGreaterThan(0);
  });

  it("uma data inválida diz-se no campo", () => {
    montar({ erro: "invalido" });
    const campo = screen.getByLabelText("Data do levantamento");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Indique um dia válido (a partir de 2000).")).toBeInTheDocument();
  });
});

describe("com visita ligada: os dados vêm da visita", () => {
  it("só se leem, e a mensagem diz de onde vêm", () => {
    montar({ deVisita: true, levantamento: levantamento({ data: "2026-10-15", estado: "feito", feitoPor: "Tomás Reis" }) });
    expect(screen.getByLabelText("Data do levantamento")).toBeDisabled();
    expect(screen.getByLabelText("Data do levantamento")).toHaveValue("2026-10-15");
    expect(screen.getByRole("combobox", { name: "Estado" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Feito");
    expect(screen.getByRole("combobox", { name: "Comercial" })).toBeDisabled();
    expect(screen.getByText(/vêm da visita/)).toBeInTheDocument();
    expect(screen.queryByText(/Sem visita ligada/)).toBeNull();
  });

  it("uma data inválida não se mostra como erro (não é do levantamento)", () => {
    montar({ deVisita: true, erro: "invalido" });
    expect(screen.queryByText(/Indique um dia válido/)).toBeNull();
  });
});
