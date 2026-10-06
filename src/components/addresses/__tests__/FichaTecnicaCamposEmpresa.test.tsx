// @vitest-environment jsdom
/**
 * Ficha do local com a configuração da empresa (cfg_campos):
 *  1. rótulo mudado num campo de sistema e rótulo de uma opção;
 *  2. campo de sistema escondido (e o dependente: sem "Tem elevador" não há nº de elevadores);
 *  3. campo da empresa no fim da secção e a condição "só aparece se";
 *  4. secção própria da empresa;
 *  5. resumo com a linha "Outros" e sem os campos escondidos.
 */
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FichaTecnicaCampos } from "../FichaTecnicaCampos";
import { FichaLocalResumo } from "../FichaLocalResumo";
import { FICHA_TECNICA_VALORES_VAZIOS, type FichaTecnicaValores } from "@/lib/addresses/fichaTecnicaEdificio";
import { combinarFicha, type ValoresFormulario } from "@/lib/campos/definicoes";
import type { LinhaCampo } from "@/lib/campos/catalogo";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));

const LINHAS: LinhaCampo[] = [
  { chave: "habitada_durante_obra", sistema: true, rotulo: "Loja aberta ao público" },
  { chave: "pavimento", sistema: true, opcoes: [{ valor: "outro", rotulo: "Betão" }] },
  { chave: "tipologia", sistema: true, ativo: false },
  { chave: "tem_elevador", sistema: true, ativo: false },
  { chave: "credenciacao", sistema: false, tipo: "sim_nao", rotulo: "Exige credenciação", seccao: "interior" },
  { chave: "quem_credencia", sistema: false, tipo: "texto", rotulo: "Quem credencia", seccao: "interior",
    condicao: { campo: "credenciacao", valores: ["true"] } },
  { chave: "horario", sistema: false, tipo: "escolha", rotulo: "Horário", seccao: "acessos",
    opcoes: [{ valor: "manha", rotulo: "Manhã" }, { valor: "tarde", rotulo: "Tarde" }] },
];
const config = combinarFicha("local", LINHAS);

const Controlado = ({ inicial = FICHA_TECNICA_VALORES_VAZIOS }: { inicial?: FichaTecnicaValores }) => {
  const [valor, setValor] = useState(inicial);
  const [extra, setExtra] = useState<ValoresFormulario>({});
  return (
    <FichaTecnicaCampos
      valor={valor}
      onChange={setValor}
      idPrefix="t"
      defaultOpen
      config={config}
      extra={extra}
      onExtraChange={setExtra}
      termoLocal="Espaço"
    />
  );
};

describe("FichaTecnicaCampos com a configuração da empresa", () => {
  it("rótulos da empresa, campos escondidos e dependentes", () => {
    render(<Controlado />);
    expect(screen.getByText("Ficha do local — Espaço")).toBeInTheDocument();
    expect(screen.getByLabelText("Loja aberta ao público")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Betão" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "T2" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/elevador/i)).not.toBeInTheDocument();
  });

  it("campo da empresa no fim da secção e a condição", () => {
    render(<Controlado />);
    expect(screen.queryByLabelText("Quem credencia")).not.toBeInTheDocument();
    fireEvent.click(document.getElementById("t_x_credenciacao_true")!);
    expect(screen.getByLabelText("Quem credencia")).toBeInTheDocument();
  });

  it("secção própria da empresa", () => {
    render(<Controlado />);
    expect(screen.getByRole("button", { name: /Acessos/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Manhã" })).toBeInTheDocument();
  });

  it("sem config, nada muda", () => {
    render(<FichaTecnicaCampos valor={FICHA_TECNICA_VALORES_VAZIOS} onChange={() => {}} idPrefix="s" defaultOpen />);
    expect(screen.getByText("Ficha do local")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "T2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Acessos/ })).not.toBeInTheDocument();
  });
});

describe("FichaLocalResumo com a configuração da empresa", () => {
  it("acrescenta 'Outros' e tira os campos escondidos", () => {
    render(
      <FichaLocalResumo
        ficha={{ tipologia: "T3", area_util_m2: 95, tem_elevador: true }}
        config={config}
        extra={{ horario: "manha", credenciacao: true }}
      />,
    );
    expect(screen.getByText(/95 m²/)).toBeInTheDocument();
    expect(screen.queryByText(/T3/)).not.toBeInTheDocument();
    expect(screen.queryByText(/elevador/)).not.toBeInTheDocument();
    const outros = document.querySelector('[data-seccao="outros"]');
    expect(outros?.textContent).toBe("Outros: Exige credenciação · Horário: Manhã");
  });

  it("sem config, o resumo de sempre", () => {
    render(<FichaLocalResumo ficha={{ tipologia: "T3", tem_elevador: true }} extra={{ horario: "manha" }} />);
    expect(screen.getByText(/T3/)).toBeInTheDocument();
    expect(document.querySelector('[data-seccao="outros"]')).toBeNull();
  });
});
