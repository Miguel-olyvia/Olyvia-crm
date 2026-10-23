// O que a ficha real dá aos ecrãs para EDITAR um negócio e as suas condições: as notas e o comercial do negócio, a permissão de o mandar
// para o lixo e a proposta com as condições lidas de `terms`. Os testes do resto do adaptador estão em adaptarDadosNegocio.test.ts.
import { describe, expect, it } from "vitest";
import { adaptarDadosNegocio } from "./adaptarDadosNegocio";
import { adaptarNegocios } from "./adaptarNegociosFicha";
import { fichaDb, negocioDb } from "./fichaFabrica";
import type { PropostaDb } from "./fichaTipos";

const HOJE = "2026-10-19";
const proposta = (sobre: Partial<PropostaDb> = {}): PropostaDb => ({
  id: "p1", numero: "P-1", titulo: "Proposta", status: "draft", valor: 1000, valid_until: null, terms: null, enviada_em: null, aceite_em: null,
  criado_em: "2026-10-10T09:00:00Z", ...sobre,
});
const CONDICOES = { prazo_execucao_dias: 20, inicio_previsto: "2026-11-02", pagamento: "metade", garantia_anos: 2 };
const dados = (negocios: Parameters<typeof negocioDb>[0][], opcoes?: { podeApagar?: boolean }) =>
  adaptarDadosNegocio(fichaDb({ negocios: { total: negocios.length, itens: negocios.map((n) => negocioDb(n)) } }), null, opcoes);

describe("o negócio da base traz o que o diálogo de editar precisa", () => {
  const negocio = (sobre: Parameters<typeof negocioDb>[0]) => adaptarNegocios(fichaDb({ negocios: { total: 1, itens: [negocioDb(sobre)] } }), HOJE)[0];

  it("as notas (texto vazio quando a base tem null) e o comercial (o id)", () => {
    expect(negocio({ notas: "Cliente quer tudo branco", responsavel_id: "u7" })).toMatchObject({ notas: "Cliente quer tudo branco", comercialId: "u7" });
    expect(negocio({ notas: null, responsavel_id: null })).toMatchObject({ notas: "", comercialId: null });
  });
});

describe("podeApagar (pessoas.delete)", () => {
  it("vem das opções e, sem elas, é falso (quem não pode, não vê o lixo)", () => {
    expect(dados([{}], { podeApagar: true }).podeApagar).toBe(true);
    expect(dados([{}], { podeApagar: false }).podeApagar).toBe(false);
    expect(dados([{}]).podeApagar).toBe(false);
  });
});

describe("a proposta com as condições (dados.proposta)", () => {
  it("lê as condições de terms e o estado da proposta viva", () => {
    const p = dados([{ id: "n1", propostas: [proposta({ status: "sent", terms: CONDICOES })] }]).proposta?.("n1");
    expect(p).toEqual({
      id: "p1", estado: "enviada", legivel: true, condicoes: { prazo: 20, inicio: "2026-11-02", pagamento: "metade", garantia: 2 },
    });
  });

  it("sem condições (terms null ou {}) é legível e vazio", () => {
    expect(dados([{ id: "n1", propostas: [proposta()] }]).proposta?.("n1")).toMatchObject({ estado: "rascunho", condicoes: null, legivel: true });
    expect(dados([{ id: "n1", propostas: [proposta({ terms: {} as never })] }]).proposta?.("n1")).toMatchObject({ condicoes: null, legivel: true });
  });

  it("um formato que não se conhece fica ilegível (nada rebenta)", () => {
    expect(dados([{ id: "n1", propostas: [proposta({ terms: "30 dias" as never })] }]).proposta?.("n1")).toMatchObject({ condicoes: null, legivel: false });
  });

  it("um negócio sem proposta, ou que não existe, dá null", () => {
    const d = dados([{ id: "n1", propostas: [] }]);
    expect(d.proposta?.("n1")).toBeNull();
    expect(d.proposta?.("outro")).toBeNull();
  });

  it("escolhe a proposta viva: a mais recente que o cliente não recusou", () => {
    const d = dados([{ id: "n1", propostas: [
      proposta({ id: "velha", status: "sent", criado_em: "2026-10-01T09:00:00Z" }),
      proposta({ id: "recusada", status: "rejected", criado_em: "2026-10-15T09:00:00Z" }),
    ] }]);
    expect(d.proposta?.("n1")?.id).toBe("velha");
  });

  it("se só há propostas recusadas, o negócio está sem proposta (como no resto do ecrã)", () => {
    expect(dados([{ id: "n1", propostas: [proposta({ status: "rejected" })] }]).proposta?.("n1")).toBeNull();
  });

  it("uma proposta aceite mantém o estado «aceite» (o ecrã não deixa editar as condições)", () => {
    expect(dados([{ id: "n1", propostas: [proposta({ status: "accepted", terms: CONDICOES })] }]).proposta?.("n1")?.estado).toBe("aceite");
  });
});
