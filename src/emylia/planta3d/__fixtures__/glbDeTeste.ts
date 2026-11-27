// Um GLB mínimo feito em código para os testes (nenhum ficheiro binário no repositório): um cubo de 8 vértices em duas malhas, com os materiais «corpo» e «metal»
// (os nomes dos materiais que o 3D do produto distingue). As opções partem o ficheiro de propósito (versão, cabeçalho, URI externo, Draco, truncado…) ou engordam-no
// (triângulos, imagem embebida) para os testes das regras de glbValidar.ts e do carregamento de ModeloProprio.tsx.
export interface OpcoesGlbTeste {
  /** versão do contentor (omissão 2) */ versao?: number;
  /** número mágico (omissão «glTF») */ magia?: number;
  /** triângulos no total (omissão 12), repartidos pelas duas malhas; os índices repetem-se (só interessa a contagem) */ triangulos?: number;
  /** nomes dos materiais (omissão corpo e metal) */ materiais?: [string, string];
  /** dimensões do cubo (x, y, z, em metros; omissão 1×1×1) */ tamanho?: [number, number, number];
  /** onde fica o centro do cubo (omissão: na origem, ou seja, a meio da altura) */ centro?: [number, number, number];
  extensionsRequired?: string[]; extensionsUsed?: string[];
  /** a malha 0 declara a extensão Draco */ draco?: boolean;
  /** o buffer aponta para um ficheiro externo */ uriExterno?: boolean;
  /** uma imagem embebida com este tamanho (bytes de lixo; não se desenha) */ imagemBytes?: number;
  /** sem o bloco binário (o buffer 0 fica por preencher) */ semBin?: boolean;
  /** corta o ficheiro neste número de bytes do fim (truncado) */ cortarDoFim?: number;
  /** sem nenhuma malha */ semMalhas?: boolean;
  /** altera o JSON antes de escrever (para casos pontuais) */ mutar?: (json: Record<string, unknown>) => void;
}

const CUBO_INDICES = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2];
const alinhar = (n: number) => (n + 3) & ~3;

export function glbDeTeste(o: OpcoesGlbTeste = {}): ArrayBuffer {
  const [sx, sy, sz] = o.tamanho ?? [1, 1, 1], [cx, cy, cz] = o.centro ?? [0, 0, 0];
  const pos: number[] = [];
  for (const [x, y, z] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) pos.push(cx + (x * sx) / 2, cy + (y * sy) / 2, cz + (z * sz) / 2);
  const total = Math.max(0, o.triangulos ?? 12), nA = Math.ceil(total / 2), nB = total - nA;
  const indicesDe = (n: number, desde: number) => Array.from({ length: n * 3 }, (_, i) => CUBO_INDICES[(desde * 3 + i) % CUBO_INDICES.length]!);
  const iA = indicesDe(nA, 0), iB = indicesDe(nB, nA);
  const bytesPos = pos.length * 4, bytesA = iA.length * 4, bytesB = iB.length * 4;
  const imagem = o.imagemBytes ?? 0;
  const bin = new ArrayBuffer(alinhar(bytesPos + bytesA + bytesB + imagem));
  const dv = new DataView(bin);
  pos.forEach((v, i) => dv.setFloat32(i * 4, v, true));
  iA.forEach((v, i) => dv.setUint32(bytesPos + i * 4, v, true));
  iB.forEach((v, i) => dv.setUint32(bytesPos + bytesA + i * 4, v, true));

  const [nomeA, nomeB] = o.materiais ?? ["corpo", "metal"];
  const min = [cx - sx / 2, cy - sy / 2, cz - sz / 2], max = [cx + sx / 2, cy + sy / 2, cz + sz / 2];
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "teste" },
    scene: 0, scenes: [{ nodes: o.semMalhas ? [] : [0] }], nodes: o.semMalhas ? [] : [{ mesh: 0, name: "cubo" }],
    materials: [{ name: nomeA, pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0 } }, { name: nomeB, pbrMetallicRoughness: { baseColorFactor: [0.7, 0.7, 0.75, 1], metallicFactor: 1 } }],
    meshes: o.semMalhas ? [] : [{ name: "cubo", primitives: [
      { attributes: { POSITION: 0 }, indices: 1, material: 0, ...(o.draco ? { extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } } } : {}) },
      { attributes: { POSITION: 0 }, indices: 2, material: 1 },
    ] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5125, count: iA.length, type: "SCALAR" },
      { bufferView: 2, componentType: 5125, count: iB.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: bytesPos, target: 34962 },
      { buffer: 0, byteOffset: bytesPos, byteLength: bytesA, target: 34963 },
      { buffer: 0, byteOffset: bytesPos + bytesA, byteLength: bytesB, target: 34963 },
      ...(imagem ? [{ buffer: 0, byteOffset: bytesPos + bytesA + bytesB, byteLength: imagem }] : []),
    ],
    buffers: [{ byteLength: bin.byteLength, ...(o.uriExterno ? { uri: "https://exemplo.invalid/cubo.bin" } : {}) }],
    ...(imagem ? { images: [{ name: "foto", bufferView: 3, mimeType: "image/png" }] } : {}),
    ...(o.extensionsRequired ? { extensionsRequired: o.extensionsRequired } : {}),
    ...(o.extensionsUsed ? { extensionsUsed: o.extensionsUsed } : {}),
  };
  o.mutar?.(json);
  const texto = new TextEncoder().encode(JSON.stringify(json));
  const jsonBytes = new Uint8Array(alinhar(texto.length)).fill(0x20);
  jsonBytes.set(texto);
  const comBin = !o.semBin;
  const compr = 12 + 8 + jsonBytes.length + (comBin ? 8 + bin.byteLength : 0);
  const saida = new ArrayBuffer(compr), v = new DataView(saida), u = new Uint8Array(saida);
  v.setUint32(0, o.magia ?? 0x46546c67, true); v.setUint32(4, o.versao ?? 2, true); v.setUint32(8, compr, true);
  v.setUint32(12, jsonBytes.length, true); v.setUint32(16, 0x4e4f534a, true); u.set(jsonBytes, 20);
  if (comBin) { const p = 20 + jsonBytes.length; v.setUint32(p, bin.byteLength, true); v.setUint32(p + 4, 0x004e4942, true); u.set(new Uint8Array(bin), p + 8); }
  return o.cortarDoFim ? saida.slice(0, compr - o.cortarDoFim) : saida;
}
