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
  id: "pedido-a", pessoaId: "a", nome: "Ana Lopes", papel: "lead", coluna: "porContactar", trabalho: null, valor: null,
  passo: "registarChamada", prazo: null, atrasado: false, ...extra,
});

const CARTOES: CartaoQuadro[] = [
  cartao({}),
  cartao({ id: "pedido-b", pessoaId: "b", nome: "Bruno Reis", coluna: "porContactar" }),
  cartao({ id: "pedido-c", pessoaId: "c", nome: "Clara Dias", coluna: "visita", passo: "fecharLevantamento", trabalho: "Casa de banho" }),
  cartao({ id: "n1", pessoaId: "d", nome: "Duarte Melo", papel: "cliente", coluna: "orcamento", trabalho: "Cozinha", valor: 9000, passo: "criarProposta" }),
  cartao({ id: "n2", pessoaId: "d", nome: "Duarte Melo", papel: "cliente", coluna: "orcamento", trabalho: "Sala", valor: 3000, passo: "escolherOrcamento" }),
  cartao({ id: "n3", pessoaId: "e", nome: "Eva Costa", coluna: "contrato", trabalho: "Telhado", valor: 7000, passo: "recolherAssinatura", prazo: "2026-10-01", atrasado: true }),
];

const mostrar = (cartoes = CARTOES, aoAbrir = vi.fn(), chip: ChipPessoa = "todas", aoLimpar = vi.fn()) => {
  render(<QuadroPessoas cartoes={cartoes} hoje={HOJE_EXEMPLO} chip={chip} aoAbrir={aoAbrir} aoLimpar={aoLimpar} />);
  return aoAbrir;
};

const coluna = (titulo: string) => screen.getByRole("heading", { level: 3, name: new RegExp(`^${titulo}`) }).closest("section")!;

describe("QuadroPessoas", () => {
  it("renderiza as 6 colunas pela ordem, cada uma com h3 e a contagem certa", () => {
    mostrar();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    const titulos = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titulos).toEqual([
      "Por contactar, 2 cartões", "Contactado, 0 cartões", "Visita, 1 cartão", "Orçamento, 2 cartões", "Proposta, 0 cartões", "Contrato, 1 cartão",
    ]);
    expect(screen.getAllByRole("region")).toHaveLength(6);
  });

  it("cada coluna sem nada diz 'Nada nesta fase'", () => {
    mostrar();
    expect(within(coluna("Contactado")).getByText("Nada nesta fase")).toBeInTheDocument();
    expect(within(coluna("Proposta")).getByText("Nada nesta fase")).toBeInTheDocument();
    expect(within(coluna("Visita")).queryByText("Nada nesta fase")).not.toBeInTheDocument();
  });

  it("o quadro vazio mostra o estado vazio nas 6 colunas", () => {
    mostrar([]);
    expect(screen.getAllByText("Nada nesta fase")).toHaveLength(6);
  });

  it("as colunas de negócio somam o valor; as de pedido não mostram valor", () => {
    mostrar();
    expect(within(coluna("Orçamento")).getByText(formatarMeta("euro", 12000))).toBeInTheDocument();
    // Um só cartão de 7000: o valor aparece no cartão e na soma da coluna.
    expect(within(coluna("Contrato")).getAllByText(formatarMeta("euro", 7000))).toHaveLength(2);
    expect(within(coluna("Proposta")).getByText(formatarMeta("euro", 0))).toBeInTheDocument();
    expect(within(coluna("Por contactar")).queryByText(/€/)).not.toBeInTheDocument();
  });

  it("o cartão mostra o rótulo Lead ou Cliente, o trabalho, o valor e o passo", () => {
    mostrar();
    const orc = within(coluna("Orçamento"));
    expect(orc.getAllByText("Cliente")).toHaveLength(2);
    expect(orc.getByText("Cozinha")).toBeInTheDocument();
    expect(orc.getByText(formatarMeta("euro", 9000))).toBeInTheDocument();
    expect(orc.getByRole("button", { name: /Criar a proposta/ })).toBeInTheDocument();
    expect(within(coluna("Por contactar")).getAllByText("Lead")).toHaveLength(2);
    expect(within(coluna("Por contactar")).getAllByText("Pedido novo")).toHaveLength(2);
  });

  it("um prazo ultrapassado diz-se por texto, não só por cor", () => {
    mostrar();
    expect(within(coluna("Contrato")).getByText(/Prazo ultrapassado/)).toBeInTheDocument();
  });

  it("clicar no nome abre a ficha dessa pessoa", () => {
    const aoAbrir = mostrar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir a ficha de Clara Dias" }));
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("c");
  });

  it("nesta fase o botão do próximo passo só abre a ficha da pessoa", () => {
    const aoAbrir = mostrar();
    fireEvent.click(screen.getByRole("button", { name: "Recolher a assinatura: Eva Costa" }));
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("e");
  });

  it("o texto do prazo ultrapassado não usa a cor destrutiva (só o ícone), por contraste", () => {
    mostrar();
    const p = within(coluna("Contrato")).getByText(/Prazo ultrapassado/);
    expect(p.className).not.toContain("text-destructive");
    expect(p.querySelector("svg")?.getAttribute("class")).toContain("text-destructive");
  });

  it("o botão do nome leva data-linha-pessoa com o id da pessoa; o do passo deixa o texto quebrar", () => {
    mostrar();
    expect(screen.getByRole("button", { name: "Abrir a ficha de Clara Dias" })).toHaveAttribute("data-linha-pessoa", "c");
    const passo = screen.getByRole("button", { name: "Fechar o levantamento: Clara Dias" });
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
    const lista = within(coluna("Orçamento")).getByRole("list");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    for (const b of within(lista).getAllByRole("button")) expect(b.className).toContain("min-h-11");
  });
});
