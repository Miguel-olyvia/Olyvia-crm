// 3/11 (Rúben): o separador «Campos das fases» e, no Levantamento, o impacto dos campos no orçamento. O hook de leitura e gravação é simulado:
// aqui vê-se que o que o admin muda no editor chega à gravação como os ajustes certos (CfgCampos e CfgEfeitos).
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import type { CfgCampos } from "@/emylia/campos";
import type { CfgEfeitos } from "@/emylia/efeitosLevantamento";
import type { CamposConfigHook } from "@/hooks/pessoas/workflow/useCamposConfig";
import { CamposFasesSeparador } from "./CamposFasesSeparador";
import { EfeitosCamposSeccao } from "./EfeitosCamposSeccao";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
beforeAll(prepararRadixNoJsdom);

const hook = (sobre: Partial<CamposConfigHook> = {}): CamposConfigHook => ({
  estado: "pronto", dados: { campos: {}, efeitos: {} }, erro: null, aGuardar: false,
  guardar: vi.fn().mockResolvedValue({ campos: {}, efeitos: {} }), recarregar: vi.fn(), ...sobre,
});

function Campos({ config }: { config: CamposConfigHook }) {
  const [r, setR] = useState<CfgCampos | null>(null);
  return <CamposFasesSeparador config={config} rascunho={r} aoMudar={setR} />;
}
function Efeitos({ config }: { config: CamposConfigHook }) {
  const [r, setR] = useState<CfgEfeitos | null>(null);
  return <EfeitosCamposSeccao config={config} rascunho={r} aoMudar={setR} />;
}

describe("Campos das fases", () => {
  it("mudar o nome de um campo da Lead e guardar grava só esse ajuste", async () => {
    const config = hook();
    render(<Campos config={config} />);
    fireEvent.click(screen.getByLabelText("Por contactar"));
    // 4/11: a Lead («Por contactar») só tem o grupo «Pedido» (o levantamento da chamada)
    const origem = screen.getByRole("region", { name: "Pedido" });
    fireEvent.click(within(origem).getByRole("button", { name: /^O que o cliente pediu/ }));
    const pergunta = within(origem).getByLabelText("Pergunta");
    fireEvent.change(pergunta, { target: { value: "Porque contactou" } });
    fireEvent.blur(pergunta);
    expect(screen.getByText("Há alterações por guardar.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar campos" }));
    await waitFor(() => expect(config.guardar).toHaveBeenCalledWith({ campos: { Pedido: { rotulos: { pedido: "Porque contactou" } } } }));
    expect(await screen.findByText("Campos guardados. Os negócios abertos a seguir já os usam.")).toBeInTheDocument();
  });

  it("esconder um campo da visita; os campos que a Olyvia usa escondem-se mas não têm «Apagar»", async () => {
    const config = hook();
    render(<Campos config={config} />);
    expect(screen.queryByRole("button", { name: "Apagar Estacionamento" })).toBeNull();
    expect(screen.getByRole("button", { name: "Esconder Estacionamento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Esconder Amianto" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar campos" }));
    await waitFor(() => expect(config.guardar).toHaveBeenCalledWith({ campos: { "Local · interior": { ocultos: ["amianto"] } } }));
  });

  it("parte do que está gravado; «Voltar aos campos de sempre» grava sem ajustes", async () => {
    const config = hook({ dados: { campos: { Pedido: { nome: "O pedido do cliente" } }, efeitos: {} } });
    render(<Campos config={config} />);
    fireEvent.click(screen.getByLabelText("Por contactar"));
    expect(screen.getByRole("region", { name: "O pedido do cliente" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos campos de sempre" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar campos" }));
    await waitFor(() => expect(config.guardar).toHaveBeenCalledWith({ campos: {} }));
  });

  it("sem alterações, guardar não chama a base", () => {
    const config = hook();
    render(<Campos config={config} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar campos" }));
    expect(config.guardar).not.toHaveBeenCalled();
  });

  it("um erro de leitura diz-se e deixa tentar de novo", () => {
    const config = hook({ estado: "erro", dados: null, erro: "Sem permissão (pessoas.view)." });
    render(<Campos config={config} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os campos das fases.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(config.recarregar).toHaveBeenCalled();
  });
});

describe("Impacto dos campos no orçamento", () => {
  it("mudar o preço por dia do estacionamento grava o valor novo", async () => {
    const config = hook();
    render(<Efeitos config={config} />);
    const dia = screen.getByLabelText("Por dia, zona amarela (e sem zona) (€)");
    expect(dia).toHaveValue(8);
    fireEvent.change(dia, { target: { value: "10" } });
    fireEvent.blur(dia);
    fireEvent.click(screen.getByRole("button", { name: "Guardar impacto" }));
    await waitFor(() => expect(config.guardar).toHaveBeenCalledWith({ efeitos: { estacionamento: { v: { dia_amarela: 10 } } } }));
  });

  it("desligar uma regra e mudar as respostas a que se aplica", async () => {
    const config = hook();
    render(<Efeitos config={config} />);
    fireEvent.click(screen.getByRole("switch", { name: "Mexe no orçamento: Proteção do elevador" }));
    const amianto = screen.getByText("Remoção certificada de amianto").closest("li")!;
    fireEvent.click(within(amianto).getByRole("button", { name: "Não sei" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar impacto" }));
    await waitFor(() => expect(config.guardar).toHaveBeenCalledWith({ efeitos: { elevador: { off: true }, amianto: { ops: ["Sim", "Não sei"] } } }));
  });

  it("as opções vêm do campo como a organização o ajustou", () => {
    const config = hook({ dados: { campos: { "Local · interior": { opcoes: { amianto: ["Sim", "Não", "Talvez"] } } }, efeitos: {} } });
    render(<Efeitos config={config} />);
    const amianto = screen.getByText("Remoção certificada de amianto").closest("li")!;
    expect(within(amianto).getByRole("button", { name: "Talvez" })).toBeInTheDocument();
  });

  it("voltar a pôr o valor de sempre tira o ajuste (fica igual ao gravado: nada por guardar)", () => {
    const config = hook({ dados: { campos: {}, efeitos: { amianto: { v: { preco: 600 } } } } });
    render(<Efeitos config={config} />);
    const preco = screen.getAllByLabelText("Preço ao cliente (€)").find((x) => (x as HTMLInputElement).value === "600")!;
    expect(screen.getByText("De sempre: 520")).toBeInTheDocument();
    fireEvent.change(preco, { target: { value: "520" } });
    fireEvent.blur(preco);
    expect(screen.queryByText("De sempre: 520")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar impacto" }));
    expect(config.guardar).toHaveBeenCalledWith({ efeitos: {} });
  });
});
