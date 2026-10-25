import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { CHAVE_PREFS_PESSOAS } from "../preferenciasPessoas";
import { SeparadorPessoas } from "../SeparadorPessoas";
import { usePessoasEstado } from "../usePessoasEstado";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});

function Arnes({ aoAbrir = vi.fn() }: { aoAbrir?: (id: string) => void }) {
  const e = usePessoasEstado(false);
  return (
    <SeparadorPessoas
      resumos={e.resumos} pendentes={e.pendentes} tipo={e.prefs.tipo} chip={e.prefs.chip} ordem={e.prefs.ordem} vista={e.prefs.vista}
      hoje={HOJE_EXEMPLO} comVoltou={false} aoMudarTipo={e.mudarTipo} aoMudarChip={e.mudarChip} aoMudarOrdem={e.mudarOrdem} aoMudarVista={e.mudarVista}
      aoAbrir={aoAbrir} aoMudarVisiveis={vi.fn()}
    />
  );
}

const procurar = (texto: string) =>
  fireEvent.change(screen.getByLabelText("Procurar pessoas por nome, telefone ou localidade"), { target: { value: texto } });
const abrirQuadro = () => fireEvent.click(screen.getByRole("button", { name: "Quadro" }));
const botoesDeFicha = () => screen.queryAllByRole("button", { name: /^Abrir a ficha de / });

beforeEach(() => window.localStorage.clear());

describe("SeparadorPessoas: Lista", () => {
  it("por defeito mostra a tabela com as 34 pessoas e nenhum quadro", () => {
    render(<Arnes />);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1 + 34);
    expect(screen.queryByRole("group", { name: "Pessoas por fase" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a pesquisa continua a filtrar a tabela", () => {
    render(<Arnes />);
    procurar("Hugo");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1 + 1);
  });
});

describe("SeparadorPessoas: Quadro", () => {
  it("trocar para Quadro mostra as 3 colunas de abordagem e a coluna Negócio (sem sub-fases) e tira a tabela", () => {
    render(<Arnes />);
    abrirQuadro();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Quadro" })).toHaveAttribute("aria-pressed", "true");
    expect(botoesDeFicha().length).toBeGreaterThan(0);
  });

  it("abre na vista guardada", () => {
    window.localStorage.setItem(CHAVE_PREFS_PESSOAS, JSON.stringify({ vista: "quadro" }));
    render(<Arnes />);
    expect(screen.getAllByRole("region")).toHaveLength(4);
  });

  it("a pesquisa filtra o quadro: só ficam os cartões de quem coincide", () => {
    render(<Arnes />);
    abrirQuadro();
    const antes = botoesDeFicha().length;
    procurar("Hugo");
    const nomes = botoesDeFicha().map((b) => b.textContent);
    expect(nomes.length).toBeGreaterThan(0);
    expect(nomes.length).toBeLessThan(antes);
    expect(new Set(nomes)).toEqual(new Set(["Hugo Teixeira"]));
  });

  it("o tipo Clientes filtra o quadro: só cartões com o rótulo Cliente", () => {
    render(<Arnes />);
    abrirQuadro();
    fireEvent.click(screen.getByRole("button", { name: /^Clientes/ }));
    expect(botoesDeFicha().length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Lead")).toHaveLength(0);
    expect(screen.getAllByText("Cliente").length).toBeGreaterThan(0);
  });

  it("o tipo Leads filtra o quadro: nenhum cartão de Cliente", () => {
    render(<Arnes />);
    abrirQuadro();
    fireEvent.click(screen.getByRole("button", { name: /^Leads/ }));
    expect(botoesDeFicha().length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Cliente")).toHaveLength(0);
  });

  it("uma pesquisa sem resultados deixa as 3 colunas e a coluna Negócio com 'Nada nesta fase'", () => {
    render(<Arnes />);
    abrirQuadro();
    procurar("zzzz-ninguem");
    expect(botoesDeFicha()).toHaveLength(0);
    expect(screen.getAllByText("Nada nesta fase")).toHaveLength(4);
  });

  it("os atalhos j/k movem o foco entre os cartões pela ordem do DOM e o 'o' abre a ficha", () => {
    const aoAbrir = vi.fn();
    render(<Arnes aoAbrir={aoAbrir} />);
    abrirQuadro();
    const botoes = botoesDeFicha();
    expect(botoes.length).toBeGreaterThan(2);
    botoes[0].focus();
    fireEvent.keyDown(botoes[0], { key: "j" });
    expect(botoes[1]).toHaveFocus();
    fireEvent.keyDown(botoes[1], { key: "ArrowDown" });
    expect(botoes[2]).toHaveFocus();
    fireEvent.keyDown(botoes[2], { key: "k" });
    expect(botoes[1]).toHaveFocus();
    fireEvent.keyDown(botoes[1], { key: "o" });
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith(botoes[1].getAttribute("data-linha-pessoa"));
  });

  it("o chip Perdidas deixa o quadro sem cartões, explica porquê, e 'Limpar filtros' repõe-nos", () => {
    render(<Arnes />);
    abrirQuadro();
    fireEvent.click(screen.getByRole("button", { name: /^Perdidas/ }));
    expect(botoesDeFicha()).toHaveLength(0);
    expect(screen.getByText(/ficam na ficha e na lista/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(botoesDeFicha().length).toBeGreaterThan(0);
    expect(screen.queryByText(/ficam na ficha e na lista/)).not.toBeInTheDocument();
  });

  it("uma pesquisa sem resultados mostra o aviso com 'Limpar filtros'", () => {
    render(<Arnes />);
    abrirQuadro();
    procurar("zzzz-ninguem");
    expect(screen.getByText("Nenhuma pessoa com estes filtros")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeInTheDocument();
  });

  it("o anúncio de vista (role=status) está sempre presente e muda ao trocar de vista", () => {
    render(<Arnes />);
    expect(screen.getByRole("status")).toHaveTextContent("Vista Lista");
    abrirQuadro();
    expect(screen.getByRole("status")).toHaveTextContent("Vista Quadro, 4 colunas");
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.getByRole("status")).toHaveTextContent("Vista Lista");
  });

  it("voltar a Lista repõe a tabela com o mesmo filtro", () => {
    render(<Arnes />);
    abrirQuadro();
    procurar("Hugo");
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1 + 1);
  });
});
