// As traduções do canal de denúncias dentro da app: pt e en têm as mesmas chaves, todas as chaves `cdm.*` usadas no código
// existem, e as chaves de menu do canal já não existem (o grupo próprio desapareceu).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canalDenunciasTranslations as base } from "@/translations/canalDenuncias";
import { canalDenunciasMinhaAreaTranslations as tr } from "@/translations/canalDenunciasMinhaArea";

const SRC = join(process.cwd(), "src");
const PASTAS = ["components/canal-denuncias", "pages/canal-denuncias", "components/sidebar", "pages/rh-exemplo"];

function ficheirosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const c = join(pasta, nome);
    return statSync(c).isDirectory() ? ficheirosDe(c) : /\.tsx?$/.test(c) && !/\.test\.tsx?$/.test(c) ? [c] : [];
  });
}

const codigo = PASTAS.flatMap((p) => ficheirosDe(join(SRC, p))).map((f) => readFileSync(f, "utf8")).join("\n");
const usadas = Array.from(codigo.matchAll(/["'](cdm\.[A-Za-z0-9_.]+)["']/g), (m) => m[1]);

describe("traduções do canal de denúncias dentro da app", () => {
  it("pt e en têm exatamente as mesmas chaves, todas com texto e os mesmos marcadores {x}", () => {
    expect(Object.keys(tr.en).sort()).toEqual(Object.keys(tr.pt).sort());
    for (const lingua of [tr.pt, tr.en]) expect(Object.entries(lingua).filter(([, v]) => v.trim() === "")).toEqual([]);
    const marcadores = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    expect(Object.keys(tr.pt).filter((k) => JSON.stringify(marcadores(tr.pt[k])) !== JSON.stringify(marcadores(tr.en[k])))).toEqual([]);
  });

  it("todas as chaves cdm.* escritas no código existem nas duas línguas", () => {
    expect(usadas.length).toBeGreaterThan(20);
    expect(Array.from(new Set(usadas)).filter((k) => !(k in tr.pt) || !(k in tr.en))).toEqual([]);
  });

  it("não há chaves de menu do grupo antigo, nem nos textos novos nem nos antigos", () => {
    for (const lingua of [tr.pt, tr.en, base.pt, base.en]) {
      expect(Object.keys(lingua).filter((k) => k.startsWith("sidebar.canalDenuncias"))).toEqual([]);
    }
  });

  it("as chaves novas não colidem com as do canal público", () => {
    expect(Object.keys(tr.pt).filter((k) => k in base.pt)).toEqual([]);
  });
});
