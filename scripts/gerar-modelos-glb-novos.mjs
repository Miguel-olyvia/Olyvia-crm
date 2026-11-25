// Gera SÓ os GLB dos 7 genéricos novos (src/emylia/planta3d/categoriasGlbNovas.ts) em public/modelos3d/genericos/<id>.glb, no mesmo
// formato dos 28 que já lá estão (o gerador antigo, scripts/gerar-modelos-glb.mjs, não está neste ramo). Não toca nos 28.
//
// Uso (a partir da raiz do projeto):
//   node scripts/gerar-modelos-glb-novos.mjs              gera os 7 e escreve genericos-novos.json (o relatório)
//   node scripts/gerar-modelos-glb-novos.mjs --verificar  NÃO escreve em public: refaz os genéricos antigos numa pasta temporária, com este
//                                                         mesmo código, e compara-os byte a byte com os que estão em public (prova o formato)
//
// O formato (o que o runtime espera, src/emylia/planta3d/modelosHtml/glb.ts → montarGenerico):
//   raiz ─ um nó por parte, com o nome estável da parte (extras.forma) ─ a folha com a malha unitária (±0,5) da forma, chamada pelo nome do
//   material (extras.material: é por aí que o runtime lhe dá o material); posições e normais em int16 normalizado (KHR_mesh_quantization),
//   comprimidas com EXT_meshopt_compression. Sem materiais nem texturas. A folha dos novos chama-se «mat_<material>», para nunca ter o nome
//   de uma parte (a máquina de roupa tem uma parte «corpo» e o material «corpo»: o runtime procura as partes pelo nome).
//
// Precisa de: three, esbuild, meshoptimizer, @gltf-transform/core e @gltf-transform/extensions (4.5.x, a versão que gerou os 28).
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptEncoder } from "meshoptimizer";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "public", "modelos3d", "genericos");
const VERIFICAR = process.argv.includes("--verificar");

/** As tabelas dos genéricos (TypeScript), empacotadas pelo esbuild para correrem aqui. */
async function carregarTabelas() {
  const require = createRequire(join(RAIZ, "package.json"));
  const esbuild = require("esbuild");
  const pasta = mkdtempSync(join(tmpdir(), "genericos-novos-")), entrada = join(pasta, "entrada.ts"), saida = join(pasta, "tabelas.mjs");
  const src = (f) => JSON.stringify(join(RAIZ, "src", "emylia", "planta3d", f).replace(/\\/g, "/"));
  writeFileSync(entrada, `export { CATEGORIAS_GLB_NOVAS } from ${src("categoriasGlbNovas")};\nexport { CATEGORIAS_GLB } from ${src("categoriasGlb")};\n`);
  await esbuild.build({ entryPoints: [entrada], bundle: true, outfile: saida, format: "esm", platform: "node", target: "node20", logLevel: "warning" });
  return import(pathToFileURL(saida).href);
}

/** As formas unitárias (centradas, de lado 1), as mesmas dos 28: o runtime põe cada parte no sítio e na medida com a tabela. */
function formaUnitaria(f) {
  if (f === "caixa") return new THREE.BoxGeometry(1, 1, 1);
  if (f === "caixaR") return new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  if (f === "cilindro") return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
  return new THREE.SphereGeometry(0.5, 20, 12);
}

/** A malha de uma parte: vértices soldados, índices reordenados para a cache de vértices (como os 28, sem simplificação). */
function malhaDaParte(p) {
  const g = mergeVertices(formaUnitaria(p.forma).deleteAttribute("uv"), 1e-5);
  const pos = new Float32Array(g.getAttribute("position").array), nor = new Float32Array(g.getAttribute("normal").array);
  // reorderMesh reescreve os índices no próprio array que recebe e devolve o novo lugar de cada vértice
  const indices = new Uint32Array(g.index.array);
  const [remap, unicos] = MeshoptEncoder.reorderMesh(indices, true, false);
  const posicoes = new Float32Array(unicos * 3), normais = new Float32Array(unicos * 3);
  for (let i = 0; i < remap.length; i++) {
    const j = remap[i];
    if (j === 0xffffffff) continue;
    posicoes.set(pos.subarray(i * 3, i * 3 + 3), j * 3);
    normais.set(nor.subarray(i * 3, i * 3 + 3), j * 3);
  }
  return { no: p.nome, material: p.mat, posicoes, normais, indices };
}

/** Posições em int16 normalizado no cubo da malha (escala uniforme) e normais em int16 normalizado. */
function quantizar(m) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.posicoes.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], m.posicoes[i + k]); max[k] = Math.max(max[k], m.posicoes[i + k]); }
  const centro = min.map((v, k) => (v + max[k]) / 2), meio = Math.max(...max.map((v, k) => (v - min[k]) / 2), 1e-6);
  const q = new Int16Array(m.posicoes.length), n = new Int16Array(m.normais.length);
  for (let i = 0; i < m.posicoes.length; i++) q[i] = Math.round(((m.posicoes[i] - centro[i % 3]) / meio) * 32767);
  for (let i = 0; i < m.normais.length; i += 3) {
    const x = m.normais[i], y = m.normais[i + 1], z = m.normais[i + 2], l = Math.hypot(x, y, z) || 1;
    n[i] = Math.round((x / l) * 32767); n[i + 1] = Math.round((y / l) * 32767); n[i + 2] = Math.round((z / l) * 32767);
  }
  return { q, n, centro, meio };
}

/** O documento glTF de uma categoria: a raiz, um nó por parte e a folha com a malha. `prefixoFolha`: «mat_» nos novos, «» nos 28. */
function documento(c, prefixoFolha) {
  const doc = new Document();
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const buffer = doc.createBuffer();
  const cena = doc.createScene(`generico-${c.id}`);
  const raiz = doc.createNode("raiz").setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]);
  cena.addChild(raiz);
  const malhas = c.partes.map(malhaDaParte);
  for (const p of c.partes) raiz.addChild(doc.createNode(p.nome).setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setExtras({ forma: p.forma }));
  for (const m of malhas) {
    const { q, n, centro, meio } = quantizar(m);
    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(q).setNormalized(true).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(n).setNormalized(true).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(m.indices)).setBuffer(buffer));
    const malha = doc.createMesh(m.material).addPrimitive(prim);
    const folha = doc.createNode(prefixoFolha + m.material).setMesh(malha).setTranslation(centro).setScale([meio, meio, meio]).setExtras({ material: m.material });
    raiz.listChildren().find((x) => x.getName() === m.no).addChild(folha);
  }
  return { doc, triangulos: malhas.reduce((s, m) => s + m.indices.length / 3, 0), partes: malhas.length };
}

const T = await carregarTabelas();
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const novos = new Set(T.CATEGORIAS_GLB_NOVAS.map((c) => c.id));

if (VERIFICAR) {
  const pasta = mkdtempSync(join(tmpdir(), "genericos-verificar-"));
  let iguais = 0;
  const diferentes = [];
  for (const c of T.CATEGORIAS_GLB.filter((x) => !novos.has(x.id))) {
    const bytes = Buffer.from(await io.writeBinary(documento(c, "").doc));
    writeFileSync(join(pasta, `${c.id}.glb`), bytes);
    const publico = readFileSync(join(SAIDA, `${c.id}.glb`));
    if (Buffer.compare(bytes, publico) === 0) iguais++; else diferentes.push(c.id);
  }
  console.log(`verificar: ${iguais} iguais byte a byte aos de public; diferentes: ${diferentes.join(", ") || "nenhum"} (refeitos em ${pasta})`);
  process.exit(0);
}

mkdirSync(SAIDA, { recursive: true });
const rel = [];
for (const c of T.CATEGORIAS_GLB_NOVAS) {
  const { doc, triangulos, partes } = documento(c, "mat_"), ficheiro = join(SAIDA, `${c.id}.glb`);
  writeFileSync(ficheiro, await io.writeBinary(doc));
  const r = { categoria: c.id, url: `/modelos3d/genericos/${c.id}.glb`, triangulos, partes, bytes: statSync(ficheiro).size };
  rel.push(r);
  console.log(`${c.id}: ${triangulos} triângulos, ${partes} partes, ${(r.bytes / 1024).toFixed(1)} KB`);
}
// em CRLF, como os outros ficheiros do projecto (o genericos.json dos 28 incluído)
writeFileSync(join(SAIDA, "genericos-novos.json"), (JSON.stringify(rel, null, 1) + "\n").replace(/\n/g, "\r\n"));
console.log(`genéricos novos: ${rel.length} GLB, ${(rel.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(1)} KB no total`);
