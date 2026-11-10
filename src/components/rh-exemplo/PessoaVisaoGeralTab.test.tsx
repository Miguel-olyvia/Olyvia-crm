/**
 * Visao geral da ficha (RH): o cartao Ativos mostra o material atribuido a pessoa e leva a aba Custo; os cartoes vazios
 * Tarefas, Formacoes e Despesas ja nao existem. Os valores dos equipamentos nunca chegam a quem nao ve retribuicoes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    language: "pt",
    t: (chave: string, params?: Record<string, unknown>) => (params ? `${chave}:${JSON.stringify(params)}` : chave),
  }),
}));
vi.mock("@/components/rh-exemplo/hooks/useAusenciasDaPessoa", () => ({ useAusenciasDaPessoa: () => ({ pedidos: [] }) }));

const estado = vi.hoisted(() => ({
  hook: { equipamentos: null as unknown, aCarregar: false, erro: null as string | null },
  chamadas: [] as Array<{ pessoaId?: string | null; enabled?: boolean } | undefined>,
}));
vi.mock("@/components/rh-exemplo/hooks/useEquipamentosCusto", () => ({
  useEquipamentosCusto: (opcoes?: { pessoaId?: string | null; enabled?: boolean }) => {
    estado.chamadas.push(opcoes);
    return estado.hook;
  },
}));

import { PessoaVisaoGeralTab } from "@/components/rh-exemplo/PessoaVisaoGeralTab";
import type { Pessoa } from "@/components/rh-exemplo/tipos";

const PESSOA = { id: "p1", email_trabalho: null, data_admissao: null } as unknown as Pessoa;
const equip = (id: string, estadoEq: "atribuido" | "devolvido", devolucao: string | null = null) => ({
  id, pessoaId: "p1", tipo: "portatil", descricao: `Equip ${id}`, valor: 999, entrega: "2026-01-01", estado: estadoEq, devolucao,
});

function montar(podeVerRetribuicao = true, onAbrirSeparador = vi.fn()) {
  render(
    <PessoaVisaoGeralTab
      pessoa={PESSOA} reportaANome={null} entidadeLegalNome={null} vinculos={[]} horarioRealizado={[]} retribuicao={null}
      podeVerRealizado podeVerAusencias={false} podeVerRetribuicao={podeVerRetribuicao} onAbrirSeparador={onAbrirSeparador}
    />,
  );
  return onAbrirSeparador;
}

beforeEach(() => {
  estado.hook = { equipamentos: null, aCarregar: false, erro: null };
  estado.chamadas = [];
});

describe("Visao geral: cartao Ativos", () => {
  it("mostra quantos equipamentos estao atribuidos, sem contar os devolvidos, e nunca o valor", () => {
    estado.hook = {
      equipamentos: [equip("a", "atribuido"), equip("b", "atribuido"), equip("c", "devolvido", "2026-03-01")],
      aCarregar: false, erro: null,
    };
    montar();
    const cartao = screen.getByRole("button", { name: /hr\.visaoGeral\.cards\.activos/ });
    expect(cartao.textContent).toContain('hr.visaoGeral.activosAtribuidos:{"contagem":2}');
    expect(cartao.textContent).not.toContain("999");
  });

  it("com zero atribuidos diz que nao ha nenhum", () => {
    estado.hook = { equipamentos: [equip("c", "devolvido", "2026-03-01")], aCarregar: false, erro: null };
    montar();
    expect(screen.getByRole("button", { name: /hr\.visaoGeral\.cards\.activos/ }).textContent).toContain("hr.visaoGeral.semActivos");
  });

  it("a carregar mostra o estado de carregamento, nao zero", () => {
    estado.hook = { equipamentos: null, aCarregar: true, erro: null };
    montar();
    const texto = screen.getByRole("button", { name: /hr\.visaoGeral\.cards\.activos/ }).textContent;
    expect(texto).toContain("hr.visaoGeral.activosACarregar");
    expect(texto).not.toContain("semActivos");
  });

  it("com erro de leitura mostra o erro, nunca zero equipamentos", () => {
    estado.hook = { equipamentos: null, aCarregar: false, erro: "falhou" };
    montar();
    const texto = screen.getByRole("button", { name: /hr\.visaoGeral\.cards\.activos/ }).textContent;
    expect(texto).toContain("hr.visaoGeral.activosErro");
    expect(texto).not.toContain("semActivos");
  });

  it("sem permissao de ver retribuicoes mostra «Sem acesso» e nao pede equipamentos", () => {
    montar(false);
    expect(screen.getByRole("button", { name: /hr\.visaoGeral\.cards\.activos/ }).textContent).toContain("hr.semAcesso");
    expect(estado.chamadas.every((c) => c?.enabled === false)).toBe(true);
  });

  it("so pede os equipamentos da pessoa aberta, e so com permissao", () => {
    montar(true);
    expect(estado.chamadas.length).toBeGreaterThan(0);
    expect(estado.chamadas.every((c) => c?.pessoaId === "p1" && c?.enabled === true)).toBe(true);
  });

  it("o clique abre a aba Custo", () => {
    estado.hook = { equipamentos: [equip("a", "atribuido")], aCarregar: false, erro: null };
    const onAbrir = montar();
    fireEvent.click(screen.getByRole("button", { name: /hr\.visaoGeral\.cards\.activos/ }));
    expect(onAbrir).toHaveBeenCalledWith("custo");
  });
});

describe("Visao geral: cartoes removidos", () => {
  it("Tarefas, Formacoes e Despesas ja nao existem, nem ha cartoes «Em construcao» desses", () => {
    montar();
    expect(screen.queryByText("hr.pessoa.tabs.tarefas")).toBeNull();
    expect(screen.queryByText("hr.visaoGeral.cards.formacoes")).toBeNull();
    expect(screen.queryByText("hr.visaoGeral.cards.despesas")).toBeNull();
  });
});
