// Ligar um ativo de pessoa a uma atribuição do RH: só com ativos.edit E hr.pessoas.retribuicao.edit; lista só as atribuições ativas sem ativo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { Ativo, AtribuicaoSemAtivo } from "./lib/tipos";

const m = vi.hoisted(() => ({ permissoes: [] as string[], ligarPessoa: vi.fn() }));
vi.mock("@/hooks/useCountries", () => ({ useCountries: () => ({ countries: [], loading: false, error: null }) }));
vi.mock("@/hooks/ativos/useAtivoMutacoes", () => ({ useAtivoMutacoes: () => ({ ligarPessoa: m.ligarPessoa }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => m.permissoes.includes(p), loading: false }),
}));

import { LigarPessoaDialog } from "./LigarPessoaDialog";

const ATIVO = { id: "p2", nome: "Telemóvel 1", tipo: "telemovel" } as Ativo;
const ATRIBUICOES: AtribuicaoSemAtivo[] = [
  { id: "pe9", pessoaNome: "Rui Costa", tipo: "portatil", descricao: "Portátil velho", valor: 900, entrega: "2025-05-01", estado: "atribuido" },
  { id: "pe8", pessoaNome: "Inês Cardoso", tipo: "telemovel", descricao: "iPhone", valor: 700, entrega: "2025-06-01", estado: "atribuido" },
  { id: "pe6", pessoaNome: "Joana Reis", tipo: "outro", descricao: "Tablet", valor: 300, entrega: "2025-07-01", estado: "atribuido" },
  { id: "pe7", pessoaNome: "Hugo Teixeira", tipo: "portatil", descricao: "Já devolvido", valor: 500, entrega: "2024-01-01", estado: "devolvido" },
];
const TODAS = ["ativos.edit", "hr.pessoas.retribuicao.edit"];
const aoFechar = vi.fn();
const aoLigar = vi.fn();

const abrir = (ativo: Ativo | null = ATIVO, atribuicoes: AtribuicaoSemAtivo[] = ATRIBUICOES) =>
  render(
    <LanguageProvider>
      <LigarPessoaDialog ativo={ativo} atribuicoes={atribuicoes} aoFechar={aoFechar} aoLigar={aoLigar} />
    </LanguageProvider>,
  );

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  m.permissoes = TODAS;
  m.ligarPessoa.mockReset().mockResolvedValue({ ok: true });
  aoFechar.mockReset();
  aoLigar.mockReset();
});
afterEach(cleanup);

describe("LigarPessoaDialog", () => {
  it.each([[["ativos.edit"]], [["hr.pessoas.retribuicao.edit"]], [[]]])("escondido sem as duas permissões (%j)", (permissoes) => {
    m.permissoes = permissoes;
    abrir();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fechado quando não há ativo escolhido", () => {
    abrir(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  const opcoes = () => {
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Atribuição no RH/ }), { key: "Enter" });
    return screen.getAllByRole("option").map((o) => o.textContent ?? "");
  };

  it("lista só as atribuições ativas do mesmo tipo do ativo, ou «outro» em qualquer um dos lados (a base recusa o resto: ATV18)", () => {
    abrir();
    // O convite «Escolha a atribuição», o telemóvel (mesmo tipo) e o tablet «outro». Fora: o portátil (outro tipo) e o devolvido.
    const nomes = opcoes();
    expect(nomes).toHaveLength(3);
    expect(nomes[0]).toBe("Escolha a atribuição");
    expect(nomes.join("|")).toContain("Inês Cardoso");
    expect(nomes.join("|")).toContain("Joana Reis");
    expect(nomes.join("|")).not.toContain("Rui Costa");
    expect(nomes.join("|")).not.toContain("Hugo Teixeira");
  });

  it("um ativo do tipo «outro» liga a qualquer atribuição ativa", () => {
    abrir({ ...ATIVO, tipo: "outro" } as Ativo);
    const nomes = opcoes().join("|");
    for (const nome of ["Rui Costa", "Inês Cardoso", "Joana Reis"]) expect(nomes).toContain(nome);
    expect(nomes).not.toContain("Hugo Teixeira");
  });

  it("sem atribuições do tipo certo, diz qual é o tipo e não deixa confirmar", () => {
    abrir({ ...ATIVO, tipo: "viatura" } as Ativo, ATRIBUICOES.filter((a) => a.tipo !== "outro"));
    expect(screen.getByText("Não há atribuições ativas de «Viatura» no RH por ligar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ligar" })).toBeDisabled();
  });

  it("sem atribuições por ligar, diz-o e não deixa confirmar", () => {
    abrir(ATIVO, []);
    expect(screen.getByText("Não há atribuições ativas de «Telemóvel» no RH por ligar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ligar" })).toBeDisabled();
  });

  it("sem escolher a atribuição: bloqueia e avisa; escolhida: chama rpc_ativo_ligar_pessoa (via hook) e fecha", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    expect(screen.getByText("Escolha a atribuição.")).toBeInTheDocument();
    expect(m.ligarPessoa).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Atribuição no RH/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: /Inês Cardoso/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(m.ligarPessoa).toHaveBeenCalledWith("p2", "pe8"));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(aoLigar).toHaveBeenCalledWith({ nome: "Telemóvel 1", pessoa: "Inês Cardoso" });
  });

  it("ATV18 aparece num aviso, com o motivo que a base dá, e o diálogo fica aberto", async () => {
    m.ligarPessoa.mockResolvedValue({ ok: false, codigo: "ATV18", mensagem: "Esta atribuição já foi devolvida: a ligação fica no histórico." });
    abrir();
    fireEvent.keyDown(screen.getByRole("combobox", { name: /Atribuição no RH/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: /Inês Cardoso/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ligar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta atribuição já foi devolvida");
    expect(aoFechar).not.toHaveBeenCalled();
  });
});
