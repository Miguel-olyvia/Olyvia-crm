// 4/11 (Rúben): «quando o Outro é selecionado, abrir uma caixa de texto para escrever (o workflow tem de ter esse check em cada campo)»
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CONTACTO, LEAD, efetivo, type Grupo } from "./campos";
import { Campos } from "./CamposFase";
import { lerCfgCampos } from "./real/camposConfig";
import type { Negocio } from "./motor";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const QUALIFICACAO = CONTACTO.find((g) => g.titulo === "Qualificação")!;
const PEDIDO = LEAD.find((g) => g.titulo === "Pedido")!;

describe("as opções que pedem mais detalhe", () => {
  it("o editor guarda-as por campo; ao ler, ficam só as opções que o campo tem", () => {
    const cfg = lerCfgCampos({
      Qualificação: { detalhes: { posse: ["Administração", "não existe"], poder_decisao: ["x"] } },
      Pedido: { novos: [{ k: "c_canal", l: "Canal", t: "escolha", op: ["Feira", "Outro"], detalhe: ["Outro", "Rádio"] }] },
    });
    expect(cfg.Qualificação.detalhes).toEqual({ posse: ["Administração"] });
    expect(cfg.Pedido.novos?.[0].detalhe).toEqual(["Outro"]);
    expect(efetivo(cfg, QUALIFICACAO).campos.find((c) => c.k === "posse")?.detalhe).toEqual(["Administração"]);
    expect(efetivo(cfg, PEDIDO).campos.find((c) => c.k === "c_canal")?.detalhe).toEqual(["Outro"]);
  });

  it("no formulário, a caixa só aparece com a opção escolhida, e o que se escreve grava-se em <campo>_detalhe", () => {
    const grupo: Grupo = efetivo(lerCfgCampos({ Qualificação: { detalhes: { posse: ["Administração"] } } }), QUALIFICACAO);
    const campo = vi.fn();
    const d = { id: 9, f: { posse: "Proprietário" }, sug: {} } as unknown as Negocio;
    const { rerender } = render(<Campos grupo={grupo} d={d} A={{ campo } as never} run={(fn) => fn()} simples />);
    expect(screen.queryByLabelText("O cliente é: mais detalhe")).toBeNull();
    d.f.posse = "Administração";
    rerender(<Campos grupo={grupo} d={{ ...d }} A={{ campo } as never} run={(fn) => fn()} simples />);
    const caixa = screen.getByLabelText("O cliente é: mais detalhe");
    fireEvent.blur(caixa, { target: { value: "Condomínio da Rua A, administrado pela Gestão X" } });
    expect(campo).toHaveBeenCalledWith(9, "posse_detalhe", "Condomínio da Rua A, administrado pela Gestão X");
  });
});
