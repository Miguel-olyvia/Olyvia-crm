// 11/11: as perguntas da visita no Estúdio e o que o Estúdio responde sozinho (pé-direito, janela, toalheiro).
import { describe, expect, it } from "vitest";
import { PROJETO_EXEMPLO } from "./exemploEstudio";
import { faltamPerguntas, perguntasDe, respostasDoNegocio } from "./perguntasDaVisita";
import { respostasDoEstudio } from "./respostasDoEstudio";
import type { Projeto } from "./necessidadesEstudio";

const projeto = (x: Partial<Projeto> = {}): Projeto => ({ ...structuredClone(PROJETO_EXEMPLO), negocio: 1, ...x });

describe("as perguntas da visita no Estúdio (11/11)", () => {
  it("pergunta o que falta (sem o pé-direito, a janela, o toalheiro nem a divisão) e conta o que já está respondido", () => {
    const p = projeto({ perguntas: respostasDoNegocio({ diag_gas: "Não há", materiais_cliente: "Não" }, "") });
    const ks = perguntasDe(p).map((q) => q.k);
    expect(ks).toContain("diag_pontos_eletricos");
    expect(ks).toContain("mobilidade_reduzida"); // casa de banho
    expect(ks).not.toContain("diag_pe_direito_m");
    expect(ks).not.toContain("diag_janela");
    expect(faltamPerguntas(p).map((q) => q.k)).not.toContain("diag_gas");
  });
  it("as respostas do Estúdio levam as perguntas, o pé-direito, a janela e o toalheiro", () => {
    const p = projeto({ perguntas: { diag_gas: "Manter" }, alturas: { peDireito: 262, tetoFalso: null } });
    const r = respostasDoEstudio(p);
    expect(r.diag_gas).toBe("Manter");
    expect(r.diag_pe_direito_m).toBe("2,6 m");
    expect(["Sim", "Não"]).toContain(r.diag_janela);
    expect(["Sim", "Não"]).toContain(r.diag_toalheiro);
    expect(respostasDoEstudio(projeto({ alturas: { peDireito: 310, tetoFalso: null } })).diag_pe_direito_m).toBe("3 m ou mais");
  });
});
