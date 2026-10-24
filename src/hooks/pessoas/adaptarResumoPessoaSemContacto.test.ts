// O resultado do último contacto vindo da base: «semContacto» nunca é um resultado de chamada («outro» seria mentira).
// Quem nunca foi contactado é dito pela data do contacto (vistaDaLista), não por este campo.
import { describe, expect, it } from "vitest";
import { adaptarResumo } from "./adaptarResumoPessoa";
import type { LinhaResumoDb } from "./listaPessoasTipos";

const linha = (sobre: Partial<LinhaResumoDb>): LinhaResumoDb => ({
  entity_id: "11111111-1111-4111-8111-111111111111", nome: "Ana Silva", papel: "lead", lead_id: null, client_id: null,
  assigned_to: null, lead_status: null, closure_result: null, etapa: "nova", negocios_abertos: 0, negocios_ganhos: 0,
  negocios_perdidos: 0, fase_mais_avancada: null, pronto_a_ganhar: false, valor_em_jogo: null, ultimo_contacto_em: null,
  proxima_visita_em: null, ultima_visita_feita_em: null, ultimo_negocio_em: null, por_ligar_contactos: 0,
  por_ligar_visitas: 0, por_ligar_levantamentos: 0, chave_ordem: "k", ha_mais: false,
  criado_em: null, qualificacao_tipo: null, ultima_atividade_em: null, ultimo_contacto_lead_em: null,
  voltou_a_contactar: false, origem: null, origem_detalhe: null, campanha_id: null, campanha: null,
  formulario_id: null, formulario: null, ultimo_resultado: null, atrasada: false,
  ...sobre,
});

describe("adaptarResumo: ultimo_resultado «semContacto»", () => {
  it("não vira «outro»: fica sem resultado", () => {
    expect(adaptarResumo(linha({ ultimo_resultado: "semContacto" }), "2026-07-15").ultimoResultado).toBeNull();
  });

  it("com espaços à volta também", () => {
    expect(adaptarResumo(linha({ ultimo_resultado: "  semContacto " }), "2026-07-15").ultimoResultado).toBeNull();
  });

  it("um texto desconhecido continua a ser «outro»", () => {
    expect(adaptarResumo(linha({ ultimo_resultado: "answered" }), "2026-07-15").ultimoResultado).toBe("outro");
  });
});
