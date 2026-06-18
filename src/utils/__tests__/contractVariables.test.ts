import { describe, it, expect } from "vitest";
import { substituteVariables, SAMPLE_VARIABLE_DATA } from "../contractVariables";

describe("contractVariables — adapter sobre registry", () => {
  it("resolve campos simples via registry (cliente_*, empresa_*, comercial_*)", () => {
    const html = "{{cliente_nome}} | {{cliente_email}} | {{empresa_nome}} | {{empresa_nif}} | {{comercial_nome}}";
    const out = substituteVariables(html, SAMPLE_VARIABLE_DATA);
    expect(out).toBe("Adelino Armindo | adelino@email.com | Mudelar | 514234567 | Ricardo Pereira");
  });

  it("alias {{tabela_artigos}} produz a mesma tabela que {{orcamento_itens}}", () => {
    const a = substituteVariables("{{tabela_artigos}}", SAMPLE_VARIABLE_DATA);
    const b = substituteVariables("{{orcamento_itens}}", SAMPLE_VARIABLE_DATA);
    expect(a).toBe(b);
    expect(a).toContain("<table");
    expect(a).toContain("Remodelação cozinha");
  });

  it("placeholders de missing aparecem quando o campo está vazio", () => {
    const out = substituteVariables("{{cliente_nome}}", { ...SAMPLE_VARIABLE_DATA, cliente_nome: undefined });
    expect(out).toBe("____________");
  });

  it("highlightMode envolve valores e placeholders com spans coloridos", () => {
    const filled = substituteVariables("{{cliente_nome}}", SAMPLE_VARIABLE_DATA, true);
    expect(filled).toContain("background:#d1fae5");
    expect(filled).toContain("Adelino Armindo");

    const missing = substituteVariables("{{cliente_nome}}", { ...SAMPLE_VARIABLE_DATA, cliente_nome: undefined }, true);
    expect(missing).toContain("background:#fef3c7");
    expect(missing).toContain("Nome do cliente");
  });

  it("formatação de valor e datas pt-PT preservada", () => {
    const valor = substituteVariables("{{contrato_valor}}", SAMPLE_VARIABLE_DATA);
    expect(valor).toBe("€392,37");

    const data = substituteVariables("{{contrato_data_inicio}}", SAMPLE_VARIABLE_DATA);
    expect(data).toBe("13 de Março de 2026");

    const duracao = substituteVariables("{{contrato_duracao}}", SAMPLE_VARIABLE_DATA);
    expect(duracao).toBe("12 meses");

    const extenso = substituteVariables("{{contrato_valor_extenso}}", SAMPLE_VARIABLE_DATA);
    expect(extenso).toContain("euros");
    expect(extenso).toContain("cêntimos");
  });
});
