// Fecho v4 na ficha adaptada: o alerta em aberto, a origem da decisão, a perda automática e a conversão pendente, só quando a base os devolve
// (hoje `neg_ficha_pessoa` ainda não os traz: sem eles, nada se inventa). Valores desconhecidos nunca rebentam e nunca aparecem em bruto.
import { describe, expect, it } from "vitest";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { adaptarNegocios } from "./adaptarNegociosFicha";
import { fichaDb, negocioDb } from "./fichaFabrica";
import type { NegocioFichaDb } from "./fichaTipos";

const adaptar = (n: NegocioFichaDb) => adaptarNegocios(fichaDb({ negocios: { total: 1, itens: [n] } }), "2026-10-19")[0] as NegocioMes;

describe("adaptarNegocios: fecho v4", () => {
  it("sem os campos novos (a base de hoje) não inventa alerta, origem, perda automática nem conversão pendente", () => {
    const n = adaptar(negocioDb());
    expect(n.alerta).toBeUndefined();
    expect(n.origemDecisao).toBeUndefined();
    expect(n.perdaAutomatica).toBeUndefined();
    expect(n.conversaoPendente).toBeUndefined();
  });

  it("o alerta em aberto vem do código; sem código não há alerta", () => {
    expect(adaptar(negocioDb({ alerta_codigo: "sem_prova" })).alerta).toEqual({ codigo: "sem_prova" });
    expect(adaptar(negocioDb({ alerta_codigo: null })).alerta).toBeUndefined();
    expect(adaptar(negocioDb({ alerta_codigo: "" })).alerta).toBeUndefined();
  });

  it("a origem da decisão: tipo conhecido com número e dia de Lisboa", () => {
    const n = adaptar(negocioDb({ estado: "ganho", decisao_origem_tipo: "proposta", decisao_origem_numero: "P-1", decisao_origem_em: "2026-10-15T09:00:00Z" }));
    expect(n.origemDecisao).toEqual({ tipo: "proposta", numero: "P-1", em: "2026-10-15" });
  });

  it("uma origem com tipo desconhecido não conta; o tipo nulo com perda automática diz só que foi automática", () => {
    expect(adaptar(negocioDb({ estado: "ganho", decisao_origem_tipo: "xpto" })).origemDecisao).toBeUndefined();
    const perdido = adaptar(negocioDb({ estado: "perdido", decisao_origem_tipo: null, perda_automatica: true }));
    expect(perdido.perdaAutomatica).toBe(true);
    expect(perdido.origemDecisao).toBeUndefined();
  });

  it("perda automática só vale num negócio perdido e se vier exatamente booleana", () => {
    expect(adaptar(negocioDb({ estado: "perdido", perda_automatica: false })).perdaAutomatica).toBe(false);
    expect(adaptar(negocioDb({ estado: "aberto", perda_automatica: true })).perdaAutomatica).toBeUndefined();
    expect(adaptar(negocioDb({ estado: "perdido", perda_automatica: null })).perdaAutomatica).toBeUndefined();
  });

  it("a conversão pendente só vale num negócio ganho", () => {
    expect(adaptar(negocioDb({ estado: "ganho", conversao_pendente: true })).conversaoPendente).toBe(true);
    expect(adaptar(negocioDb({ estado: "ganho", conversao_pendente: false })).conversaoPendente).toBeUndefined();
    expect(adaptar(negocioDb({ estado: "aberto", conversao_pendente: true })).conversaoPendente).toBeUndefined();
  });
});
