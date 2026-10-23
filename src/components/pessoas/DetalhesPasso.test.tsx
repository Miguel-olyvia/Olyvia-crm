// O que o passo escolhido ainda pede na chamada. Encerrar a abordagem pede o motivo: um da lista, ou «Outro» com o texto escrito à mão.
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ErrosChamada } from "./chamadaPassos";
import { DetalhesPasso } from "./DetalhesPasso";
import { destinoInicial } from "./moradaVisita";
import type { CamposChamada } from "./useFormChamada";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

// O jsdom não tem estas funções, que o Select do Radix usa ao abrir a lista.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const CAMPOS: CamposChamada = {
  resultado: "semInteresse", nota: "", passo: "perder", data: "2026-10-14", hora: "10:00", destino: destinoInicial(null), motivo: "", motivoOutro: "",
};
const SEM_ERROS: ErrosChamada = { data: null, hora: null, motivo: null };

function Montado({ erros = SEM_ERROS, inicial = CAMPOS }: { erros?: ErrosChamada; inicial?: CamposChamada }) {
  const [campos, setCampos] = useState(inicial);
  return (
    <DetalhesPasso campos={campos} erros={erros} moradaLead={null} erroMorada={null} hoje="2026-10-13" aoMudar={(p) => setCampos((c) => ({ ...c, ...p }))} />
  );
}

describe("DetalhesPasso: o motivo ao encerrar a abordagem", () => {
  it("tem a lista fixa de motivos e «Outro» no fim", () => {
    render(<Montado />);
    const select = screen.getByRole("combobox", { name: /Motivo/ });
    expect(select).toBeInTheDocument();
  });

  it("o texto só aparece quando o motivo é «Outro», e escreve-se nele", () => {
    render(<Montado inicial={{ ...CAMPOS, motivo: "outro" }} />);
    const texto = screen.getByRole("textbox", { name: "Escreva o motivo" });
    fireEvent.change(texto, { target: { value: "Mudou de casa" } });
    expect(texto).toHaveValue("Mudou de casa");
  });

  it("com um motivo da lista não há campo de texto", () => {
    render(<Montado inicial={{ ...CAMPOS, motivo: "preco" }} />);
    expect(screen.queryByRole("textbox", { name: "Escreva o motivo" })).not.toBeInTheDocument();
  });

  it("o erro do texto do «Outro» diz-se em texto, ligado ao campo, sem depender da cor", () => {
    render(<Montado inicial={{ ...CAMPOS, motivo: "outro" }} erros={{ ...SEM_ERROS, motivo: "outroVazio" }} />);
    const texto = screen.getByRole("textbox", { name: "Escreva o motivo" });
    expect(texto).toBeInvalid();
    expect(texto).toHaveAccessibleDescription("Escreva o motivo.");
  });

  it("o erro de falta de motivo fica ligado ao seletor", () => {
    render(<Montado erros={{ ...SEM_ERROS, motivo: "motivoVazio" }} />);
    expect(screen.getByRole("combobox", { name: /Motivo/ })).toBeInvalid();
  });
});

describe("DetalhesPasso: os outros passos", () => {
  it("a visita pede o dia, a hora e a morada", () => {
    render(<Montado inicial={{ ...CAMPOS, passo: "marcarVisita" }} />);
    expect(screen.getByRole("group", { name: "Quando é a visita?" })).toBeInTheDocument();
  });

  it("passos sem detalhes não desenham nada", () => {
    const { container } = render(<Montado inicial={{ ...CAMPOS, passo: "ligarAmanha" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
