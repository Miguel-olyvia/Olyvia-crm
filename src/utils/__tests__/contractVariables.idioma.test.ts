import { describe, expect, it } from "vitest";
import { substituteVariables, SAMPLE_VARIABLE_DATA, type ContractVariableData } from "../contractVariables";

const DADOS: ContractVariableData = { ...SAMPLE_VARIABLE_DATA, data_documento: "2026-03-13T12:00:00.000Z" };

describe("substituteVariables com idioma — só as palavras mudam", () => {
  it("datas por extenso em inglês", () => {
    expect(substituteVariables("{{contrato_data_inicio}}", DADOS, false, "en")).toBe("13 March 2026");
    expect(substituteVariables("{{contrato_data_fim}}", DADOS, false, "en")).toBe("13 March 2027");
    expect(substituteVariables("{{proposta_data}}", DADOS, false, "en")).toBe("20 February 2026");
    expect(substituteVariables("{{data_atual}}", DADOS, false, "en")).toBe("13 March 2026");
  });

  it("duração em inglês", () => {
    expect(substituteVariables("{{contrato_duracao}}", DADOS, false, "en")).toBe("12 months");
  });

  it("valor por extenso em inglês", () => {
    expect(substituteVariables("{{contrato_valor_extenso}}", DADOS, false, "en")).toBe(
      "three hundred and ninety-two euros and thirty-seven cents",
    );
  });

  it("o dinheiro NÃO muda com o idioma: mesmo formato, mesmo símbolo, mesmos separadores", () => {
    expect(substituteVariables("{{contrato_valor}}", DADOS, false, "en")).toBe("€392,37");
    expect(substituteVariables("{{proposta_valor}}", DADOS, false, "en")).toBe("€380,50");
    const grande = { contrato_valor: 1234567.891 };
    expect(substituteVariables("{{contrato_valor}}", grande, false, "en")).toBe(substituteVariables("{{contrato_valor}}", grande, false, "pt"));
  });

  it("os campos que são dados não mudam", () => {
    const html = "{{cliente_nome}} | {{cliente_email}} | {{empresa_nome}} | {{contrato_numero}} | {{cliente_telefone}}";
    expect(substituteVariables(html, DADOS, false, "en")).toBe(substituteVariables(html, DADOS, false, "pt"));
  });

  it("espaço em falta: o sublinhado é o mesmo; em destaque, o rótulo vem em inglês", () => {
    expect(substituteVariables("{{cliente_nome}}", {}, false, "en")).toBe("____________");
    const destaque = substituteVariables("{{cliente_nome}} {{contrato_data_inicio}} {{contrato_numero}}", {}, true, "en");
    expect(destaque).toContain("[Client name missing]");
    expect(destaque).toContain("[Start date missing]");
    expect(destaque).toContain("[Contract No. missing]");
    expect(destaque).not.toContain("em falta");
  });

  it("todos os rótulos de falta existem em inglês (nenhum fica em português)", () => {
    const tokens = [
      "empresa_nome", "empresa_nif", "empresa_morada", "cliente_nome", "cliente_nif", "cliente_morada", "cliente_email",
      "cliente_telefone", "cliente_localidade", "comercial_nome", "comercial_email", "comercial_telefone", "contrato_numero",
      "contrato_valor", "contrato_valor_extenso", "contrato_data_inicio", "contrato_data_fim", "contrato_duracao",
      "proposta_numero", "proposta_valor", "proposta_data", "orcamento_itens",
    ].map((t) => `{{${t}}}`).join(" ");
    const en = substituteVariables(tokens, {}, true, "en");
    const pt = substituteVariables(tokens, {}, true, "pt");
    const rotulos = (s: string) => [...s.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
    const rEn = rotulos(en);
    const rPt = rotulos(pt);
    expect(rEn).toHaveLength(rPt.length);
    expect(rPt.length).toBeGreaterThanOrEqual(22);
    rEn.forEach((r, i) => {
      expect(r).toMatch(/ missing$/);
      expect(r).not.toBe(rPt[i]);
    });
  });

  it("tabela de itens: cabeçalhos em inglês, valores com o formato de sempre", () => {
    const html = substituteVariables("{{orcamento_itens}}", DADOS, false, "en");
    expect(html).toContain(">Description</th>");
    expect(html).toContain(">Qty</th>");
    expect(html).toContain(">Unit</th>");
    expect(html).toContain(">Amount</th>");
    expect(html).not.toContain("Descrição");
    expect(html).toContain("€320.00");
    expect(html).toContain("Remodelação cozinha");
  });

  it("sem itens: o rótulo da falta em inglês", () => {
    expect(substituteVariables("{{orcamento_itens}}", {}, true, "en")).toContain("[Quote items missing]");
  });

  it("variáveis personalizadas passam como estão", () => {
    expect(substituteVariables("{{foo}}", { foo: "valor" } as ContractVariableData, false, "en")).toBe("valor");
  });

  it("idioma desconhecido, nulo ou em maiúsculas", () => {
    expect(substituteVariables("{{contrato_data_inicio}}", DADOS, false, "xx")).toBe("13 de Março de 2026");
    expect(substituteVariables("{{contrato_data_inicio}}", DADOS, false, undefined)).toBe("13 de Março de 2026");
    expect(substituteVariables("{{contrato_data_inicio}}", DADOS, false, "EN")).toBe("13 March 2026");
  });

  it("o português continua a ser a omissão (3 argumentos)", () => {
    expect(substituteVariables("{{contrato_data_inicio}} {{contrato_duracao}}", DADOS)).toBe("13 de Março de 2026 12 meses");
  });
});
