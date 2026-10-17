import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { negocioBase, pedidoBase, pessoaBase, resumoBase, visitaBase } from "../fabricaTestes";
import type { PedidoNegocio } from "../pessoasTipos";
import { itemEmFoco, itensDaPessoa } from "./itensProcesso";

const levantamento = (n: number): RascunhoLevantamento => ({
  linhas: Array.from({ length: n }, (_, i) => ({
    id: `l${i}`, divisao: "cozinha", trabalho: "pavimento", trabalhoOutro: "", medida: "12", unidade: "m2", observacoes: "",
  })),
  observacoes: "", respostas: {},
});

const porContactar = pedidoBase("pd-1", { servico: "Cozinha" });
const comVisita = pedidoBase("pd-2", { servico: "Pintura", contactado: true, visitas: [visitaBase("pd-2-v1")] });
const feitaComLinhas = pedidoBase("pd-3", {
  servico: "Janelas", contactado: true, visitas: [visitaBase("pd-3-v1", { estado: "feita" })], levantamento: levantamento(2),
});
const aberto = negocioBase("n1", { orcamentos: [{ id: "o", valor: 1000, escolhido: true }] });

const itens = (pedidos: PedidoNegocio[], abertos = [] as ReturnType<typeof negocioBase>[]) =>
  itensDaPessoa(resumoBase(pessoaBase("a"), abertos, HOJE_EXEMPLO, "lead", pedidos), HOJE_EXEMPLO);

describe("itensDaPessoa", () => {
  it("um item por pedido, com o id do cartão (pedido-<id>), o pedidoId e o serviço como trabalho", () => {
    const [a, b] = itens([porContactar, comVisita]);
    expect(a).toMatchObject({ id: "pedido-pd-1", pedidoId: "pd-1", tipo: "pedido", fase: "porContactar", trabalho: "Cozinha", pessoaId: "a" });
    expect(b).toMatchObject({ id: "pedido-pd-2", pedidoId: "pd-2", tipo: "pedido", fase: "visita", trabalho: "Pintura" });
  });

  it("os pedidos ficam ao lado dos negócios abertos: primeiro os pedidos, depois os negócios (sem pedidoId)", () => {
    const lista = itens([porContactar, comVisita], [aberto]);
    expect(lista.map((i) => [i.id, i.tipo, i.pedidoId])).toEqual([
      ["pedido-pd-1", "pedido", "pd-1"], ["pedido-pd-2", "pedido", "pd-2"], ["n1", "negocio", null],
    ]);
  });

  it("visitaFeita vem do pedido, de cada um o seu", () => {
    const [por, visita, feita] = itens([porContactar, comVisita, feitaComLinhas]);
    expect([por.visitaFeita, visita.visitaFeita, feita.visitaFeita]).toEqual([false, false, true]);
  });

  it("o prazo de um pedido em Visita é o da sua próxima visita por fazer; atrasado se o dia já passou", () => {
    const passada = pedidoBase("pd-9", { contactado: true, visitas: [visitaBase("v", { data: "2026-10-01" })] });
    const [seguinte, atrasado] = itens([comVisita, passada]);
    expect(seguinte).toMatchObject({ prazo: "2026-10-20", atrasado: false });
    expect(atrasado).toMatchObject({ prazo: "2026-10-01", atrasado: true });
  });

  it("um negócio não tem visita feita", () => {
    const [n] = itens([], [aberto]);
    expect(n).toMatchObject({ tipo: "negocio", visitaFeita: false, orcamentos: 1, orcamentoEscolhido: true });
  });

  it("uma pessoa perdida não tem itens", () => {
    const perdida = pessoaBase("a", { perdida: { motivo: "preco", data: "2026-10-01" } });
    expect(itensDaPessoa(resumoBase(perdida, [], HOJE_EXEMPLO, "lead", [porContactar]), HOJE_EXEMPLO)).toEqual([]);
  });
});

describe("itemEmFoco", () => {
  it("com negócio aberto é o do negócio mais avançado, mesmo com pedidos ao lado", () => {
    const r = resumoBase(pessoaBase("a"), [aberto], HOJE_EXEMPLO, "lead", [porContactar]);
    expect(itemEmFoco(r, itensDaPessoa(r, HOJE_EXEMPLO))?.id).toBe("n1");
  });

  it("sem negócio aberto é o do pedido mais avançado", () => {
    const r = resumoBase(pessoaBase("a"), [], HOJE_EXEMPLO, "lead", [porContactar, comVisita]);
    expect(itemEmFoco(r, itensDaPessoa(r, HOJE_EXEMPLO))?.id).toBe("pedido-pd-2");
  });

  it("sem itens, null", () => {
    expect(itemEmFoco({ abertos: [], pedidos: [] }, [])).toBeNull();
  });
});
