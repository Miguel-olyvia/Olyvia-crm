// O que o centro do guia mostra de um passo já feito: o MESMO ecrã do passo, preenchido (`leitura`), e não uma lista de rótulo e valor. Só os passos sem ecrã
// próprio (os de documento) ficam com o registo em texto de sempre (ou «Sem registo»). Só apresentação: nada fala com a base.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RegistoDoItem } from "./GuiaColuna";
import { GuiaDoPasso, type GuiaDoPassoProps } from "./GuiaDoPasso";
import { calcularPassoGuiado, fasesDaPessoa, type ItemChecklist } from "./processo/passoGuiado";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { PASSOS_PROCESSO } from "./processo/tiposProcesso";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

const item = (extra: Partial<ItemChecklist> = {}): ItemChecklist => ({ id: "contacto", rotuloChave: "pessoasPagina.guia.check.contacto", feito: true, ...extra });

describe("RegistoDoItem: o registo em texto dos passos sem ecrã próprio", () => {
  it("mostra o detalhe em texto e se o passo está feito, sem lista de definições", () => {
    const { container } = render(<RegistoDoItem item={item({ detalhe: "912 000 000 · p@x.pt" })} />);
    expect(container.querySelector("dl")).toBeNull();
    expect(screen.getByText("912 000 000 · p@x.pt")).toBeInTheDocument();
    expect(screen.getByText("Feito")).toBeInTheDocument();
  });

  it("sem detalhe diz «Sem registo», e um passo por fazer diz «Por fazer»", () => {
    render(<RegistoDoItem item={item({ feito: false })} />);
    expect(screen.getByText("Sem registo")).toBeInTheDocument();
    expect(screen.getByText("Por fazer")).toBeInTheDocument();
  });

  it("sem passo escolhido mostra só «Sem registo»", () => {
    render(<RegistoDoItem item={null} />);
    expect(screen.getByText("Sem registo")).toBeInTheDocument();
  });
});

describe("GuiaDoPasso: abrir uma fase feita mostra o ecrã do passo, não um resumo", () => {
  const processo = (extra: Partial<ItemProcesso>): ItemProcesso => ({
    id: "pessoa-a", pessoaId: "a", tipo: "pessoa", fase: "contactado", trabalho: null, valor: null, prazo: null, atrasado: false, orcamentos: 0,
    verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
  });
  const montar = (leitura?: GuiaDoPassoProps["leitura"]) => {
    const passo = calcularPassoGuiado(processo({}), {
      dados: { nome: "Paulo", temContacto: true, temOrigem: false, chamadas: 0, visitasAtivas: 0, levantamentos: 0, detalhes: { contacto: "912 000 000" } },
      fases: fasesDaPessoa("contactado"), podeEditar: true, podeCriar: true, pessoaFechada: false, ligados: new Set(PASSOS_PROCESSO),
    });
    render(
      <GuiaDoPasso
        passo={passo} fases={fasesDaPessoa("contactado")} cabecalho={{ nome: "Paulo" }}
        cliente={{ telefone: null, email: null, morada: null, linha: null }} acontecimentos={[]} aoAcao={vi.fn()} leitura={leitura}
      />,
    );
  };
  const abrirPorContactar = () => fireEvent.click(within(screen.getByRole("navigation", { name: "Fases feitas" })).getByRole("button", { name: /^Por contactar/ }));

  it("a fase feita abre no primeiro passo com o ecrã que a aplicação dá, e pede-o com a fase, o passo e «faseFeita»", () => {
    const leitura = vi.fn(({ itemId }: { itemId: string }) => <label>Campo de {itemId}<input readOnly value="Paulo Nogueira" /></label>);
    montar(leitura);
    abrirPorContactar();
    expect(screen.getByRole("heading", { level: 2, name: "Quem pede" })).toBeInTheDocument();
    expect(screen.getByLabelText("Campo de quemPede")).toHaveValue("Paulo Nogueira");
    expect(leitura).toHaveBeenLastCalledWith({ faseId: "porContactar", itemId: "quemPede", faseFeita: true });
    // Já não há lista de rótulo e valor nem «Sem registo» a substituir o ecrã.
    expect(screen.queryByText("Sem registo")).toBeNull();
  });

  it("escolher outro passo da fase feita troca o ecrã", () => {
    montar(({ itemId }) => <p>Ecrã de {itemId}</p>);
    abrirPorContactar();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Passos da fase" })).getByRole("button", { name: /^Origem/ }));
    expect(screen.getByText("Ecrã de origem")).toBeInTheDocument();
    expect(screen.queryByText("Ecrã de quemPede")).toBeNull();
  });

  it("um passo para o qual não há ecrã (leitura devolve null) cai no registo em texto", () => {
    montar(() => null);
    abrirPorContactar();
    expect(screen.getByText("Sem registo")).toBeInTheDocument();
  });

  it("sem leitura nenhuma (um guia que não a dá) o registo em texto continua a servir", () => {
    montar(undefined);
    abrirPorContactar();
    expect(screen.getByText("Sem registo")).toBeInTheDocument();
  });

  it("na fase atual, escolher um passo da lista mostra o ecrã dele por baixo do nome do passo, com faseFeita falso", () => {
    const leitura = vi.fn(({ itemId }: { itemId: string }) => <p>Ecrã de {itemId}</p>);
    montar(leitura);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Passos da fase" })).getByRole("button", { name: /^Chamada/ }));
    expect(screen.getByText("Ecrã de chamada")).toBeInTheDocument();
    expect(leitura).toHaveBeenLastCalledWith({ faseId: "contactado", itemId: "chamada", faseFeita: false });
  });

  it("o assistente tem prioridade numa fase feita quando devolve conteúdo, e a coluna de sempre quando devolve null", () => {
    const assistente = vi.fn(({ faseVista }: { faseVista: string | null }) => (faseVista === "porContactar" ? <p>Assistente da fase feita</p> : null));
    const passo = calcularPassoGuiado(processo({}), {
      dados: { nome: "Paulo", temContacto: true, temOrigem: false, chamadas: 0, visitasAtivas: 0, levantamentos: 0 },
      fases: fasesDaPessoa("contactado"), podeEditar: true, podeCriar: true, pessoaFechada: false, ligados: new Set(PASSOS_PROCESSO),
    });
    render(
      <GuiaDoPasso
        passo={passo} fases={fasesDaPessoa("contactado")} cabecalho={{ nome: "Paulo" }} assistente={assistente}
        cliente={{ telefone: null, email: null, morada: null, linha: null }} acontecimentos={[]} aoAcao={vi.fn()}
      />,
    );
    // Na fase atual o assistente devolve null: vê-se a coluna e o centro de sempre.
    expect(screen.queryByText("Assistente da fase feita")).toBeNull();
    abrirPorContactar();
    expect(screen.getByText("Assistente da fase feita")).toBeInTheDocument();
  });
});
