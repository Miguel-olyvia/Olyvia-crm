import { describe, it, expect } from "vitest";
import {
  FICHA_TECNICA_VALORES_VAZIOS,
  MENSAGENS_FICHA_TECNICA,
  fichaTecnicaVazia,
  pisoNumerico,
  resumoFichaTecnica,
  validarFichaTecnica,
  valoresDaFichaTecnica,
  type FichaTecnicaEdificio,
  type FichaTecnicaValores,
} from "../fichaTecnicaEdificio";

const v = (over: Partial<FichaTecnicaValores>): FichaTecnicaValores => ({ ...FICHA_TECNICA_VALORES_VAZIOS, ...over });

describe("pisoNumerico", () => {
  it("lê o número do andar", () => {
    expect(pisoNumerico("3")).toBe(3);
    expect(pisoNumerico("3º")).toBe(3);
    expect(pisoNumerico("3.º Esq")).toBe(3);
    expect(pisoNumerico("-1")).toBe(-1);
    expect(pisoNumerico("12")).toBe(12);
  });
  it("rés-do-chão é 0", () => {
    expect(pisoNumerico("R/C")).toBe(0);
    expect(pisoNumerico("rc")).toBe(0);
    expect(pisoNumerico("Rés-do-chão")).toBe(0);
  });
  it("sem número → null", () => {
    expect(pisoNumerico("Cave")).toBeNull();
    expect(pisoNumerico("")).toBeNull();
    expect(pisoNumerico(null)).toBeNull();
    expect(pisoNumerico("12345")).toBeNull();
  });
});

describe("validarFichaTecnica", () => {
  it("vazia é válida e não gera ficha", () => {
    expect(validarFichaTecnica(FICHA_TECNICA_VALORES_VAZIOS)).toEqual({ valido: true, erros: {}, ficha: null });
  });

  it("ficha completa", () => {
    const r = validarFichaTecnica(v({
      acesso: "dificil", impacto_percent: "15", estacionamento: "pago", zona_estacionamento: "verde",
      tem_elevador: true, n_elevadores: "1", n_andares: "5", n_fracoes_por_andar: "4",
    }), "3");
    expect(r.valido).toBe(true);
    expect(r.ficha).toEqual({
      acesso: "dificil", impacto_percent: 15, estacionamento: "pago", zona_estacionamento: "verde",
      tem_elevador: true, n_elevadores: 1, n_andares: 5, n_fracoes_por_andar: 4,
    });
  });

  it("com dados e sem elevador grava tem_elevador = false", () => {
    const r = validarFichaTecnica(v({ n_andares: "2" }));
    expect(r.ficha?.tem_elevador).toBe(false);
  });

  it("impacto só com acesso difícil e entre 0 e 100", () => {
    expect(validarFichaTecnica(v({ acesso: "facil", impacto_percent: "10" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoSoDificil);
    expect(validarFichaTecnica(v({ impacto_percent: "10" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoSoDificil);
    expect(validarFichaTecnica(v({ acesso: "dificil", impacto_percent: "101" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoIntervalo);
    expect(validarFichaTecnica(v({ acesso: "dificil", impacto_percent: "-1" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoIntervalo);
    expect(validarFichaTecnica(v({ acesso: "dificil", impacto_percent: "2.5" })).erros.impacto_percent)
      .toBe(MENSAGENS_FICHA_TECNICA.impactoIntervalo);
    expect(validarFichaTecnica(v({ acesso: "dificil", impacto_percent: "0" })).valido).toBe(true);
  });

  it("elevadores só com elevador e ≥ 1", () => {
    expect(validarFichaTecnica(v({ n_elevadores: "2" })).erros.n_elevadores)
      .toBe(MENSAGENS_FICHA_TECNICA.elevadoresSemElevador);
    expect(validarFichaTecnica(v({ tem_elevador: true, n_elevadores: "0" })).erros.n_elevadores)
      .toBe(MENSAGENS_FICHA_TECNICA.elevadoresIntervalo);
    expect(validarFichaTecnica(v({ tem_elevador: true })).valido).toBe(true);
  });

  it("zona só com estacionamento", () => {
    expect(validarFichaTecnica(v({ zona_estacionamento: "verde" })).erros.zona_estacionamento)
      .toBe(MENSAGENS_FICHA_TECNICA.zonaSemEstacionamento);
    expect(validarFichaTecnica(v({ estacionamento: "sem_estacionamento", zona_estacionamento: "verde" })).erros.zona_estacionamento)
      .toBe(MENSAGENS_FICHA_TECNICA.zonaSemEstacionamento);
    expect(validarFichaTecnica(v({ estacionamento: "nao_pago", zona_estacionamento: "amarela" })).valido).toBe(true);
  });

  it("limites de andares e frações", () => {
    expect(validarFichaTecnica(v({ n_andares: "201" })).erros.n_andares).toBe(MENSAGENS_FICHA_TECNICA.andaresIntervalo);
    expect(validarFichaTecnica(v({ n_fracoes_por_andar: "abc" })).erros.n_fracoes_por_andar)
      .toBe(MENSAGENS_FICHA_TECNICA.fracoesIntervalo);
    expect(validarFichaTecnica(v({ n_andares: "0", n_fracoes_por_andar: "0" })).valido).toBe(true);
  });

  it("piso não pode passar o número de andares", () => {
    expect(validarFichaTecnica(v({ n_andares: "5" }), "6º").erros.piso).toBe(MENSAGENS_FICHA_TECNICA.pisoAcimaDosAndares);
    expect(validarFichaTecnica(v({ n_andares: "5" }), "5").valido).toBe(true);
    expect(validarFichaTecnica(v({ n_andares: "0" }), "R/C").valido).toBe(true);
    expect(validarFichaTecnica(v({ n_andares: "2" }), "Sótão").valido).toBe(true);
  });
});

describe("valoresDaFichaTecnica / fichaTecnicaVazia", () => {
  it("ida e volta", () => {
    const ficha: FichaTecnicaEdificio = {
      acesso: "dificil", impacto_percent: 20, estacionamento: "pago", zona_estacionamento: null,
      tem_elevador: true, n_elevadores: 2, n_andares: 8, n_fracoes_por_andar: 3,
    };
    expect(validarFichaTecnica(valoresDaFichaTecnica(ficha)).ficha).toEqual(ficha);
  });
  it("vazia", () => {
    expect(fichaTecnicaVazia(null)).toBe(true);
    expect(valoresDaFichaTecnica(null)).toEqual(FICHA_TECNICA_VALORES_VAZIOS);
  });
});

describe("resumoFichaTecnica", () => {
  it("exemplo completo", () => {
    expect(resumoFichaTecnica({
      acesso: "dificil", impacto_percent: 15, estacionamento: "pago", zona_estacionamento: null,
      tem_elevador: true, n_elevadores: 1, n_andares: 5, n_fracoes_por_andar: 4,
    }, "3")).toBe("Difícil acesso (+15%) · Estac. pago · 3º de 5 · elevador ×1 · 4 frações/andar");
  });
  it("partes soltas", () => {
    expect(resumoFichaTecnica({
      acesso: "facil", impacto_percent: null, estacionamento: "nao_pago", zona_estacionamento: "vermelha",
      tem_elevador: false, n_elevadores: null, n_andares: 2, n_fracoes_por_andar: null,
    }, "")).toBe("Fácil acesso · Estac. não pago (zona vermelha) · 2 andares · sem elevador");
    expect(resumoFichaTecnica(null)).toBe("");
  });
});
