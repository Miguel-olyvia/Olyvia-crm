// "E agora?" da chamada: o seletor de pedido só aparece com a visita escolhida e mais de um pedido ainda sem visita, e a escolha vai para
// os dados da chamada.
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { pedidoBase, pessoaBase, resumoBase } from "./fabricaTestes";
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

const CANDIDATOS = [pedidoBase("pd-1", { servico: "Cozinha" }), pedidoBase("pd-2", { servico: "", contactado: true })];
const mostrar = (extra: Partial<Parameters<typeof ProximoPassoChamada>[0]> = {}) => {
  const aoEscolherPedido = vi.fn();
  render(
    <ProximoPassoChamada
      resultado="atendeuInteressado" passos={["marcarVisita", "ligarAmanha", "nenhum"]} valor="marcarVisita" aoEscolher={vi.fn()}
      candidatos={CANDIDATOS} pedidoId="pd-1" aoEscolherPedido={aoEscolherPedido} {...extra}
    />,
  );
  return aoEscolherPedido;
};

describe("ProximoPassoChamada: o seletor de pedido", () => {
  it("com a visita escolhida e dois pedidos sem visita, pergunta a que pedido vai, com o serviço e a fase de cada um", () => {
    mostrar();
    const grupo = screen.getByRole("radiogroup", { name: "A que pedido se refere a visita?" });
    expect(within(grupo).getAllByRole("radio")).toHaveLength(2);
    expect(within(grupo).getByRole("radio", { name: /Cozinha/ })).toBeChecked();
    expect(within(grupo).getByRole("radio", { name: /Pedido de 01\/10\/2026/ })).not.toBeChecked();
    expect(within(grupo).getByText("Contactado")).toBeInTheDocument();
  });

  it("escolher o outro pedido avisa quem usa o seletor", () => {
    const aoEscolherPedido = mostrar();
    fireEvent.click(screen.getByRole("radio", { name: /Pedido de 01\/10\/2026/ }));
    expect(aoEscolherPedido).toHaveBeenCalledExactlyOnceWith("pd-2");
  });

  it("com um só pedido sem visita não há seletor (não há nada a escolher)", () => {
    mostrar({ candidatos: [CANDIDATOS[0]] });
    expect(screen.queryByRole("radiogroup", { name: "A que pedido se refere a visita?" })).not.toBeInTheDocument();
  });

  it("com outro passo escolhido não há seletor", () => {
    mostrar({ valor: "ligarAmanha" });
    expect(screen.queryByRole("radiogroup", { name: "A que pedido se refere a visita?" })).not.toBeInTheDocument();
  });

  it("o nome acessível de cada cartão separa o pedido da fase com uma vírgula (só para leitores de ecrã)", () => {
    mostrar();
    expect(screen.getByRole("radio", { name: /Cozinha, Por contactar/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Pedido de 01\/10\/2026, Contactado/ })).toBeInTheDocument();
  });

  it("com um só pedido sem visita não há seletor, mas diz em que pedido fica a visita", () => {
    mostrar({ candidatos: [CANDIDATOS[0]] });
    expect(screen.queryByRole("radiogroup", { name: "A que pedido se refere a visita?" })).not.toBeInTheDocument();
    expect(screen.getByText("A visita fica no pedido Cozinha")).toBeInTheDocument();
  });

  it("com outro passo escolhido, ou sem candidatos, não diz onde fica a visita", () => {
    mostrar({ valor: "ligarAmanha" });
    expect(screen.queryByText(/A visita fica no pedido/)).not.toBeInTheDocument();
    cleanup();
    mostrar({ candidatos: [] });
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

  it("sem candidatos (o pedido vem do item) não há seletor", () => {
    mostrar({ candidatos: [] });
    expect(screen.queryByRole("radiogroup", { name: "A que pedido se refere a visita?" })).not.toBeInTheDocument();
  });
});

describe("dadosDaChamada: o pedido da visita", () => {
  const resumo = resumoBase(pessoaBase("a"), [], "2026-10-13", "lead", CANDIDATOS);
  const campos = (extra: Partial<CamposChamada> = {}): CamposChamada => ({
    resultado: "atendeuInteressado", nota: "", passo: "marcarVisita", data: "2026-10-16", hora: "10:00", destino: destinoInicial(null), motivo: "",
    pedidoId: "pd-2", ...extra,
  });

  it("a visita leva o pedido escolhido; sem pedido escolhido não leva (a pessoa não tem nenhum sem visita: cria-se um)", () => {
    expect(dadosDaChamada(campos(), resumo)).toMatchObject({ passo: "marcarVisita", pedidoId: "pd-2" });
    expect(dadosDaChamada(campos({ pedidoId: "" }), resumo)).not.toHaveProperty("pedidoId");
  });

  it("os outros passos não levam pedido", () => {
    expect(dadosDaChamada(campos({ passo: "ligarAmanha" }), resumo)).not.toHaveProperty("pedidoId");
    expect(dadosDaChamada(campos({ passo: "ligarData" }), resumo)).not.toHaveProperty("pedidoId");
  });
});
