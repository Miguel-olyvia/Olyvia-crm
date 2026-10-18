// «Perder negócio» (em qualquer fase, com motivo) e «Anular perda»: mudam o negócio em memória e deixam-no onde estava.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BotaoAnularPerda, BotaoPerderNegocio } from "./BotoesPerda";
import { faseDoNegocio, type NegocioMes } from "./negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { alteracoesAtuais, negociosDoQuadro, perdaDoNegocio, repor } from "./negociosAlterados";
import { PerderNegocioDialogo } from "./PerderNegocioDialogo";
import { MOTIVO_OUTRO } from "./perdaNegocio";
import { MOTIVOS_PREDEFINIDOS } from "./workflowNegocio";

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

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); repor(); });

const emProposta = DADOS_EXEMPLO.negocios.find((n) => faseDoNegocio(n) === "proposta")!;
const emOrcamento = DADOS_EXEMPLO.negocios.find((n) => faseDoNegocio(n) === "orcamento")!;

const montar = (negocio: NegocioMes = emProposta) => {
  const aoFechar = vi.fn();
  const aoPerder = vi.fn();
  render(<PerderNegocioDialogo negocio={negocio} hoje={HOJE_EXEMPLO} motivos={MOTIVOS_PREDEFINIDOS} aoFechar={aoFechar} aoPerder={aoPerder} />);
  return { aoFechar, aoPerder };
};
const confirmar = () => fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
const escolher = (valor: string) => fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: valor } });

describe("PerderNegocioDialogo", () => {
  it("diz o negócio e a fase em que se perde, e oferece os motivos da lista do Workflow mais «Outro»", () => {
    montar();
    const dialogo = screen.getByRole("dialog", { name: "Perder o negócio" });
    expect(dialogo).toHaveTextContent(emProposta.pessoa);
    expect(dialogo).toHaveTextContent("fase Proposta");
    const opcoes = Array.from(screen.getByRole("combobox", { name: "Motivo da perda" }).querySelectorAll("option")).map((o) => o.textContent);
    expect(opcoes).toEqual(["Escolha um motivo", "Preço", "Concorrência", "Sem resposta", "Adiou", "Outro"]);
  });

  it("sem motivo não perde: o erro diz-se em texto (a cor só no ícone) e o foco vai para o campo", () => {
    const { aoFechar } = montar();
    confirmar();
    const erro = screen.getByText("Escolha o motivo da perda.");
    expect(erro).toHaveClass("text-foreground");
    expect(erro).not.toHaveClass("text-destructive");
    expect(erro.querySelector("svg")).toHaveClass("text-destructive");
    expect(screen.getByRole("combobox", { name: "Motivo da perda" })).toHaveFocus();
    expect(perdaDoNegocio(emProposta.id)).toBeUndefined();
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("com um motivo da lista perde o negócio, guarda a fase em que estava, fecha e avisa DEPOIS (o aviso sai por `aoPerder`)", () => {
    const { aoFechar, aoPerder } = montar();
    escolher("Preço");
    confirmar();
    expect(perdaDoNegocio(emProposta.id)).toMatchObject({ motivo: "Preço", fase: "proposta", data: HOJE_EXEMPLO });
    expect(negociosDoQuadro(DADOS_EXEMPLO.negocios, alteracoesAtuais()).some((n) => n.id === emProposta.id)).toBe(false);
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(aoPerder).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Motivo: Preço"));
  });

  it("perde em qualquer fase: em Orçamento guarda «orcamento»", () => {
    montar(emOrcamento);
    escolher("Adiou");
    confirmar();
    expect(perdaDoNegocio(emOrcamento.id)).toMatchObject({ motivo: "Adiou", fase: "orcamento" });
  });

  it("«Outro» pede o texto: sem ele não perde; com ele guarda-o aparado", () => {
    montar();
    escolher(MOTIVO_OUTRO);
    confirmar();
    expect(screen.getByText("Escreva o motivo.")).toHaveClass("text-foreground");
    expect(perdaDoNegocio(emProposta.id)).toBeUndefined();
    fireEvent.change(screen.getByRole("textbox", { name: "Escreva o motivo" }), { target: { value: "  Mudou de casa " } });
    confirmar();
    expect(perdaDoNegocio(emProposta.id)?.motivo).toBe("Mudou de casa");
  });

  it("Cancelar fecha sem perder nada", () => {
    const { aoFechar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(perdaDoNegocio(emProposta.id)).toBeUndefined();
  });
});

describe("BotaoPerderNegocio e BotaoAnularPerda", () => {
  it("o botão abre o diálogo, e perder esconde o diálogo e deixa o aviso para quem o lê", () => {
    const aoPerder = vi.fn();
    render(<BotaoPerderNegocio negocio={emProposta} hoje={HOJE_EXEMPLO} aoPerder={aoPerder} />);
    fireEvent.click(screen.getByRole("button", { name: "Perder negócio" }));
    escolher("Concorrência");
    confirmar();
    expect(perdaDoNegocio(emProposta.id)?.motivo).toBe("Concorrência");
    expect(aoPerder).toHaveBeenCalledTimes(1);
  });

  it("Anular perda devolve o negócio ao quadro, na fase em que estava, e avisa", () => {
    const aoAnular = vi.fn();
    render(<BotaoPerderNegocio negocio={emProposta} hoje={HOJE_EXEMPLO} />);
    fireEvent.click(screen.getByRole("button", { name: "Perder negócio" }));
    escolher("Preço");
    confirmar();
    cleanup();
    render(<BotaoAnularPerda negocio={emProposta} aoAnular={aoAnular} />);
    fireEvent.click(screen.getByRole("button", { name: "Anular perda" }));
    expect(perdaDoNegocio(emProposta.id)).toBeUndefined();
    const doQuadro = negociosDoQuadro(DADOS_EXEMPLO.negocios, alteracoesAtuais()).find((n) => n.id === emProposta.id);
    expect(doQuadro && faseDoNegocio(doQuadro)).toBe("proposta");
    expect(aoAnular).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Perda anulada"));
  });
});
