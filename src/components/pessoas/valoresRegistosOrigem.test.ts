// O painel abre com a origem da morada que o levantamento guardado já tem (entidade, manual ou localizacao), para a conservar se nada mudar.
import { describe, expect, it } from "vitest";
import { levantamentoBase, pessoaBase, registosBase } from "./fabricaTestes";
import { valoresIniciaisDosRegistos } from "./valoresRegistos";

const rascunho = { linhas: [], observacoes: "", respostas: {}, moradaObra: { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "" } };

describe("valoresIniciaisDosRegistos: moradaOrigem", () => {
  it("leva a origem do levantamento", () => {
    const registos = registosBase({ levantamentos: [levantamentoBase("rl-1", { rascunho, moradaOrigem: "localizacao" })] });
    expect(valoresIniciaisDosRegistos(pessoaBase("a"), registos).levantamento?.moradaOrigem).toBe("localizacao");
  });

  it("sem origem conhecida não inventa nenhuma", () => {
    const registos = registosBase({ levantamentos: [levantamentoBase("rl-1", { rascunho })] });
    expect(valoresIniciaisDosRegistos(pessoaBase("a"), registos).levantamento).not.toHaveProperty("moradaOrigem");
  });
});
