// 6/11: o plano de obra estimado (as etapas, os dias úteis e as datas) e as medidas que saem do Estúdio.
import { describe, expect, it } from "vitest";
import { PLANTA_VAZIA, retangulo, type Planta } from "@/emylia/planta";
import type { Projeto } from "./necessidadesEstudio";
import { calendario, duracaoEmPalavras, etapasDaObra } from "./planoEstimado";
import { abrirEstudio, medidasDoEstudio, projetoDoNegocio } from "./daVisita";

const antes: Planta = { ...PLANTA_VAZIA, paredes: retangulo(200, 250), pecas: [{ id: "a-ban", tipo: "banheira", x: 0, y: 0, w: 170, h: 75 }] };
const depois: Planta = { ...PLANTA_VAZIA, paredes: retangulo(200, 250), pecas: [{ id: "b", tipo: "base", x: 0, y: 0, w: 120, h: 70 }, { id: "s", tipo: "sanita", x: 150, y: 150, w: 36, h: 52 }, { id: "m", tipo: "movel", x: 0, y: 200, w: 80, h: 46 }] };
const projeto: Projeto = {
  negocio: 7, antes, depois, escolhas: { b: "bas-ard-p", s: "san-nexo-s", m: "mov-axis-80" }, acompanha: {}, revestimento: "rev-tela-c", pavimento: "pav-tela-a",
  alturas: { peDireito: 250, tetoFalso: 240 }, estilo: { cores: [], porCategoria: {} }, ajustes: {}, servicos: [{ id: "sv-limpeza", q: 1 }],
};

describe("o plano de obra estimado", () => {
  const etapas = etapasDaObra(projeto);
  it("as etapas pela ordem da obra; a limpeza no último dia", () => {
    const nomes = etapas.map((e) => e.n);
    expect(nomes[0]).toBe("Proteções e retirar");
    expect(nomes.indexOf("Teto falso")).toBeLessThan(nomes.indexOf("Revestimento"));
    expect(nomes.indexOf("Revestimento")).toBeLessThan(nomes.indexOf("Instalar as peças"));
    expect(etapas[etapas.length - 1].oQue.join(" ")).toMatch(/Limpeza/);
  });
  it("as datas só em dias úteis, uma etapa a seguir à outra", () => {
    // 2026-11-13 é sexta: a segunda etapa começa na segunda
    const cal = calendario([{ n: "A", dias: 1, oQue: ["a"] }, { n: "B", dias: 2, oQue: ["b"] }], new Date(2026, 10, 13));
    expect(cal.etapas[1].inicio!.getDay()).toBe(1);
    expect(cal.fim!.getDate()).toBe(17);
    expect(cal.dias).toBe(3);
  });
  it("a duração em palavras", () => {
    expect(duracaoEmPalavras(7)).toBe("1 semana e 2 dias (7 dias úteis)");
    expect(duracaoEmPalavras(1)).toBe("1 dia (1 dia útil)");
  });
});

describe("as medidas e o projeto no negócio", () => {
  it("o chão e as paredes da planta, os pontos de água e os vasos pelas peças", () => {
    const m = medidasDoEstudio(projeto);
    expect(m.pav).toBe(5);
    expect(m.ptf).toBe(3);
    expect(m.ptq).toBe(2);
    expect(m.pcs).toBe(1);
    expect(m.par).toBeGreaterThan(0);
  });
  it("o Estúdio abre pela versão mais recente: a do negócio ou a deste browser", () => {
    localStorage.clear();
    const f = { estudio: JSON.stringify({ ...projeto, gravadoEm: 9000, nome: "do negócio" }) };
    expect(projetoDoNegocio(f)?.gravadoEm).toBe(9000);
    localStorage.setItem("olyvia.estudio.v1", JSON.stringify({ ...projeto, gravadoEm: 1000 }));
    abrirEstudio("X", f, 7, "/negocios");
    expect(JSON.parse(localStorage.getItem("olyvia.estudio.v1")!).gravadoEm).toBe(9000);
    localStorage.setItem("olyvia.estudio.v1", JSON.stringify({ ...projeto, gravadoEm: 20000 }));
    abrirEstudio("X", f, 7, "/negocios");
    expect(JSON.parse(localStorage.getItem("olyvia.estudio.v1")!).gravadoEm).toBe(20000);
    expect(projetoDoNegocio({ estudio: "{partido" })).toBeNull();
  });
});
