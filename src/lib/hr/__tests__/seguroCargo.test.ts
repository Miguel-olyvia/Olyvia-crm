/**
 * Seguro de acidentes de trabalho por cargo (`hr_cargos.seguro_acidentes_pct`): leitura do texto escrito pelo RH,
 * formato de apresentacao, leitura da resposta da RPC e traducao dos erros. Puro, sem base.
 */
import { describe, expect, it } from "vitest";
import {
  chaveDeErroSeguro,
  formatarPercentagemSeguro,
  lerPercentagemSeguro,
  paraTextoDoCampo,
} from "@/lib/hr/seguroCargo";
import { lerResultadoDefinirSeguro } from "@/lib/hr/respostasRpc";
import { rhExemploCargoSeguroTranslations } from "@/translations/rhExemploCargoSeguro";

describe("lerPercentagemSeguro", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["0", 0],
    ["100", 100],
    ["1,5", 1.5],
    ["1.5", 1.5],
    [" 2,25 ", 2.25],
    ["0,01", 0.01],
    ["99.99", 99.99],
    ["100,00", 100],
  ])("aceita %j como %j", (texto, esperado) => {
    expect(lerPercentagemSeguro(texto)).toEqual({ ok: true, valor: esperado });
  });

  it.each(["abc", "-1", "100,01", "101", "1,234", "1,2,3", "1e2", "--", ",5", "5,", "1 000", "NaN", "Infinity", "٣"])(
    "recusa %j",
    (texto) => {
      expect(lerPercentagemSeguro(texto)).toEqual({ ok: false });
    },
  );

  it("recusa o que nao e texto (null, undefined, numero)", () => {
    expect(lerPercentagemSeguro(null as unknown as string)).toEqual({ ok: false });
    expect(lerPercentagemSeguro(undefined as unknown as string)).toEqual({ ok: false });
    expect(lerPercentagemSeguro(5 as unknown as string)).toEqual({ ok: false });
  });
});

describe("formatarPercentagemSeguro e paraTextoDoCampo", () => {
  it("pt usa virgula, en usa ponto, sem zeros a mais", () => {
    expect(formatarPercentagemSeguro(1.5, "pt")).toBe("1,5");
    expect(formatarPercentagemSeguro(1.5, "en")).toBe("1.5");
    expect(formatarPercentagemSeguro(2, "pt")).toBe("2");
    expect(formatarPercentagemSeguro(0, "pt")).toBe("0");
    expect(formatarPercentagemSeguro(0.25, "pt")).toBe("0,25");
  });

  it("o texto do campo vem vazio para sem seguro (null e undefined) e 0 e um valor", () => {
    expect(paraTextoDoCampo(null, "pt")).toBe("");
    expect(paraTextoDoCampo(undefined, "pt")).toBe("");
    expect(paraTextoDoCampo(0, "pt")).toBe("0");
    expect(paraTextoDoCampo(1.5, "pt")).toBe("1,5");
  });

  it("o que o campo mostra volta a ser lido como o mesmo valor", () => {
    for (const v of [0, 0.01, 1.5, 33.33, 100]) {
      expect(lerPercentagemSeguro(paraTextoDoCampo(v, "pt"))).toEqual({ ok: true, valor: v });
    }
  });
});

describe("lerResultadoDefinirSeguro", () => {
  it("le a resposta com valor e com null (limpar)", () => {
    expect(lerResultadoDefinirSeguro({ cargo_id: "c1", seguro_acidentes_pct: 1.5 })).toEqual({
      cargo_id: "c1",
      seguro_acidentes_pct: 1.5,
    });
    expect(lerResultadoDefinirSeguro({ cargo_id: "c1", seguro_acidentes_pct: null })).toEqual({
      cargo_id: "c1",
      seguro_acidentes_pct: null,
    });
  });

  it("recusa respostas sem as chaves ou de outro tipo", () => {
    expect(lerResultadoDefinirSeguro(null)).toBeNull();
    expect(lerResultadoDefinirSeguro([])).toBeNull();
    expect(lerResultadoDefinirSeguro({ cargo_id: "c1" })).toBeNull();
    expect(lerResultadoDefinirSeguro({ seguro_acidentes_pct: 1 })).toBeNull();
    expect(lerResultadoDefinirSeguro({ cargo_id: 7, seguro_acidentes_pct: 1 })).toBeNull();
    expect(lerResultadoDefinirSeguro({ cargo_id: "c1", seguro_acidentes_pct: "1" })).toBeNull();
  });
});

describe("chaveDeErroSeguro", () => {
  it("nao_encontrado", () => {
    expect(chaveDeErroSeguro({ message: "nao_encontrado" })).toBe("hr.cargos.seguro.erro.naoEncontrado");
    expect(chaveDeErroSeguro({ code: "HRC02", message: "nao_encontrado" })).toBe("hr.cargos.seguro.erro.naoEncontrado");
    expect(chaveDeErroSeguro({ code: "P0002", message: "nao_encontrado: cargo" })).toBe(
      "hr.cargos.seguro.erro.naoEncontrado",
    );
  });

  it("permissao: 42501 e permission denied", () => {
    expect(chaveDeErroSeguro({ code: "42501", message: "x" })).toBe("hr.cargos.seguro.erro.semPermissao");
    expect(chaveDeErroSeguro({ message: "permission denied for function" })).toBe(
      "hr.cargos.seguro.erro.semPermissao",
    );
  });

  it("percentagem invalida", () => {
    expect(chaveDeErroSeguro({ code: "22003", message: "x" })).toBe("hr.cargos.seguro.erro.invalida");
    // o que a RPC lanca de facto (20270112600000)
    expect(chaveDeErroSeguro({ code: "22023", message: "seguro_invalido" })).toBe("hr.cargos.seguro.erro.invalida");
    expect(chaveDeErroSeguro({ message: "seguro_invalido: fora de 0 a 100" })).toBe("hr.cargos.seguro.erro.invalida");
  });

  it("o que nao e nosso fica sem chave (o ecra usa o texto generico)", () => {
    expect(chaveDeErroSeguro(new Error("boom"))).toBeNull();
    expect(chaveDeErroSeguro(null)).toBeNull();
    expect(chaveDeErroSeguro("texto")).toBeNull();
  });
});

describe("rhExemploCargoSeguroTranslations", () => {
  it("pt e en tem as mesmas chaves, todas com texto, e todas sao hr.cargos.seguro.*", () => {
    const pt = Object.keys(rhExemploCargoSeguroTranslations.pt).sort();
    const en = Object.keys(rhExemploCargoSeguroTranslations.en).sort();
    expect(pt.length).toBeGreaterThan(8);
    expect(pt).toEqual(en);
    for (const lingua of ["pt", "en"]) {
      for (const [chave, texto] of Object.entries(rhExemploCargoSeguroTranslations[lingua])) {
        expect(chave.startsWith("hr.cargos.seguro.")).toBe(true);
        expect(texto.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("as chaves de erro que o codigo devolve existem", () => {
    for (const chave of [
      "hr.cargos.seguro.erro.naoEncontrado",
      "hr.cargos.seguro.erro.semPermissao",
      "hr.cargos.seguro.erro.invalida",
    ]) {
      expect(rhExemploCargoSeguroTranslations.pt[chave]).toBeTruthy();
      expect(rhExemploCargoSeguroTranslations.en[chave]).toBeTruthy();
    }
  });
});
