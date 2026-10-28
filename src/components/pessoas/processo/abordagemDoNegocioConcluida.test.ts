import { describe, expect, it } from "vitest";
import { itemComFaseConcluida, type LigadosDoNegocio } from "./abordagemDoNegocio";
import type { ItemProcesso } from "./tiposProcesso";

const item = (fase: ItemProcesso["fase"], tipo: ItemProcesso["tipo"] = "negocio"): ItemProcesso => ({
  id: "n", pessoaId: "p", tipo, fase, trabalho: null, valor: null, prazo: null, atrasado: false, orcamentos: 0, verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false,
});
const nada: LigadosDoNegocio = { contactos: 0, visitasMarcadas: 0, levantamentos: 0, comLevantamentoEscrito: false };

describe("itemComFaseConcluida (a fase avança no momento em que se conclui)", () => {
  it("registar a chamada leva Por contactar a Contactado", () => {
    expect(itemComFaseConcluida(item("porContactar"), { ...nada, contactos: 1 }).fase).toBe("contactado");
  });
  it("marcar a visita leva Contactado (ou Por contactar) a Visita", () => {
    expect(itemComFaseConcluida(item("contactado"), { ...nada, contactos: 1, visitasMarcadas: 1 }).fase).toBe("visita");
    expect(itemComFaseConcluida(item("porContactar"), { ...nada, visitasMarcadas: 1 }).fase).toBe("visita");
  });
  it("guardar o levantamento leva a Visita ao Levantamento (a coluna do grupo Negócio), também o escrito no negócio", () => {
    expect(itemComFaseConcluida(item("visita"), { ...nada, visitasMarcadas: 1, levantamentos: 1 }).fase).toBe("levantamento");
    expect(itemComFaseConcluida(item("visita"), { ...nada, comLevantamentoEscrito: true }).fase).toBe("levantamento");
  });
  it("nunca recua: uma fase já avançada fica, mesmo com poucos registos", () => {
    expect(itemComFaseConcluida(item("visita"), { ...nada, contactos: 1 }).fase).toBe("visita");
    expect(itemComFaseConcluida(item("levantamento"), nada).fase).toBe("levantamento");
  });
  it("fora da abordagem (orçamento, proposta, contrato) ou numa pessoa não mexe, e devolve o mesmo objeto se nada muda", () => {
    const orc = item("orcamento");
    expect(itemComFaseConcluida(orc, { ...nada, levantamentos: 1 })).toBe(orc);
    const pessoa = item("porContactar", "pessoa");
    expect(itemComFaseConcluida(pessoa, { ...nada, contactos: 3 })).toBe(pessoa);
    const igual = item("contactado");
    expect(itemComFaseConcluida(igual, { ...nada, contactos: 1 })).toBe(igual);
  });
});
