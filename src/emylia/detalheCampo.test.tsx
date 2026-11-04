// 4/11 (Rúben): «quando o Outro é selecionado, abrir uma caixa de texto para escrever (o workflow tem de ter esse check em cada campo)»
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CONTACTO, LEAD, efetivo, type Grupo } from "./campos";
import { Campos } from "./CamposFase";
import { lerCfgCampos } from "./real/camposConfig";
import type { Negocio } from "./motor";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const PREPARAR = CONTACTO.find((g) => g.titulo === "Preparar a visita")!;
const ORIGEM = LEAD.find((g) => g.titulo === "Origem")!;

describe("as opções que pedem mais detalhe", () => {
  it("o editor guarda-as por campo; ao ler, ficam só as opções que o campo tem", () => {
    const cfg = lerCfgCampos({
      "Preparar a visita": { detalhes: { presentes: ["Outra pessoa", "não existe"], nota_visita: ["x"] } },
      Origem: { novos: [{ k: "c_canal", l: "Canal", t: "escolha", op: ["Feira", "Outro"], detalhe: ["Outro", "Rádio"] }] },
    });
    expect(cfg["Preparar a visita"].detalhes).toEqual({ presentes: ["Outra pessoa"] });
    expect(cfg.Origem.novos?.[0].detalhe).toEqual(["Outro"]);
    expect(efetivo(cfg, PREPARAR).campos.find((c) => c.k === "presentes")?.detalhe).toEqual(["Outra pessoa"]);
    expect(efetivo(cfg, ORIGEM).campos.find((c) => c.k === "c_canal")?.detalhe).toEqual(["Outro"]);
  });

  it("no formulário, a caixa só aparece com a opção escolhida, e o que se escreve grava-se em <campo>_detalhe", () => {
    const grupo: Grupo = efetivo(lerCfgCampos({ "Preparar a visita": { detalhes: { presentes: ["Outra pessoa"] } } }), PREPARAR);
    const campo = vi.fn();
    const d = { id: 9, f: { presentes: "O casal" }, sug: {} } as unknown as Negocio;
    const { rerender } = render(<Campos grupo={grupo} d={d} A={{ campo } as never} run={(fn) => fn()} simples />);
    expect(screen.queryByLabelText("Quem vai estar: mais detalhe")).toBeNull();
    d.f.presentes = "Outra pessoa";
    rerender(<Campos grupo={grupo} d={{ ...d }} A={{ campo } as never} run={(fn) => fn()} simples />);
    const caixa = screen.getByLabelText("Quem vai estar: mais detalhe");
    fireEvent.blur(caixa, { target: { value: "A vizinha, que tem a chave" } });
    expect(campo).toHaveBeenCalledWith(9, "presentes_detalhe", "A vizinha, que tem a chave");
  });
});
