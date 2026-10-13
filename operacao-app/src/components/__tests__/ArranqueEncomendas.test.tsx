import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("../../lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { EncomendaClienteCartao } from "../arranque/EncomendaClienteCartao";
import { NotaEncomendaCartao } from "../arranque/NotaEncomendaCartao";
import { DadosEmFalta } from "../arranque/DadosEmFalta";

const L = (p: Record<string, unknown>) => ({
  id: String(p.id), tipo: "produto", product_id: "p", descricao: "Torneira", unidade: "un",
  qtd_necessaria: 2, qtd_stock: 0, qtd_em_encomenda: 1, qtd_em_falta: 1, origem: "orcamento",
  supplier_id: "s1", fornecedor_nome: "Leroy Pro", fornecedor_origem: "preferido", fornecedor_mudado: false, ...p,
});

const obter = (estado: "rascunho" | "validada", extra: Record<string, unknown> = {}) => ({
  contrato: { id: "c1", numero: "CC-1", estado: "signed", assinado: true },
  pode: { editar: true, validar: true, aprovar: true, mudar_fornecedor: true },
  encomenda: { id: "e1", estado, fornecedor_estado: estado === "validada" ? "por_aprovar" : "por_gerar", versao: 1,
               validada_em: "2026-10-13T10:00:00Z", validada_por_nome: "Paula" },
  linhas: [
    L({ id: "a" }),
    L({ id: "b", descricao: "Espelho", supplier_id: null, fornecedor_nome: null, fornecedor_origem: "nenhum" }),
    L({ id: "c", tipo: "consumivel", descricao: "Silicone", servico_nome: "Canalização", qtd_em_falta: 0 }),
    L({ id: "d", tipo: "mao_obra", product_id: null, descricao: "Mão de obra · Canalizador", unidade: "h", qtd_necessaria: 5 }),
  ],
  notas: [
    { id: "n1", estado: "proposta", supplier_id: "s1", fornecedor_nome: "Leroy Pro", total: 40, prazo_previsto: "2026-10-18",
      linhas: [{ id: "nl1", product_id: "p", descricao: "Torneira", qtd: 1, preco_compra: 40 }] },
    { id: "n2", estado: "proposta", supplier_id: null, fornecedor_nome: null, total: 0, prazo_previsto: null,
      linhas: [{ id: "nl2", product_id: "p2", descricao: "Espelho", qtd: 1, preco_compra: null }] },
  ],
  fornecedores: [{ id: "s1", nome: "Leroy Pro" }, { id: "s2", nome: "Banema" }],
  ...extra,
});

beforeEach(() => rpc.mockReset());

describe("EncomendaClienteCartao", () => {
  it("mostra as linhas por tipo, com o porquê do fornecedor, e valida", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "rpc_ec_obter" ? { data: obter("rascunho"), error: null } : { data: { notas: 1 }, error: null }
    );
    const aoMudar = vi.fn();
    render(<EncomendaClienteCartao contratoId="c1" obraId="o1" aoMudar={aoMudar} />);
    expect(await screen.findByText("Produtos")).toBeInTheDocument();
    expect(screen.getByText("Consumíveis")).toBeInTheDocument();
    expect(screen.getByText("Mão de obra")).toBeInTheDocument();
    expect(screen.getByText("sem fornecedor preferido nem marca ligada")).toBeInTheDocument();
    expect(screen.getByText("de Canalização")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Validar/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_ec_validar", { p_encomenda_id: "e1" }));
    await waitFor(() => expect(aoMudar).toHaveBeenCalled());
  });

  it("reabrir pede motivo", async () => {
    rpc.mockImplementation(async () => ({ data: obter("validada"), error: null }));
    render(<EncomendaClienteCartao contratoId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Reabrir" }));
    const dialogo = screen.getByText("Reabrir a Encomenda Cliente").closest("div")!.parentElement!;
    const todos = within(dialogo).getAllByRole("button", { name: "Reabrir" });
    const botao = todos[todos.length - 1];
    expect(botao).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Cliente acrescentou um espelho" } });
    fireEvent.click(botao);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_ec_reabrir", { p_encomenda_id: "e1", p_motivo: "Cliente acrescentou um espelho" })
    );
  });

  it("SQL por instalar: diz isso, sem erro vermelho", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Could not find the function public.rpc_ec_obter", code: "PGRST202" } });
    render(<EncomendaClienteCartao contratoId="c1" />);
    expect(await screen.findByText(/Por instalar/)).toBeInTheDocument();
  });
});

describe("NotaEncomendaCartao", () => {
  it("a nota sem fornecedor não aprova; mudar fornecedor e aprovar chamam as RPCs", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "rpc_ec_obter" ? { data: obter("validada"), error: null } : { data: "x", error: null }
    );
    render(<NotaEncomendaCartao contratoId="c1" />);
    const notas = await screen.findAllByTestId("nota");
    expect(notas).toHaveLength(2);
    const sem = notas[1];
    expect(within(sem).getByText(/Escolha o fornecedor/)).toBeInTheDocument();
    expect(within(sem).getByRole("button", { name: /Aprovar/ })).toBeDisabled();
    fireEvent.change(within(sem).getByLabelText("Mudar o fornecedor de Espelho"), { target: { value: "s2" } });
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_nota_mudar_fornecedor", { p_nota_linha_id: "nl2", p_supplier_id: "s2" })
    );
    fireEvent.click(within(notas[0]).getByRole("button", { name: /Aprovar/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_nota_aprovar", { p_nota_id: "n1" }));
  });

  it("o erro da RPC aparece em português", async () => {
    rpc.mockImplementation(async (nome: string) =>
      nome === "rpc_ec_obter"
        ? { data: obter("validada"), error: null }
        : { data: null, error: { message: "Sem permissão para aprovar notas de encomenda (purchase_orders.approve).", code: "42501" } }
    );
    render(<NotaEncomendaCartao contratoId="c1" />);
    const notas = await screen.findAllByTestId("nota");
    fireEvent.click(within(notas[0]).getByRole("button", { name: /Aprovar/ }));
    expect(await screen.findByText(/Sem permissão para aprovar notas/)).toBeInTheDocument();
  });

  it("nada em falta: Não necessária", async () => {
    rpc.mockResolvedValue({
      data: obter("validada", { notas: [], encomenda: { id: "e1", estado: "validada", fornecedor_estado: "nao_necessaria", versao: 1 } }),
      error: null,
    });
    render(<NotaEncomendaCartao contratoId="c1" />);
    expect(await screen.findByText("Não necessária")).toBeInTheDocument();
  });
});

describe("DadosEmFalta", () => {
  it("lista e liga marca → fornecedor", async () => {
    const dados = {
      resumo: { produtos_vendidos: 7, sem_fornecedor_preferido: 4, sem_fornecedor: 2, sem_preco_compra: 5,
                sem_gestao_stock: 5, servicos_vendidos: 3, servicos_sem_ficha: 1, marcas_por_ligar: 1, encomendas_paradas: 0 },
      produtos: [{ product_id: "p", nome: "Espelho", sku: "ESP", marca: null, contratos: 1, tem_preferido: false,
                   tem_preco: false, gere_stock: false, resolvido_id: null, resolvido_nome: null, resolvido_origem: "nenhum" }],
      servicos_sem_ficha: [{ service_id: "sv", nome: "Pintura de teto", contratos: 1 }],
      marcas: [{ brand_id: "b", marca: "Roca", supplier_id: "s", fornecedor: "Roca", produtos: 2, vendidos: 1 }],
      encomendas_paradas: [],
      pode_ligar: true,
    };
    rpc.mockImplementation(async (nome: string) =>
      nome === "rpc_ec_dados_em_falta" ? { data: dados, error: null } : { data: { marcadas: 0, criadas: 2, total: 2 }, error: null }
    );
    render(<DadosEmFalta orgId="org" />);
    expect(await screen.findByText("Pintura de teto")).toBeInTheDocument();
    expect(screen.getByText("sem fornecedor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ligar marca → fornecedor" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("rpc_ec_ligar_marca_fornecedor", { p_org: "org", p_brand_id: "b", p_supplier_id: "s" })
    );
    expect(await screen.findByText(/2 produtos Roca com Roca como fornecedor preferido/)).toBeInTheDocument();
  });
});
