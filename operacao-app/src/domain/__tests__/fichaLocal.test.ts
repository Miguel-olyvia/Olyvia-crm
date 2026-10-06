import { describe, expect, it } from "vitest";
import { fichaTemDados, linhasExterior, linhasInterior, pisoNumero } from "../fichaLocal";

describe("ficha do local", () => {
  it("lê o andar da morada", () => {
    expect(pisoNumero("3.º Esq")).toBe(3);
    expect(pisoNumero("R/C Dto")).toBe(0);
    expect(pisoNumero("rés-do-chão")).toBe(0);
    expect(pisoNumero("Cave -1")).toBe(-1);
    expect(pisoNumero(null)).toBeNull();
    expect(pisoNumero("Loja")).toBeNull();
  });

  it("exterior: acesso difícil, 3.º sem elevador e sem estacionamento pedem atenção", () => {
    const l = linhasExterior({
      acesso: "dificil",
      impacto_percent: 15,
      piso: "3.º Esq",
      n_andares: 5,
      tem_elevador: false,
      estacionamento: "sem_estacionamento",
    });
    expect(l).toEqual([
      { texto: "Acesso difícil (+15 %)", atencao: true },
      { texto: "3.º Esq de 5 · sem elevador", atencao: true },
      { texto: "Sem estacionamento", atencao: true },
    ]);
  });

  it("exterior: 1.º andar sem elevador não é alarme; elevador e estacionamento pago", () => {
    expect(linhasExterior({ piso: "1.º", tem_elevador: false })[0].atencao).toBe(false);
    expect(linhasExterior({ piso: "R/C", tem_elevador: true, n_elevadores: 2 })[0].texto).toBe("R/C · elevador ×2");
    expect(linhasExterior({ estacionamento: "pago", zona_estacionamento: "amarela" })).toEqual([
      { texto: "Estacionamento pago (zona amarela)" },
    ]);
  });

  it("interior: habitada, animais e amianto primeiro; a casa numa linha", () => {
    const l = linhasInterior({
      habitada_durante_obra: true,
      animais: true,
      amianto: "nao_sei",
      tipologia: "T3",
      area_util_m2: 95,
      n_casas_banho: 2,
      ano_construcao: 1985,
      canalizacao: "ferro",
      eletrica: "antiga",
      quadro_diferencial: false,
      gas: "garrafa",
    });
    expect(l.map((x) => x.texto)).toEqual([
      "Casa habitada durante a obra",
      "Há animais",
      "Amianto: não se sabe",
      "T3 · 95 m² · 2 WC · 1985",
      "Canalização em ferro",
      "Elétrica antiga, sem diferencial",
      "Gás de garrafa",
    ]);
    expect(l.filter((x) => x.atencao).length).toBe(4);
  });

  it("ficha vazia ({} do servidor) não mostra nada", () => {
    expect(fichaTemDados({})).toBe(false);
    expect(fichaTemDados(null)).toBe(false);
    expect(fichaTemDados({ notas_interior: "  " })).toBe(false);
    expect(fichaTemDados({ notas_interior: "Portão com código 1234" })).toBe(true);
    expect(fichaTemDados({ acesso: "facil" })).toBe(true);
  });
});
