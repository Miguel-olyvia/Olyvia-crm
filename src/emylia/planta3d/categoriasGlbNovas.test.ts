// Os 7 genéricos novos (ainda não ligados à app): estrutura, geometria em 3 tamanhos e nos extremos para todas as combinações de opções,
// as partes condicionais (`ver`) e as omissões que o nome do produto dá.
import { describe, expect, it } from "vitest";
import { CATEGORIAS_GLB, categoriaDoTipo, opcoesComOmissao, type CategoriaGlb, type ParamsGenerico, type V3 } from "./categoriasGlb";
import { CATEGORIAS_GLB_NOVAS, MEDIDAS_ACESSORIO_POR_FORMA, MEDIDAS_GENERICOS_NOVOS } from "./categoriasGlbNovas";
import type { TipoMockup } from "./catalogo3d";

const IDS = ["tampo_wc", "lava_loica", "maquina_roupa", "termoacumulador", "aplique", "garrafeira", "acessorio"];
/** Folga das verificações de volume (m): 3 mm. */
const TOL = 0.003;

const cat = (id: string): CategoriaGlb => {
  const c = CATEGORIAS_GLB_NOVAS.find((x) => x.id === id);
  if (!c) throw new Error(`falta o genérico ${id}`);
  return c;
};

/** Todas as combinações de opções de uma categoria. */
function combinacoes(c: CategoriaGlb): Record<string, string | boolean>[] {
  let r: Record<string, string | boolean>[] = [{}];
  for (const op of c.opcoes) {
    const valores: (string | boolean)[] = op.tipo === "sim" ? [true, false] : op.valores.map((v) => v.id);
    r = r.flatMap((o) => valores.map((v) => ({ ...o, [op.id]: v })));
  }
  return r;
}

/** A caixa (alinhada aos eixos) que uma parte ocupa: a peça unitária (±0,5) escalada, rodada (Euler XYZ, como no three) e deslocada. */
function caixaDaParte(pos: V3, esc: V3, rot: V3 = [0, 0, 0]): { min: V3; max: V3 } {
  const [a, b, g] = rot, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  // matriz de rotação do three para a ordem XYZ
  const m = [
    [cb * cg, -cb * sg, sb],
    [ca * sg + sa * sb * cg, ca * cg - sa * sb * sg, -sa * cb],
    [sa * sg - ca * sb * cg, sa * cg + ca * sb * sg, ca * cb],
  ];
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
    const v = [sx * esc[0], sy * esc[1], sz * esc[2]];
    for (let i = 0; i < 3; i++) {
      const w = m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2] + pos[i];
      min[i] = Math.min(min[i], w); max[i] = Math.max(max[i], w);
    }
  }
  return { min, max };
}

const tamanhosDe = (id: string): [string, V3][] => {
  const m = MEDIDAS_GENERICOS_NOVOS[id];
  return [["mínimo", m.min], ["pequeno", m.tamanhos.pequeno], ["mediano", m.tamanhos.mediano], ["grande", m.tamanhos.grande], ["máximo", m.max]];
};
const params = ([w, d, h]: V3, o: Record<string, string | boolean>): ParamsGenerico => ({ w, d, h, o });
const visiveis = (c: CategoriaGlb, p: ParamsGenerico): string[] => c.partes.filter((x) => (x.ver ? x.ver(p) : true)).map((x) => x.nome);
const parte = (c: CategoriaGlb, nome: string) => {
  const x = c.partes.find((k) => k.nome === nome);
  if (!x) throw new Error(`${c.id} não tem a parte ${nome}`);
  return x;
};
const omissoes = (id: string, t: TipoMockup, nome: string) => opcoesComOmissao(cat(id), t, {}, nome);

describe("genéricos novos: estrutura", () => {
  it("são os 7 pedidos, com ids únicos e sem colidir com os 28 que já existem", () => {
    expect(CATEGORIAS_GLB_NOVAS.map((c) => c.id)).toEqual(IDS);
    const antigos = new Set(CATEGORIAS_GLB.map((c) => c.id));
    expect(antigos.size).toBe(28);
    for (const id of IDS) expect(antigos.has(id)).toBe(false);
  });

  it("ainda não estão ligados à app: o classificador nunca os devolve", () => {
    const tipos: TipoMockup[] = ["bancada", "tampo", "lava_loica", "eletro", "candeeiro", "acessorio"];
    for (const t of tipos) for (const n of ["Encimera 80x46", "Lava-louças UNA 2 CUBAS", "Máquina lavar roupa", "Termoacumulador 80L", "Aplique LED", "Garrafeira", "Piaçaba"]) {
      const c = categoriaDoTipo(t, n);
      expect(c === undefined || !IDS.includes(c.id)).toBe(true);
    }
  });

  it.each(IDS)("%s: partes com nomes únicos, opções com rótulos e omissões válidas, medidas coerentes", (id) => {
    const c = cat(id);
    const nomes = c.partes.map((p) => p.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const n of nomes) expect(n).toMatch(/^[a-z0-9_]+$/);
    expect(c.rotulo.length).toBeGreaterThan(3);
    const ids = c.opcoes.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const op of c.opcoes) {
      expect(op.rotulo.length).toBeGreaterThan(2);
      for (const t of c.tipos) for (const nome of ["", "Produto qualquer"]) {
        const v = typeof op.omissao === "function" ? op.omissao(t, nome) : op.omissao;
        if (op.tipo === "sim") expect(typeof v).toBe("boolean");
        else expect(op.valores.map((x) => x.id)).toContain(v);
      }
    }
    const m = MEDIDAS_GENERICOS_NOVOS[id];
    expect(m).toBeDefined();
    for (const [, t] of tamanhosDe(id)) for (let i = 0; i < 3; i++) {
      expect(t[i]).toBeGreaterThanOrEqual(m.min[i]);
      expect(t[i]).toBeLessThanOrEqual(m.max[i]);
    }
  });
});

describe("genéricos novos: geometria", () => {
  for (const id of IDS) {
    it(`${id}: em 5 tamanhos e todas as combinações de opções, sem NaN, escalas positivas e tudo dentro de w×d×h`, () => {
      const c = cat(id);
      const combos = combinacoes(c);
      let verificadas = 0;
      for (const [rotulo, t] of tamanhosDe(id)) for (const o of combos) {
        const p = params(t, o);
        for (const x of c.partes) {
          const k = x.colocar(p), onde = `${id} ${rotulo} ${JSON.stringify(o)} ${x.nome}`;
          const numeros = [...k.pos, ...k.esc, ...(k.rot ?? [])];
          expect(numeros.every(Number.isFinite), `${onde}: NaN ou infinito`).toBe(true);
          expect(k.esc.every((e) => e > 0), `${onde}: escala ${k.esc.join(", ")}`).toBe(true);
          if (x.ver && !x.ver(p)) continue;
          const b = caixaDaParte(k.pos, k.esc, k.rot);
          const lim: { min: V3; max: V3 } = { min: [-p.w / 2, 0, -p.d / 2], max: [p.w / 2, p.h, p.d / 2] };
          for (let i = 0; i < 3; i++) {
            expect(b.min[i], `${onde}: sai do volume (eixo ${"xyz"[i]}, mín ${b.min[i].toFixed(4)})`).toBeGreaterThanOrEqual(lim.min[i] - TOL);
            expect(b.max[i], `${onde}: sai do volume (eixo ${"xyz"[i]}, máx ${b.max[i].toFixed(4)})`).toBeLessThanOrEqual(lim.max[i] + TOL);
          }
          verificadas++;
        }
        expect(visiveis(c, p).length).toBeGreaterThan(0);
      }
      expect(verificadas).toBeGreaterThan(0);
    });
  }
});

describe("acessório: a medida típica de cada forma", () => {
  it("cada forma, na sua medida típica (×0,8, ×1 e ×1,5), fica dentro do volume e do intervalo", () => {
    const c = cat("acessorio"), m = MEDIDAS_GENERICOS_NOVOS.acessorio;
    expect(Object.keys(MEDIDAS_ACESSORIO_POR_FORMA).sort()).toEqual(["barra", "cabide", "piacaba", "porta_rolos"]);
    for (const [forma, base] of Object.entries(MEDIDAS_ACESSORIO_POR_FORMA)) for (const f of [0.8, 1, 1.5]) {
      const t = base.map((v, i) => Math.min(m.max[i], Math.max(m.min[i], v * f))) as V3, p = params(t, { forma });
      for (let i = 0; i < 3; i++) expect(base[i]).toBeGreaterThanOrEqual(m.min[i]);
      for (const x of c.partes.filter((k) => (k.ver ? k.ver(p) : true))) {
        const k = x.colocar(p), b = caixaDaParte(k.pos, k.esc, k.rot);
        expect(k.esc.every((e) => e > 0)).toBe(true);
        expect(b.min[0]).toBeGreaterThanOrEqual(-p.w / 2 - TOL); expect(b.max[0]).toBeLessThanOrEqual(p.w / 2 + TOL);
        expect(b.min[1]).toBeGreaterThanOrEqual(-TOL); expect(b.max[1]).toBeLessThanOrEqual(p.h + TOL);
        expect(b.min[2]).toBeGreaterThanOrEqual(-p.d / 2 - TOL); expect(b.max[2]).toBeLessThanOrEqual(p.d / 2 + TOL);
      }
    }
  });
});

describe("genéricos novos: partes condicionais e omissões do nome", () => {
  it("tampo_wc: sem cuba é uma placa inteira; com cuba abre o buraco e a cuba vai para o lado escolhido", () => {
    const c = cat("tampo_wc"), t = MEDIDAS_GENERICOS_NOVOS.tampo_wc.tamanhos.mediano;
    const sem = visiveis(c, params(t, { cuba: false, posicao: "centrada", furo: true }));
    expect(sem).toContain("placa");
    expect(sem.some((n) => n.startsWith("cuba_"))).toBe(false);
    const com = visiveis(c, params(t, { cuba: true, posicao: "centrada", furo: true }));
    expect(com).not.toContain("placa");
    expect(com).toEqual(expect.arrayContaining(["placa_esq", "placa_dir", "placa_tras", "placa_frente", "cuba_fundo", "cuba_ralo", "furo_torneira"]));
    const x = (pos: string) => parte(c, "cuba_fundo").colocar(params(t, { cuba: true, posicao: pos, furo: true })).pos[0];
    expect(x("centrada")).toBe(0);
    expect(x("esquerda")).toBeLessThan(-0.05);
    expect(x("direita")).toBeGreaterThan(0.05);
    expect(visiveis(c, params(t, { cuba: true, posicao: "centrada", furo: false }))).not.toContain("furo_torneira");
    expect(omissoes("tampo_wc", "bancada", "Encimera BREDA sem lavabo Solid Bath a medida 70cm").cuba).toBe(false);
    expect(omissoes("tampo_wc", "bancada", "Lavabo MILANO Solid Bath Alice Desplazado Izq. (p/ móvel 100cm)")).toMatchObject({ cuba: true, posicao: "esquerda" });
    expect(omissoes("tampo_wc", "bancada", "Lavabo Desplazado Dcha.").posicao).toBe("direita");
    expect(omissoes("tampo_wc", "bancada", "Encimera Piedra Compacta (Resina) 140x46").cuba).toBe(false);
  });

  it("lava_loica: a segunda cuba e o escorredor só aparecem quando pedidos, e o escorredor muda de lado", () => {
    const c = cat("lava_loica"), t = MEDIDAS_GENERICOS_NOVOS.lava_loica.tamanhos.grande;
    const uma = visiveis(c, params(t, { cubas: "1", escorredor: false, lado: "direita", rebordo: true }));
    expect(uma.some((n) => n.startsWith("cuba2_"))).toBe(false);
    expect(uma.some((n) => n.startsWith("escorredor_"))).toBe(false);
    const duas = visiveis(c, params(t, { cubas: "2", escorredor: true, lado: "direita", rebordo: true }));
    expect(duas).toEqual(expect.arrayContaining(["cuba1_fundo", "cuba2_fundo", "rebordo_meio", "escorredor_1"]));
    const xe = (lado: string) => parte(c, "escorredor_1").colocar(params(t, { cubas: "1", escorredor: true, lado, rebordo: true })).pos[0];
    expect(xe("direita")).toBeGreaterThan(0);
    expect(xe("esquerda")).toBeLessThan(0);
    expect(omissoes("lava_loica", "lava_loica", "Lava-louças UNA 55 - 2 CUBAS").cubas).toBe("2");
    expect(omissoes("lava_loica", "lava_loica", "Lava-louças AMBAR 1 CUBA 80")).toMatchObject({ cubas: "1" });
    expect(omissoes("lava_loica", "lava_loica", "Lava-louças com escorredor").escorredor).toBe(true);
  });

  it("maquina_roupa: de encastrar tira o tampo; a de secar não tem vidro nem gaveta do detergente", () => {
    const c = cat("maquina_roupa"), t = MEDIDAS_GENERICOS_NOVOS.maquina_roupa.tamanhos.mediano;
    expect(visiveis(c, params(t, { tipo: "lavar", encastre: false }))).toEqual(expect.arrayContaining(["tampo", "vidro_porta", "gaveta"]));
    expect(visiveis(c, params(t, { tipo: "lavar", encastre: true }))).not.toContain("tampo");
    const sec = visiveis(c, params(t, { tipo: "secar", encastre: false }));
    expect(sec).toContain("porta_cega");
    expect(sec).not.toContain("vidro_porta");
    expect(sec).not.toContain("gaveta");
    expect(omissoes("maquina_roupa", "eletro", "Máquina lavar & secar roupa ENCASTRE INDESIT")).toEqual({ tipo: "lavar_secar", encastre: true });
    expect(omissoes("maquina_roupa", "eletro", "Máquina secar roupa WHIRPOOL")).toEqual({ tipo: "secar", encastre: false });
    expect(omissoes("maquina_roupa", "eletro", "Máquina lavar roupa INDESIT")).toEqual({ tipo: "lavar", encastre: false });
  });

  it("termoacumulador: cilindro ou caixa, deitado ou de pé, e a chaminé do esquentador", () => {
    const c = cat("termoacumulador"), t = MEDIDAS_GENERICOS_NOVOS.termoacumulador.tamanhos.mediano;
    const cil = visiveis(c, params(t, { forma: "cilindro", orientacao: "vertical", chamine: false }));
    expect(cil).toContain("cilindro");
    expect(cil).not.toContain("caixa");
    expect(cil).not.toContain("chamine");
    const cx = visiveis(c, params(t, { forma: "caixa", orientacao: "vertical", chamine: true }));
    expect(cx).toEqual(expect.arrayContaining(["caixa", "chamine"]));
    const deitado = parte(c, "cilindro").colocar(params(t, { forma: "cilindro", orientacao: "horizontal", chamine: false }));
    expect(deitado.rot?.[2]).toBeCloseTo(Math.PI / 2);
    expect(omissoes("termoacumulador", "eletro", "Esquentador VULCANO 15L GÁS NATURAL")).toMatchObject({ forma: "caixa", chamine: true });
    expect(omissoes("termoacumulador", "eletro", "Termoacumulador VULCANO 150L")).toMatchObject({ forma: "cilindro", orientacao: "vertical", chamine: false });
    expect(omissoes("termoacumulador", "eletro", "Termoacumulador SLIM TEKA 100L").forma).toBe("caixa");
    expect(omissoes("termoacumulador", "eletro", "Termoacumulador horizontal 80L").orientacao).toBe("horizontal");
    expect(c.parede).toBeDefined();
  });

  it("aplique: a luz à frente ou por baixo, e as pontas metálicas opcionais", () => {
    const c = cat("aplique"), t = MEDIDAS_GENERICOS_NOVOS.aplique.tamanhos.mediano;
    const frente = parte(c, "difusor").colocar(params(t, { luz: "frente", pontas: true }));
    const baixo = parte(c, "difusor").colocar(params(t, { luz: "baixo", pontas: true }));
    expect(frente.pos[2]).toBeGreaterThan(baixo.pos[2]);
    expect(baixo.pos[1]).toBeLessThan(frente.pos[1]);
    expect(visiveis(c, params(t, { luz: "frente", pontas: false }))).not.toContain("ponta_esq");
    expect(c.parede).toBeDefined();
  });

  it("garrafeira: mais garrafas quanto maior, nenhuma se desligadas, e grelha só quando é de encastrar", () => {
    const c = cat("garrafeira"), m = MEDIDAS_GENERICOS_NOVOS.garrafeira.tamanhos;
    const garrafas = (t: V3, o: Record<string, string | boolean>) => visiveis(c, params(t, o)).filter((n) => n.startsWith("garrafa_")).length;
    const o = { encastre: false, garrafas: true };
    expect(garrafas(m.pequeno, o)).toBeGreaterThan(0);
    expect(garrafas(m.grande, o)).toBeGreaterThan(garrafas(m.pequeno, o));
    expect(garrafas(m.grande, { encastre: false, garrafas: false })).toBe(0);
    expect(visiveis(c, params(m.mediano, { encastre: true, garrafas: true }))).toContain("grelha");
    expect(visiveis(c, params(m.mediano, { encastre: false, garrafas: true }))).not.toContain("grelha");
    expect(omissoes("garrafeira", "eletro", "Garrafeira encastre 41 garrafas").encastre).toBe(true);
  });

  it("acessorio: só se vê a forma escolhida, e a forma sai do nome", () => {
    const c = cat("acessorio"), t = MEDIDAS_GENERICOS_NOVOS.acessorio.tamanhos.mediano;
    const prefixo: Record<string, string> = { barra: "barra_", cabide: "cabide_", piacaba: "piacaba_", porta_rolos: "rolos_" };
    for (const [forma, pre] of Object.entries(prefixo)) {
      const v = visiveis(c, params(t, { forma }));
      expect(v.length).toBeGreaterThan(0);
      expect(v.every((n) => n.startsWith(pre)), `${forma}: ${v.join(", ")}`).toBe(true);
    }
    expect(omissoes("acessorio", "acessorio", "Pega De Segurança 30cm CROMADO").forma).toBe("barra");
    expect(omissoes("acessorio", "acessorio", "Cabide SMOOTH CROMADO").forma).toBe("cabide");
    expect(omissoes("acessorio", "acessorio", "Piaçaba MARINA PRETO MATE").forma).toBe("piacaba");
    expect(omissoes("acessorio", "acessorio", "Porta-Rolos SMOOTH BRANCO MATE").forma).toBe("porta_rolos");
    expect(c.parede).toBeDefined();
  });
});
