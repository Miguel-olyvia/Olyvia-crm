// O resumo de leitura de um passo no centro do guia: uma lista de definições (rótulo e valor), «Por preencher» por texto onde não há nada,
// e o registo em texto de sempre (ou «Sem registo») quando o passo não tem resumo. Só apresentação: nada fala com a base.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RegistoDoItem } from "./GuiaColuna";
import { GuiaDoPasso } from "./GuiaDoPasso";
import { calcularPassoGuiado, fasesDaPessoa, type ItemChecklist } from "./processo/passoGuiado";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { PASSOS_PROCESSO } from "./processo/tiposProcesso";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
afterEach(cleanup);

const item = (extra: Partial<ItemChecklist> = {}): ItemChecklist => ({ id: "contacto", rotuloChave: "pessoasPagina.guia.check.contacto", feito: true, ...extra });

describe("RegistoDoItem: o resumo do passo", () => {
  it("com linhas desenha uma lista de definições com o rótulo e o valor de cada uma", () => {
    const { container } = render(<RegistoDoItem item={item({ linhas: [{ rotulo: "Telefone", valor: "912 000 000" }, { rotulo: "Email", valor: "p@x.pt" }] })} />);
    const dl = container.querySelector("dl");
    expect(dl).not.toBeNull();
    expect(dl?.querySelectorAll("dt")).toHaveLength(2);
    expect(within(dl as HTMLElement).getByText("Telefone").tagName).toBe("DT");
    expect(within(dl as HTMLElement).getByText("912 000 000").tagName).toBe("DD");
    expect(screen.getByText("Feito")).toBeInTheDocument();
  });

  it("um valor null diz «Por preencher» em texto, e o valor guardado não", () => {
    render(<RegistoDoItem item={item({ linhas: [{ rotulo: "Telefone", valor: "912 000 000" }, { rotulo: "Idioma", valor: null }] })} comTitulo={false} />);
    const idioma = screen.getByText("Idioma").closest("div") as HTMLElement;
    expect(within(idioma).getByText("Por preencher")).toBeInTheDocument();
    expect(screen.getAllByText("Por preencher")).toHaveLength(1);
    expect(screen.queryByText("Sem registo")).toBeNull();
  });

  it("repete rótulos sem estragar (as perguntas de um questionário podem coincidir)", () => {
    render(<RegistoDoItem item={item({ linhas: [{ rotulo: "Notas", valor: "a" }, { rotulo: "Notas", valor: "b" }] })} />);
    expect(screen.getAllByText("Notas")).toHaveLength(2);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("sem linhas mostra o detalhe em texto, e sem detalhe «Sem registo» (como antes)", () => {
    const { container, rerender } = render(<RegistoDoItem item={item({ detalhe: "912 000 000 · p@x.pt" })} />);
    expect(container.querySelector("dl")).toBeNull();
    expect(screen.getByText("912 000 000 · p@x.pt")).toBeInTheDocument();
    rerender(<RegistoDoItem item={item()} />);
    expect(screen.getByText("Sem registo")).toBeInTheDocument();
  });

  it("uma lista de linhas vazia cai no registo em texto", () => {
    const { container } = render(<RegistoDoItem item={item({ linhas: [] })} />);
    expect(container.querySelector("dl")).toBeNull();
    expect(screen.getByText("Sem registo")).toBeInTheDocument();
  });
});

describe("GuiaDoPasso: abrir uma fase feita mostra o resumo dos passos", () => {
  const processo = (extra: Partial<ItemProcesso>): ItemProcesso => ({
    id: "pessoa-a", pessoaId: "a", tipo: "pessoa", fase: "contactado", trabalho: null, valor: null, prazo: null, atrasado: false, orcamentos: 0,
    verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
  });
  const montar = () => {
    const i = processo({});
    const passo = calcularPassoGuiado(i, {
      dados: {
        nome: "Paulo", temContacto: true, temOrigem: false, chamadas: 0, visitasAtivas: 0, levantamentos: 0,
        resumos: {
          quemPede: [{ rotulo: "Nome", valor: "Paulo Nogueira" }, { rotulo: "NIF", valor: null }],
          contacto: [{ rotulo: "Telefone", valor: "912 000 000" }],
        },
      },
      fases: fasesDaPessoa("contactado"), podeEditar: true, podeCriar: true, pessoaFechada: false, ligados: new Set(PASSOS_PROCESSO),
    });
    render(
      <GuiaDoPasso
        passo={passo} fases={fasesDaPessoa("contactado")} cabecalho={{ nome: "Paulo" }}
        cliente={{ telefone: null, email: null, morada: null, linha: null }} acontecimentos={[]} aoAcao={vi.fn()}
      />,
    );
  };

  it("a fase feita abre no primeiro passo com as suas linhas, e «Por preencher» onde falta", () => {
    montar();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Fases feitas" })).getByRole("button", { name: /^Por contactar/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Quem pede" })).toBeInTheDocument();
    expect(screen.getByText("Paulo Nogueira").tagName).toBe("DD");
    // O cartão do cliente também tem um «NIF» e «Por preencher»: o resumo procura-se só no centro.
    const centro = screen.getByRole("region", { name: "Conteúdo do passo" });
    const nif = within(centro).getByText("NIF").closest("div") as HTMLElement;
    expect(within(nif).getByText("Por preencher")).toBeInTheDocument();
  });

  it("escolher outro passo da fase feita troca o resumo; um passo sem resumo continua a dizer «Sem registo»", () => {
    montar();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Fases feitas" })).getByRole("button", { name: /^Por contactar/ }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Passos da fase" })).getByRole("button", { name: /^Contacto/ }));
    const centro = screen.getByRole("region", { name: "Conteúdo do passo" });
    expect(within(centro).getByText("912 000 000").tagName).toBe("DD");
    expect(screen.queryByText("Paulo Nogueira")).toBeNull();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Passos da fase" })).getByRole("button", { name: /^Origem/ }));
    expect(screen.getByText("Sem registo")).toBeInTheDocument();
  });
});
