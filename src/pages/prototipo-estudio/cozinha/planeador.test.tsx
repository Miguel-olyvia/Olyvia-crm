// 6/11: o planeador da cozinha (como o do IKEA, com os produtos do Estúdio): as regras, o 3D, o ecrã e a ligação ao Estúdio.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PLANTA_VAZIA, retangulo } from "@/emylia/planta";
import { necessidades, type Projeto } from "../necessidadesEstudio";
import { linhasParaLevar } from "../levarParaNegocio";
import {
  ALTURA_TAMPO, avisos, comprimento, cozinhaDeExemplo, cozinhaParaParede, juntar, linhasDaCozinha, metrosDeTampo, mover, mudar, novoModulo, porNoLugar, postos, precoDoMovel, tirar,
  totalDaCozinha, trocosDeTampo, type Cozinha,
} from "./modelo";
import { cenaDaCozinha, cotas, desenhar } from "./cena";
import PlaneadorCozinha from "./PlaneadorCozinha";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const cozinha = (): Cozinha => ({
  parede: 300, altura: 250, fundo: 300, acabamento: "branco", puxador: "inox", tampo: "ban-carvalho",
  baixo: [novoModulo("alto", 60), novoModulo("lava", 80), novoModulo("placa", 60, "forno"), novoModulo("normal", 40, "3g")],
  cima: [novoModulo("vazio", 60), novoModulo("parede", 80), novoModulo("exaustor", 60), novoModulo("parede", 40)],
});

describe("as regras do planeador", () => {
  it("a fila encosta da esquerda para a direita; o alto corta o tampo", () => {
    const c = cozinha();
    expect(postos(c.baixo).map((p) => [p.x0, p.x1])).toEqual([[0, 60], [60, 140], [140, 200], [200, 240]]);
    expect(trocosDeTampo(c)).toEqual([{ x0: 60, x1: 240 }]);
    expect(metrosDeTampo(c)).toBe(1.8);
  });
  it("juntar a seguir ao escolhido, mudar, mover e tirar", () => {
    let c = cozinha();
    const lava = c.baixo[1], novo = novoModulo("normal", 30, "p");
    c = juntar(c, novo, lava.id);
    expect(c.baixo.map((m) => m.id).indexOf(novo.id)).toBe(2);
    c = mover(c, novo.id, -1);
    expect(c.baixo[1].id).toBe(novo.id);
    c = mudar(c, novo.id, { w: 60 });
    expect(comprimento(c.baixo)).toBe(300);
    c = tirar(c, novo.id);
    expect(c.baixo).toHaveLength(4);
    // arrastar no 3D: pôr no lugar 0 (encostado à esquerda) e no fim
    const lava2 = c.baixo[1].id;
    expect(porNoLugar(c, lava2, 0).baixo[0].id).toBe(lava2);
    expect(porNoLugar(c, lava2, 99).baixo.at(-1)!.id).toBe(lava2);
    // o espaço livre pode ir para a fila de cima
    expect(juntar(c, novoModulo("vazio", 30), undefined, true).cima).toHaveLength(5);
  });
  it("o preço: o móvel (corpo, frente, gavetas, puxadores) e os produtos do catálogo; o tampo por metro; a montagem", () => {
    const c = cozinha();
    expect(precoDoMovel(novoModulo("normal", 60, "3g"), c)).toBe(Math.round(95 + 60 * 2.4 + 45 + 3 * 9));
    const ls = linhasDaCozinha(c);
    expect(ls.find((l) => l.id === "coz-tampo")).toMatchObject({ q: 1.8, un: "m", unit: 350 });
    expect(ls.filter((l) => l.grupo === "Eletrodomésticos").map((l) => l.cat).sort()).toEqual(["exaustor", "forno", "lava", "placa", "torneira"]);
    expect(ls.find((l) => l.id === "serv-sv-montagem-cozinha")?.q).toBe(6);
    expect(ls.find((l) => l.id === "serv-sv-recortes")?.q).toBe(2);
    expect(totalDaCozinha(c).comIva).toBeCloseTo(totalDaCozinha(c).semIva * 1.23, 1);
  });
  it("avisa quando passa da parede, quando falta o lava-loiça e a placa sem exaustor", () => {
    const c = cozinha();
    expect(avisos(c)).toEqual([]);
    expect(avisos({ ...c, parede: 200 })[0]).toMatch(/passa 40 cm/);
    expect(avisos({ ...c, cima: c.cima.filter((m) => m.modelo !== "exaustor"), baixo: c.baixo.filter((m) => m.modelo !== "lava") })).toEqual(["Há placa sem exaustor por cima.", "Falta o lava-loiça."]);
  });
  it("uma cozinha à medida da parede: cabe, com o lava-loiça, a placa e o exaustor por cima dela", () => {
    for (const parede of [180, 234, 330, 420]) {
      const c = cozinhaParaParede(parede);
      expect(comprimento(c.baixo)).toBeLessThanOrEqual(parede);
      expect(comprimento(c.cima)).toBe(comprimento(c.baixo));
      expect(c.baixo.some((m) => m.modelo === "lava")).toBe(true);
      const placa = postos(c.baixo).find((p) => p.m.modelo === "placa")!, exaustor = postos(c.cima).find((p) => p.m.modelo === "exaustor")!;
      expect(exaustor.x0).toBe(placa.x0);
    }
  });
});

describe("o 3D", () => {
  it("desenha os móveis por camadas, com as cotas do comprimento, da altura (91,8) e da fundura", () => {
    const c = cozinhaDeExemplo();
    const cena = cenaDaCozinha(c), cam = { rumo: -0.4, inclinacao: 0.3 };
    const { poligonos, caixa } = desenhar(cena, cam);
    expect(poligonos.length).toBeGreaterThan(100);
    expect(caixa.w).toBeGreaterThan(0);
    // o chão primeiro; o tampo antes do que está em cima dele (a placa); a fila de cima no fim
    const ordem = (pred: (id?: string) => boolean) => poligonos.findIndex((p) => pred(p.id));
    const placa = c.baixo.find((m) => m.modelo === "placa")!.id;
    expect(ordem((id) => id === "chao")).toBe(0);
    expect(poligonos.map((p) => p.id).lastIndexOf("tampo")).toBeLessThan(poligonos.map((p) => p.id).lastIndexOf(placa));
    const ks = cotas(c, cena, cam).map((k) => k.texto);
    expect(ks).toEqual([String(comprimento(c.baixo)), String(ALTURA_TAMPO).replace(".", ","), "63,5"]);
    expect(cotas(c, cena, cam, c.baixo[1].id)).toHaveLength(4);
  });
});

describe("o ecrã", () => {
  it("abre com a cozinha, junta um armário do painel e o total sobe; tocar no 3D escolhe", () => {
    render(<MemoryRouter initialEntries={["/prototipo/cozinha"]}><PlaneadorCozinha /></MemoryRouter>);
    const total = () => screen.getByLabelText(/Total com IVA/).textContent;
    const antes = total();
    fireEvent.click(screen.getByRole("button", { name: "Juntar Armário baixo de 60 cm" }));
    expect(total()).not.toBe(antes);
    // o escolhido abre no painel, com a largura e a frente
    expect(screen.getByRole("heading", { name: "Armário baixo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "80 cm" }));
    expect(screen.getByText(/80 cm · 3 gavetas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tirar/ }));
    expect(total()).toBe(antes);
    // o resumo
    fireEvent.click(screen.getByRole("button", { name: /Resumo/ }));
    expect(screen.getByRole("dialog", { name: "Resumo da cozinha" })).toBeInTheDocument();
  });
});

describe("a ligação ao Estúdio", () => {
  const projeto = (c?: Cozinha): Projeto => ({
    antes: { ...PLANTA_VAZIA, paredes: retangulo(300, 250) }, depois: { ...PLANTA_VAZIA, paredes: retangulo(300, 250), pecas: [{ id: "b", tipo: "bancada", x: 0, y: 0, w: 120, h: 60 }] },
    escolhas: { b: "ban-quartzo-b" }, acompanha: {}, ajustes: {}, alturas: { peDireito: 250, tetoFalso: null }, estilo: { cores: [], porCategoria: {} }, divisao: "Cozinha", cozinha: c,
  });
  it("com o planeador, as necessidades são as dele (a bancada da planta não conta duas vezes) e vão para o negócio com a chave certa", () => {
    const sem = necessidades(projeto());
    expect(sem.some((l) => l.id === "prod-b")).toBe(true);
    const c = cozinha(), p = projeto(c), ls = necessidades(p);
    expect(ls.some((l) => l.id === "prod-b")).toBe(false);
    expect(ls.filter((l) => l.porque === "Do planeador da cozinha.").length).toBe(linhasDaCozinha(c).length);
    expect(ls.some((l) => l.id === "coz-agua")).toBe(true);
    const levar = linhasParaLevar(p);
    expect(levar.find((l) => l.id === "coz-tampo")).toMatchObject({ tipo: "produto", chave: "bancada" });
    expect(levar.find((l) => l.id.startsWith("coz-mod-"))).toMatchObject({ tipo: "produto", chave: "modulo_cozinha" });
    expect(levar.filter((l) => l.id.startsWith("coz-apar-")).map((l) => l.chave).sort()).toEqual(["exaustor", "forno", "lava", "placa", "torneira"]);
  });
});
