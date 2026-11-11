// 11/11: o guia ao vivo (quando se pede, como se junta) e o que a função devolve, limpo (supabase/functions/_shared/conversa.ts).
import { describe, expect, it } from "vitest";
import { GUIA_FALAS_NOVAS, GUIA_INTERVALO_MS, TEMAS_GUIA, contasGuia, devePedirGuia, juntarGuia, type GuiaConversa } from "./guiaConversa";
import { correrEmParalelo } from "./blocosAudio";
import { esquemaInsights, limparGuia, textoGuia, INSTRUCAO_INSIGHTS } from "../../supabase/functions/_shared/conversa";
import type { Fala } from "./chamadaMotor";

const fala = (i: number, revista = true): Fala => ({ inicio: i * 5, fim: i * 5 + 4, texto: `frase ${i}`, falante: i % 2 ? "cliente" : "comercial", confianca_falante: 1, revista });

describe("guia ao vivo: quando se pede", () => {
  it("só com falas revistas suficientes; depois, com falas novas e tempo desde o último", () => {
    const poucas = Array.from({ length: GUIA_FALAS_NOVAS - 1 }, (_, i) => fala(i));
    expect(devePedirGuia(poucas, null, 0)).toBe(false);
    const provisorias = Array.from({ length: 10 }, (_, i) => fala(i, false));
    expect(devePedirGuia(provisorias, null, 0)).toBe(false);
    const tres = Array.from({ length: GUIA_FALAS_NOVAS }, (_, i) => fala(i));
    expect(devePedirGuia(tres, null, 0)).toBe(true);
    const ultimo = { revistas: GUIA_FALAS_NOVAS, em: 1000 };
    const seis = Array.from({ length: GUIA_FALAS_NOVAS * 2 }, (_, i) => fala(i));
    expect(devePedirGuia(seis, ultimo, 1000 + GUIA_INTERVALO_MS - 1)).toBe(false); // cedo demais
    expect(devePedirGuia(tres, ultimo, 1000 + GUIA_INTERVALO_MS * 2)).toBe(false); // nada de novo
    expect(devePedirGuia(seis, ultimo, 1000 + GUIA_INTERVALO_MS)).toBe(true);
    // num ficheiro não há intervalo: só falas novas
    expect(devePedirGuia(seis, ultimo, 1001, 0)).toBe(true);
  });
});

describe("guia ao vivo: juntar e contar", () => {
  const g = (estados: Record<string, "respondido" | "parcial" | "por_falar">, pergunta: string): GuiaConversa => ({
    temas: Object.entries(estados).map(([chave, estado]) => ({ chave, estado, resposta: estado === "por_falar" ? null : `r ${chave}`, linha: null })),
    proxima: { pergunta, porque: null }, alerta: null,
  });
  it("um tema nunca recua (respondido fica respondido), e a próxima pergunta é a nova", () => {
    const a = g({ orcamento: "respondido", prazo: "parcial", decisores: "por_falar" }, "Para quando?");
    const b = g({ orcamento: "por_falar", prazo: "respondido", decisores: "parcial" }, "Quem decide?");
    const j = juntarGuia(a, b);
    expect(j.temas.map((t) => t.estado)).toEqual(["respondido", "respondido", "parcial"]);
    expect(j.temas[0].resposta).toBe("r orcamento");
    expect(j.proxima.pergunta).toBe("Quem decide?");
    // sem pergunta nova, fica a anterior
    expect(juntarGuia(j, { ...b, proxima: { pergunta: null, porque: null } }).proxima.pergunta).toBe("Quem decide?");
    expect(contasGuia(j)).toEqual({ feitos: 2, meio: 1, total: 3 });
  });
});

describe("o que a função devolve, limpo (conversa.ts)", () => {
  it("limparGuia: os temas pela ordem pedida, os que faltam por falar, linhas fora caem, texto vazio é null", () => {
    const temas = TEMAS_GUIA.chamada.slice(0, 3);
    const r = limparGuia({
      temas: [{ chave: temas[1].k, estado: "respondido", resposta: " Porque a banheira verte ", linha: 4 }, { chave: "inventado", estado: "respondido" },
        { chave: temas[0].k, estado: "qualquer", resposta: "x", linha: 99 }],
      proxima: { pergunta: "  ", porque: "p" }, alerta: "",
    }, temas, 10);
    expect(r.temas.map((t) => [t.chave, t.estado, t.resposta, t.linha])).toEqual([
      [temas[0].k, "por_falar", null, null], [temas[1].k, "respondido", "Porque a banheira verte", 4], [temas[2].k, "por_falar", null, null]]);
    expect(r.proxima).toEqual({ pergunta: null, porque: "p" });
    expect(r.alerta).toBeNull();
  });
  it("textoGuia leva os temas com a pergunta de exemplo e a transcrição numerada", () => {
    const t = textoGuia([{ k: "orcamento", l: "Orçamento", pergunta: "Tem um valor em mente?" }], [{ inicio: 65, texto: "Até 5 mil.", falante: "cliente" }]);
    expect(t).toContain("- orcamento: Orçamento (ex.: «Tem um valor em mente?»)");
    expect(t).toContain("[0] 1:05 Cliente: Até 5 mil.");
  });
  it("na visita, a análise pede o levantamento (escolhas, medidas, valores); na chamada não", () => {
    const v = esquemaInsights("visita") as { properties: Record<string, unknown>; required: string[] };
    const c = esquemaInsights("chamada") as { properties: Record<string, unknown>; required: string[] };
    expect(v.required).toEqual(expect.arrayContaining(["escolhas", "medidas", "valores"]));
    expect(c.properties.escolhas).toBeUndefined();
    expect(INSTRUCAO_INSIGHTS("visita")).toContain("escolhas:");
    expect(INSTRUCAO_INSIGHTS("chamada")).not.toContain("escolhas:");
  });
});

describe("correrEmParalelo (as gravações carregadas)", () => {
  it("o primeiro sozinho, depois até n ao mesmo tempo, e os resultados pela ordem", async () => {
    let agora = 0, maximo = 0;
    const ordem: string[] = [];
    const r = await correrEmParalelo(7, 3, async (i) => {
      agora++; maximo = Math.max(maximo, agora); ordem.push(`+${i}`);
      await new Promise((ok) => setTimeout(ok, i === 0 ? 5 : 1 + ((i * 7) % 5)));
      agora--; ordem.push(`-${i}`);
      return i * 10;
    });
    expect(r).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(ordem.slice(0, 2)).toEqual(["+0", "-0"]);
    expect(maximo).toBe(3);
  });
  it("sem blocos não chama nada; com um só, só esse", async () => {
    expect(await correrEmParalelo(0, 4, async () => 1)).toEqual([]);
    expect(await correrEmParalelo(1, 4, async (i) => i + 1)).toEqual([1]);
  });
});
