// @vitest-environment jsdom
/**
 * FichaTecnicaCampos — "Ficha do local" com duas secções colapsáveis.
 *
 *  1. Título "Ficha do local" e as secções Exterior / Interior, fechadas sem dados.
 *  2. Abre-se a secção que já tem dados.
 *  3. Interior: tipologia (rádio), área com "m²", canalização (lista), interruptores e notas.
 *  4. Exterior: desligar o elevador limpa o nº de elevadores (como antes).
 *  5. Uma secção com erros abre-se e mostra a mensagem.
 */
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FichaTecnicaCampos } from "../FichaTecnicaCampos";
import {
  FICHA_TECNICA_VALORES_VAZIOS,
  MENSAGENS_FICHA_TECNICA,
  type ErrosFichaTecnica,
  type FichaTecnicaValores,
} from "@/lib/addresses/fichaTecnicaEdificio";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));

const Controlado = ({
  inicial = FICHA_TECNICA_VALORES_VAZIOS,
  erros,
  onChange,
}: {
  inicial?: FichaTecnicaValores;
  erros?: ErrosFichaTecnica;
  onChange?: (v: FichaTecnicaValores) => void;
}) => {
  const [valor, setValor] = useState(inicial);
  return (
    <FichaTecnicaCampos
      valor={valor}
      onChange={(v) => { setValor(v); onChange?.(v); }}
      erros={erros}
      idPrefix="t"
    />
  );
};

const abrir = (nome: RegExp) => fireEvent.click(screen.getByRole("button", { name: nome }));

describe("FichaTecnicaCampos", () => {
  it("mostra o título e as duas secções, fechadas quando não há dados", () => {
    render(<Controlado />);
    expect(screen.getByText("Ficha do local")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exterior — edifício e acessos/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Interior — a casa/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Área útil")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("N.º de andares do edifício")).not.toBeInTheDocument();
  });

  it("abre a secção que já tem dados", () => {
    render(<Controlado inicial={{ ...FICHA_TECNICA_VALORES_VAZIOS, tipologia: "T2" }} />);
    expect(screen.getByRole("button", { name: /Interior — a casa/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Exterior — edifício e acessos/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("radio", { name: "T2" })).toHaveAttribute("aria-checked", "true");
  });

  it("interior: preenche os campos da casa", () => {
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);
    abrir(/Interior — a casa/);

    fireEvent.click(screen.getByRole("radio", { name: "T3" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tipologia: "T3" }));

    const area = screen.getByLabelText("Área útil");
    expect(within(area.parentElement as HTMLElement).getByText("m²")).toBeInTheDocument();
    fireEvent.change(area, { target: { value: "95,5" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ area_util_m2: "95,5" }));

    fireEvent.change(screen.getByLabelText("N.º de casas de banho"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Ano de construção"), { target: { value: "1985" } });
    fireEvent.change(screen.getByLabelText("Canalização"), { target: { value: "ferro" } });
    fireEvent.change(screen.getByLabelText("Pavimento"), { target: { value: "madeira" } });
    fireEvent.click(screen.getByRole("radio", { name: "Renovada" }));
    fireEvent.click(screen.getByRole("switch", { name: "Quadro com diferencial" }));
    fireEvent.click(screen.getByRole("radio", { name: "Garrafa" }));
    fireEvent.click(screen.getByRole("switch", { name: "Habitada durante a obra" }));
    fireEvent.change(screen.getByLabelText("Notas do interior"), { target: { value: "Cão em casa" } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      tipologia: "T3", area_util_m2: "95,5", n_casas_banho: "2", ano_construcao: "1985",
      canalizacao: "ferro", pavimento: "madeira", eletrica: "renovada", quadro_diferencial: true,
      gas: "garrafa", habitada_durante_obra: true, animais: false, notas_interior: "Cão em casa",
    }));
    expect(screen.getByText("11/2000")).toBeInTheDocument();
  });

  it("amianto tem sim / não / não sei e 'Não indicado' volta a limpar", () => {
    const onChange = vi.fn();
    render(<Controlado onChange={onChange} />);
    abrir(/Interior — a casa/);
    const grupo = screen.getByRole("radiogroup", { name: "Amianto" });
    fireEvent.click(within(grupo).getByRole("radio", { name: "Não sei" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ amianto: "nao_sei" }));
    fireEvent.click(within(grupo).getByRole("radio", { name: "Não indicado" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ amianto: "" }));
  });

  it("exterior: desligar o elevador limpa o número de elevadores", () => {
    const onChange = vi.fn();
    render(<Controlado
      inicial={{ ...FICHA_TECNICA_VALORES_VAZIOS, tem_elevador: true, n_elevadores: "2" }}
      onChange={onChange}
    />);
    expect(screen.getByRole("button", { name: /Exterior — edifício e acessos/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("switch", { name: "Tem elevador" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tem_elevador: false, n_elevadores: "" }));
  });

  it("secção com erros abre-se e mostra a mensagem", () => {
    render(<Controlado
      inicial={{ ...FICHA_TECNICA_VALORES_VAZIOS }}
      erros={{ ano_construcao: MENSAGENS_FICHA_TECNICA.anoIntervalo }}
    />);
    expect(screen.getByRole("button", { name: /Interior — a casa/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(MENSAGENS_FICHA_TECNICA.anoIntervalo)).toBeInTheDocument();
    expect(screen.getByLabelText("Ano de construção")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /Exterior — edifício e acessos/ })).toHaveAttribute("aria-expanded", "false");
  });
});
