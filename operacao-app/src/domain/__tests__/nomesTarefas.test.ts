import { describe, expect, it } from "vitest";
import { etiquetaServico, nomesCurtos, separarNome, servicosDistintos } from "../nomesTarefas";

const S = "MO Modelo 3 - Casa de Banho: Remoção de Banheira ou Poliban  + Elevação da Torneira + Revestimento até teto";

describe("nomes curtos das tarefas", () => {
  it("separa pelo último ': ' (o serviço também tem ':')", () => {
    expect(separarNome(`${S}: Isolamento e proteção da área`)).toEqual({ prefixo: S, resto: "Isolamento e proteção da área" });
    expect(separarNome("Limpeza final")).toEqual({ prefixo: null, resto: "Limpeza final" });
  });

  it("só tira o serviço quando se repete; a etiqueta só conta com mais de um serviço", () => {
    const n = nomesCurtos([
      { id: "a", nome: `${S}: Isolamento` },
      { id: "b", nome: `${S}: Demolição` },
      { id: "c", nome: "Pintura: tetos" },
    ]);
    expect(n.get("a")).toEqual({ curto: "Isolamento", servico: S });
    expect(n.get("c")).toEqual({ curto: "Pintura: tetos", servico: null });
    expect(servicosDistintos(n)).toBe(1);
  });

  it("etiqueta: sem 'MO', até ao primeiro ':', cortada", () => {
    expect(etiquetaServico(S)).toBe("Modelo 3 - Casa de Banho");
    expect(etiquetaServico("Remodelação completa de cozinha com ilha central", 20)).toBe("Remodelação complet…");
  });
});
