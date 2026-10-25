// Os textos do guia do passo: pt e en têm as mesmas chaves e os mesmos {marcadores}, e cada um dos passos do processo tem título e subtítulo
// (o guia monta a chave pelo nome do passo, e uma chave em falta aparecia como texto técnico no ecrã).
import { describe, expect, it } from "vitest";
import { PASSOS_PROCESSO } from "@/components/pessoas/processo/tiposProcesso";
import { pessoasGuiaTranslations } from "./pessoasGuia";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = pessoasGuiaTranslations;
const marcadores = (texto: string): string[] => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("textos do guia do passo", () => {
  it("pt e en têm as mesmas chaves, todas com texto", () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    for (const lingua of [pt, en]) for (const texto of Object.values(lingua)) expect(texto.trim()).not.toBe("");
  });

  it("os marcadores {x} são os mesmos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(marcadores(en[chave]), chave).toEqual(marcadores(pt[chave]));
  });

  it("cada passo do processo tem título e subtítulo", () => {
    for (const passo of PASSOS_PROCESSO) {
      expect(pt[`pessoasPagina.guia.titulo.${passo}`], passo).toBeTruthy();
      expect(pt[`pessoasPagina.guia.subtitulo.${passo}`], passo).toBeTruthy();
    }
    expect(pt["pessoasPagina.guia.titulo.registarChamada.pronto"]).toBe("Está tudo. Registar a chamada.");
  });

  it("estão juntos nos textos da página e nenhuma chave colide com outro módulo", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave], chave).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave], chave).toBe(en[chave]);
  });
});
