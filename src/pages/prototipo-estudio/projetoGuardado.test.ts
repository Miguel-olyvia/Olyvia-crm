// 20/11 (auditoria de 19/11, lote 3): o projeto do Estúdio numa chave por negócio, a chave antiga aproveitada, a gravação no negócio pela
// ligação da Visita, e o Estúdio vazio (não o exemplo) quando não há projeto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLANTA_VAZIA, retangulo } from "@/emylia/planta";
import type { Projeto } from "./necessidadesEstudio";
import {
  CHAVE_ESTUDIO, CHAVE_ESTUDIO_ABERTO, chaveDoEstudio, desligarEstudio, gravarNoNegocio, guardarProjetoLocal, lembrarNegocioAberto,
  lerProjetoLocal, ligarEstudioAoNegocio, migrarChaveAntiga, negocioDoEndereco, projetoInicial, projetoVazio,
} from "./projetoGuardado";

const projeto = (extra: Partial<Projeto> = {}): Projeto => ({
  antes: { ...PLANTA_VAZIA, paredes: retangulo(200, 250) }, depois: { ...PLANTA_VAZIA, paredes: retangulo(200, 250) },
  escolhas: {}, acompanha: {}, ajustes: {}, alturas: { peDireito: 250, tetoFalso: null }, estilo: { cores: [], porCategoria: {} }, movidasNoDepois: [], ...extra,
});
const ler = (k: string) => JSON.parse(localStorage.getItem(k) ?? "null") as Projeto | null;

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); desligarEstudio(); });
afterEach(() => desligarEstudio());

describe("uma chave por negócio", () => {
  it("o projeto de cada negócio fica na sua chave: abrir outro negócio não apaga o primeiro", () => {
    guardarProjetoLocal(projeto({ negocio: 7, nome: "Ana" }));
    guardarProjetoLocal(projeto({ negocio: 8, nome: "Rui" }));
    expect(chaveDoEstudio(7)).toBe("olyvia.estudio.v1.7");
    expect(lerProjetoLocal(7)?.nome).toBe("Ana");
    expect(lerProjetoLocal(8)?.nome).toBe("Rui");
    // sem negócio (o protótipo): a chave de sempre
    guardarProjetoLocal(projeto({ nome: "Protótipo" }));
    expect(ler(CHAVE_ESTUDIO)?.nome).toBe("Protótipo");
    expect(lerProjetoLocal(null)?.nome).toBe("Protótipo");
  });

  it("a chave antiga com o projeto de um negócio passa para a desse negócio e aproveita-se", () => {
    localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(projeto({ negocio: 7, nome: "Ana", gravadoEm: 5000 })));
    expect(lerProjetoLocal(7)?.nome).toBe("Ana");
    expect(localStorage.getItem(CHAVE_ESTUDIO)).toBeNull();
    expect(ler(chaveDoEstudio(7))?.gravadoEm).toBe(5000);
  });

  it("a chave antiga de outro negócio não se perde (vai para a dele) e não serve a este", () => {
    localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(projeto({ negocio: 8, nome: "Rui" })));
    expect(lerProjetoLocal(7)).toBeNull();
    expect(lerProjetoLocal(8)?.nome).toBe("Rui");
  });

  it("a migração não põe uma versão antiga por cima de uma mais recente; um projeto sem negócio fica onde está", () => {
    guardarProjetoLocal(projeto({ negocio: 7, nome: "novo", gravadoEm: 9000 }));
    localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(projeto({ negocio: 7, nome: "velho", gravadoEm: 1000 })));
    migrarChaveAntiga();
    expect(lerProjetoLocal(7)?.nome).toBe("novo");
    localStorage.setItem(CHAVE_ESTUDIO, JSON.stringify(projeto({ nome: "sem negócio" })));
    migrarChaveAntiga();
    expect(ler(CHAVE_ESTUDIO)?.nome).toBe("sem negócio");
  });
});

describe("com o que o Estúdio abre", () => {
  it("sem projeto e sem negócio abre vazio, não o exemplo «Casa de banho do Bruno»", () => {
    const p = projetoInicial(null)!;
    expect(p.antes.paredes).toEqual([]);
    expect(p.depois.pecas).toEqual([]);
    expect(p.nome).toBe("Novo projeto");
    expect(projetoVazio().negocio).toBeUndefined();
  });

  it("com negócio e sem nada neste browser nem ligação: nada (abre-se pelo negócio)", () => {
    expect(projetoInicial(12)).toBeNull();
  });

  it("a ligação da Visita traz o projeto (mesmo sem armazenamento); o deste browser ganha se for mais recente", () => {
    ligarEstudioAoNegocio({ negocio: 12, gravar: vi.fn(), projeto: projeto({ negocio: 12, nome: "da Visita", gravadoEm: 2000 }) });
    expect(projetoInicial(12)?.nome).toBe("da Visita");
    guardarProjetoLocal(projeto({ negocio: 12, nome: "deste browser", gravadoEm: 3000 }));
    expect(projetoInicial(12)?.nome).toBe("deste browser");
    // a ligação de outro negócio não conta
    expect(projetoInicial(13)).toBeNull();
  });

  it("o negócio vem do endereço; sem ele, do último aberto neste separador", () => {
    expect(negocioDoEndereco("?negocio=42")).toBe(42);
    expect(negocioDoEndereco("")).toBeNull();
    lembrarNegocioAberto(9);
    expect(sessionStorage.getItem(CHAVE_ESTUDIO_ABERTO)).toBe("9");
    expect(negocioDoEndereco("")).toBe(9);
    expect(negocioDoEndereco("?negocio=4")).toBe(4);
    lembrarNegocioAberto(null);
    expect(negocioDoEndereco("?negocio=abc")).toBeNull();
  });
});

describe("gravar no negócio pela ligação da Visita", () => {
  it("grava o que mudou, uma vez; o mesmo conteúdo com outra hora não volta a gravar", () => {
    const gravar = vi.fn();
    ligarEstudioAoNegocio({ negocio: 5, gravar });
    expect(gravarNoNegocio(projeto({ negocio: 5, nome: "A", gravadoEm: 1 }))).toBe(true);
    expect(gravar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(gravar.mock.calls[0][0]).nome).toBe("A");
    expect(gravarNoNegocio(projeto({ negocio: 5, nome: "A", gravadoEm: 2 }))).toBe(false);
    expect(gravarNoNegocio(projeto({ negocio: 5, nome: "B", gravadoEm: 3 }))).toBe(true);
    expect(gravar).toHaveBeenCalledTimes(2);
  });

  it("não grava o que o negócio já tem, nem o projeto de outro negócio, nem sem ligação", () => {
    const gravar = vi.fn();
    const noNegocio = JSON.stringify(projeto({ negocio: 5, nome: "igual", gravadoEm: 100 }));
    ligarEstudioAoNegocio({ negocio: 5, gravar, noNegocio: () => noNegocio });
    expect(gravarNoNegocio(projeto({ negocio: 5, nome: "igual", gravadoEm: 999 }))).toBe(false);
    expect(gravarNoNegocio(projeto({ negocio: 6, nome: "outro" }))).toBe(false);
    desligarEstudio();
    expect(gravarNoNegocio(projeto({ negocio: 5, nome: "mudou" }))).toBe(false);
    expect(gravar).not.toHaveBeenCalled();
  });
});
