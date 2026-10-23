import { describe, expect, it } from "vitest";
import {
  COLUNAS_PLANEAMENTO,
  DIAGNOSTICO_PLANEAMENTO_VAZIO,
  deLinha,
  m2Parede,
  paraPayload,
  temPlaneamento,
  validarPlaneamento,
} from "../diagnosticoPlaneamento";

describe("diagnóstico para o planeamento da obra", () => {
  it("lê a linha de deal_needs e devolve o payload com os mesmos valores", () => {
    const linha = {
      diag_tipo_area: "casa_banho", diag_m2_pavimento: 5, diag_perimetro_m: 9, diag_pe_direito_m: 2.5,
      diag_altura_revestimento: "teto", diag_pontos_agua: 4, diag_pontos_eletricos: null, diag_janela: false,
      diag_local_cortes: "fora", diag_gas: null, diag_toalheiro: true, diag_distancia_entrada: "media",
      diag_mobilada: "muito", diag_portas_proteger: 3, diag_cliente_recusou_fotos: null,
    };
    const f = deLinha(linha);
    expect(f).toMatchObject({ tipo_area: "casa_banho", m2_pavimento: "5", janela: "nao", toalheiro: "sim", pontos_eletricos: "" });
    expect(paraPayload(f)).toEqual(linha);
  });

  it("aceita vírgula nos decimais e apaga com vazio", () => {
    const p = paraPayload({ ...DIAGNOSTICO_PLANEAMENTO_VAZIO, m2_pavimento: "4,5" });
    expect(p.diag_m2_pavimento).toBe(4.5);
    expect(p.diag_tipo_area).toBeNull();
    expect(Object.keys(p)).toHaveLength(15);
  });

  it("valida números e escolhas", () => {
    expect(validarPlaneamento(DIAGNOSTICO_PLANEAMENTO_VAZIO)).toBeNull();
    expect(validarPlaneamento({ ...DIAGNOSTICO_PLANEAMENTO_VAZIO, pontos_agua: "2,5" })).toMatch(/inteiro/);
    expect(validarPlaneamento({ ...DIAGNOSTICO_PLANEAMENTO_VAZIO, pe_direito_m: "12" })).toMatch(/Pé-direito/);
    expect(validarPlaneamento({ ...DIAGNOSTICO_PLANEAMENTO_VAZIO, m2_pavimento: "abc" })).toMatch(/número/);
    expect(validarPlaneamento({ ...DIAGNOSTICO_PLANEAMENTO_VAZIO, gas: "talvez" })).toMatch(/inválida/);
  });

  it("calcula os m² de parede como as Operações", () => {
    const f = { ...DIAGNOSTICO_PLANEAMENTO_VAZIO, perimetro_m: "9", altura_revestimento: "teto", pe_direito_m: "2,5" };
    expect(m2Parede(f)).toBe(22.5);
    expect(m2Parede({ ...f, altura_revestimento: "60cm" })).toBe(5.4);
    expect(m2Parede({ ...f, altura_revestimento: "" })).toBeNull();
    expect(temPlaneamento(f)).toBe(true);
    expect(temPlaneamento(DIAGNOSTICO_PLANEAMENTO_VAZIO)).toBe(false);
  });

  it("as colunas do select são as 15 diag_*", () => {
    expect(COLUNAS_PLANEAMENTO.split(", ")).toHaveLength(15);
    expect(COLUNAS_PLANEAMENTO).toContain("diag_altura_revestimento");
  });
});
