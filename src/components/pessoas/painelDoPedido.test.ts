// O que o painel «Novo negócio» leva quando se abre a partir de um pedido: a pessoa, o comercial, as visitas e o levantamento dele.
import { describe, expect, it } from "vitest";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { pedidoBase, pessoaBase, visitaBase } from "./fabricaTestes";
import { valoresIniciaisDoPedido } from "./painelDoPedido";

const rascunho: RascunhoLevantamento = {
  linhas: [{ id: "l1", divisao: "cozinha", trabalho: "outro", trabalhoOutro: "Bancada", medida: "3", unidade: "m2", observacoes: "" }],
  observacoes: "Ver canos", respostas: { q1: "a" }, moradaObra: { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "" },
};

describe("valoresIniciaisDoPedido", () => {
  it("traz a pessoa, o comercial do pedido e as visitas (a lista inteira), sem levantamento quando ainda não há", () => {
    const pedido = pedidoBase("pd-1", { pessoaId: "a", comercial: "Bruno Costa", visitas: [visitaBase("v1"), visitaBase("v2", { data: "2026-10-30" })] });
    const valores = valoresIniciaisDoPedido(pessoaBase("a"), pedido);
    expect(valores).toMatchObject({ pessoaId: "a", comercial: "Bruno Costa" });
    expect(valores).not.toHaveProperty("exigirLevantamento");
    expect(valores.visitas?.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(valores).not.toHaveProperty("levantamento");
  });

  it("leva o levantamento guardado (linhas, observações, respostas e morada da obra)", () => {
    const pedido = pedidoBase("pd-1", { visitas: [visitaBase("v1", { estado: "feita" })], levantamento: rascunho });
    expect(valoresIniciaisDoPedido(pessoaBase("a"), pedido).levantamento).toEqual(rascunho);
  });

  it("não exige visita nem levantamento: a visita é opcional e só havendo uma feita se pedem as medidas (a validação do formulário)", () => {
    expect(valoresIniciaisDoPedido(pessoaBase("a"), pedidoBase("pd-1"))).not.toHaveProperty("exigirLevantamento");
    expect(valoresIniciaisDoPedido(pessoaBase("a"), null)).not.toHaveProperty("exigirLevantamento");
  });

  it("não partilha a lista de visitas com o pedido (copiar, não referir)", () => {
    const pedido = pedidoBase("pd-1", { visitas: [visitaBase("v1")] });
    expect(valoresIniciaisDoPedido(pessoaBase("a"), pedido).visitas).not.toBe(pedido.visitas);
  });

  it("sem pedido (um pedido novo), abre vazio: a pessoa, o comercial dela e nenhuma visita", () => {
    const valores = valoresIniciaisDoPedido(pessoaBase("a", { comercial: "Carla Mendes" }), null);
    expect(valores).toEqual({ pessoaId: "a", comercial: "Carla Mendes", visitas: [] });
  });
});
