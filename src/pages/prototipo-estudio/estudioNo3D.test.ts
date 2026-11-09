// 9/11: a planta do Estúdio no 3D do Miguel: os produtos escolhidos dão a cor e a medida; as peças de parede e os móveis suspensos sobem.
import { describe, expect, it } from "vitest";
import { PROJETO_EXEMPLO } from "./exemploEstudio";
import { espacoDoEstudio, revestimentosDe } from "./estudioNo3D";
import { produto } from "./catalogoFake";

describe("o Estúdio no 3D do Miguel", () => {
  it("o depois: cada peça com produto tem o modelo com a cor dele; o espelho fica na parede e o móvel suspenso acima do chão", () => {
    const p = { ...PROJETO_EXEMPLO, escolhas: { ...PROJETO_EXEMPLO.escolhas } };
    const r = espacoDoEstudio(p, "depois");
    if ("erro" in r || !r.ok) throw new Error("a planta do exemplo devia abrir em 3D");
    for (const [pecaId, prodId] of Object.entries(p.escolhas)) {
      const pc = r.espaco.pecas.find((x) => x.id === pecaId);
      if (!pc) continue;
      expect(r.modelos[pc.produtoId].mockup3d.cor).toBe(produto(prodId)!.hex);
    }
    const tipo = (t: string) => p.depois.pecas.find((x) => x.tipo === t)?.id;
    const espelho = r.espaco.pecas.find((x) => x.id === tipo("espelho"));
    if (espelho) expect(espelho).toMatchObject({ montagem: "parede" });
    const movel = r.espaco.pecas.find((x) => x.id === tipo("movel"));
    if (movel && (produto(p.escolhas[movel.id])?.z0 ?? 0) > 5) expect(movel.altura).toBeGreaterThan(0);
  });
  it("o antes abre sem produtos; sem paredes, diz o que falta", () => {
    const r = espacoDoEstudio(PROJETO_EXEMPLO, "antes");
    expect(r.ok).toBe(true);
    const vazio = espacoDoEstudio({ ...PROJETO_EXEMPLO, depois: { ...PROJETO_EXEMPLO.depois, paredes: [] } }, "depois");
    expect("erro" in vazio && vazio.erro).toMatch(/paredes/);
  });
  it("o revestimento e o pavimento: o mais parecido da lista do 3D", () => {
    expect(revestimentosDe({ pavimento: "pav-madeira" })).toMatchObject({ pavimento: "madeira_carvalho" });
    expect(revestimentosDe({ pavimento: "pav-tela-a", revestimento: "rev-tela-c" })).toEqual({ pavimento: "ceramico_escuro", parede: "tinta_cinza" });
  });
});
