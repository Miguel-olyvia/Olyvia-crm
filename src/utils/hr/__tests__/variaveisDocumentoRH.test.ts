/**
 * Testes de `variaveisDocumentoRH.ts`.
 *
 * PARIDADE COM O CATALOGO SQL
 * -----------------------------
 * Nao ha ligacao viva a base de dados aqui (vitest corre sem Postgres). O que
 * se compara e um SNAPSHOT dos tokens de `hr_documento_variaveis_catalogo()`
 * (20261202020000/supabase/migrations) mantido a mao nesta lista -- se um dia
 * a funcao SQL ganhar ou perder um token e este snapshot nao acompanhar, o
 * pior que acontece e o teste ficar cego a essa divergencia especifica, nao
 * um falso positivo. O que ESTE teste apanha de facto: o caso mais comum, que
 * e alguem acrescentar um token so num dos dois lados (TS ou SQL) e esquecer
 * o outro -- exactamente o que aconteceria ao adicionar um botao no editor
 * sem tambem ensinar a RPC a resolve-lo.
 */
import { describe, it, expect } from "vitest";
import {
  CATALOGO_VARIAVEIS_RH,
  DADOS_EXEMPLO_RH,
  extrairTokensRH,
  tokensDesconhecidosRH,
  substituirVariaveisRH,
} from "../variaveisDocumentoRH";

// Snapshot manual dos tokens devolvidos por
// supabase/migrations/20261202020000_hr_documento_emitir_substitui_variaveis.sql
// :: hr_documento_variaveis_catalogo(). Manter em sincronia com essa funcao.
const TOKENS_CATALOGO_SQL = [
  "pessoa_nome_completo", "pessoa_primeiro_nome", "pessoa_apelido", "pessoa_numero_interno",
  "pessoa_cargo", "pessoa_local_trabalho", "pessoa_email_trabalho", "pessoa_telefone_trabalho",
  "pessoa_data_admissao", "pessoa_data_antiguidade", "pessoa_data_nascimento", "pessoa_nacionalidade",
  "pessoa_estado_civil", "pessoa_nif", "pessoa_tipo_documento", "pessoa_numero_documento",
  "pessoa_validade_documento", "pessoa_niss_ultimos4", "pessoa_morada", "pessoa_codigo_postal",
  "pessoa_localidade", "vinculo_tipo_contrato", "vinculo_regime", "vinculo_data_inicio",
  "vinculo_data_fim", "vinculo_motivo_termo", "vinculo_periodo_experimental_ate", "vinculo_horas_semanais",
  "retribuicao_valor_base", "retribuicao_periodicidade", "retribuicao_moeda",
  "retribuicao_subsidio_alimentacao", "retribuicao_subsidio_alimentacao_modo",
  "empresa_nome", "documento_titulo", "documento_tipo", "documento_data_emissao",
].sort();

describe("CATALOGO_VARIAVEIS_RH — paridade com o catalogo SQL", () => {
  it("lista exactamente os mesmos tokens que hr_documento_variaveis_catalogo()", () => {
    const tokensTs = CATALOGO_VARIAVEIS_RH.map((v) => v.token).sort();
    expect(tokensTs).toEqual(TOKENS_CATALOGO_SQL);
  });

  it("nao tem tokens duplicados", () => {
    const tokens = CATALOGO_VARIAVEIS_RH.map((v) => v.token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("nenhum token tem chavetas ou pontos (convencao {{prefixo_campo}})", () => {
    for (const variavel of CATALOGO_VARIAVEIS_RH) {
      expect(variavel.token).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe("extrairTokensRH", () => {
  it("extrai tokens sem duplicados, na ordem em que aparecem", () => {
    const html = "<p>{{pessoa_nome_completo}}, {{pessoa_cargo}} e {{pessoa_nome_completo}}</p>";
    expect(extrairTokensRH(html)).toEqual(["pessoa_nome_completo", "pessoa_cargo"]);
  });

  it("ignora espacos dentro das chavetas e normaliza para minusculas", () => {
    const html = "{{ Pessoa_Nome_Completo }}";
    expect(extrairTokensRH(html)).toEqual(["pessoa_nome_completo"]);
  });

  it("devolve lista vazia quando nao ha tokens", () => {
    expect(extrairTokensRH("<p>texto sem variaveis</p>")).toEqual([]);
  });
});

describe("tokensDesconhecidosRH", () => {
  it("nao assinala tokens do catalogo", () => {
    expect(tokensDesconhecidosRH("{{pessoa_nome_completo}} {{retribuicao_valor_base}}")).toEqual([]);
  });

  it("assinala tokens fora do catalogo", () => {
    expect(tokensDesconhecidosRH("{{pessoa_nome_completo}} {{campo_inventado}}")).toEqual(["campo_inventado"]);
  });
});

describe("substituirVariaveisRH", () => {
  it("substitui um token preenchido, com realce verde por omissao", () => {
    const resultado = substituirVariaveisRH("Ola {{pessoa_nome_completo}}", { pessoa_nome_completo: "Ana Ferreira" });
    expect(resultado).toContain("Ana Ferreira");
    expect(resultado).toContain("background:#d1fae5");
  });

  it("marca um token em falta a amarelo por omissao, nunca deixa {{token}} cru", () => {
    const resultado = substituirVariaveisRH("Termina em {{vinculo_data_fim}}", {});
    expect(resultado).not.toContain("{{vinculo_data_fim}}");
    expect(resultado).toContain("background:#fef3c7");
    expect(resultado).toContain("vinculo_data_fim em falta");
  });

  it("sem realce (realce=false), preenchido fica literal e em falta fica ____________", () => {
    const resultado = substituirVariaveisRH(
      "{{pessoa_nome_completo}} — {{vinculo_data_fim}}",
      { pessoa_nome_completo: "Ana Ferreira" },
      false,
    );
    expect(resultado).toBe("Ana Ferreira — ____________");
  });

  it("com DADOS_EXEMPLO_RH, um contrato a termo (sem data de fim) mostra o campo em falta", () => {
    const resultado = substituirVariaveisRH(
      "{{pessoa_nome_completo}} tem contrato até {{vinculo_data_fim}}",
      DADOS_EXEMPLO_RH,
    );
    expect(resultado).toContain("Ana Sofia Ferreira");
    expect(resultado).toContain("vinculo_data_fim em falta");
  });

  // Paridade TS/SQL (ponto (a) da revisao a 20261202020000): um token
  // escrito com espacos dentro das chavetas e/ou maiusculas resolve aqui
  // exactamente como "{{pessoa_nome_completo}}" -- e a mesma tolerancia que
  // hr_documento_substituir_variaveis (a substituicao REAL, no servidor)
  // agora tambem tem, provada do lado SQL em
  // supabase/tests/database/hr_documento_variaveis_test.sql. Se um dos dois
  // lados deixar de tolerar isto, um token assim fica verde na
  // pre-visualizacao e sai cru no documento emitido (ou vice-versa).
  it("resolve um token com espacos dentro das chavetas, tal como o lado SQL", () => {
    const resultado = substituirVariaveisRH("Ola {{ pessoa_nome_completo }}", { pessoa_nome_completo: "Ana Ferreira" });
    expect(resultado).toContain("Ana Ferreira");
    expect(resultado).not.toContain("{{");
  });

  it("resolve um token em maiusculas, tal como o lado SQL", () => {
    const resultado = substituirVariaveisRH("Ola {{PESSOA_NOME_COMPLETO}}", { pessoa_nome_completo: "Ana Ferreira" });
    expect(resultado).toContain("Ana Ferreira");
    expect(resultado).not.toContain("{{");
  });

  it("um token desconhecido com espacos e maiusculas fica marcado, nunca cru", () => {
    const resultado = substituirVariaveisRH("{{ CAMPO_INVENTADO }}", {}, false);
    expect(resultado).toBe("____________");
  });
});
