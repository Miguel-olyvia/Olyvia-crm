import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import type { ItemProcesso } from "../processo/tiposProcesso";
import { LinhaNegociosPessoa } from "./LinhaNegociosPessoa";

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

const item = (extra: Partial<ItemProcesso>): ItemProcesso => ({
  id: "n1", pessoaId: "p1", tipo: "negocio", fase: "orcamento", trabalho: "Cozinha", valor: 9000, prazo: null, atrasado: false,
  orcamentos: 0, verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
});

const ITENS: ItemProcesso[] = [
  item({}),
  item({ id: "n2", trabalho: "Sala", fase: "proposta", valor: 3000, orcamentos: 1 }),
  item({ id: "pessoa-p1", tipo: "pessoa", fase: "porContactar", trabalho: null, valor: null }),
  item({ id: "n3", trabalho: "Janelas", fase: "levantamento", valor: null }),
];

const mostrar = (itens = ITENS, aoAbrir = vi.fn()) => {
  render(<LinhaNegociosPessoa pessoaId="p1" nome="Ana Lopes" itens={itens} hoje="2026-10-13" aoAbrir={aoAbrir} />);
  return aoAbrir;
};
const linhas = () => within(screen.getByRole("list", { name: "Negócios de Ana Lopes" })).getAllByRole("listitem");

describe("LinhaNegociosPessoa", () => {
  it("é uma lista com nome (role=list) e uma linha por item, sem headings", () => {
    mostrar();
    expect(linhas()).toHaveLength(4);
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
  });

  it("cada linha mostra o trabalho, a etiqueta, a fase e o valor", () => {
    mostrar();
    const [negocio, , pessoa] = linhas();
    expect(within(negocio).getByText("Cozinha")).toBeInTheDocument();
    expect(within(negocio).getByText("Negócio")).toBeInTheDocument();
    expect(within(negocio).getByText("Orçamento")).toBeInTheDocument();
    expect(within(negocio).getByText(formatarMeta("euro", 9000))).toBeInTheDocument();
    // Uma pessoa em abordagem não tem trabalho nem é um negócio: diz «Abordagem» (no trabalho e na etiqueta).
    expect(within(pessoa).getAllByText("Abordagem")).toHaveLength(2);
    expect(within(pessoa).queryByText("Negócio")).not.toBeInTheDocument();
    expect(within(pessoa).getByText("Por contactar")).toBeInTheDocument();
    expect(within(pessoa).getByText("Valor a definir")).toBeInTheDocument();
  });

  it("cada linha diz 'A fazer:' e tem o botão do passo certo para a sua fase", () => {
    mostrar();
    const [orcamento, proposta, pessoa, levantamento] = linhas();
    for (const l of [orcamento, proposta, pessoa, levantamento]) expect(within(l).getByText("A fazer:")).toBeInTheDocument();
    expect(within(orcamento).getByRole("button", { name: /^Criar o orçamento/ })).toBeInTheDocument();
    expect(within(proposta).getByRole("button", { name: /^Registar a resposta do cliente/ })).toBeInTheDocument();
    expect(within(pessoa).getByRole("button", { name: /^Registar a chamada/ })).toBeInTheDocument();
    expect(within(levantamento).getByRole("button", { name: /^Fazer o levantamento/ })).toBeInTheDocument();
    expect(within(levantamento).getByText("Levantamento")).toBeInTheDocument();
  });

  it("o botão do passo abre a ficha da pessoa (não há botões mortos nesta fase)", () => {
    const aoAbrir = mostrar();
    for (const botao of screen.getAllByRole("button")) fireEvent.click(botao);
    expect(aoAbrir).toHaveBeenCalledTimes(4);
    expect(aoAbrir).toHaveBeenCalledWith("p1");
  });

  it("o botão é do tipo button e tem alvo de 44 px", () => {
    mostrar([item({})]);
    const botao = screen.getByRole("button");
    expect(botao).toHaveAttribute("type", "button");
    expect(botao.className).toContain("min-h-11");
  });

  it("o nome acessível é '{passo}: {trabalho} de {nome} (abre a ficha)', começa pelo texto visível, e distingue sub-linhas da mesma pessoa", () => {
    mostrar();
    const [orcamento, proposta, pessoa, levantamento] = linhas();
    const nomes = [orcamento, proposta, pessoa, levantamento].map((l) => within(l).getByRole("button"));
    expect(nomes[0]).toHaveAccessibleName("Criar o orçamento: Cozinha de Ana Lopes (abre a ficha)");
    expect(nomes[1]).toHaveAccessibleName("Registar a resposta do cliente: Sala de Ana Lopes (abre a ficha)");
    expect(nomes[2]).toHaveAccessibleName("Registar a chamada: Abordagem de Ana Lopes (abre a ficha)");
    expect(nomes[3]).toHaveAccessibleName("Fazer o levantamento: Janelas de Ana Lopes (abre a ficha)");
    for (const b of nomes) expect(b.getAttribute("aria-label")!.startsWith(b.textContent!)).toBe(true);
    expect(new Set(nomes.map((b) => b.getAttribute("aria-label"))).size).toBe(4);
  });

  it("fase, valor e prazo levam um rótulo só para leitores de ecrã, e o texto lido não fica solto", () => {
    mostrar([item({ prazo: "2026-10-20" }), item({ id: "n3", prazo: null, valor: null })]);
    const [com, sem] = linhas();
    const rotulos = (l: HTMLElement) => Array.from(l.querySelectorAll(".sr-only")).map((e) => e.textContent);
    expect(rotulos(com)).toEqual(expect.arrayContaining([expect.stringMatching(/^Fase:/), expect.stringMatching(/^Valor:/), expect.stringMatching(/^Prazo:/)]));
    expect(rotulos(sem).some((r) => r?.startsWith("Prazo:"))).toBe(false);
    expect(com).toHaveTextContent(/Fase: Orçamento.*Valor: .*9.*Prazo: Até 20\/10/);
    expect(sem).toHaveTextContent(/Valor: Valor a definir/);
  });

  it("um item em atraso mostra o aviso em texto, não só em cor; o texto é foreground e a cor fica só no ícone", () => {
    mostrar([item({ prazo: "2026-10-01", atrasado: true })]);
    const aviso = screen.getByText(/Prazo ultrapassado/);
    expect(aviso.className).toContain("text-foreground");
    expect(aviso.className).not.toContain("text-destructive");
    expect(aviso.querySelector("svg")?.getAttribute("class")).toContain("text-destructive");
  });

  it("sem itens não desenha lista nenhuma", () => {
    mostrar([]);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
