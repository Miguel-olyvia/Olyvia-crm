// A estimativa pelo salario do cargo na tabela do modulo «Custos»: a marca «estimado» em texto, o motivo de quem fica sem
// valor (nunca 0,00) e o total do mes a dizer quantos sao estimados.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Table, TableBody } from "@/components/ui/table";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { montarLinhaCusto, totaisDaOrganizacao, type ContextoCusto, type LinhaCusto, type PessoaParaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { CabecalhoTotais } from "./CabecalhoTotais";
import { LinhaTabelaCusto } from "./LinhaTabelaCusto";

vi.mock("./ItensDoMes", () => ({ ItensDoMes: () => null }));

const CONTEXTO: ContextoCusto = { mes: "2026-09", avulsos: [], equipamentos: [], definicoes: { taxaEmpresa: 23.75, seguro: 5, valorPorKm: 0.4, ajudaPorDia: 25 }, excecoes: {} };
const pessoa = (extra: Partial<PessoaParaCusto> = {}): PessoaParaCusto => ({
  pessoaId: "p1", nome: "Ines Cardoso", cargo: "Gerente", centroId: null, centro: "Loja Porto", filialId: null, filial: "Filial Porto", tipoContrato: null, retribuicaoMes: 1500, horasSemanais: 40, ...extra,
});
const linha = (extra: Partial<PessoaParaCusto> = {}): LinhaCusto => montarLinhaCusto(pessoa(extra), CONTEXTO);

const renderLinha = (l: LinhaCusto) =>
  render(
    <LanguageProvider>
      <Table><TableBody><LinhaTabelaCusto linha={l} expandida={false} aoAbrir={vi.fn()} aoAlternar={vi.fn()} /></TableBody></Table>
    </LanguageProvider>,
  );

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
});

describe("LinhaTabelaCusto: estimativa pelo cargo", () => {
  it("com retribuicao nao aparece a marca «estimado»", () => {
    renderLinha(linha());
    expect(screen.queryByText(/estimado/i)).not.toBeInTheDocument();
  });

  it("com estimativa o valor leva a marca «estimado» em texto e continua a contar", () => {
    const l = linha({ estimadoPeloCargo: { cargo: "Gerente", salario: 1500 } });
    renderLinha(l);
    expect(screen.getByText("estimado")).toBeInTheDocument();
    expect(screen.getAllByText(/1500,00|1\s?500,00/).length).toBeGreaterThan(0);
    expect(l.total).not.toBeNull();
  });

  it("sem retribuicao e sem cargo mostra «Sem valor» e o motivo em texto, nunca 0,00", () => {
    const { container } = renderLinha(linha({ retribuicaoMes: null, razaoSemValor: "sem_cargo" }));
    expect(screen.getByText("Sem retribuição e sem cargo atribuído")).toBeInTheDocument();
    const celulas = Array.from(container.querySelectorAll("td")).map((c) => c.textContent ?? "");
    // retribuicao, encargos, seguro e total: nenhum e 0,00 (os avulsos a 0 sao um zero verdadeiro, nao se mexe).
    for (const i of [2, 3, 6, 7]) expect(celulas[i]).not.toMatch(/0,00/);
    expect(celulas[3]).toMatch(/Sem valor/);
    expect(celulas[6]).toMatch(/Sem valor/);
  });

  it("cargo com salario que nao e mensal diz porque nao se estima", () => {
    renderLinha(linha({ retribuicaoMes: null, razaoSemValor: "nao_mensal" }));
    expect(screen.getByText(/salário do cargo não é mensal/)).toBeInTheDocument();
  });

  it("cada razao tem o seu texto: sem periodo, mes passado e falha a ler o salario do cargo", () => {
    const casos = [
      ["sem_periodo", "Sem retribuição nem salário no cargo"],
      ["mes_passado", "Mês passado: sem retribuição registada; o salário do cargo pode ter sido outro"],
      ["erro_periodos", "Não foi possível ler o salário do cargo"],
    ] as const;
    for (const [razao, texto] of casos) {
      cleanup();
      renderLinha(linha({ retribuicaoMes: null, razaoSemValor: razao }));
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("em ingles a marca e o motivo tambem", () => {
    window.localStorage.setItem("language", "en");
    renderLinha(linha({ estimadoPeloCargo: { cargo: "Gerente", salario: 1500 } }));
    expect(screen.getByText("estimated")).toBeInTheDocument();
    cleanup();
    renderLinha(linha({ retribuicaoMes: null, razaoSemValor: "sem_cargo" }));
    expect(screen.getByText("No pay and no job assigned")).toBeInTheDocument();
  });
});

describe("CabecalhoTotais: estimados", () => {
  it("o total conta quem tem estimativa e diz quantos sao", () => {
    const linhas = [linha(), linha({ pessoaId: "p2", estimadoPeloCargo: { cargo: "Gerente", salario: 1500 } }), linha({ pessoaId: "p3", estimadoPeloCargo: { cargo: "Gerente", salario: 1500 } })];
    render(<LanguageProvider><CabecalhoTotais totais={totaisDaOrganizacao(linhas)} /></LanguageProvider>);
    const total = screen.getByTestId("rhcustos-total-total").closest("div")!;
    expect(within(total).getByText(/2 estimados pelo salário do cargo/)).toBeInTheDocument();
    expect(screen.getByTestId("rhcustos-total-retribuicao").textContent).toMatch(/4\s?500,00/);
  });

  it("a retribuicao e os encargos tambem dizem «inclui N estimados»", () => {
    const linhas = [linha(), linha({ pessoaId: "p2", estimadoPeloCargo: { cargo: "Gerente", salario: 1500 } }), linha({ pessoaId: "p3", estimadoPeloCargo: { cargo: "Gerente", salario: 1500 } })];
    render(<LanguageProvider><CabecalhoTotais totais={totaisDaOrganizacao(linhas)} /></LanguageProvider>);
    for (const chave of ["retribuicao", "encargos"]) {
      const cartao = screen.getByTestId(`rhcustos-total-${chave}`).closest("div")!;
      expect(within(cartao).getByText("inclui 2 estimados")).toBeInTheDocument();
    }
    for (const chave of ["avulsos", "equipamentos", "pessoas"]) {
      expect(within(screen.getByTestId(`rhcustos-total-${chave}`).closest("div")!).queryByText(/inclui/)).not.toBeInTheDocument();
    }
  });

  it("sem estimados nao acrescenta a nota", () => {
    render(<LanguageProvider><CabecalhoTotais totais={totaisDaOrganizacao([linha()])} /></LanguageProvider>);
    expect(screen.queryByText(/estimados pelo salário do cargo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/inclui/)).not.toBeInTheDocument();
  });
});
