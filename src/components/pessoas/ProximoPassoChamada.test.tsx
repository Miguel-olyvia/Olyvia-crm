// "E agora?" da chamada: os cartões de escolha única dos próximos passos e os dados que a chamada leva. Não há pedidos: a visita marcada na
// chamada é da pessoa, por isso não há nada a escolher além do passo.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProximoPassoChamada } from "./ProximoPassoChamada";
import { dadosDaChamada, type CamposChamada } from "./useFormChamada";
import { destinoInicial } from "./moradaVisita";

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

const mostrar = (extra: Partial<Parameters<typeof ProximoPassoChamada>[0]> = {}) => {
  const aoEscolher = vi.fn();
  render(
    <ProximoPassoChamada
      resultado="atendeuInteressado" passos={["marcarVisita", "ligarAmanha", "nenhum"]} valor="marcarVisita" aoEscolher={aoEscolher} {...extra}
    />,
  );
  return aoEscolher;
};

describe("ProximoPassoChamada", () => {
  it("mostra um cartão por passo que cabe, com o recomendado marcado em texto", () => {
    mostrar();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /Marcar visita/ })).toBeChecked();
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
  });

  it("escolher outro passo avisa quem usa o componente", () => {
    const aoEscolher = mostrar();
    fireEvent.click(screen.getByRole("radio", { name: /Ligar amanhã/ }));
    expect(aoEscolher).toHaveBeenCalledExactlyOnceWith("ligarAmanha");
  });

  it("nunca pergunta a que pedido vai a visita: a visita é da pessoa", () => {
    mostrar();
    expect(screen.queryByRole("radiogroup", { name: "A que pedido se refere a visita?" })).not.toBeInTheDocument();
    expect(screen.queryByText(/A visita fica no pedido/)).not.toBeInTheDocument();
  });

  it("antes de escolher como correu, o grupo «E agora?» não tem rádios e por isso é um grupo, não um grupo de rádio", () => {
    mostrar({ resultado: null, passos: [] });
    expect(screen.queryByRole("radiogroup", { name: "E agora?" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "E agora?" })).toBeInTheDocument();
  });

  it("com rádios, «E agora?» é um grupo de rádio", () => {
    mostrar();
    expect(screen.getByRole("radiogroup", { name: "E agora?" })).toBeInTheDocument();
  });
});

describe("dadosDaChamada", () => {
  const campos = (extra: Partial<CamposChamada> = {}): CamposChamada => ({
    resultado: "atendeuInteressado", nota: "", passo: "marcarVisita", data: "2026-10-16", hora: "10:00", destino: destinoInicial(null), motivo: "",
    motivoOutro: "", ...extra,
  });

  it("a visita leva o dia, a hora e a morada; não leva pedido", () => {
    const dados = dadosDaChamada(campos());
    expect(dados).toMatchObject({ passo: "marcarVisita", data: "2026-10-16", hora: "10:00" });
    expect(dados).not.toHaveProperty("pedidoId");
  });

  it("ligar numa data leva o dia e a hora; os outros passos só a nota", () => {
    expect(dadosDaChamada(campos({ passo: "ligarData" }))).toEqual({ resultado: "atendeuInteressado", nota: "", passo: "ligarData", data: "2026-10-16", hora: "10:00" });
    expect(dadosDaChamada(campos({ passo: "ligarAmanha" }))).toEqual({ resultado: "atendeuInteressado", nota: "", passo: "ligarAmanha" });
  });

  it("encerrar a abordagem leva o motivo da lista; sem motivo não há dados", () => {
    expect(dadosDaChamada(campos({ resultado: "semInteresse", passo: "perder", motivo: "preco" }))).toMatchObject({ passo: "perder", motivo: "preco" });
    expect(dadosDaChamada(campos({ resultado: "semInteresse", passo: "perder" }))).toBeNull();
  });

  it("o motivo «outro» leva o texto aparado; sem texto não há dados", () => {
    const dados = dadosDaChamada(campos({ resultado: "semInteresse", passo: "perder", motivo: "outro", motivoOutro: "  Mudou de casa " }));
    expect(dados).toMatchObject({ motivo: "outro", motivoOutro: "Mudou de casa" });
    expect(dadosDaChamada(campos({ resultado: "semInteresse", passo: "perder", motivo: "outro", motivoOutro: "  " }))).toBeNull();
  });

  it("sem resultado escolhido não há dados", () => {
    expect(dadosDaChamada(campos({ resultado: null }))).toBeNull();
  });
});
