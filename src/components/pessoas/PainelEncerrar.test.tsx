// «Encerrar a abordagem»: o painel da ficha que fecha a abordagem de uma pessoa sem criar negócio (sem interesse, ou obra inviável).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { pessoaBase, resumoBase } from "./fabricaTestes";
import type { AcoesFicha } from "./PainelBase";
import { PainelEncerrar } from "./PainelEncerrar";

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

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function montar() {
  const acoes = { encerrar: vi.fn() } as unknown as AcoesFicha & { encerrar: ReturnType<typeof vi.fn> };
  const aoConcluir = vi.fn();
  const aoFechar = vi.fn();
  const aoMudarConteudo = vi.fn();
  const pessoa = pessoaBase("a", { nome: "Ana" });
  render(
    <PainelEncerrar
      id="p" titulo="Encerrar a abordagem" ativo pessoa={pessoa} resumo={resumoBase(pessoa)} hoje="2026-10-13" acoes={acoes}
      aoFechar={aoFechar} aoConcluir={aoConcluir} aoMudarConteudo={aoMudarConteudo}
    />,
  );
  return { acoes, aoConcluir, aoFechar, aoMudarConteudo };
}

const confirmar = () => screen.getByRole("button", { name: "Encerrar abordagem" });

describe("PainelEncerrar", () => {
  it("explica que não se cria negócio e pede como terminou e o motivo", () => {
    montar();
    expect(screen.getByText(/Não se cria negócio/)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Como terminou" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sem interesse" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Obra inviável" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Motivo" })).toBeInTheDocument();
  });

  it("o foco inicial vai para Cancelar (a ação é grave) e o botão de confirmar diz o que falta, sem fazer nada", () => {
    const { acoes } = montar();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(confirmar()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(confirmar());
    expect(acoes.encerrar).not.toHaveBeenCalled();
  });

  it("com o resultado e o motivo da lista, encerra e avisa o leitor de ecrã", () => {
    const { acoes, aoConcluir } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Obra inviável" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo" }), { target: { value: "preco" } });
    fireEvent.click(confirmar());
    expect(acoes.encerrar).toHaveBeenCalledExactlyOnceWith("a", { resultado: "obraInviavel", motivo: "preco", motivoOutro: undefined });
    expect(aoConcluir).toHaveBeenCalledExactlyOnceWith("Abordagem de Ana encerrada");
  });

  it("o motivo «Outro» pede o texto: sem ele não encerra; com ele leva-o aparado", () => {
    const { acoes } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Sem interesse" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo" }), { target: { value: "outro" } });
    fireEvent.click(confirmar());
    expect(acoes.encerrar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Escreva o motivo" }), { target: { value: "  Prédio em ruínas " } });
    fireEvent.click(confirmar());
    expect(acoes.encerrar).toHaveBeenCalledExactlyOnceWith("a", { resultado: "semInteresse", motivo: "outro", motivoOutro: "Prédio em ruínas" });
  });

  it("diz à ficha quando há algo escrito (o primeiro Esc avisa antes de descartar)", () => {
    const { aoMudarConteudo } = montar();
    expect(aoMudarConteudo).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("radio", { name: "Sem interesse" }));
    expect(aoMudarConteudo).toHaveBeenLastCalledWith(true);
  });

  it("Cancelar fecha sem encerrar", () => {
    const { acoes, aoFechar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(acoes.encerrar).not.toHaveBeenCalled();
  });
});
