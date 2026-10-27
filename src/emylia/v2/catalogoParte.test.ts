// O Catálogo na base (26/10/2026): só a diferença para o Catálogo de base vai para a parte "catalogo" da sincronização.
import { afterEach, describe, expect, it } from "vitest";
import { catalogo0 } from "./catalogoModelo";
import { aplicarDiferenca, diferencaCatalogo } from "./catalogoParte";
import { aplicarParteCatalogo, fonteCatalogo, lerCatalogo, lerParteCatalogo, mudarCatalogo, reporCatalogo } from "./catalogoStore";

afterEach(() => reporCatalogo());

describe("o Catálogo na base", () => {
  it("sem mudanças, a diferença é vazia", () => {
    const base = catalogo0();
    expect(diferencaCatalogo(base, catalogo0())).toEqual({});
  });

  it("um preço mudado, um produto novo e um tirado: só eles vão; aplicados à base, dão o mesmo Catálogo", () => {
    const base = catalogo0(), K = structuredClone(base);
    const ventax = K.produtos.find((p) => p.sku === "MVWC")!;
    ventax.pvp = 45; // o preço da proposta P-2026-0109
    K.produtos.push({ ...structuredClone(ventax), id: "p-novo", n: "Produto novo", sku: "NOVO1" });
    const tirado = K.produtos.splice(0, 1)[0];
    K.perguntaManter = { ...(K.perguntaManter ?? {}), c4: "O cliente mantém o azulejo?" };
    const x = diferencaCatalogo(base, K);
    expect(Object.keys(x.produtos ?? {}).sort()).toEqual([tirado.id, ventax.id, "p-novo"].sort());
    expect(x.produtos![tirado.id]).toBeNull();
    expect(Object.keys(x.resto ?? {})).toEqual(["perguntaManter"]);
    const J = JSON.stringify(x);
    expect(J.length).toBeLessThan(5000); // nada dos milhares de produtos que não mudaram
    const R = aplicarDiferenca(base, JSON.parse(J));
    expect(R.produtos.find((p) => p.sku === "MVWC")!.pvp).toBe(45);
    expect(R.produtos.some((p) => p.id === tirado.id)).toBe(false);
    expect(R.produtos.at(-1)!.id).toBe("p-novo");
    expect(R.perguntaManter?.c4).toBe("O cliente mantém o azulejo?");
    expect(base.produtos.find((p) => p.sku === "MVWC")!.pvp).not.toBe(45); // a base não mexe
  });

  it("a store: a parte segue a mudança, e a parte que chega de outro aparelho muda o Catálogo", () => {
    expect(lerParteCatalogo()).toEqual({});
    mudarCatalogo((k) => { k.produtos.find((p) => p.sku === "MVWC")!.pvp = 45; });
    const parte = fonteCatalogo().ler() as { produtos: Record<string, { pvp: number }> };
    expect(Object.values(parte.produtos).map((p) => p.pvp)).toEqual([45]);
    reporCatalogo();
    expect(lerCatalogo().produtos.find((p) => p.sku === "MVWC")!.pvp).not.toBe(45);
    aplicarParteCatalogo(JSON.parse(JSON.stringify(parte)));
    expect(lerCatalogo().produtos.find((p) => p.sku === "MVWC")!.pvp).toBe(45);
    expect(lerParteCatalogo()).toEqual(parte); // o que chegou não volta a ir
  });
});
