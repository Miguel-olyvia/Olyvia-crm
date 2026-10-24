// O que o painel «Visita e levantamento» leva quando se abre sobre uma PESSOA: ela, o comercial dela, as visitas dela (a lista inteira) e o
// último levantamento dela por ligar. Função pura.
import { describe, expect, it } from "vitest";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { levantamentoBase, pessoaBase, registosBase, visitaPessoaBase } from "./fabricaTestes";
import { valoresIniciaisDosRegistos } from "./valoresRegistos";

const rascunho = (observacoes: string): RascunhoLevantamento => ({
  linhas: [{ id: "l1", divisao: "cozinha", trabalho: "outro", trabalhoOutro: "Bancada", medida: "3", unidade: "m2", observacoes: "" }],
  observacoes, respostas: { q1: "a" }, moradaObra: { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "" },
});

describe("valoresIniciaisDosRegistos", () => {
  it("traz a pessoa, o comercial dela e as visitas (a lista inteira), sem levantamento quando ainda não há", () => {
    const registos = registosBase({ visitas: [visitaPessoaBase("rv-1"), visitaPessoaBase("rv-2", { data: "2026-10-30" })] });
    const valores = valoresIniciaisDosRegistos(pessoaBase("a", { comercial: "Bruno Costa" }), registos);
    expect(valores).toMatchObject({ pessoaId: "a", comercial: "Bruno Costa" });
    expect(valores.visitas?.map((v) => v.id)).toEqual(["rv-1", "rv-2"]);
    expect(valores).not.toHaveProperty("levantamento");
  });

  it("leva o último levantamento por ligar (linhas, observações, respostas e morada da obra)", () => {
    const registos = registosBase({
      levantamentos: [levantamentoBase("rl-1", { data: "2026-10-01", rascunho: rascunho("antigo") }), levantamentoBase("rl-2", { data: "2026-10-12", rascunho: rascunho("recente") })],
    });
    expect(valoresIniciaisDosRegistos(pessoaBase("a"), registos).levantamento?.observacoes).toBe("recente");
  });

  it("um levantamento ligado a um negócio não se edita aqui: não conta", () => {
    const registos = registosBase({ levantamentos: [levantamentoBase("rl-1", { negocioId: "n1", rascunho: rascunho("ligado") })] });
    expect(valoresIniciaisDosRegistos(pessoaBase("a"), registos)).not.toHaveProperty("levantamento");
  });

  it("não partilha a lista de visitas com os registos (copiar, não referir)", () => {
    const registos = registosBase({ visitas: [visitaPessoaBase("rv-1")] });
    expect(valoresIniciaisDosRegistos(pessoaBase("a"), registos).visitas).not.toBe(registos.visitas);
  });

  it("sem registos, abre vazio: a pessoa, o comercial dela e nenhuma visita", () => {
    expect(valoresIniciaisDosRegistos(pessoaBase("a", { comercial: "Carla Mendes" }), registosBase())).toEqual({ pessoaId: "a", comercial: "Carla Mendes", visitas: [] });
  });
});

describe("valoresIniciaisDosRegistos: os dados próprios do levantamento", () => {
  it("o levantamento por ligar leva a data, o estado e o comercial (nome) que já tem", () => {
    const registos = registosBase({
      levantamentos: [levantamentoBase("rl-1", { data: "2026-10-12", feitoPor: "Carla Dias", estado: "feito", rascunho: rascunho("x") })],
    });
    expect(valoresIniciaisDosRegistos(pessoaBase("a"), registos).levantamento?.dados).toEqual({
      data: "2026-10-12", estado: "feito", feitoPor: "Carla Dias",
    });
  });

  it("sem estado nem comercial gravados: por fazer e sem nome", () => {
    const registos = registosBase({ levantamentos: [levantamentoBase("rl-1", { data: "2026-10-12", feitoPor: "", rascunho: rascunho("x") })] });
    expect(valoresIniciaisDosRegistos(pessoaBase("a"), registos).levantamento?.dados).toEqual({ data: "2026-10-12", estado: "porFazer", feitoPor: "" });
  });
});
