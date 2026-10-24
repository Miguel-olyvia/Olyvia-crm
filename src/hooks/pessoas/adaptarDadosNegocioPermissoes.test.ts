// As permissões do fecho no que a ficha dá aos ecrãs: cada botão de documento pede pessoas.edit E a do documento; reabrir pede pessoas.reopen;
// converter pede leads.convert. Sem a lista de permissões (o exemplo, ou a página que ainda não a leu) nada se restringe por aqui: a base decide.
import { describe, expect, it } from "vitest";
import { adaptarDadosNegocio } from "./adaptarDadosNegocio";
import { fichaDb, negocioDb } from "./fichaFabrica";

const dados = (permissoes?: readonly string[], editar = true) =>
  adaptarDadosNegocio(fichaDb({ permissoes: { editar, criar: true } }), null, permissoes ? { permissoes } : {});

describe("adaptarDadosNegocio: permissões do fecho", () => {
  it("sem a lista não restringe nada: os campos ficam ausentes", () => {
    const d = dados();
    expect(d.podeNoDocumento).toBeUndefined();
    expect(d.podeReabrir).toBeUndefined();
    expect(d.podeConverter).toBeUndefined();
  });

  it("um documento pede pessoas.edit e a permissão do documento", () => {
    const d = dados(["proposals.edit", "quotes.create", "client_contracts.create"]);
    expect(d.podeNoDocumento?.("proposta", "edit")).toBe(true);
    expect(d.podeNoDocumento?.("proposta", "create")).toBe(false);
    expect(d.podeNoDocumento?.("orcamento", "create")).toBe(true);
    expect(d.podeNoDocumento?.("orcamento", "edit")).toBe(false);
    expect(d.podeNoDocumento?.("contrato", "create")).toBe(true);
    expect(d.podeNoDocumento?.("contrato", "edit")).toBe(false);
  });

  it("sem pessoas.edit nenhum documento se pode mexer, mesmo com a permissão do documento", () => {
    const d = dados(["proposals.edit", "proposals.create", "quotes.edit", "quotes.create", "client_contracts.edit", "client_contracts.create"], false);
    for (const tipo of ["orcamento", "proposta", "contrato"] as const) {
      expect(d.podeNoDocumento?.(tipo, "edit")).toBe(false);
      expect(d.podeNoDocumento?.(tipo, "create")).toBe(false);
    }
  });

  it("reabrir só com pessoas.reopen e converter só com leads.convert", () => {
    expect(dados(["pessoas.reopen"]).podeReabrir).toBe(true);
    expect(dados(["proposals.edit"]).podeReabrir).toBe(false);
    expect(dados(["leads.convert"]).podeConverter).toBe(true);
    expect(dados(["pessoas.reopen"]).podeConverter).toBe(false);
  });

  it("uma lista vazia conta como «não tem nenhuma», diferente de «não sei»", () => {
    const d = dados([]);
    expect(d.podeReabrir).toBe(false);
    expect(d.podeNoDocumento?.("proposta", "edit")).toBe(false);
  });
});

describe("adaptarDadosNegocio: comerciais reais para o «Feito por»", () => {
  it("passam das opções, e sem elas o campo fica ausente (ainda por ler)", () => {
    expect(adaptarDadosNegocio(fichaDb(), null, { comerciais: ["Rita Gomes", "Tomás Reis"] }).comerciais).toEqual(["Rita Gomes", "Tomás Reis"]);
    expect(adaptarDadosNegocio(fichaDb(), null, {}).comerciais).toBeUndefined();
  });

  it("uma lista vazia passa como vazia (a leitura acabou sem comerciais), diferente de «ainda por ler»", () => {
    expect(adaptarDadosNegocio(fichaDb(), null, { comerciais: [] }).comerciais).toEqual([]);
  });
});

describe("adaptarDadosNegocio: as permissões por negócio (pode_editar, pode_apagar, pode_restaurar da ficha)", () => {
  const ficha = (sobre: Parameters<typeof negocioDb>[0]) => fichaDb({ negocios: { total: 1, itens: [negocioDb({ id: "n1", ...sobre })] } });

  it("lê os três campos de cada negócio, pelo id", () => {
    const d = adaptarDadosNegocio(ficha({ pode_editar: true, pode_apagar: false, pode_restaurar: false }), null);
    expect(d.permissoesNegocio?.("n1")).toEqual({ editar: true, apagar: false, restaurar: false });
  });

  it("sem os campos (a migration não está aplicada) devolve vazio: nada se sabe, nada se restringe", () => {
    const d = adaptarDadosNegocio(ficha({}), null);
    expect(d.permissoesNegocio?.("n1")).toEqual({});
  });

  it("um valor que não é booleano não conta; um negócio que a ficha não tem dá null", () => {
    const d = adaptarDadosNegocio(ficha({ pode_editar: "sim", pode_apagar: null } as never), null);
    expect(d.permissoesNegocio?.("n1")).toEqual({});
    expect(d.permissoesNegocio?.("desconhecido")).toBeNull();
  });
});
