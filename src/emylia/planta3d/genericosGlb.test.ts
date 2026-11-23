// Os GLB dos 7 genéricos novos (scripts/gerar-modelos-glb-novos.mjs) carregam com o mesmo carregador do visualizador (GLTFLoader + meshopt)
// e montam-se com `montarGenerico` em todas as combinações de opções: cada parte da tabela tem o seu nó no GLB. Uma parte nova de uma
// categoria antiga (os pés do móvel de lavatório) que o GLB antigo não tem constrói-se em tempo de execução.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { describe, expect, it } from "vitest";
import { categoriaPorId, opcoesComOmissao, urlDoGenerico, type CategoriaGlb } from "./categoriasGlb";
import { CATEGORIAS_GLB_NOVAS, MEDIDAS_GENERICOS_NOVOS } from "./categoriasGlbNovas";
import { montarGenerico } from "./modelosHtml/glb";

const PUBLICO = join(process.cwd(), "public");
const ficheiro = (id: string): string => join(PUBLICO, urlDoGenerico(id));

async function carregar(id: string): Promise<THREE.Group> {
  // uma cópia num ArrayBuffer deste ambiente (o do Buffer do Node não passa no `instanceof ArrayBuffer` do carregador em jsdom)
  const b = readFileSync(ficheiro(id)), buf = new ArrayBuffer(b.byteLength);
  new Uint8Array(buf).set(b);
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  const g = await l.parseAsync(buf, "");
  return g.scene;
}
function combinacoes(c: CategoriaGlb): Record<string, string | boolean>[] {
  let r: Record<string, string | boolean>[] = [{}];
  for (const op of c.opcoes) {
    const valores: (string | boolean)[] = op.tipo === "sim" ? [true, false] : op.valores.map((v) => v.id);
    r = r.flatMap((o) => valores.map((v) => ({ ...o, [op.id]: v })));
  }
  return r;
}

describe("GLB dos genéricos novos", () => {
  it("há um GLB por genérico novo, e o relatório lista os 7", () => {
    for (const c of CATEGORIAS_GLB_NOVAS) expect(existsSync(ficheiro(c.id)), c.id).toBe(true);
    const rel = JSON.parse(readFileSync(join(PUBLICO, "modelos3d", "genericos", "genericos-novos.json"), "utf8")) as { categoria: string; partes: number }[];
    expect(rel.map((r) => r.categoria)).toEqual(CATEGORIAS_GLB_NOVAS.map((c) => c.id));
    for (const r of rel) expect(r.partes).toBe(CATEGORIAS_GLB_NOVAS.find((c) => c.id === r.categoria)?.partes.length);
  });

  for (const c of CATEGORIAS_GLB_NOVAS) {
    it(`${c.id}: carrega, tem um nó por parte e monta-se em todas as combinações de opções`, async () => {
      const cena = await carregar(c.id);
      for (const p of c.partes) expect(cena.getObjectByName(p.nome), `${c.id}/${p.nome}`).toBeDefined();
      expect(categoriaPorId(c.id)).toBe(c);
      const [w, d, h] = MEDIDAS_GENERICOS_NOVOS[c.id].tamanhos.mediano;
      for (const o of combinacoes(c)) {
        const m = montarGenerico(cena, c, { w, d, h, o: opcoesComOmissao(c, c.tipos[0], o) }, "#cccccc");
        const malhas: THREE.Mesh[] = [];
        m.grupo.traverse((x) => { if ((x as THREE.Mesh).isMesh) malhas.push(x as THREE.Mesh); });
        expect(malhas.length).toBe(c.partes.length);
        for (const x of malhas) expect(x.material).toBeInstanceOf(THREE.Material);
        const visiveis = c.partes.filter((p) => m.grupo.getObjectByName(p.nome)?.visible);
        expect(visiveis.length, JSON.stringify(o)).toBeGreaterThan(0);
        const caixa = new THREE.Box3().setFromObject(m.grupo);
        expect(caixa.isEmpty()).toBe(false);
        m.libertar();
      }
    });
  }

  it("móvel de lavatório com pés: o GLB antigo não tem os pés, e eles constroem-se em tempo de execução (o GLB não muda)", async () => {
    const c = categoriaPorId("movel_lavatorio");
    if (!c) throw new Error("falta movel_lavatorio");
    const cena = await carregar("movel_lavatorio");
    expect(cena.getObjectByName("pe_1")).toBeUndefined();
    const m = montarGenerico(cena, c, { w: 0.8, d: 0.45, h: 0.8, o: { gavetas: "portas", apoio: "pes" } }, "#cccccc");
    const pe = m.grupo.getObjectByName("pe_1") as THREE.Mesh | undefined;
    expect(pe?.isMesh).toBe(true);
    expect(pe?.visible).toBe(true);
    expect(pe?.position.y).toBeGreaterThan(0);
    const semPes = montarGenerico(cena, c, { w: 0.8, d: 0.45, h: 0.8, o: { gavetas: "portas", apoio: "chao" } }, "#cccccc");
    expect(semPes.grupo.getObjectByName("pe_1")?.visible).toBe(false);
    m.libertar(); semPes.libertar();
  });

  it("uma parte em falta no GLB que não está marcada para construir em tempo de execução continua a ser erro", async () => {
    const c = categoriaPorId("movel_lavatorio");
    if (!c) throw new Error("falta movel_lavatorio");
    const cena = await carregar("movel_lavatorio");
    const comErro: CategoriaGlb = { ...c, partes: [...c.partes, { nome: "parte_inexistente", forma: "caixa", mat: "corpo", colocar: () => ({ pos: [0, 0, 0], esc: [1, 1, 1] }) }] };
    expect(() => montarGenerico(cena, comErro, { w: 0.8, d: 0.45, h: 0.8, o: {} }, "#cccccc")).toThrow(/parte_inexistente/);
  });
});
