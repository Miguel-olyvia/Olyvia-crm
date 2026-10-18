// Um teste de arranque por ecrã: cada peça abre sem erro com os dados de exemplo.
// A página não grava nada, por isso não se testam cliques ao detalhe.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DadosPessoaPainel } from "@/components/ficha-comum/dadosPessoaPainel";
import type { AcoesNegocio } from "./AcoesNegocio";
import { ComparacaoNegocios } from "./ComparacaoNegocios";
import { ListaNegocios } from "./ListaNegocios";
import { PainelNegocio } from "./PainelNegocio";
import { QuadroNegocios } from "./QuadroNegocios";
import { SEM_FILTROS, totaisPorFase } from "./logicaQuadro";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { ordenarNegocios } from "./ordenacaoQuadro";
import { DadosPainelProvider } from "./useDadosPainel";

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
  abrirPessoa: vi.fn(), criarOrcamento: vi.fn(),
};
const noRouter = (ui: JSX.Element) => render(<MemoryRouter>{ui}</MemoryRouter>);

/** A ficha e os detalhes do painel, com dados literais (o painel não os vai buscar a lado nenhum). */
const PESSOA_DO_PAINEL: DadosPessoaPainel = {
  id: "p-vasco", nome: "Vasco Pinto", papel: "lead", etapa: "qualificada", origem: "indicacao", empresa: null,
  ultimoContactoDias: 4, comercial: "Ana Ribeiro", desde: "2026-08-11", telefone: "919 012 308", email: "vasco.pinto@exemplo.pt",
  morada: "Rua do Castelo 2, 3500-120 Viseu", distrito: "Viseu",
};
const comDados = (ui: JSX.Element) => (
  <DadosPainelProvider
    pessoaDe={(id) => (id === "p-vasco" ? PESSOA_DO_PAINEL : null)}
    detalheDe={(id) => (id === "n10" ? { orcamentos: { "n10-o1": { data: "2026-09-30", estado: "aceite", linhas: [{ descricao: "Obra (exemplo)", valor: 24000 }] } } } : null)}
  >
    {ui}
  </DadosPainelProvider>
);

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

  it("Painel aberto: cabeçalho, separadores, as ações (abrir a pessoa, criar orçamento e perder; sem Copiar contacto nem ligação à base) e a cadeia no Resumo", () => {
    noRouter(comDados(<PainelNegocio negocio={negocios[9]} hoje={hoje} acoes={acoes} aoFechar={vi.fn()} />));
    const painel = screen.getByRole("dialog", { name: "Vasco Pinto" });
    expect(within(painel).getByRole("heading", { name: "Vasco Pinto" })).toBeVisible();
    const abas = within(painel).getByRole("tablist", { name: "Secções do negócio" });
    expect(within(abas).getAllByRole("tab").map((a) => a.textContent)).toEqual([
      "Resumo", "Pessoa", "Orçamentos2, 2", "Proposta", "Contrato",
    ]);
    expect(within(abas).getByRole("tab", { name: /^Resumo$/ })).toHaveAttribute("aria-selected", "true");
    const barra = within(painel).getByRole("group", { name: "Ações do negócio" });
    expect(within(barra).queryByRole("link", { name: "Abrir negócio" })).not.toBeInTheDocument();
    expect(within(barra).getByRole("link", { name: "Abrir pessoa" })).toHaveAttribute("href", "/pessoas?open=p-vasco");
    expect(within(barra).getByRole("button", { name: "Criar orçamento" })).toBeInTheDocument();
    expect(within(barra).getAllByRole("link")).toHaveLength(1);
    expect(within(barra).getByRole("button", { name: "Perder negócio" })).toBeInTheDocument();
    expect(within(barra).getAllByRole("button")).toHaveLength(2);
    expect(within(painel).queryByRole("button", { name: "Copiar contacto" })).not.toBeInTheDocument();
    expect(within(painel).getByRole("list", { name: "Cadeia do negócio" })).toBeInTheDocument();
    expect(within(painel).getByText(/^Se ganho:/)).toBeInTheDocument();
  });

  it("Painel sem pessoa nem detalhes: abre com os estados vazios, sem Proposta nem Contrato quando o negócio não os tem", () => {
    noRouter(<PainelNegocio negocio={negocios[7]} hoje={hoje} acoes={acoes} aoFechar={vi.fn()} />);
    const abas = within(screen.getByRole("dialog")).getByRole("tablist");
    expect(within(abas).getAllByRole("tab")).toHaveLength(3);
    expect(within(abas).queryByRole("tab", { name: /Proposta|Contrato/ })).not.toBeInTheDocument();
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
