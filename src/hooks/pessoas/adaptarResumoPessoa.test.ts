import { describe, expect, it } from "vitest";
import { adaptarResumo, hojeLisboa } from "./adaptarResumoPessoa";
import type { LinhaResumoDb } from "./listaPessoasTipos";

const ID = "11111111-1111-4111-8111-111111111111";
const HOJE = "2026-07-15";

function linha(sobre: Partial<LinhaResumoDb> = {}): LinhaResumoDb {
  return {
    entity_id: ID,
    nome: "Ana Silva",
    papel: "cliente",
    lead_id: "22222222-2222-4222-8222-222222222222",
    client_id: "33333333-3333-4333-8333-333333333333",
    assigned_to: "44444444-4444-4444-8444-444444444444",
    lead_status: "open",
    closure_result: null,
    etapa: "qualificada",
    negocios_abertos: 2,
    negocios_ganhos: 1,
    negocios_perdidos: 3,
    fase_mais_avancada: "proposta",
    pronto_a_ganhar: true,
    valor_em_jogo: 12500.5,
    ultimo_contacto_em: "2026-07-10T09:00:00Z",
    proxima_visita_em: "2026-07-20T10:00:00Z",
    ultima_visita_feita_em: null,
    ultimo_negocio_em: null,
    por_ligar_contactos: 0,
    por_ligar_visitas: 0,
    por_ligar_levantamentos: 0,
    chave_ordem: "2026-07-10T09:00:00.000000Z",
    ha_mais: false,
    ...sobre,
  };
}

describe("hojeLisboa", () => {
  it("usa o dia de Lisboa, não o de UTC (verão: 23:30 UTC já é o dia seguinte)", () => {
    expect(hojeLisboa(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-16");
  });
  it("no inverno Lisboa coincide com UTC", () => {
    expect(hojeLisboa(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-15");
  });
  it("sem argumento devolve AAAA-MM-DD", () => {
    expect(hojeLisboa()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("adaptarResumo", () => {
  it("converte uma linha completa", () => {
    expect(adaptarResumo(linha(), HOJE)).toEqual({
      id: ID,
      nome: "Ana Silva",
      papel: "cliente",
      leadId: "22222222-2222-4222-8222-222222222222",
      clienteId: "33333333-3333-4333-8333-333333333333",
      responsavelId: "44444444-4444-4444-8444-444444444444",
      etapa: "qualificada",
      faseEtapa: "proposta",
      encerrada: null,
      abertos: 2,
      ganhos: 1,
      perdidos: 3,
      prontoAGanhar: true,
      valorEmJogo: 12500.5,
      ultimoContactoEm: "2026-07-10T09:00:00Z",
      diasSemContacto: 5,
      proximaVisitaEm: "2026-07-20T10:00:00Z",
      // Lote A: os 6 campos que a função já devolvia e a lista deitava fora, mais o passo calculado com eles.
      leadStatus: "open",
      ultimaVisitaFeitaEm: null,
      ultimoNegocioEm: null,
      porLigarContactos: 0,
      porLigarVisitas: 0,
      porLigarLevantamentos: 0,
      passo: "ganharNegocio",
      // Lote C: os campos novos; a função mais antiga (esta linha não os traz) dá «sem dado» (null), nunca undefined.
      criadoEm: null,
      qualificacao: null,
      voltou: null,
      atrasada: null,
      origem: null,
      campanhaId: null,
      campanha: null,
      formulario: null,
      ultimoResultado: null,
    });
  });

  it("valor em jogo: null vira 0, número fica, texto converte", () => {
    expect(adaptarResumo(linha({ valor_em_jogo: null }), HOJE).valorEmJogo).toBe(0);
    expect(adaptarResumo(linha({ valor_em_jogo: 300 }), HOJE).valorEmJogo).toBe(300);
    expect(adaptarResumo(linha({ valor_em_jogo: "1234.50" }), HOJE).valorEmJogo).toBe(1234.5);
  });

  it("valor em jogo ilegível não dá NaN", () => {
    expect(adaptarResumo(linha({ valor_em_jogo: "abc" }), HOJE).valorEmJogo).toBe(0);
  });

  it("etapa desconhecida cai em nova; as cinco conhecidas ficam", () => {
    expect(adaptarResumo(linha({ etapa: "outra" }), HOJE).etapa).toBe("nova");
    expect(adaptarResumo(linha({ etapa: "" }), HOJE).etapa).toBe("nova");
    for (const e of ["nova", "emContacto", "visitaMarcada", "qualificada", "cliente"] as const) {
      expect(adaptarResumo(linha({ etapa: e }), HOJE).etapa).toBe(e);
    }
  });

  it("papel desconhecido cai em lead", () => {
    expect(adaptarResumo(linha({ papel: "fornecedor" }), HOJE).papel).toBe("lead");
    expect(adaptarResumo(linha({ papel: "lead" }), HOJE).papel).toBe("lead");
  });

  it("closure_result só conta se for semInteresse ou obraInviavel", () => {
    expect(adaptarResumo(linha({ closure_result: "semInteresse" }), HOJE).encerrada).toBe("semInteresse");
    expect(adaptarResumo(linha({ closure_result: "obraInviavel" }), HOJE).encerrada).toBe("obraInviavel");
    expect(adaptarResumo(linha({ closure_result: "ganho" }), HOJE).encerrada).toBeNull();
    expect(adaptarResumo(linha({ closure_result: null }), HOJE).encerrada).toBeNull();
  });

  it("fase mais avançada só aceita orcamento, proposta ou contrato", () => {
    for (const f of ["orcamento", "proposta", "contrato"] as const) {
      expect(adaptarResumo(linha({ fase_mais_avancada: f }), HOJE).faseEtapa).toBe(f);
    }
    expect(adaptarResumo(linha({ fase_mais_avancada: "ganho" }), HOJE).faseEtapa).toBeNull();
    expect(adaptarResumo(linha({ fase_mais_avancada: null }), HOJE).faseEtapa).toBeNull();
  });

  it("nome null ou vazio vira texto vazio", () => {
    expect(adaptarResumo(linha({ nome: null }), HOJE).nome).toBe("");
    expect(adaptarResumo(linha({ nome: "   " }), HOJE).nome).toBe("");
    expect(adaptarResumo(linha({ nome: "" }), HOJE).nome).toBe("");
  });

  it("dias sem contacto: calendário de Lisboa no verão (23:30 UTC já é o dia seguinte)", () => {
    const l = linha({ ultimo_contacto_em: "2026-07-15T23:30:00Z" });
    expect(adaptarResumo(l, "2026-07-16").diasSemContacto).toBe(0);
    expect(adaptarResumo(l, "2026-07-17").diasSemContacto).toBe(1);
  });

  it("dias sem contacto: calendário de Lisboa no inverno (23:30 UTC é o mesmo dia)", () => {
    const l = linha({ ultimo_contacto_em: "2026-01-15T23:30:00Z" });
    expect(adaptarResumo(l, "2026-01-15").diasSemContacto).toBe(0);
    expect(adaptarResumo(l, "2026-01-16").diasSemContacto).toBe(1);
  });

  it("dias sem contacto atravessa a mudança de hora sem perder um dia", () => {
    const l = linha({ ultimo_contacto_em: "2026-03-28T12:00:00Z" });
    expect(adaptarResumo(l, "2026-03-30").diasSemContacto).toBe(2);
  });

  it("sem contacto: null", () => {
    const r = adaptarResumo(linha({ ultimo_contacto_em: null }), HOJE);
    expect(r.diasSemContacto).toBeNull();
    expect(r.ultimoContactoEm).toBeNull();
  });

  it("contacto no futuro não dá dias negativos", () => {
    const l = linha({ ultimo_contacto_em: "2026-07-20T10:00:00Z" });
    expect(adaptarResumo(l, HOJE).diasSemContacto).toBe(0);
  });

  it("não altera a linha recebida", () => {
    const l = linha({ nome: null });
    const copia = JSON.stringify(l);
    adaptarResumo(l, HOJE);
    expect(JSON.stringify(l)).toBe(copia);
  });
});
