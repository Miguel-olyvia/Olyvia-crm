import { describe, expect, it } from "vitest";
import {
  MOTIVOS_ATRASO,
  diasDeDesvio,
  formatarDesvio,
  minutosExtra,
  rotuloContagemAlerta,
  rotuloMotivoAtraso,
  validarAtraso,
} from "../atrasos";

describe("atrasos — regras do ecrã", () => {
  it("os motivos são os mesmos da CHECK da base", () => {
    expect([...MOTIVOS_ATRASO]).toEqual([
      "secagem", "condicoes_edificio", "material_em_falta", "trabalho_imprevisto",
      "acesso_cliente", "meteorologia", "equipa", "outro",
    ]);
    expect(rotuloMotivoAtraso("meteorologia")).toBe("Meteorologia");
    expect(rotuloMotivoAtraso("??")).toBe("Outro");
  });

  it("'mais quanto tempo' → mão de obra (pessoa × min)", () => {
    expect(minutosExtra(2, "horas")).toBe(120);
    expect(minutosExtra(1.5, "horas", 2)).toBe(180);
    expect(minutosExtra(1, "dias", 2, 480)).toBe(960);
    expect(minutosExtra(0, "horas")).toBeNull();
    expect(minutosExtra(Number.NaN, "dias")).toBeNull();
  });

  it("validar: motivo, contexto ≥ 5 letras, e tempo ou data (para a frente)", () => {
    const base = { motivo: "secagem" as const, contexto: "Ainda húmido", minutosExtra: 60, novoFim: "" };
    expect(validarAtraso(base)).toBeNull();
    expect(validarAtraso({ ...base, motivo: "" })).toMatch(/motivo/);
    expect(validarAtraso({ ...base, contexto: " abc " })).toMatch(/contexto/);
    expect(validarAtraso({ ...base, minutosExtra: null })).toMatch(/quanto tempo/);
    expect(validarAtraso({ ...base, minutosExtra: null, novoFim: "2026-10-01", fimAtual: "2026-10-05" })).toMatch(/antes/);
    expect(validarAtraso({ ...base, minutosExtra: null, novoFim: "2026-10-07", fimAtual: "2026-10-05" })).toBeNull();
  });

  it("desvio em dias úteis e o texto", () => {
    expect(diasDeDesvio("2026-10-02", "2026-10-06")).toBe(2); // sexta → terça
    expect(diasDeDesvio(null, "2026-10-06")).toBe(0);
    expect(formatarDesvio(2)).toBe("+2 dias úteis");
    expect(formatarDesvio(1)).toBe("+1 dia útil");
    expect(formatarDesvio(0)).toBe("");
  });

  it("rótulos das contagens de alertas", () => {
    expect(rotuloContagemAlerta("nao_iniciada", 1)).toBe("1 tarefa não iniciada a tempo");
    expect(rotuloContagemAlerta("cliente_por_avisar", 3)).toBe("3 atrasos por avisar ao cliente");
  });
});
