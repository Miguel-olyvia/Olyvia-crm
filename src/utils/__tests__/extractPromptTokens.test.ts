// @vitest-environment node
import { describe, it, expect } from "vitest";
import { extractPromptTokens, RESERVED_CONTRACT_KEYS, substituteVariables, SAMPLE_VARIABLE_DATA } from "../contractVariables";

describe("extractPromptTokens", () => {
  it("deteta token dentro de span HTML (chip TipTap)", () => {
    const html = '<span data-contract-variable="true">{{data_de_nascimento}}</span>';
    expect(extractPromptTokens(html)).toEqual(["data_de_nascimento"]);
  });

  it("normaliza espaços em {{ data_de_nascimento }}", () => {
    const html = "{{ data_de_nascimento }}";
    expect(extractPromptTokens(html)).toEqual(["data_de_nascimento"]);
  });

  it("deduplica token repetido", () => {
    const html = "{{foo}} texto {{foo}} mais {{foo}}";
    expect(extractPromptTokens(html)).toEqual(["foo"]);
  });

  it("variável eliminada da BD — token detetado mas sem match DB → fica visível no HTML", () => {
    // extractPromptTokens devolve o key; se o componente não encontrar match na DB
    // (varMap.has === false), não entra no diálogo → finalizeGeneration({}) →
    // substituteVariables deixa o token intacto no HTML (indicador visual de variável por preencher).
    const html = "{{chave_eliminada}}";
    const tokens = extractPromptTokens(html);
    expect(tokens).toContain("chave_eliminada");
    // substituteVariables não substitui tokens desconhecidos — ficam visíveis
    const out = substituteVariables(html, SAMPLE_VARIABLE_DATA);
    expect(out).toBe("{{chave_eliminada}}");
  });

  it("token reservado não entra nos resultados", () => {
    const html = "{{empresa_nome}} {{cliente_nome}} {{tabela_signatarios}} {{tabela_artigos}} {{data_atual}}";
    expect(extractPromptTokens(html)).toEqual([]);
  });

  it("variável prompt válida entra, token reservado é excluído", () => {
    const html = "{{data_de_nascimento}} {{empresa_nome}}";
    const tokens = extractPromptTokens(html);
    expect(tokens).toContain("data_de_nascimento");
    expect(tokens).not.toContain("empresa_nome");
  });

  it("token desconhecido permanece visível após substituição (não é apagado)", () => {
    const html = "<p>Valor: {{contrato_valor}}</p><p>Personalizado: {{token_desconhecido}}</p>";
    const out = substituteVariables(html, SAMPLE_VARIABLE_DATA);
    expect(out).toContain("{{token_desconhecido}}");
    expect(out).toContain("€392,37");
  });
});

describe("RESERVED_CONTRACT_KEYS", () => {
  it("inclui todos os tokens padrão e aliases", () => {
    const expectedKeys = [
      "empresa_nome", "empresa_nif", "empresa_morada",
      "empresa_telefone", "empresa_email", "empresa_website",
      "cliente_nome", "cliente_email", "cliente_localidade",
      "contrato_numero", "contrato_valor", "contrato_valor_extenso",
      "contrato_data_inicio", "contrato_data_fim", "contrato_duracao",
      "proposta_numero", "proposta_valor", "proposta_data",
      "orcamento_itens", "tabela_artigos", "tabela_signatarios",
      "comercial_nome", "comercial_email", "comercial_telefone",
      "signatario_nome", "signatario_cargo", "data_atual",
    ];
    for (const key of expectedKeys) {
      expect(RESERVED_CONTRACT_KEYS.has(key), `esperado reservado: ${key}`).toBe(true);
    }
  });
});
