// A ligação entre o botão de um passo e `executar`: sem este teste, os do provider chamam `executar` à mão e uma mudança que
// deixasse o botão a abrir sempre a ficha só era apanhada pelos testes da página.
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ATRIBUTO_ITEM, ATRIBUTO_PESSOA, BloqueioContext, ProcessoContext, useAcaoDoPasso } from "./processoContexto";
import type { ItemProcesso } from "./tiposProcesso";

const item = (extra: Partial<ItemProcesso> = {}): ItemProcesso => ({
  id: "pedido-a", pessoaId: "a", tipo: "pedido", fase: "porContactar", trabalho: null, valor: null, prazo: null, atrasado: false,
  orcamentos: 0, orcamentoEscolhido: false, verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, levantamentoLinhas: 0, ...extra,
});

function Botao({ item: i, aoAbrir }: { item?: ItemProcesso; aoAbrir: () => void }) {
  const acao = useAcaoDoPasso(i, aoAbrir);
  return <button type="button" onClick={acao.aoClicar} data-executa={String(acao.executa)} {...acao.atributos}>passo</button>;
}

const comProvider = (executar: () => void, filhos: ReactNode) => (
  <ProcessoContext.Provider value={{ executar }}>{filhos}</ProcessoContext.Provider>
);

describe("useAcaoDoPasso", () => {
  it("com provider e um passo que já executa, o clique chama `executar` com o item e o botão, e não abre a ficha", () => {
    const executar = vi.fn();
    const aoAbrir = vi.fn();
    const pedido = item();
    render(comProvider(executar, <Botao item={pedido} aoAbrir={aoAbrir} />));
    const botao = screen.getByRole("button", { name: "passo" });
    expect(botao).toHaveAttribute("data-executa", "true");
    fireEvent.click(botao);
    expect(executar).toHaveBeenCalledExactlyOnceWith(pedido, botao);
    expect(aoAbrir).not.toHaveBeenCalled();
  });

  it("marca o botão com o item e a pessoa (é por aí que o foco o encontra)", () => {
    render(comProvider(vi.fn(), <Botao item={item({ id: "n7", pessoaId: "p9" })} aoAbrir={vi.fn()} />));
    expect(screen.getByRole("button")).toHaveAttribute(ATRIBUTO_ITEM, "n7");
    expect(screen.getByRole("button")).toHaveAttribute(ATRIBUTO_PESSOA, "p9");
  });

  it("sem provider, o clique abre a ficha e o botão não diz que executa", () => {
    const aoAbrir = vi.fn();
    render(<Botao item={item()} aoAbrir={aoAbrir} />);
    expect(screen.getByRole("button")).toHaveAttribute("data-executa", "false");
    fireEvent.click(screen.getByRole("button"));
    expect(aoAbrir).toHaveBeenCalledOnce();
  });

  it("com provider mas num passo da Fase 5 (registar a assinatura), o clique abre a ficha e `executar` não é chamado", () => {
    const executar = vi.fn();
    const aoAbrir = vi.fn();
    render(comProvider(executar, <Botao item={item({ tipo: "negocio", fase: "contrato", id: "n1" })} aoAbrir={aoAbrir} />));
    expect(screen.getByRole("button")).toHaveAttribute("data-executa", "false");
    fireEvent.click(screen.getByRole("button"));
    expect(aoAbrir).toHaveBeenCalledOnce();
    expect(executar).not.toHaveBeenCalled();
  });

  it("com provider, os passos do orçamento (Fase 4) executam: criar, verificar, aguardar a Direção e enviar a proposta", () => {
    const negocio = { tipo: "negocio", fase: "orcamento", id: "n1", orcamentos: 1, orcamentoEscolhido: true } as const;
    const casos: [string, Partial<ItemProcesso>][] = [
      ["criar o orçamento", { orcamentos: 0, orcamentoEscolhido: false }],
      ["verificar o orçamento", { verificacao: "porVerificar" }],
      ["aguardar a Direção", { verificacao: "aguardaDirecao" }],
      ["enviar a proposta", { verificacao: "verificado" }],
    ];
    for (const [nome, extra] of casos) {
      const executar = vi.fn();
      const { unmount } = render(comProvider(executar, <Botao item={item({ ...negocio, ...extra })} aoAbrir={vi.fn()} />));
      expect(screen.getByRole("button"), nome).toHaveAttribute("data-executa", "true");
      unmount();
    }
  });

  it("sem item (um cartão sem processo), abre a ficha", () => {
    const executar = vi.fn();
    const aoAbrir = vi.fn();
    render(comProvider(executar, <Botao aoAbrir={aoAbrir} />));
    fireEvent.click(screen.getByRole("button"));
    expect(aoAbrir).toHaveBeenCalledOnce();
    expect(executar).not.toHaveBeenCalled();
  });

  it("a explicação do portão só chega ao botão do item e do passo bloqueados, e liga-se a ele com aria-describedby", () => {
    function Visivel({ i }: { i: ItemProcesso }) {
      const acao = useAcaoDoPasso(i, vi.fn());
      return <button type="button" {...acao.atributos}>{acao.bloqueio ?? "livre"}</button>;
    }
    const bloqueio = { itemId: "pedido-a", passo: "registarChamada" as const, texto: "Falta o resultado." };
    render(
      <ProcessoContext.Provider value={{ executar: vi.fn() }}>
        <BloqueioContext.Provider value={bloqueio}>
          <Visivel i={item()} />
          <Visivel i={item({ id: "pedido-b" })} />
          <Visivel i={item({ fase: "contactado" })} />
        </BloqueioContext.Provider>
      </ProcessoContext.Provider>,
    );
    const [bloqueado, outroItem, outroPasso] = screen.getAllByRole("button");
    expect(bloqueado).toHaveTextContent("Falta o resultado.");
    expect(bloqueado).toHaveAttribute("aria-describedby", "explicacao-passo-pedido-a");
    expect(outroItem).toHaveTextContent("livre");
    expect(outroItem).not.toHaveAttribute("aria-describedby");
    expect(outroPasso).toHaveTextContent("livre");
  });
});
