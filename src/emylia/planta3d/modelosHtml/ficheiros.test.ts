// Os 76 GLB «completos» do fabricante (public/modelos3d/completos): cada entrada de FICHEIROS_3D (gerada por script, ficheiros.ts) tem o seu ficheiro,
// corresponde a uma variante real do catálogo (familias.ts) e cabe nos orçamentos de tamanho.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILIAS, variantesDe } from "../familias";
import { FICHEIROS_3D, chaveFicheiro, temFicheiro, urlDoFicheiro } from "./ficheiros";

const COMPLETOS = join(process.cwd(), "public", "modelos3d", "completos");
const MB = 1024 * 1024;

/** As variantes reais que podem ter ficheiro: torneira = id da família; lava-loiça = id da medida (como o resto do carregador). */
const reais = new Set(
  FAMILIAS.filter((f) => f.categoria === "torneiras" || f.categoria === "lavaloicas").flatMap((f) =>
    variantesDe(f).map((v) => chaveFicheiro(f.categoria === "torneiras" ? "torneira" : "lava_loica", f.categoria === "torneiras" ? f.id : v.medida.id, v.acabamento.id))),
);

describe("FICHEIROS_3D (gerado)", () => {
  it("são 76: 62 lava-loiças e 14 torneiras", () => {
    expect(FICHEIROS_3D).toHaveLength(76);
    expect(FICHEIROS_3D.filter((x) => x.familia === "lava_loica")).toHaveLength(62);
    expect(FICHEIROS_3D.filter((x) => x.familia === "torneira")).toHaveLength(14);
  });

  it("cada entrada tem o ficheiro em public/modelos3d/completos, um glTF binário, com o nome familia-modelo-acab sem espaços nem acentos", () => {
    for (const x of FICHEIROS_3D) {
      expect(x.ficheiro, x.ficheiro).toBe(`${x.familia}-${x.modelo}-${x.acab}.glb`);
      expect(x.ficheiro).toMatch(/^[a-z0-9_-]+\.glb$/);
      const caminho = join(COMPLETOS, x.ficheiro);
      expect(existsSync(caminho), x.ficheiro).toBe(true);
      expect(readFileSync(caminho).subarray(0, 4).toString("latin1"), x.ficheiro).toBe("glTF");
    }
  });

  it("cada entrada corresponde a uma variante real do catálogo, e as 76 variantes são todas distintas", () => {
    for (const x of FICHEIROS_3D) expect(reais.has(chaveFicheiro(x.familia, x.modelo, x.acab)), `${x.familia}|${x.modelo}|${x.acab}`).toBe(true);
    expect(new Set(FICHEIROS_3D.map((x) => chaveFicheiro(x.familia, x.modelo, x.acab))).size).toBe(76);
    expect(new Set(FICHEIROS_3D.map((x) => x.ficheiro)).size).toBe(76);
  });

  it("as marcas e os triângulos vêm dos ficheiros (nada à mão)", () => {
    for (const x of FICHEIROS_3D) { expect(x.marca.length, x.ficheiro).toBeGreaterThan(0); expect(x.triangulos, x.ficheiro).toBeGreaterThan(100); }
    expect(new Set(FICHEIROS_3D.map((x) => x.marca))).toEqual(new Set(["RODI", "Frasa", "Rubicer", "Marti 1921", "Moovlux"]));
  });

  it("orçamento: no máximo 1 MB por ficheiro e 12 MB no total, e os bytes registados são os do disco", () => {
    let total = 0;
    for (const x of FICHEIROS_3D) {
      const b = statSync(join(COMPLETOS, x.ficheiro)).size;
      expect(b, x.ficheiro).toBe(x.bytes);
      expect(b, x.ficheiro).toBeLessThanOrEqual(1 * MB);
      total += b;
    }
    expect(total).toBeLessThanOrEqual(12 * MB);
  });

  it("chaveFicheiro, temFicheiro e urlDoFicheiro", () => {
    expect(chaveFicheiro("torneira", "smooth", "chrome")).toBe("torneira|smooth|chrome");
    expect(temFicheiro("torneira", "smooth", "chrome")).toBe(true);
    expect(temFicheiro("lava_loica", "ambar50n", "negro")).toBe(true);
    expect(temFicheiro("torneira", "round", "chrome")).toBe(false);
    expect(temFicheiro("lava_loica", "ambar50n", "oro")).toBe(false);
    expect(temFicheiro("lava_loica", "ambar50n", undefined)).toBe(false);
    expect(urlDoFicheiro("lava_loica", "ambar50n", "negro")).toBe("/modelos3d/completos/lava_loica-ambar50n-negro.glb");
    expect(urlDoFicheiro("torneira", "smooth", "chrome")).toBe("/modelos3d/completos/torneira-smooth-chrome.glb");
    expect(urlDoFicheiro("torneira", "round", "chrome")).toBeUndefined();
  });
});
