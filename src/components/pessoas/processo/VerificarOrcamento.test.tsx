import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { novaLinhaDoCatalogo, type ChaveTrabalho } from "./catalogoTrabalhos";
import type { LinhaTrabalho } from "./orcamentoCalculo";
import type { OrcamentoDetalhado } from "./orcamentoDetalhado";
import type { FaltaProcesso } from "./portoesProcesso";
import type { NegocioDoPasso } from "./tiposProcesso";
import type { DadosDoOrcamento } from "./transicoes";
import { VerificarOrcamento } from "./VerificarOrcamento";

vi.mock("@/hooks/useTranslation", async () => (await import("@/test/traducoesPessoasTeste")).moduloDeTraducao());

beforeAll(prepararRadixNoJsdom);

const NEGOCIO: NegocioDoPasso = { id: "n1", nome: "Ana Silva", trabalho: "Cozinha" };

const linha = (trabalho: ChaveTrabalho, quantidade: number, precoUnitario?: number): LinhaTrabalho => ({
  ...novaLinhaDoCatalogo(trabalho, `l-${trabalho}`), quantidade, ...(precoUnitario === undefined ? {} : { precoUnitario }),
});
const orcamento = (linhas: LinhaTrabalho[], extra: Partial<OrcamentoDetalhado> = {}): OrcamentoDetalhado => ({
  orcamentoId: "o1", linhas, desconto: 0, vendaDireta: false, verificado: false, direcao: null, versao: 1, ...extra,
});

interface Extras { faltas?: FaltaProcesso[] }

function montar(inicial: OrcamentoDetalhado, extra: Extras = {}) {
  const faltas = extra.faltas ?? [];
  const aoAjustar = vi.fn((_d: DadosDoOrcamento): FaltaProcesso[] => faltas);
  const aoPedirDirecao = vi.fn((): FaltaProcesso[] => faltas);
  const aoVerificar = vi.fn((): FaltaProcesso[] => faltas);
  const aoEditar = vi.fn();
  const aoFechar = vi.fn();
  const aoDevolverFoco = vi.fn(() => false);
  const ui = (negocio: NegocioDoPasso | null, o: OrcamentoDetalhado) => (
    <VerificarOrcamento
      negocio={negocio} orcamento={o} aoAjustar={aoAjustar} aoPedirDirecao={aoPedirDirecao} aoVerificar={aoVerificar} aoEditar={aoEditar}
      explicar={(f) => `não: ${f.join(",")}`} aoFechar={aoFechar} aoDevolverFoco={aoDevolverFoco}
    />
  );
  const { rerender } = render(ui(NEGOCIO, inicial));
  return {
    aoAjustar, aoPedirDirecao, aoVerificar, aoEditar, aoFechar, aoDevolverFoco,
    mudar: (o: OrcamentoDetalhado) => rerender(ui(NEGOCIO, o)), fechar: () => rerender(ui(null, inicial)),
  };
}

const lista = () => screen.getByRole("list", { name: "Resultado da verificação" });
const botao = (nome: string | RegExp) => screen.getByRole("button", { name: nome });
const semBotao = (nome: string | RegExp) => expect(screen.queryByRole("button", { name: nome })).not.toBeInTheDocument();

describe("VerificarOrcamento: o diálogo", () => {
  it("tem título e descrição com o trabalho, a pessoa, a margem mínima e o alvo", () => {
    montar(orcamento([linha("pavimento", 10)]));
    const dialogo = screen.getByRole("dialog", { name: "Verificar o orçamento de Cozinha" });
    expect(dialogo).toHaveAccessibleDescription("Para Ana Silva. A margem mínima é 28 % e o alvo é 35 %.");
  });

  it("sem bloqueios: diz que está tudo certo e oferece 'Marcar como verificado' (e não pede à Direção)", () => {
    const { aoVerificar } = montar(orcamento([linha("pavimento", 10)]));
    expect(screen.getByRole("status")).toHaveTextContent("Margem de 40 %. Sem bloqueios.");
    expect(within(lista()).getByText("Tudo certo: margens dentro do mínimo.")).toBeInTheDocument();
    semBotao("Pedir aprovação à Direção");
    fireEvent.click(botao("Marcar como verificado"));
    expect(aoVerificar).toHaveBeenCalledTimes(1);
  });

  it("uma margem abaixo do alvo é só um aviso: não bloqueia e deixa verificar", () => {
    montar(orcamento([linha("pavimento", 10, 27)]));
    expect(within(lista()).getByText(/Margem de 33,3 %, abaixo do alvo de 35 %\. Não bloqueia\./)).toBeInTheDocument();
    expect(within(lista()).getByText("Aviso")).toBeInTheDocument();
    expect(botao("Marcar como verificado")).toBeInTheDocument();
  });
});

describe("VerificarOrcamento: preço abaixo do custo (bloqueio duro)", () => {
  const duro = () => orcamento([linha("pavimento", 10, 17), linha("pintura", 40)]);

  it("mostra o bloqueio, diz que a Direção nunca o aprova e não oferece pedir aprovação nem verificar", () => {
    montar(duro());
    expect(screen.getByRole("status")).toHaveTextContent("1 bloqueio por resolver.");
    expect(within(lista()).getByText(/Preço abaixo do custo em Pavimento: 17,00 € contra um custo de 18,00 €\./)).toBeInTheDocument();
    expect(within(lista()).getByText("Um preço abaixo do custo nunca pode ser aprovado pela Direção.")).toBeInTheDocument();
    expect(within(lista()).getByText("Bloqueio")).toBeInTheDocument();
    semBotao("Pedir aprovação à Direção");
    semBotao("Marcar como verificado");
  });

  it("'Usar 25,00 €' põe esse preço na linha certa e deixa o resto como está; o nome do botão diz o serviço", () => {
    const { aoAjustar } = montar(duro());
    const usar = botao("Usar 25,00 € em Pavimento");
    expect(usar).toHaveTextContent("Usar 25,00 €");
    fireEvent.click(usar);
    expect(aoAjustar).toHaveBeenCalledExactlyOnceWith({
      linhas: [linha("pavimento", 10, 25), linha("pintura", 40)], desconto: 0, vendaDireta: false,
    });
  });

  it("com vários preços abaixo do custo há um botão por linha, com nomes diferentes", () => {
    montar(orcamento([linha("pavimento", 10, 17), linha("pintura", 40, 2)]));
    const nomes = screen.getAllByRole("button", { name: /^Usar / }).map((b) => b.getAttribute("aria-label"));
    expect(nomes).toEqual(["Usar 25,00 € em Pavimento", "Usar 6,00 € em Pintura"]);
    expect(new Set(nomes).size).toBe(2);
  });

  it("depois de aplicar o preço (o orçamento chega atualizado) o bloqueio desaparece e passa a poder verificar; o resumo é uma região live", () => {
    const { mudar } = montar(duro());
    const resumo = screen.getByRole("status");
    mudar(orcamento([linha("pavimento", 10, 25), linha("pintura", 40)]));
    expect(screen.getByRole("status")).toBe(resumo);
    expect(resumo).toHaveTextContent(/Sem bloqueios\./);
    expect(screen.queryByText(/Preço abaixo do custo em/)).not.toBeInTheDocument();
    expect(botao("Marcar como verificado")).toBeInTheDocument();
  });
});

describe("VerificarOrcamento: margem global e desconto (bloqueios moles)", () => {
  it("margem abaixo do mínimo: diz a margem e o mínimo, oferece pedir a aprovação à Direção (e não verificar)", () => {
    const { aoPedirDirecao } = montar(orcamento([linha("pavimento", 10, 24)]));
    expect(within(lista()).getByText(/Margem de 25 %, abaixo do mínimo de 28 %\./)).toBeInTheDocument();
    semBotao("Marcar como verificado");
    semBotao(/^Usar /);
    fireEvent.click(botao("Pedir aprovação à Direção"));
    expect(aoPedirDirecao).toHaveBeenCalledTimes(1);
  });

  it("27,9 % bloqueia e o texto diz 27,9 % (nunca 28 %)", () => {
    montar(orcamento([linha("eletricidade", 4, 55.5)]));
    expect(within(lista()).getByText(/Margem de 27,9 %, abaixo do mínimo de 28 %\./)).toBeInTheDocument();
  });

  it("um desconto que baixa a margem: oferece 'Tirar o desconto', que o põe a 0 e mantém o resto", () => {
    const { aoAjustar } = montar(orcamento([linha("pavimento", 10)], { desconto: 20, vendaDireta: true }));
    expect(within(lista()).getByText(/O desconto baixa a margem para 25 % \(mínimo 28 %\)\./)).toBeInTheDocument();
    fireEvent.click(botao("Tirar o desconto"));
    expect(aoAjustar).toHaveBeenCalledExactlyOnceWith({ linhas: [linha("pavimento", 10)], desconto: 0, vendaDireta: true });
    // O desconto baixa a margem mas também se pode pedir a exceção.
    expect(botao("Pedir aprovação à Direção")).toBeInTheDocument();
  });
});

describe("VerificarOrcamento: editar, fechar, erros", () => {
  it("'Editar o orçamento' pede para abrir o editor", () => {
    const { aoEditar } = montar(orcamento([linha("pavimento", 10, 24)]));
    fireEvent.click(botao("Editar o orçamento"));
    expect(aoEditar).toHaveBeenCalledTimes(1);
  });

  it("se a ação diz que falta algo, o alerta aparece dentro do diálogo, que continua aberto", () => {
    const { aoFechar } = montar(orcamento([linha("pavimento", 10)]), { faltas: ["margem"] });
    fireEvent.click(botao("Marcar como verificado"));
    expect(screen.getByRole("alert")).toHaveTextContent("não: margem");
    expect(screen.getByRole("alert").className).toContain("text-foreground");
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("Fechar e Esc fecham sem mudar nada", () => {
    const { aoFechar, aoAjustar, aoVerificar } = montar(orcamento([linha("pavimento", 10)]));
    fireEvent.click(botao("Fechar"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(aoFechar).toHaveBeenCalledTimes(2);
    expect(aoAjustar).not.toHaveBeenCalled();
    expect(aoVerificar).not.toHaveBeenCalled();
  });

  it("ao fechar pede para devolver o foco, e o conteúdo fica até desmontar (não pisca vazio)", async () => {
    const { fechar, aoDevolverFoco } = montar(orcamento([linha("pavimento", 10)]));
    fechar();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(aoDevolverFoco).toHaveBeenCalled());
  });

  it("todos os botões têm 44 px de altura", () => {
    montar(orcamento([linha("pavimento", 10, 17)]));
    for (const b of within(screen.getByRole("dialog")).getAllByRole("button")) expect(b.className).toContain("min-h-11");
  });
});

describe("VerificarOrcamento: uma venda abaixo do custo (margem negativa) é bloqueio duro", () => {
  // 5 m² de pavimento a 20 € = 100 €, custo 90 €.
  const vendaAbaixo = () => orcamento([linha("pavimento", 5, 20)], { desconto: 50 });

  it("diz a venda e o custo, que a Direção nunca o aprova, sugere tirar o desconto e não oferece pedir aprovação nem verificar", () => {
    const { aoAjustar } = montar(vendaAbaixo());
    expect(within(lista()).getByText(/A venda, depois do desconto, fica em 50,00 € sem IVA, abaixo do custo de 90,00 €\./)).toBeInTheDocument();
    expect(within(lista()).getByText("Um preço abaixo do custo nunca pode ser aprovado pela Direção.")).toBeInTheDocument();
    semBotao("Pedir aprovação à Direção");
    semBotao("Marcar como verificado");
    fireEvent.click(botao("Tirar o desconto"));
    expect(aoAjustar).toHaveBeenCalledExactlyOnceWith({ linhas: [linha("pavimento", 5, 20)], desconto: 0, vendaDireta: false });
  });

  it("com 10 % de desconto a margem fica a 0 %: bloqueio mole, e pede-se a aprovação à Direção", () => {
    montar(orcamento([linha("pavimento", 5, 20)], { desconto: 10 }));
    expect(within(lista()).getByText(/Margem de 0 %, abaixo do mínimo de 28 %\./)).toBeInTheDocument();
    expect(botao("Pedir aprovação à Direção")).toBeInTheDocument();
    expect(screen.queryByText(/abaixo do custo de/)).not.toBeInTheDocument();
  });
});

describe("VerificarOrcamento: o foco não cai no body depois de um ajuste", () => {
  it("depois de 'Usar 25,00 €' (o botão desaparece) o foco vai para o resumo, que é focável por programa mas não entra na ordem do Tab", () => {
    const { mudar } = montar(orcamento([linha("pavimento", 10, 17), linha("pintura", 40)]));
    const resumo = screen.getByRole("status");
    expect(resumo).toHaveAttribute("tabindex", "-1");
    fireEvent.click(botao("Usar 25,00 € em Pavimento"));
    expect(resumo).toHaveFocus();
    mudar(orcamento([linha("pavimento", 10, 25), linha("pintura", 40)]));
    expect(screen.queryByRole("button", { name: /^Usar / })).not.toBeInTheDocument();
    expect(resumo).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it("depois de 'Tirar o desconto' também", () => {
    const { mudar } = montar(orcamento([linha("pavimento", 10)], { desconto: 20 }));
    fireEvent.click(botao("Tirar o desconto"));
    mudar(orcamento([linha("pavimento", 10)]));
    expect(screen.queryByRole("button", { name: "Tirar o desconto" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveFocus();
  });

  it("se o ajuste não se deu (faltou algo) o foco fica onde estava e o alerta aparece", () => {
    montar(orcamento([linha("pavimento", 10, 17)]), { faltas: ["semOrcamento"] });
    const usar = botao("Usar 25,00 € em Pavimento");
    usar.focus();
    fireEvent.click(usar);
    expect(screen.getByRole("alert")).toHaveTextContent("não: semOrcamento");
    expect(usar).toHaveFocus();
  });
});

describe("VerificarOrcamento: sem orçamento detalhado", () => {
  it("diz que não há orçamento para verificar e oferece Fechar (o diálogo nunca fica vazio e sem saída)", () => {
    const aoFechar = vi.fn();
    render(
      <VerificarOrcamento
        negocio={NEGOCIO} orcamento={undefined} aoAjustar={vi.fn(() => [])} aoPedirDirecao={vi.fn(() => [])} aoVerificar={vi.fn(() => [])}
        aoEditar={vi.fn()} explicar={() => ""} aoFechar={aoFechar} aoDevolverFoco={() => false}
      />,
    );
    const dialogo = screen.getByRole("dialog", { name: "Verificar o orçamento de Cozinha" });
    expect(within(dialogo).getByText("Este negócio ainda não tem orçamento para verificar.")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});
