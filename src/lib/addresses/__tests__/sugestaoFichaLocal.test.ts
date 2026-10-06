import { describe, expect, it } from "vitest";
import {
  andarNumero,
  fichaDaSugestao,
  sugerirProtecoesELogistica,
  PARAMETROS_SUGESTAO as P,
} from "../sugestaoFichaLocal";

const por = <T extends { chave: string }>(linhas: T[], chave: string) => linhas.find((l) => l.chave === chave);

describe("sugerirProtecoesELogistica", () => {
  it("4.º andar sem elevador, estacionamento pago zona vermelha, casa de banho medida na visita", () => {
    const s = sugerirProtecoesELogistica(
      { piso: "4.º Esq", tem_elevador: false, n_andares: 5, estacionamento: "pago", zona_estacionamento: "vermelha", pavimento: "madeira", habitada_durante_obra: true },
      [{ diag_tipo_area: "casa_banho", diag_distancia_entrada: "media", diag_mobilada: "muito", diag_portas_proteger: 3, diag_local_cortes: "na_area", diag_demolir_m2: "12" }],
    );
    expect(s.dias).toBe(10);
    expect(s.diasOrigem).toBe("estimado");

    const cartao = por(s.protecoes, "cartao")!;
    expect(cartao.quantidade).toBeCloseTo(12 * 1.2 * 1.1, 1);
    expect(cartao.precoUnitario).toBe(P.cartaoReforcado_eur_m2);
    expect(cartao.razao).toContain("madeira");
    expect(cartao.estimado).toBeUndefined();

    // 50 (muito) + 10 (cortes) + 3 × 4 (portas) = 72 m² × 1,1
    expect(por(s.protecoes, "plastico")!.quantidade).toBeCloseTo(79.2, 1);
    expect(por(s.protecoes, "protetor_porta")!.quantidade).toBe(3);
    expect(por(s.protecoes, "porta_po")).toBeTruthy();
    expect(por(s.protecoes, "escadas")!.razao).toBe("4.º andar sem elevador");
    expect(por(s.protecoes, "elevador")).toBeUndefined();

    const parq = por(s.logistica, "parquimetro")!;
    expect(parq.quantidade).toBe(10);
    expect(parq.precoUnitario).toBe(15);
    expect(parq.total).toBe(150);

    // (4 − 1) andares × 1,5 h
    expect(por(s.logistica, "escada")!.quantidade).toBe(4.5);
    expect(por(s.logistica, "entulho")!.quantidade).toBe(2);
    expect(s.total).toBeCloseTo(s.totalProtecoes + s.totalLogistica, 2);
  });

  it("usa os dias do plano quando os há", () => {
    const s = sugerirProtecoesELogistica({ estacionamento: "pago", zona_estacionamento: "verde", tem_elevador: true, piso: "2" }, [], { diasObra: 7, kmIdaVolta: 50 });
    expect(s.diasOrigem).toBe("plano");
    expect(por(s.logistica, "parquimetro")!.total).toBe(42);
    expect(por(s.logistica, "deslocacoes")!.quantidade).toBe(350);
    expect(por(s.protecoes, "elevador")).toBeTruthy();
    expect(por(s.logistica, "escada")).toBeUndefined();
    expect(s.faltaSaber).not.toContain("a distância ao armazém (ainda não se calcula pela morada)");
  });

  it("sem visita: estima e diz o que falta saber", () => {
    const s = sugerirProtecoesELogistica({ acesso: "dificil", impacto_percent: 15, amianto: "nao_sei" });
    expect(por(s.protecoes, "cartao")!.estimado).toBe(true);
    expect(por(s.protecoes, "plastico")!.estimado).toBe(true);
    expect(s.faltaSaber).toEqual(expect.arrayContaining([
      "a distância da entrada à área (visita)",
      "o estacionamento (ficha, exterior)",
      "se há elevador (ficha, exterior)",
      "o andar da morada",
    ]));
    expect(s.avisos.join(" ")).toContain("+15 %");
    expect(s.avisos.join(" ")).toContain("Amianto");
    expect(por(s.logistica, "parquimetro")).toBeUndefined();
  });

  it("sem estacionamento conta o parque público; R/C sem elevador não tem escadas", () => {
    const s = sugerirProtecoesELogistica({ estacionamento: "sem_estacionamento", tem_elevador: false, piso: "R/C" });
    expect(por(s.logistica, "sem_estacionamento")!.total).toBe(120);
    expect(por(s.protecoes, "escadas")).toBeUndefined();
    expect(por(s.logistica, "escada")).toBeUndefined();
  });

  it("duas áreas somam percursos e dias", () => {
    const s = sugerirProtecoesELogistica({}, [
      { diag_tipo_area: "casa_banho", diag_distancia_entrada: "curta" },
      { diag_tipo_area: "cozinha", diag_distancia_entrada: "longa" },
    ]);
    expect(s.dias).toBe(22);
    expect(por(s.protecoes, "cartao")!.quantidade).toBeCloseTo(30 * 1.2 * 1.1, 1);
  });
});

describe("auxiliares", () => {
  it("andarNumero", () => {
    expect(andarNumero("R/C Dto")).toBe(0);
    expect(andarNumero("rés-do-chão")).toBe(0);
    expect(andarNumero("3.º Esq")).toBe(3);
    expect(andarNumero("")).toBeNull();
    expect(andarNumero("Cave")).toBeNull();
  });
  it("fichaDaSugestao", () => {
    expect(fichaDaSugestao(null)).toBe(false);
    expect(fichaDaSugestao({})).toBe(false);
    expect(fichaDaSugestao({ estacionamento: "pago" })).toBe(true);
    expect(fichaDaSugestao({}, [{ diag_mobilada: "pouco" }])).toBe(true);
  });
});
