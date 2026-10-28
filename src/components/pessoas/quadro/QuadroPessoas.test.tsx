import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { QuadroPessoas } from "./QuadroPessoas";
import type { ChipPessoa } from "../pessoasTipos";
import type { CartaoQuadro } from "./cartoesQuadroPessoas";

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

const cartao = (extra: Partial<CartaoQuadro>): CartaoQuadro => ({
  id: "pessoa-a", tipo: "pessoa", pessoaId: "a", nome: "Ana Lopes", papel: "lead", coluna: "porContactar", trabalho: null, valor: null,
  passo: "registarChamada", prazo: null, atrasado: false, ...extra,
});
const deNegocio = (extra: Partial<CartaoQuadro>): CartaoQuadro => cartao({ tipo: "negocio", ...extra });

const CARTOES: CartaoQuadro[] = [
  cartao({}),
  cartao({ id: "pessoa-b", pessoaId: "b", nome: "Bruno Reis", coluna: "porContactar" }),
  cartao({ id: "pessoa-c", pessoaId: "c", nome: "Clara Dias", coluna: "visita", passo: "fecharLevantamento" }),
  deNegocio({ id: "n0", pessoaId: "f", nome: "Filipa Reis", coluna: "levantamento", trabalho: "Janelas", passo: "fazerLevantamento" }),
  deNegocio({ id: "n1", pessoaId: "d", nome: "Duarte Melo", papel: "cliente", coluna: "orcamento", trabalho: "Cozinha", valor: 9000, passo: "criarProposta" }),
  deNegocio({ id: "n2", pessoaId: "d", nome: "Duarte Melo", papel: "cliente", coluna: "orcamento", trabalho: "Sala", valor: 3000, passo: "enviarProposta" }),
  deNegocio({ id: "n3", pessoaId: "e", nome: "Eva Costa", coluna: "contrato", trabalho: "Telhado", valor: 7000, passo: "recolherAssinatura", prazo: "2026-10-01", atrasado: true }),
];

const mostrar = (cartoes = CARTOES, aoAbrir = vi.fn(), chip: ChipPessoa = "todas", aoLimpar = vi.fn()) => {
  render(<QuadroPessoas cartoes={cartoes} hoje={HOJE_EXEMPLO} chip={chip} aoAbrir={aoAbrir} aoLimpar={aoLimpar} />);
  return aoAbrir;
};

// Cada coluna é um h3: as 3 da abordagem e a coluna única «Negócio» (sem sub-fases).
const coluna = (titulo: string) => screen.getByRole("heading", { level: 3, name: new RegExp(`^${titulo}`) }).closest("section")!;

describe("QuadroPessoas", () => {
  it("renderiza as 3 colunas de abordagem e UMA coluna «Negócio» (h3), sem sub-fases nem h4", () => {
    mostrar();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    const titulos = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titulos).toEqual(["Por contactar, 2 cartões", "Contactado, 0 cartões", "Visita, 1 cartão", "Negócio, 4 cartões"]);
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
    // 3 colunas de abordagem + 1 de negócio, todas com nome acessível.
    expect(screen.getAllByRole("region")).toHaveLength(4);
    expect(within(coluna("Negócio")).queryAllByRole("region")).toHaveLength(0);
    expect(screen.getAllByRole("group", { name: "Pessoas por fase" })).toHaveLength(1);
  });

  it("nenhum título de fase (Levantamento, Orçamento, Proposta, Contrato) aparece como cabeçalho", () => {
    mostrar();
    for (const f of ["Levantamento", "Orçamento", "Proposta", "Contrato"]) expect(screen.queryByRole("heading", { name: new RegExp(`^${f}`) })).toBeNull();
  });

  it("a coluna «Negócio» é UMA lista com os cartões de todas as fases, por fase e, dentro dela, pela ordem de chegada", () => {
    // Chegam fora de ordem: o contrato primeiro, depois um orçamento, o levantamento e outro orçamento.
    mostrar([
      deNegocio({ id: "c1", pessoaId: "p1", nome: "Rita Sá", coluna: "contrato", trabalho: "Telhado", valor: 1 }),
      deNegocio({ id: "o1", pessoaId: "p2", nome: "Hugo Paz", coluna: "orcamento", trabalho: "Sala", valor: 2 }),
      deNegocio({ id: "l1", pessoaId: "p3", nome: "Inês Vaz", coluna: "levantamento", trabalho: "Janelas", passo: "fazerLevantamento" }),
      deNegocio({ id: "o2", pessoaId: "p4", nome: "Luís Gil", coluna: "orcamento", trabalho: "Cozinha", valor: 3 }),
      deNegocio({ id: "r1", pessoaId: "p5", nome: "Tomás Rui", coluna: "proposta", trabalho: "Chão", valor: 4 }),
    ]);
    const lista = within(coluna("Negócio")).getByRole("list");
    const nomes = within(lista).getAllByRole("button", { name: /^Abrir a ficha de/ }).map((b) => b.textContent);
    expect(nomes).toEqual(["Inês Vaz", "Hugo Paz", "Luís Gil", "Tomás Rui", "Rita Sá"]);
    expect(within(coluna("Negócio")).getAllByRole("list")).toHaveLength(1);
  });

  it("a pessoa em abordagem só está nas três primeiras colunas e o negócio nas outras: a mesma pessoa não está nas duas", () => {
    mostrar();
    for (const c of ["Por contactar", "Contactado", "Visita"]) expect(within(coluna(c)).queryByText("Duarte Melo")).not.toBeInTheDocument();
    expect(within(coluna("Negócio")).queryByText("Ana Lopes")).not.toBeInTheDocument();
  });

  it("uma coluna da abordagem sem cartões diz 'Nada nesta fase'; a de negócio com cartões não o diz", () => {
    mostrar();
    expect(within(coluna("Contactado")).getByText("Nada nesta fase")).toBeInTheDocument();
    expect(within(coluna("Visita")).queryByText("Nada nesta fase")).not.toBeInTheDocument();
    expect(within(coluna("Negócio")).queryByText("Nada nesta fase")).not.toBeInTheDocument();
  });

  it("um negócio em Levantamento mostra-se na coluna Negócio, com o passo «Criar o orçamento» (o levantamento já está guardado: a base só o põe aí com levantamento) e sem valor", () => {
    mostrar([deNegocio({ id: "n0", pessoaId: "f", nome: "Filipa Reis", coluna: "levantamento", trabalho: "Janelas", passo: "fazerLevantamento" })]);
    const neg = within(coluna("Negócio"));
    expect(neg.getByText("Janelas")).toBeInTheDocument();
    expect(neg.getByRole("button", { name: /Criar o orçamento/ })).toBeInTheDocument();
    expect(neg.queryByRole("button", { name: /Fazer o levantamento/ })).toBeNull();
    // O Levantamento não tem valor: o cartão não mostra nenhum e o agregado da coluna fica em 0.
    expect(neg.getAllByText(/€/, { selector: "span[aria-hidden='true']" })).toHaveLength(1);
    expect(neg.getByText(formatarMeta("euro", 0), { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
  });

  it("o quadro vazio mostra o estado vazio nas 3 colunas da abordagem e UMA só mensagem na coluna «Negócio»", () => {
    mostrar([]);
    expect(screen.getAllByText("Nada nesta fase")).toHaveLength(4);
    expect(within(coluna("Negócio")).getAllByText("Nada nesta fase")).toHaveLength(1);
  });

  it("a coluna de negócio mostra o valor de cada cartão; as da abordagem não mostram valor", () => {
    mostrar();
    expect(within(coluna("Negócio")).getByText(formatarMeta("euro", 9000))).toBeInTheDocument();
    expect(within(coluna("Por contactar")).queryByText(/€/)).not.toBeInTheDocument();
  });

  it("a coluna «Negócio» soma as contagens e os valores das fases, sem o Levantamento, e diz o total por texto", () => {
    mostrar();
    const grupo = coluna("Negócio");
    // 9000 + 3000 + 0 + 7000; o Levantamento não conta.
    const total = formatarMeta("euro", 19000);
    const cab = grupo.querySelector("h3")!.parentElement!.parentElement!;
    expect(within(cab as HTMLElement).getByText(total, { selector: "span[aria-hidden='true']" })).toBeInTheDocument();
    expect(within(cab as HTMLElement).getByText(`Valor total: ${total}`)).toBeInTheDocument();
    expect(grupo.querySelector("h3 .sr-only")?.textContent).toBe(", 4 cartões");
  });

  it("a faixa da coluna tem as cores das 4 fases e é decorativa", () => {
    mostrar();
    const faixa = coluna("Negócio").querySelector("[aria-hidden='true'].flex.h-1")!;
    expect(faixa.children).toHaveLength(4);
  });

  it("o cartão mostra o rótulo Lead ou Cliente, o trabalho, o valor e o passo", () => {
    mostrar();
    const orc = within(coluna("Negócio"));
    expect(orc.getAllByText("Cliente")).toHaveLength(2);
    expect(orc.getByText("Cozinha")).toBeInTheDocument();
    expect(orc.getByText(formatarMeta("euro", 9000))).toBeInTheDocument();
    expect(orc.getByRole("button", { name: /Criar a proposta/ })).toBeInTheDocument();
    expect(within(coluna("Por contactar")).getAllByText("Lead")).toHaveLength(2);
    // Uma pessoa em abordagem não tem trabalho: o cartão diz «Abordagem».
    expect(within(coluna("Por contactar")).getAllByText("Abordagem")).toHaveLength(2);
  });

  it("um prazo ultrapassado diz-se por texto, não só por cor", () => {
    mostrar();
    expect(within(coluna("Negócio")).getByText(/Prazo ultrapassado/)).toBeInTheDocument();
  });

  it("clicar no nome abre a ficha dessa pessoa", () => {
    const aoAbrir = mostrar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Clara Dias" }));
    // Um cartão de pessoa em abordagem abre só a pessoa: sem negócio.
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("c", undefined);
  });

  it("nesta fase o botão do próximo passo só abre a ficha da pessoa", () => {
    const aoAbrir = mostrar();
    fireEvent.click(screen.getByRole("button", { name: "Recolher a assinatura: Telhado de Eva Costa (abre a ficha)" }));
    // O cartão de um negócio abre a pessoa com ESSE negócio (n3), e não só a pessoa.
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("e", "n3");
  });

  it("o nome do botão do passo é '{passo}: {trabalho} de {nome}', como na Lista: distingue os cartões da mesma pessoa e começa pelo texto visível", () => {
    mostrar();
    const duarte = within(coluna("Negócio")).getAllByRole("button", { name: /de Duarte Melo \(abre a ficha\)$/ });
    expect(duarte.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Criar a proposta: Cozinha de Duarte Melo (abre a ficha)", "Enviar a proposta: Sala de Duarte Melo (abre a ficha)",
    ]);
    // Uma pessoa em abordagem usa «Abordagem» no lugar do trabalho.
    expect(within(coluna("Por contactar")).getByRole("button", { name: "Registar a chamada: Abordagem de Ana Lopes (abre a ficha)" })).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: /\(abre a ficha\)$/ })) {
      expect(b.getAttribute("aria-label")!.startsWith(b.textContent!)).toBe(true);
    }
  });

  it("o texto do prazo ultrapassado não usa a cor destrutiva (só o ícone), por contraste", () => {
    mostrar();
    const p = within(coluna("Negócio")).getByText(/Prazo ultrapassado/);
    expect(p.className).not.toContain("text-destructive");
    expect(p.querySelector("svg")?.getAttribute("class")).toContain("text-destructive");
  });

  it("o botão do nome leva data-linha-pessoa com o id da pessoa; o do passo deixa o texto quebrar", () => {
    mostrar();
    expect(screen.getByRole("button", { name: "Abrir a ficha de Clara Dias" })).toHaveAttribute("data-linha-pessoa", "c");
    const passo = screen.getByRole("button", { name: "Marcar a visita como feita: Abordagem de Clara Dias (abre a ficha)" });
    expect(passo.className).toContain("h-auto");
    expect(passo.className).toContain("py-2");
  });

  it("as colunas quebram o título em vez de o cortar, e o separador da contagem vem das traduções", () => {
    mostrar();
    const h = screen.getByRole("heading", { level: 3, name: /^Visita/ });
    expect(h.className).toContain("break-words");
    expect(h.className).not.toContain("truncate");
    expect(h.querySelector(".sr-only")?.textContent).toBe(", 1 cartão");
  });

  it("com cartões não há aviso de quadro vazio", () => {
    mostrar();
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).not.toBeInTheDocument();
  });

  it("sem cartões mostra o aviso com 'Limpar filtros', que chama aoLimpar", () => {
    const aoLimpar = vi.fn();
    mostrar([], vi.fn(), "todas", aoLimpar);
    expect(screen.getByText("Nenhuma pessoa com estes filtros")).toBeInTheDocument();
    expect(screen.queryByText(/ficam na ficha e na lista/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(aoLimpar).toHaveBeenCalledOnce();
  });

  it("sem cartões com o chip Perdidas diz que as perdidas ficam na ficha e na lista", () => {
    const aoLimpar = vi.fn();
    mostrar([], vi.fn(), "perdidas", aoLimpar);
    expect(screen.getByText("As perdidas não aparecem no quadro: ficam na ficha e na lista.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(aoLimpar).toHaveBeenCalledOnce();
  });

  it("os cartões vivem numa lista e os botões levam a classe min-h-11 (não se mede o tamanho em px)", () => {
    mostrar();
    const lista = within(coluna("Negócio")).getByRole("list");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(4);
    for (const b of within(lista).getAllByRole("button")) expect(b.className).toContain("min-h-11");
  });
});
