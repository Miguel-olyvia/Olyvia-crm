// Lote C: os 13 campos novos de neg_resumo_pessoas (migration 20261225150000) passam para PessoaDaLista.
import { describe, expect, it } from "vitest";
import { adaptarResumo } from "./adaptarResumoPessoa";
import type { LinhaResumoDb } from "./listaPessoasTipos";

const HOJE = "2026-07-15";

function linha(sobre: Partial<LinhaResumoDb> = {}): LinhaResumoDb {
  return {
    entity_id: "11111111-1111-4111-8111-111111111111", nome: "Ana Silva", papel: "lead",
    lead_id: "22222222-2222-4222-8222-222222222222", client_id: null,
    assigned_to: null, lead_status: null, closure_result: null, etapa: "nova", negocios_abertos: 0, negocios_ganhos: 0,
    negocios_perdidos: 0, fase_mais_avancada: null, pronto_a_ganhar: false, valor_em_jogo: null, ultimo_contacto_em: null,
    proxima_visita_em: null, ultima_visita_feita_em: null, ultimo_negocio_em: null, por_ligar_contactos: 0,
    por_ligar_visitas: 0, por_ligar_levantamentos: 0, chave_ordem: "k", ha_mais: false,
    criado_em: null, qualificacao_tipo: null, ultima_atividade_em: null, ultimo_contacto_lead_em: null,
    voltou_a_contactar: false, origem: null, origem_detalhe: null, campanha_id: null, campanha: null,
    formulario_id: null, formulario: null, ultimo_resultado: null, atrasada: false,
    ...sobre,
  };
}

describe("adaptarResumo: campos novos tal como a função os devolve", () => {
  it("criado em, origem, campanha e formulário passam", () => {
    const p = adaptarResumo(linha({
      criado_em: "2026-06-01T10:00:00Z", origem: "web", campanha_id: "c1", campanha: "Cozinhas", formulario_id: "f1", formulario: "Pedido de orçamento",
    }), HOJE);
    expect(p.criadoEm).toBe("2026-06-01T10:00:00Z");
    expect(p.origem).toBe("web");
    expect(p.campanhaId).toBe("c1");
    expect(p.campanha).toBe("Cozinhas");
    expect(p.formulario).toBe("Pedido de orçamento");
  });

  it("colunas em falta (função mais antiga) ficam null e false, nunca undefined", () => {
    const antiga = linha();
    for (const k of ["criado_em", "qualificacao_tipo", "voltou_a_contactar", "atrasada", "origem", "campanha_id", "campanha", "formulario", "ultimo_resultado"] as const) {
      delete (antiga as Partial<LinhaResumoDb>)[k];
    }
    const p = adaptarResumo(antiga, HOJE);
    expect(p).toMatchObject({
      criadoEm: null, qualificacao: null, voltou: null, atrasada: null, origem: null, campanhaId: null, campanha: null,
      formulario: null, ultimoResultado: null,
    });
  });

  it("voltou e atrasada passam como booleanos", () => {
    const p = adaptarResumo(linha({ voltou_a_contactar: true, atrasada: true }), HOJE);
    expect([p.voltou, p.atrasada]).toEqual([true, true]);
  });
});

describe("adaptarResumo: selo MQL/SQL (como a página de Leads: só com a lead qualificada)", () => {
  it.each([
    ["mql", "qualified", "MQL"], ["sql", "qualified", "SQL"], [" SQL ", "qualified", "SQL"],
    ["mql", "open", null], ["sql", "new", null], [null, "qualified", null], ["outro", "qualified", null],
    ["sql", null, null],
  ] as const)("tipo %s com o estado %s dá %s", (tipo, estado, esperado) => {
    expect(adaptarResumo(linha({ qualificacao_tipo: tipo, lead_status: estado }), HOJE).qualificacao).toBe(esperado);
  });
});

describe("adaptarResumo: «Sem contacto» com duas fontes", () => {
  it("o último contacto é o MAIOR entre a chamada registada e o contacto guardado na lead", () => {
    const p = adaptarResumo(linha({
      ultimo_contacto_em: "2026-07-01T10:00:00Z", ultimo_contacto_lead_em: "2026-07-12T10:00:00Z",
    }), HOJE);
    expect(p.ultimoContactoEm).toBe("2026-07-12T10:00:00Z");
    expect(p.diasSemContacto).toBe(3);
  });

  it("com a chamada mais recente, vale a chamada", () => {
    const p = adaptarResumo(linha({
      ultimo_contacto_em: "2026-07-14T10:00:00Z", ultimo_contacto_lead_em: "2026-07-01T10:00:00Z",
    }), HOJE);
    expect(p.ultimoContactoEm).toBe("2026-07-14T10:00:00Z");
    expect(p.diasSemContacto).toBe(1);
  });

  it("só uma das fontes: vale essa", () => {
    expect(adaptarResumo(linha({ ultimo_contacto_lead_em: "2026-07-10T10:00:00Z" }), HOJE).diasSemContacto).toBe(5);
    expect(adaptarResumo(linha({ ultimo_contacto_em: "2026-07-10T10:00:00Z" }), HOJE).diasSemContacto).toBe(5);
  });

  it("nenhuma das duas: nunca houve contacto (null)", () => {
    const p = adaptarResumo(linha(), HOJE);
    expect(p.ultimoContactoEm).toBeNull();
    expect(p.diasSemContacto).toBeNull();
  });

  it("uma data ilegível numa das fontes não estraga a outra", () => {
    const p = adaptarResumo(linha({ ultimo_contacto_em: "lixo", ultimo_contacto_lead_em: "2026-07-10T10:00:00Z" }), HOJE);
    expect(p.ultimoContactoEm).toBe("2026-07-10T10:00:00Z");
  });
});

describe("adaptarResumo: resultado do último contacto", () => {
  it.each(["atendeuInteressado", "atendeuMaisTarde", "naoAtendeu", "semInteresse", "numeroErrado"])("conhece %s", (r) => {
    expect(adaptarResumo(linha({ ultimo_resultado: r }), HOJE).ultimoResultado).toBe(r);
  });

  it("um valor das Leads (id de resultado, texto livre) é «outro»", () => {
    expect(adaptarResumo(linha({ ultimo_resultado: "answered" }), HOJE).ultimoResultado).toBe("outro");
    expect(adaptarResumo(linha({ ultimo_resultado: "5b2c-uuid" }), HOJE).ultimoResultado).toBe("outro");
  });

  it("vazio ou nulo: sem resultado", () => {
    expect(adaptarResumo(linha({ ultimo_resultado: null }), HOJE).ultimoResultado).toBeNull();
    expect(adaptarResumo(linha({ ultimo_resultado: "  " }), HOJE).ultimoResultado).toBeNull();
  });
});
