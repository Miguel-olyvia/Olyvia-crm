// O diálogo «Colunas»: caixa por coluna, arrastar COM alternativa de teclado (Subir e Descer), «Repor padrão». O nome é fixo.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DialogoColunasPessoas } from "./DialogoColunasPessoas";
import { escolhaPorOmissao, type EscolhaColuna } from "./colunasPessoas";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());

function desenhar(escolha: readonly EscolhaColuna[] = escolhaPorOmissao()) {
  const aoAlternar = vi.fn();
  const aoMover = vi.fn();
  const aoMoverPara = vi.fn();
  const aoRepor = vi.fn();
  render(<DialogoColunasPessoas escolha={escolha} aoAlternar={aoAlternar} aoMover={aoMover} aoMoverPara={aoMoverPara} aoRepor={aoRepor} />);
  return { aoAlternar, aoMover, aoMoverPara, aoRepor };
}
const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Colunas" }));
const linhaDe = (nome: string): HTMLElement => screen.getByRole("checkbox", { name: nome }).closest("li")!;

describe("DialogoColunasPessoas: abrir", () => {
  it("o botão «Colunas» tem 44 px, abre o diálogo e este tem título e ajuda", () => {
    desenhar();
    const botao = screen.getByRole("button", { name: "Colunas" });
    expect(botao.className).toContain("min-h-11");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(botao);
    expect(screen.getByRole("dialog", { name: "Personalizar colunas" })).toBeInTheDocument();
    expect(screen.getByText(/Arraste, ou use os botões Subir e Descer/)).toBeInTheDocument();
  });
  it("«Fechar» fecha o diálogo", () => {
    desenhar();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("DialogoColunasPessoas: as colunas", () => {
  it("uma linha por coluna com dado, pela ordem da escolha; a localidade saiu e as outras já aparecem", () => {
    desenhar();
    abrir();
    const nomes = within(screen.getByRole("list", { name: "Colunas da lista" })).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label") ?? c.id);
    expect(nomes).toHaveLength(escolhaPorOmissao().length);
    expect(screen.queryByRole("checkbox", { name: "Localidade" })).toBeNull();
    for (const com of ["Formulário", "Criado em", "Origem", "Campanha"]) {
      expect(screen.getByRole("checkbox", { name: com })).toBeInTheDocument();
    }
    expect(screen.getByRole("checkbox", { name: "Telefone" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Atribuído a" })).toBeInTheDocument();
  });
  it("«Pessoa» está sempre visível: marcada, desativada, sem Subir nem Descer", () => {
    desenhar();
    abrir();
    const pessoa = screen.getByRole("checkbox", { name: "Pessoa" });
    expect(pessoa).toBeChecked();
    expect(pessoa).toBeDisabled();
    expect(within(linhaDe("Pessoa")).getByText("Sempre visível")).toBeInTheDocument();
    expect(within(linhaDe("Pessoa")).queryByRole("button")).toBeNull();
  });
  it("a caixa reflete a visibilidade e clicar chama aoAlternar com o id", () => {
    const { aoAlternar } = desenhar(escolhaPorOmissao().map((c) => (c.id === "phone" ? { ...c, visivel: false } : c)));
    abrir();
    const caixa = screen.getByRole("checkbox", { name: "Telefone" });
    expect(caixa).not.toBeChecked();
    fireEvent.click(caixa);
    expect(aoAlternar).toHaveBeenCalledExactlyOnceWith("phone");
  });
});

describe("DialogoColunasPessoas: ordenar com o teclado", () => {
  it("Subir e Descer têm o nome da coluna, 44 px e chamam aoMover com -1 e +1", () => {
    const { aoMover } = desenhar();
    abrir();
    const sobe = screen.getByRole("button", { name: "Subir Valor" });
    const desce = screen.getByRole("button", { name: "Descer Valor" });
    expect(sobe.className).toContain("min-h-11");
    expect(desce.className).toContain("min-h-11");
    fireEvent.click(sobe);
    fireEvent.click(desce);
    expect(aoMover.mock.calls).toEqual([["value", -1], ["value", 1]]);
  });
  // ALTERADO: antes esperava `disabled` (toBeDisabled). Um botão `disabled` sai da ordem do teclado e o foco perdia-se ao chegar ao extremo;
  // passa a `aria-disabled` com a guarda no clique, e continua a ser focável.
  it("a primeira depois de «Pessoa» não sobe e a última não desce: aria-disabled (focável), com pista visual, e o clique não faz nada", () => {
    const { aoMover } = desenhar();
    abrir();
    const e = escolhaPorOmissao();
    const sobe = screen.getByRole("button", { name: "Subir Etapa" });
    const desce = screen.getByRole("button", { name: "Descer Campanha" });
    for (const botao of [sobe, desce]) {
      expect(botao).toHaveAttribute("aria-disabled", "true");
      expect(botao).not.toBeDisabled();
      expect(botao.className).toContain("aria-disabled:opacity-60");
    }
    sobe.focus();
    expect(sobe).toHaveFocus();
    fireEvent.click(sobe);
    fireEvent.click(desce);
    expect(aoMover).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(e[1].id).toBe("stage");
    expect(e[e.length - 1].id).toBe("campaign");
  });
  it("os botões que podem mover-se não levam aria-disabled", () => {
    desenhar();
    abrir();
    expect(screen.getByRole("button", { name: "Subir Valor" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: "Descer Valor" })).not.toHaveAttribute("aria-disabled");
  });
  it("depois de mover, uma região live diz a nova posição (quem não vê o ecrã sabe onde ficou)", () => {
    desenhar();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Descer Valor" }));
    const total = escolhaPorOmissao().length;
    const posicao = escolhaPorOmissao().findIndex((c) => c.id === "value") + 2;
    expect(screen.getByRole("status")).toHaveTextContent(`Valor: posição ${posicao} de ${total}`);
  });
});

describe("DialogoColunasPessoas: arrastar", () => {
  it("arrastar a pega de uma coluna para cima de outra chama aoMoverPara com o índice dessa", () => {
    const { aoMoverPara } = desenhar();
    abrir();
    const e = escolhaPorOmissao();
    const pega = within(linhaDe("Valor")).getByTitle("Arrastar Valor");
    expect(pega).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(pega);
    fireEvent.dragOver(linhaDe("Etapa"));
    expect(aoMoverPara).toHaveBeenCalledWith("value", e.findIndex((c) => c.id === "stage"));
  });
  it("largar sem ter arrancado, ou arrastar sobre si própria, não faz nada", () => {
    const { aoMoverPara } = desenhar();
    abrir();
    fireEvent.dragOver(linhaDe("Etapa"));
    const pega = within(linhaDe("Valor")).getByTitle("Arrastar Valor");
    fireEvent.dragStart(pega);
    fireEvent.dragOver(linhaDe("Valor"));
    expect(aoMoverPara).not.toHaveBeenCalled();
  });
  it("«Pessoa» não tem pega de arrastar nem aceita largar por cima", () => {
    const { aoMoverPara } = desenhar();
    abrir();
    expect(within(linhaDe("Pessoa")).queryByTitle(/Arrastar/)).toBeNull();
    fireEvent.dragStart(within(linhaDe("Valor")).getByTitle("Arrastar Valor"));
    fireEvent.dragOver(linhaDe("Pessoa"));
    expect(aoMoverPara).not.toHaveBeenCalled();
  });
});

describe("DialogoColunasPessoas: repor", () => {
  it("«Repor padrão» chama aoRepor", () => {
    const { aoRepor } = desenhar();
    abrir();
    const botao = screen.getByRole("button", { name: "Repor padrão" });
    expect(botao.className).toContain("min-h-11");
    fireEvent.click(botao);
    expect(aoRepor).toHaveBeenCalledTimes(1);
  });
  it("«Repor padrão» anuncia que as colunas voltaram ao padrão", () => {
    desenhar();
    abrir();
    expect(screen.getByRole("status")).toHaveTextContent("");
    fireEvent.click(screen.getByRole("button", { name: "Repor padrão" }));
    expect(screen.getByRole("status")).toHaveTextContent("Colunas repostas ao padrão.");
  });
  it("o anúncio limpa-se ao fechar o diálogo (não volta a aparecer ao reabrir)", () => {
    desenhar();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Repor padrão" }));
    fireEvent.click(screen.getByRole("button", { name: "Descer Valor" }));
    expect(screen.getByRole("status")).not.toHaveTextContent("");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    abrir();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});

describe("DialogoColunasPessoas: acessibilidade do diálogo", () => {
  it("só há um botão de fechar (o «Fechar» traduzido): o X em inglês do componente base não aparece", () => {
    desenhar();
    abrir();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^(Fechar|Close)$/ })).toHaveLength(1);
  });
  it("a caixa de «Pessoa» liga «Sempre visível» por aria-describedby, para o leitor de ecrã dizer porque está desativada", () => {
    desenhar();
    abrir();
    const pessoa = screen.getByRole("checkbox", { name: "Pessoa" });
    expect(pessoa).toHaveAccessibleDescription("Sempre visível");
    expect(screen.getByRole("checkbox", { name: "Etapa" })).not.toHaveAttribute("aria-describedby");
  });
});
