// Os textos do assistente de passos do Pipeline: pt e en têm as mesmas chaves, cada passo das fases Contacto e Visita tem o seu nome, o cabeçalho
// «Passo N de M · faltam X respostas · tempo» tem todas as peças e as chaves do assistente chegam à página (nenhuma colide com outro módulo).
import { describe, expect, it } from "vitest";
import { pessoasGuiaTranslations } from "./pessoasGuia";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasGuiaTranslations;
const A = "pessoasPagina.assistente.";
const doAssistente = (lingua: Record<string, string>): string[] => Object.keys(lingua).filter((k) => k.startsWith(A)).sort();
const marcadores = (texto: string): string[] => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("textos do assistente de passos", () => {
  it("pt e en têm as mesmas chaves do assistente, todas com texto, e os mesmos {marcadores}", () => {
    expect(doAssistente(pt).length).toBeGreaterThan(40);
    expect(doAssistente(pt)).toEqual(doAssistente(en));
    for (const chave of doAssistente(pt)) {
      expect(pt[chave].trim(), chave).not.toBe("");
      expect(en[chave].trim(), chave).not.toBe("");
      expect(marcadores(en[chave]), chave).toEqual(marcadores(pt[chave]));
    }
  });

  it("os sete passos têm nome, e os da fase Contacto são os do desenho", () => {
    expect(["chamada", "qualificacao", "morada", "preparar", "marcar"].map((p) => pt[`${A}passo.${p}`])).toEqual([
      "Chamada", "Qualificação", "Morada da obra", "Preparar a visita", "Marcar a visita",
    ]);
    expect(pt[`${A}passo.visitas`]).toBe("Visitas");
    expect(pt[`${A}passo.fechar`]).toBe("Fechar levantamento");
  });

  it("o cabeçalho diz «Passo N de M · faltam X respostas · menos de 1 minuto»", () => {
    expect(pt[`${A}cabecalho.passo`]).toBe("Passo {n} de {m}");
    expect(pt[`${A}cabecalho.falta.varias`]).toBe("faltam {n} respostas");
    expect(pt[`${A}cabecalho.falta.uma`]).toBe("falta 1 resposta");
    expect(pt[`${A}tempo.menos`]).toBe("menos de 1 minuto");
    expect(pt[`${A}tempo.completo`]).toBe("completo");
  });

  it("o rodapé tem «Ir para» (com o nome do passo) e «Continuar», e os quatro estados de um passo dizem-se em texto", () => {
    expect(pt[`${A}irPara`]).toBe('Ir para "{passo}"');
    expect(pt[`${A}continuar`]).toBe("Continuar");
    for (const estado of ["feito", "atual", "comFalta", "porFazer"]) expect(pt[`${A}estado.${estado}`], estado).toBeTruthy();
  });

  it("Preparar a visita e a lista de visitas usam as palavras do protótipo", () => {
    expect(pt[`${A}preparar.duracao`]).toBe("Duração prevista");
    expect(pt[`${A}preparar.quem`]).toBe("Quem vai estar");
    expect(pt[`${A}preparar.nota`]).toBe("Nota para a visita (opcional)");
    expect(pt[`${A}visitas.titulo`]).toBe("Visita {n} · {tipo}");
    expect(pt[`${A}visitas.outra`]).toBe("Marcar outra visita");
    expect([pt[`${A}visitas.estado.porFazer`], pt[`${A}visitas.estado.feita`], pt[`${A}visitas.estado.cancelada`]]).toEqual(["Marcada", "Feita", "Cancelada"]);
  });

  it("estão juntos nos textos da página", () => {
    for (const chave of doAssistente(pt)) expect(pessoasPaginaTranslations.pt[chave], chave).toBe(pt[chave]);
    for (const chave of doAssistente(en)) expect(pessoasPaginaTranslations.en[chave], chave).toBe(en[chave]);
  });
});
