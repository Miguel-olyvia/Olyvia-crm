// Um teste de arranque por ecrã: cada peça abre sem erro com os dados de exemplo.
// A página não grava nada, por isso não se testam cliques ao detalhe.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AcoesNegocio } from "./AcoesNegocio";
import { ComparacaoNegocios } from "./ComparacaoNegocios";
import { ListaNegocios } from "./ListaNegocios";
import { PainelNegocio } from "./PainelNegocio";
import { QuadroNegocios } from "./QuadroNegocios";
import { SEM_FILTROS, totaisPorFase } from "./logicaQuadro";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { ordenarNegocios } from "./ordenacaoQuadro";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => {
          texto = texto.replace(`{${k}}`, String(v));
        });
        return texto;
      },
    }),
  };
});

const { negocios } = DADOS_EXEMPLO;
const hoje = HOJE_EXEMPLO;
const ordenados = ordenarNegocios(negocios, null, hoje);
const acoes: AcoesNegocio = {
  abrirNegocio: vi.fn(), abrirPessoa: vi.fn(), criarOrcamento: vi.fn(), copiarContacto: vi.fn(),
};
const noRouter = (ui: JSX.Element) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("arranque dos ecrãs", () => {
  it("Quadro: quatro colunas, um cartão por negócio e botões de ação fora do botão principal", () => {
    render(
      <QuadroNegocios
        negocios={ordenados} hoje={hoje} fases={[]} ocultarComercial={false} selecionados={new Set()}
        acoes={acoes} aoAbrir={vi.fn()} aoAlternarSelecao={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    const principal = screen.getByRole("button", { name: /^Tiago Rocha · / });
    expect(principal.querySelector("button")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Abrir pessoa:/ })).toHaveLength(10);
    expect(screen.getAllByRole("checkbox")).toHaveLength(10);
  });

  it("Lista: tabela com cabeçalhos, linhas expansíveis e rodapé com totais", () => {
    render(
      <ListaNegocios
        negocios={ordenados} hoje={hoje} ordem={null} totaisFase={totaisPorFase(negocios, SEM_FILTROS, hoje)}
        ocultarComercial={false} selecionados={new Set()} acoes={acoes}
        aoMudarOrdem={vi.fn()} aoAbrir={vi.fn()} aoAlternarSelecao={vi.fn()}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    const expansores = screen.getAllByRole("button", { name: /^Detalhe de/ });
    expect(expansores).toHaveLength(10);
    expect(expansores[0]).toHaveAttribute("aria-expanded", "false");
    expect(expansores[0]).toHaveAttribute("aria-controls");
    expect(screen.getByText(/Total visível/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expandir tudo" })).toBeInTheDocument();
  });

  it("Painel aberto: resumo, quatro ações e a cadeia", () => {
    noRouter(<PainelNegocio negocio={negocios[9]} hoje={hoje} acoes={acoes} aoFechar={vi.fn()} />);
    const painel = screen.getByRole("dialog");
    expect(within(painel).getByRole("link", { name: "Abrir negócio" })).toHaveAttribute("href", "/deals?open=n10");
    expect(within(painel).getByRole("button", { name: "Criar orçamento" })).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: "Copiar contacto" })).toBeInTheDocument();
    expect(within(painel).getByRole("list", { name: "Cadeia do negócio" })).toBeInTheDocument();
  });

  it("Comparação com 2 negócios: tabela real com a melhor célula marcada por texto", () => {
    const dois = [negocios[8], negocios[5]];
    render(<ComparacaoNegocios negocios={dois} hoje={hoje} aberta aoFechar={vi.fn()} />);
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(tabela).getAllByRole("rowheader")).toHaveLength(11);
    expect(within(tabela).getByText("Maior valor")).toBeInTheDocument();
    expect(within(tabela).getByText("Mais parado")).toBeInTheDocument();
  });
});
