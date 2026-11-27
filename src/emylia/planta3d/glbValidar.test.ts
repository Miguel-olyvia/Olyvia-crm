import { describe, expect, it } from "vitest";
import { glbDeTeste } from "./__fixtures__/glbDeTeste";
import { analisarGlb, AVISO_IMAGEM_BYTES, AVISO_TRIANGULOS, LIMITE_BYTES, MAX_TRIANGULOS, validarGlb } from "./glbValidar";

describe("validarGlb: o contentor", () => {
  it("aceita um GLB mínimo e conta malhas, triângulos e materiais", () => {
    const r = validarGlb(glbDeTeste());
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.triangulos).toBe(12);
    expect(r.malhas).toBe(1);
    expect(r.materiais).toEqual(["corpo", "metal"]);
  });

  it("recusa o que é pequeno de mais, sem cabeçalho glTF, noutra versão ou truncado", () => {
    expect(validarGlb(new ArrayBuffer(4)).erros[0]).toMatch(/pequeno/);
    expect(validarGlb(glbDeTeste({ magia: 0x12345678 })).erros[0]).toMatch(/cabeçalho/i);
    expect(validarGlb(glbDeTeste({ versao: 1 })).erros[0]).toMatch(/versão 1/);
    expect(validarGlb(glbDeTeste({ cortarDoFim: 40 })).erros[0]).toMatch(/truncado|incompleto/i);
  });

  it("recusa um ficheiro de texto que começa por «{» (um .gltf renomeado)", () => {
    const t = new TextEncoder().encode('{"asset":{"version":"2.0"}}   ');
    const r = validarGlb(t.buffer.slice(0) as ArrayBuffer);
    expect(r.ok).toBe(false);
    expect(r.erros[0]).toMatch(/\.glb|binário/);
  });

  it("recusa acima de 5 MB e diz o tamanho", () => {
    const r = validarGlb(glbDeTeste({ imagemBytes: LIMITE_BYTES }));
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/5 MB/);
  });

  it("recusa um JSON que não abre", () => {
    const b = glbDeTeste();
    new Uint8Array(b)[20] = 0x7e; // estraga a primeira letra do JSON
    expect(validarGlb(b).erros.join(" ")).toMatch(/JSON/);
  });

  it("recusa um GLB sem o bloco binário quando o buffer 0 não traz URI", () => {
    expect(validarGlb(glbDeTeste({ semBin: true })).erros.join(" ")).toMatch(/binário/);
  });
});

describe("validarGlb: autocontido, extensões e malhas", () => {
  it("recusa URI externos (o GLB tem de trazer tudo dentro)", () => {
    const r = validarGlb(glbDeTeste({ uriExterno: true }));
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/externo/);
  });

  it("aceita uma imagem embebida em data: e recusa uma que aponte para fora", () => {
    const dentro = validarGlb(glbDeTeste({ mutar: (j) => { j.images = [{ uri: "data:image/png;base64,AAAA" }]; } }));
    expect(dentro.ok).toBe(true);
    const fora = validarGlb(glbDeTeste({ mutar: (j) => { j.images = [{ uri: "textura.png" }]; } }));
    expect(fora.ok).toBe(false);
    expect(fora.erros.join(" ")).toMatch(/externo/);
  });

  it("recusa Draco com uma mensagem só dele (e diz o que fazer)", () => {
    const r = validarGlb(glbDeTeste({ draco: true, extensionsRequired: ["KHR_draco_mesh_compression"] }));
    expect(r.ok).toBe(false);
    expect(r.erros).toHaveLength(1);
    expect(r.erros[0]).toMatch(/Draco/);
    expect(r.erros[0]).toMatch(/meshopt/);
  });

  it("recusa Draco também quando só a malha o declara", () => {
    expect(validarGlb(glbDeTeste({ draco: true })).erros.join(" ")).toMatch(/Draco/);
  });

  it("aceita meshopt e as extensões da lista, e recusa as outras", () => {
    expect(validarGlb(glbDeTeste({ extensionsRequired: ["EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_transform"] })).ok).toBe(true);
    const r = validarGlb(glbDeTeste({ extensionsRequired: ["KHR_texture_basisu"] }));
    expect(r.ok).toBe(false);
    expect(r.erros.join(" ")).toMatch(/KHR_texture_basisu/);
  });

  it("recusa um GLB sem malhas", () => {
    expect(validarGlb(glbDeTeste({ semMalhas: true })).erros.join(" ")).toMatch(/malha/);
  });

  it("avisa a partir de 50 000 triângulos e recusa acima de 200 000", () => {
    const logo = validarGlb(glbDeTeste({ triangulos: AVISO_TRIANGULOS - 2 }));
    expect(logo.ok).toBe(true);
    expect(logo.avisos).toEqual([]);
    const aviso = validarGlb(glbDeTeste({ triangulos: AVISO_TRIANGULOS }));
    expect(aviso.ok).toBe(true);
    expect(aviso.triangulos).toBe(AVISO_TRIANGULOS);
    expect(aviso.avisos.join(" ")).toMatch(/50 000|50\s?000/);
    const limite = validarGlb(glbDeTeste({ triangulos: MAX_TRIANGULOS }));
    expect(limite.ok).toBe(true);
    const demais = validarGlb(glbDeTeste({ triangulos: MAX_TRIANGULOS + 2 }));
    expect(demais.ok).toBe(false);
    expect(demais.erros.join(" ")).toMatch(/200 000|200\s?000/);
  });

  it("conta os triângulos pelo modo da primitiva (faixa e leque) e ignora linhas e pontos", () => {
    const r = validarGlb(glbDeTeste({ mutar: (j) => {
      const m = (j.meshes as { primitives: Record<string, unknown>[] }[])[0]!;
      m.primitives[0]!.mode = 5; m.primitives[1]!.mode = 1;
    } }));
    expect(r.triangulos).toBe(6 * 3 - 2);
  });

  it("conta os triângulos sem índices pelos vértices", () => {
    const r = validarGlb(glbDeTeste({ mutar: (j) => {
      const m = (j.meshes as { primitives: Record<string, unknown>[] }[])[0]!;
      delete m.primitives[0]!.indices; delete m.primitives[1]!.indices;
    } }));
    expect(r.triangulos).toBe(Math.floor(8 / 3) * 2);
  });

  it("avisa de uma imagem embebida com mais de 2 MB, sem recusar", () => {
    const r = validarGlb(glbDeTeste({ imagemBytes: AVISO_IMAGEM_BYTES + 4 }));
    expect(r.ok).toBe(true);
    expect(r.avisos.join(" ")).toMatch(/imagem/i);
  });
});

describe("analisarGlb", () => {
  it("abre um GLB bom com o carregador do 3D e devolve o mesmo relatório", async () => {
    const r = await analisarGlb(glbDeTeste());
    expect(r.ok).toBe(true);
    expect(r.abriu).toBe(true);
    expect(r.triangulos).toBe(12);
  });

  it("não chega a abrir o que a validação já recusou", async () => {
    const r = await analisarGlb(glbDeTeste({ versao: 1 }));
    expect(r.ok).toBe(false);
    expect(r.abriu).toBe(false);
  });

  it("recusa, com mensagem em português, um GLB válido no JSON mas que o carregador não abre", async () => {
    const r = await analisarGlb(glbDeTeste({ mutar: (j) => { (j.accessors as { bufferView: number }[])[0]!.bufferView = 99; } }));
    expect(r.ok).toBe(false);
    expect(r.abriu).toBe(false);
    expect(r.erros.join(" ")).toMatch(/não abriu|não foi possível/i);
  });
});
