// Lote A: os 6 campos de neg_resumo_pessoas que a lista deitava fora passam para PessoaDaLista, e o passo sai deles.
import { describe, expect, it } from "vitest";
import { adaptarResumo } from "./adaptarResumoPessoa";
import type { LinhaResumoDb } from "./listaPessoasTipos";

const HOJE = "2026-07-15";

function linha(sobre: Partial<LinhaResumoDb> = {}): LinhaResumoDb {
  return {
    entity_id: "11111111-1111-4111-8111-111111111111", nome: "Ana Silva", papel: "lead", lead_id: null, client_id: null,
    assigned_to: null, lead_status: null, closure_result: null, etapa: "nova", negocios_abertos: 0, negocios_ganhos: 0,
    negocios_perdidos: 0, fase_mais_avancada: null, pronto_a_ganhar: false, valor_em_jogo: null, ultimo_contacto_em: null,
    proxima_visita_em: null, ultima_visita_feita_em: null, ultimo_negocio_em: null, por_ligar_contactos: 0,
    por_ligar_visitas: 0, por_ligar_levantamentos: 0, chave_ordem: "k", ha_mais: false, ...sobre,
  };
}

describe("adaptarResumo: campos que a lista deitava fora", () => {
  it("passa os 6 campos tal como a função os devolve", () => {
    const p = adaptarResumo(linha({
      lead_status: "qualified", ultima_visita_feita_em: "2026-07-01T10:00:00Z", ultimo_negocio_em: "2026-06-01T10:00:00Z",
      por_ligar_contactos: 2, por_ligar_visitas: 1, por_ligar_levantamentos: 3,
    }), HOJE);
    expect(p.leadStatus).toBe("qualified");
    expect(p.ultimaVisitaFeitaEm).toBe("2026-07-01T10:00:00Z");
    expect(p.ultimoNegocioEm).toBe("2026-06-01T10:00:00Z");
    expect([p.porLigarContactos, p.porLigarVisitas, p.porLigarLevantamentos]).toEqual([2, 1, 3]);
  });

  it("valores em falta ou ilegíveis ficam null e 0, nunca NaN nem undefined", () => {
    const sujo = linha({
      lead_status: null, por_ligar_contactos: undefined as unknown as number, por_ligar_visitas: "x" as unknown as number,
    });
    const p = adaptarResumo(sujo, HOJE);
    expect(p.leadStatus).toBeNull();
    expect([p.porLigarContactos, p.porLigarVisitas, p.porLigarLevantamentos]).toEqual([0, 0, 0]);
  });

  it("o passo sai dos campos: sem nada, registar a chamada; com contacto por ligar, marcar a visita", () => {
    expect(adaptarResumo(linha(), HOJE).passo).toBe("registarChamada");
    expect(adaptarResumo(linha({ por_ligar_contactos: 1 }), HOJE).passo).toBe("marcarVisita");
  });

  it("o passo de uma abordagem encerrada é nenhum", () => {
    expect(adaptarResumo(linha({ closure_result: "obraInviavel", por_ligar_contactos: 1 }), HOJE).passo).toBe("nenhum");
  });

  it("uma proposta por fechar dá passo desconhecido (null): a lista não inventa", () => {
    expect(adaptarResumo(linha({ negocios_abertos: 1, fase_mais_avancada: "proposta" }), HOJE).passo).toBeNull();
  });
});
