// Gera os GLB dos modelos detalhados do HTML (7 torneiras, 32 lava-loiças, 8 placas) em public/modelos3d/, a partir dos construtores procedurais.
// Uso (a partir da raiz do projeto): node scripts/gerar-modelos-glb.mjs [familia:modelo,...]
//
// Por modelo: constrói com o construtor procedural (scripts/modelos3d/preparar.ts, empacotado pelo esbuild), junta as peças por nó móvel e
// material, simplifica com o meshoptimizer (erro absoluto em mm, o mais pequeno que cumpre o alvo de triângulos da família), quantiza
// (posições e normais em int16, KHR_mesh_quantization) e comprime (EXT_meshopt_compression). Sem materiais: cada malha chama-se pelo
// nome do material e o runtime atribui-lhe o do acabamento (src/emylia/planta3d/modelosHtml/glb.ts). Escreve também modelos.json (o relatório).
import { createRequire } from "node:module";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "public", "modelos3d");
/** O alvo de triângulos por família e os erros (mm) a experimentar, do mais fino para o mais grosso. */
const ALVO = { torneira: 8000, lava_loica: 6000, placa: 4000 };
const ERROS_MM = [0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5];
/** O erro máximo aceite (mm): acima disto perde-se forma a olho; se o alvo não couber, fica este e o relatório diz. */
const ERRO_MAXIMO_MM = Number(process.env.ERRO_MAXIMO_MM ?? 0.5);
/**
 * O peso das normais no erro da simplificação (mm por unidade de normal): no metal polido (torneiras, inox) um desvio pequeno da normal vê-se
 * logo no reflexo, por isso pesa 1; nas placas (inox escovado, ferro, vidro plano) não pesa. A Cira fica sem peso: a gravação muda a normal em
 * cada sulco e o peso impedia a simplificação (97 mil triângulos), sem ganho à vista.
 */
const PESO_NORMAIS = { torneira: 1, lava_loica: 1, placa: 0 };
const PESO_POR_MODELO = { cira: 0 };
/** Ajustes por modelo, depois da verificação a olho (modelo -> erro máximo em mm). */
const ERRO_POR_MODELO = {
  // a gravação quadriculada da Cira (corpo e braço) tem sulcos de 0,42 mm: acima de ~0,08 mm o simplificador apaga-os e o metal fica «martelado»
  cira: 0.08,
};

async function carregarPreparar() {
  const require = createRequire(join(RAIZ, "package.json"));
  const esbuild = require("esbuild");
  const saida = join(tmpdir(), `preparar-glb-${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [join(RAIZ, "scripts", "modelos3d", "preparar.ts")], bundle: true, outfile: saida, format: "esm", platform: "node", target: "node20",
    alias: { "@": join(RAIZ, "src") }, logLevel: "warning",
  });
  return import(pathToFileURL(saida).href);
}

/** Simplifica cada malha com o mesmo erro absoluto (mm) e devolve as malhas novas (índices compactados e reordenados para o vertex cache). */
function simplificar(malhas, erro, peso) {
  return malhas.map((m) => {
    // as normais entram no erro com o peso da família (ver PESO_NORMAIS)
    const [ind] = erro <= 0 ? [m.indices.slice()]
      : peso > 0 ? MeshoptSimplifier.simplifyWithAttributes(m.indices, m.posicoes, 3, m.normais, 3, [peso, peso, peso], null, 0, erro, ["ErrorAbsolute"])
        : MeshoptSimplifier.simplify(m.indices, m.posicoes, 3, 0, erro, ["ErrorAbsolute"]);
    const indices = new Uint32Array(ind);
    const [remap, unicos] = MeshoptEncoder.reorderMesh(indices, true, false);
    const posicoes = new Float32Array(unicos * 3), normais = new Float32Array(unicos * 3);
    for (let i = 0; i < remap.length; i++) {
      const j = remap[i];
      if (j === 0xffffffff) continue;
      posicoes.set(m.posicoes.subarray(i * 3, i * 3 + 3), j * 3);
      normais.set(m.normais.subarray(i * 3, i * 3 + 3), j * 3);
    }
    return { ...m, posicoes, normais, indices };
  }).filter((m) => m.indices.length > 0);
}
const triangulos = (malhas) => malhas.reduce((s, m) => s + m.indices.length / 3, 0);

/** Posições em int16 normalizado no cubo da malha (escala uniforme, para as normais não se deformarem) e normais em int16 normalizado. */
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

/** `prefixoFolha`: nos genéricos as folhas chamam-se «mat_<material>», para não terem o nome de uma parte (uma parte «corpo» e o material «corpo» davam dois nós «corpo» e o runtime mexia no errado: as torneiras saíam como dois cilindros grandes). */
function documento(prep, malhas, prefixoFolha = "") {
  const doc = new Document();
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const buffer = doc.createBuffer();
  const cena = doc.createScene(`${prep.familia}-${prep.modelo}`);
  const nos = new Map();
  for (const n of prep.nos) {
    const no = doc.createNode(n.nome).setTranslation(n.posicao).setRotation(n.quaternion);
    if (n.extras) no.setExtras(n.extras);
    nos.set(n.nome, no);
    if (n.pai) nos.get(n.pai).addChild(no); else cena.addChild(no);
  }
  for (const m of malhas) {
    const { q, n, centro, meio } = quantizar(m);
    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(q).setNormalized(true).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(n).setNormalized(true).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(m.posicoes.length / 3 > 65535 ? m.indices : new Uint16Array(m.indices)).setBuffer(buffer));
    const malha = doc.createMesh(m.material).addPrimitive(prim);
    // a folha leva a desquantização (centro e escala uniforme); o nome é o do material, que o runtime usa
    const folha = doc.createNode(prefixoFolha + m.material).setMesh(malha).setTranslation(centro).setScale([meio, meio, meio]).setExtras({ material: m.material });
    nos.get(m.no).addChild(folha);
  }
  return doc;
}

const P = await carregarPreparar();
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
mkdirSync(SAIDA, { recursive: true });
// `node scripts/gerar-modelos-glb.mjs genericos`: os GLB genéricos por categoria (já low-poly: sem simplificação), em public/modelos3d/genericos
if (process.argv[2] === "genericos") {
  const dir = join(SAIDA, "genericos"), rel = [];
  mkdirSync(dir, { recursive: true });
  for (const id of P.listaDeGenericos()) {
    const prep = P.prepararGenerico(id), malhas = simplificar(prep.malhas, 0, 0), ficheiro = join(dir, `${id}.glb`);
    writeFileSync(ficheiro, await io.writeBinary(documento(prep, malhas, "mat_")));
    const r = { categoria: id, url: `/modelos3d/genericos/${id}.glb`, triangulos: triangulos(malhas), partes: malhas.length, bytes: statSync(ficheiro).size };
    rel.push(r); console.log(`${id}: ${r.triangulos} triângulos, ${r.partes} partes, ${(r.bytes / 1024).toFixed(1)} KB`);
  }
  writeFileSync(join(dir, "genericos.json"), JSON.stringify(rel, null, 1) + "\n");
  console.log(`genéricos: ${rel.length} GLB, ${(rel.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(1)} KB no total`);
  process.exit(0);
}
const pedidos = process.argv[2]?.split(",").map((s) => { const [familia, modelo] = s.split(":"); return { familia, modelo }; });
const relatorio = [];
for (const { familia, modelo } of pedidos ?? P.listaDeModelos()) {
  const prep = P.preparar(familia, modelo);
  const alvo = ALVO[familia], limite = ERRO_POR_MODELO[modelo] ?? ERRO_MAXIMO_MM, peso = PESO_POR_MODELO[modelo] ?? PESO_NORMAIS[familia];
  let erro = 0, malhas = simplificar(prep.malhas, 0, peso);
  for (const e of ERROS_MM.filter((x) => x <= limite)) { erro = e; malhas = simplificar(prep.malhas, e, peso); if (triangulos(malhas) <= alvo) break; }
  const ficheiro = join(SAIDA, `${familia}-${modelo}.glb`);
  writeFileSync(ficheiro, await io.writeBinary(documento(prep, malhas)));
  const r = { familia, modelo, url: `/modelos3d/${familia}-${modelo}.glb`, triangulosOriginais: prep.triangulosOriginais, triangulos: triangulos(malhas), alvo, erroMm: erro, pesoNormais: peso, bytes: statSync(ficheiro).size, malhas: malhas.length, construirMs: Math.round(prep.ms) };
  relatorio.push(r);
  console.log(`${familia}-${modelo}: ${r.triangulosOriginais} -> ${r.triangulos} triângulos (erro ${erro} mm${r.triangulos > alvo ? ", ACIMA DO ALVO" : ""}), ${(r.bytes / 1024).toFixed(1)} KB, ${r.malhas} malhas`);
  if (process.env.DETALHE) for (const m of malhas) console.log(`  ${m.no}/${m.material}: ${m.indices.length / 3} triângulos (${prep.malhas.find((x) => x.no === m.no && x.material === m.material).indices.length / 3} antes)`);
}
if (!pedidos) {
  writeFileSync(join(SAIDA, "modelos.json"), JSON.stringify(relatorio, null, 1) + "\n");
  for (const f of Object.keys(ALVO)) { const l = relatorio.filter((r) => r.familia === f); console.log(`${f}: ${l.length} GLB, ${(l.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(1)} KB no total`); }
}
