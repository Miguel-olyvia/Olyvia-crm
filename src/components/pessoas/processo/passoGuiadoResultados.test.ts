// Contactado: um último contacto «Sem interesse» ou «Número errado» AVISA e bloqueia «Marcar a visita», mas não toca em mais nada do guia.
import { describe, expect, it } from "vitest";
import { calcularPassoGuiado, fasesDaPessoa, type ContextoDoGuia, type DadosDoGuia } from "./passoGuiado";
import { PASSOS_PROCESSO, type ItemProcesso } from "./tiposProcesso";

const contactado: ItemProcesso = {
  id: "pessoa-a", pessoaId: "a", tipo: "pessoa", fase: "contactado", trabalho: null, valor: null, prazo: null, atrasado: false, orcamentos: 0,
  verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false,
};
const dados = (extra: Partial<DadosDoGuia> = {}): DadosDoGuia => ({
  nome: "Pedro", temContacto: true, temOrigem: true, chamadas: 1, visitasAtivas: 0, levantamentos: 0, ...extra,
});
const contexto = (d: DadosDoGuia): ContextoDoGuia => ({
  dados: d, fases: fasesDaPessoa("contactado"), podeEditar: true, podeCriar: true, pessoaFechada: false, ligados: new Set(PASSOS_PROCESSO),
});

describe("o botão «Marcar a visita» depois de uma chamada sem futuro", () => {
  it.each(["semInteresse", "numeroErrado"] as const)("%s: fica desativado, com a razão em texto", (resultado) => {
    const p = calcularPassoGuiado(contactado, contexto(dados({ ultimoResultado: resultado })));
    expect(p.passo).toBe("marcarVisita");
    expect(p.acao).toMatchObject({ passo: "marcarVisita", estado: "desativada", razaoChave: `pessoasPagina.guia.razao.${resultado}` });
  });

  it.each(["atendeuInteressado", "atendeuMaisTarde", "naoAtendeu", null, undefined] as const)("%s: continua pronto", (resultado) => {
    const p = calcularPassoGuiado(contactado, contexto(dados({ ultimoResultado: resultado })));
    expect(p.acao.estado).toBe("pronta");
  });

  it("não afeta o passo de registar a chamada (por contactar)", () => {
    const i: ItemProcesso = { ...contactado, fase: "porContactar" };
    const p = calcularPassoGuiado(i, { ...contexto(dados({ ultimoResultado: "semInteresse" })), fases: fasesDaPessoa("porContactar") });
    expect(p.acao.estado).toBe("pronta");
  });
});
