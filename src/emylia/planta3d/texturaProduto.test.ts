// 24/11: a textura da foto da opção de cor no 3D do produto. Aqui, sem WebGL: o mapeamento por posição NO MUNDO (cada repetição da foto cobre `ladoCm` centímetros
// reais, qualquer que seja a forma e a medida da peça), o que o material recebe e o que o shader leva, a cache por URL (uma textura por foto, libertada ao largar)
// e a queda para a cor lisa quando a imagem falha. O que o WebGL desenha (o veio da madeira, sem esticar) só se vê ao vivo.
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LADO_TEXTURA_CM, aplicarTextura, pedirTextura, repeticoesPorMetro, retirarTextura, uvEmMundo, texturasEmCache } from "./texturaProduto";

describe("repeticoesPorMetro: quantas vezes a foto se repete por metro", () => {
  it("o lado por omissão são 40 cm: 2,5 repetições por metro", () => {
    expect(LADO_TEXTURA_CM).toBe(40);
    expect(repeticoesPorMetro(LADO_TEXTURA_CM)).toBeCloseTo(2.5);
  });
  it("20 cm dão 5 repetições por metro; 100 cm dão 1", () => {
    expect(repeticoesPorMetro(20)).toBeCloseTo(5);
    expect(repeticoesPorMetro(100)).toBeCloseTo(1);
  });
  it("um lado inválido (zero, negativo, NaN) volta ao lado por omissão em vez de dar infinitos", () => {
    for (const mau of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(repeticoesPorMetro(mau)).toBeCloseTo(2.5);
  });
});

describe("uvEmMundo: o UV vem da posição no mundo e da normal, não do UV da peça (sem esticar)", () => {
  const rep = repeticoesPorMetro(40);
  it("a escala é sempre a mesma em metros reais: 40 cm numa face dão exactamente uma repetição da foto", () => {
    expect(uvEmMundo([0.4, 0, 0], [0, 1, 0], rep)).toEqual([1, 0]); // tampo (normal em y): u = x
    expect(uvEmMundo([0, 0, 0.4], [0, 1, 0], rep)).toEqual([0, 1]); // v = z
    expect(uvEmMundo([0, 0.4, 0.4], [1, 0, 0], rep)).toEqual([1, 1]); // face de lado (normal em x): u = z, v = y
    expect(uvEmMundo([0.4, 0.4, 0], [0, 0, 1], rep)).toEqual([1, 1]); // face da frente (normal em z): u = x, v = y
  });
  it("escolhe o plano pela normal dominante, também com a normal virada para o lado negativo", () => {
    expect(uvEmMundo([0.2, 0.8, 0.4], [0.1, -0.9, 0.2], rep)).toEqual([0.5, 1]); // y
    expect(uvEmMundo([0.2, 0.8, 0.4], [-0.9, 0.1, 0.2], rep)).toEqual([1, 2]); // x: (z, y)
    expect(uvEmMundo([0.2, 0.8, 0.4], [0.1, 0.2, -0.9], rep)).toEqual([0.5, 2]); // z: (x, y)
  });
  it("não depende das medidas da peça: o mesmo ponto do mundo dá o mesmo UV numa coluna estreita e num revestimento comprido", () => {
    const ponto: [number, number, number] = [0.3, 1.2, 0.25];
    expect(uvEmMundo(ponto, [0, 0, 1], rep)).toEqual(uvEmMundo(ponto, [0, 0, 1], rep));
    // 1,2 m de altura = 3 repetições, seja a peça de 40 × 160 × 25 ou de 19,5 × 120 × 1
    expect(uvEmMundo([0, 1.2, 0], [0, 0, 1], rep)[1]).toBeCloseTo(3);
  });
});

describe("aplicarTextura: a foto fica como mapa do material, com a cor branca por baixo e o shader a mapear no mundo", () => {
  const nova = () => new THREE.MeshStandardMaterial({ color: "#c9b08a", roughness: 0.55 });
  const tex = () => new THREE.Texture();
  const shaderFalso = () => ({
    vertexShader: "#include <common>\nvoid main() {\n#include <beginnormal_vertex>\n#include <begin_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n#include <map_fragment>\n}",
    uniforms: {} as Record<string, { value: unknown }>,
  });
  it("põe a textura em `map` e a cor em branco (a cor multiplica a foto: senão tingia-a)", () => {
    const m = nova(), t = tex();
    aplicarTextura(m, t, 40);
    expect(m.map).toBe(t);
    expect(m.color.getHexString()).toBe("ffffff");
  });
  it("o shader recebe a posição e a normal no mundo e mapeia por elas, com a escala num uniform (e a mesma chave de programa para todos)", () => {
    const m = nova();
    aplicarTextura(m, tex(), 40);
    const s = shaderFalso();
    m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    expect(s.vertexShader).toContain("modelMatrix * vec4( transformed, 1.0 )");
    expect(s.vertexShader).toContain("mat3( modelMatrix ) * objectNormal");
    expect(s.fragmentShader).not.toContain("#include <map_fragment>");
    expect(s.fragmentShader).toContain("texture2D( map,");
    for (const par of ["vPosMundoTx.zy", "vPosMundoTx.xz", "vPosMundoTx.xy"]) expect(s.fragmentShader).toContain(par);
    expect((s.uniforms.uRepTextura as { value: number }).value).toBeCloseTo(2.5);
    expect(m.customProgramCacheKey()).toContain("textura"); // a chave distingue o programa com o mapeamento no mundo dos outros
    const m2 = nova();
    aplicarTextura(m2, tex(), 20);
    expect(m2.customProgramCacheKey()).toBe(m.customProgramCacheKey());
    const s2 = shaderFalso();
    m2.onBeforeCompile(s2 as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    expect((s2.uniforms.uRepTextura as { value: number }).value).toBeCloseTo(5);
  });
  it("24/11 `rodar` (revestimentos com o lado maior na horizontal): o veio vertical da foto passa a correr ao longo da peça; outra chave de programa; sem ele, como sempre", () => {
    const m = nova(), r = nova();
    aplicarTextura(m, tex(), 40);
    aplicarTextura(r, tex(), 40, { rodar: true });
    const s = shaderFalso(), sr = shaderFalso();
    m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    r.onBeforeCompile(sr as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    expect(s.fragmentShader).not.toContain("uvTx = uvTx.yx");
    expect(sr.fragmentShader).toContain("uvTx = uvTx.yx");
    expect(r.customProgramCacheKey()).not.toBe(m.customProgramCacheKey());
    expect(uvEmMundo([0.4, 0, 0.8], [0, 1, 0], 2.5, true)).toEqual([2, 1]);
  });
  it("mudar o lado de uma peça já com textura muda a escala do mesmo uniform", () => {
    const m = nova();
    aplicarTextura(m, tex(), 40);
    const s = shaderFalso();
    m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    aplicarTextura(m, tex(), 100);
    expect((s.uniforms.uRepTextura as { value: number }).value).toBeCloseTo(1);
  });
  it("retirarTextura volta à cor e ao material liso de antes (a cor do produto), sem a textura", () => {
    const m = nova(), t = tex();
    aplicarTextura(m, t, 40);
    retirarTextura(m);
    expect(m.map).toBeNull();
    expect(m.color.getHexString()).toBe("c9b08a");
  });
  it("27/11 `tingir` (a Textura da Mudelar): a cor do material NÃO passa a branco, multiplica a foto; a chave do programa é a mesma", () => {
    const m = nova(), b = nova(), t = tex();
    aplicarTextura(m, t, 40, { tingir: true });
    aplicarTextura(b, tex(), 40);
    expect(m.map).toBe(t);
    expect(m.color.getHexString()).toBe("c9b08a");
    expect(b.color.getHexString()).toBe("ffffff");
    expect(m.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    const s = { vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <map_fragment>", uniforms: {} as Record<string, { value: unknown }> };
    m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    expect(s.fragmentShader).toContain("diffuseColor *= texture2D( map,"); // a cor que o material já tem (diffuseColor) multiplica o texel
  });
  it("27/11 com `tingir`, retirarTextura repõe a cor de antes e tira o mapa", () => {
    const m = nova();
    aplicarTextura(m, tex(), 40, { tingir: true });
    m.color.set("#112233"); // a cor mudou entretanto: o que se repõe é a de antes de aplicar
    retirarTextura(m);
    expect(m.map).toBeNull();
    expect(m.color.getHexString()).toBe("c9b08a");
  });
  it("retirar sem nunca ter aplicado não faz nada", () => {
    const m = nova();
    retirarTextura(m);
    expect(m.map).toBeNull();
    expect(m.color.getHexString()).toBe("c9b08a");
  });
});

describe("pedirTextura: uma textura por foto, partilhada e libertada ao largar; a imagem que falha dá null (a cor lisa)", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  type Carregador = Pick<THREE.TextureLoader, "load">;
  const carregadorQue = (resultado: "ok" | "erro", fotos: THREE.Texture[] = []): Carregador & { chamadas: string[] } => {
    const chamadas: string[] = [];
    return {
      chamadas,
      load: ((url: string, ok?: (t: THREE.Texture) => void, _p?: unknown, erro?: (e: unknown) => void) => {
        chamadas.push(url);
        const t = new THREE.Texture(); fotos.push(t);
        queueMicrotask(() => (resultado === "ok" ? ok?.(t) : erro?.(new Error("404"))));
        return t;
      }) as Carregador["load"],
    };
  };
  const espera = () => new Promise((r) => setTimeout(r, 0));

  it("carrega, configura (sRGB, repete, anisotropia até 4) e entrega a textura", async () => {
    const c = carregadorQue("ok"), recebidas: (THREE.Texture | null)[] = [];
    const largar = pedirTextura("https://x/a.webp", (t) => recebidas.push(t), c);
    await espera();
    const t = recebidas[0]!;
    expect(t).toBeInstanceOf(THREE.Texture);
    expect(t.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
    expect(t.wrapT).toBe(THREE.RepeatWrapping);
    expect(t.anisotropy).toBeGreaterThan(0);
    expect(t.anisotropy).toBeLessThanOrEqual(4);
    largar();
  });
  it("a mesma foto pedida duas vezes carrega uma vez e partilha a textura; só se liberta quando as duas largam", async () => {
    const c = carregadorQue("ok"), a: (THREE.Texture | null)[] = [], b: (THREE.Texture | null)[] = [];
    const l1 = pedirTextura("https://x/b.webp", (t) => a.push(t), c);
    const l2 = pedirTextura("https://x/b.webp", (t) => b.push(t), c);
    await espera();
    expect(c.chamadas).toEqual(["https://x/b.webp"]);
    expect(a[0]).toBe(b[0]);
    const libertar = vi.spyOn(a[0]!, "dispose");
    l1();
    expect(libertar).not.toHaveBeenCalled();
    expect(texturasEmCache()).toContain("https://x/b.webp");
    l2();
    expect(libertar).toHaveBeenCalledTimes(1);
    expect(texturasEmCache()).not.toContain("https://x/b.webp");
  });
  it("largar duas vezes a mesma entrega não liberta a de outro", async () => {
    const c = carregadorQue("ok");
    const l1 = pedirTextura("https://x/c.webp", () => {}, c);
    const l2 = pedirTextura("https://x/c.webp", () => {}, c);
    await espera();
    l1(); l1();
    expect(texturasEmCache()).toContain("https://x/c.webp");
    l2();
    expect(texturasEmCache()).not.toContain("https://x/c.webp");
  });
  it("uma imagem que falha (404, CORS, rede) entrega null, avisa uma vez, e não fica em cache (outra tentativa volta a pedir)", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = carregadorQue("erro"), recebidas: (THREE.Texture | null)[] = [];
    const largar = pedirTextura("https://x/d.webp", (t) => recebidas.push(t), c);
    await espera();
    expect(recebidas).toEqual([null]);
    expect(aviso).toHaveBeenCalledTimes(1);
    largar();
    expect(texturasEmCache()).not.toContain("https://x/d.webp");
    const outra = pedirTextura("https://x/d.webp", () => {}, c);
    expect(c.chamadas).toEqual(["https://x/d.webp", "https://x/d.webp"]);
    outra();
  });
  it("largar antes de a imagem chegar liberta a textura quando ela chegar e não entrega nada", async () => {
    const fotos: THREE.Texture[] = [], c = carregadorQue("ok", fotos), recebidas: unknown[] = [];
    const largar = pedirTextura("https://x/e.webp", (t) => recebidas.push(t), c);
    const libertar = vi.spyOn(fotos[0], "dispose");
    largar();
    await espera();
    expect(recebidas).toEqual([]);
    expect(libertar).toHaveBeenCalledTimes(1);
    expect(texturasEmCache()).not.toContain("https://x/e.webp");
  });
});
