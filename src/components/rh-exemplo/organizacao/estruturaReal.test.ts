import { describe, expect, it } from "vitest";
import {
  construirEstruturaReal,
  ligacoesReais,
  pessoasOrgReais,
  validarPedidoReal,
} from "@/components/rh-exemplo/organizacao/estruturaReal";
import type { PessoaColocacaoOrganograma } from "@/components/rh-exemplo/tipos";

const empresa = { id: "org-1", name: "Mudelar Teste" };
const filiais = [{ id: "org-2", name: "Filial Porto" }, { id: "org-3", name: "Filial Braga" }];
const locais = [
  { id: "loc-a", nome: "Loja Porto", organograma_node_id: "org-2", morada: "Rua A 1", cidade: "Porto" },
  { id: "loc-b", nome: "Armazem", organograma_node_id: null, morada: null, cidade: null },
  { id: "loc-c", nome: "Fora da arvore", organograma_node_id: "org-99", morada: null, cidade: "Faro" },
];

const col = (pessoa: string, no: string | null, desde = "2026-01-01"): PessoaColocacaoOrganograma => ({
  id: `c-${pessoa}`, pessoa_id: pessoa, organization_id: "org-1", organograma_node_id: no, valido_de: desde, valido_ate: null, motivo: null,
});

describe("construirEstruturaReal", () => {
  const est = construirEstruturaReal({ empresa, filiais, locais });

  it("o grupo e a empresa vem da organizacao activa, com ids que nao chocam com os das filiais", () => {
    expect(est.grupo.nome).toBe("Mudelar Teste");
    expect(est.empresas).toHaveLength(1);
    expect(est.empresas[0]!.nome).toBe("Mudelar Teste");
    const ids = [est.grupo.id, est.empresas[0]!.id, ...est.filiais.map((f) => f.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a propria organizacao entra como filial, mesmo que a arvore nao a devolva", () => {
    expect(est.filiais.map((f) => f.id)).toEqual(["org-1", "org-2", "org-3"]);
    expect(est.filiais.every((f) => f.empresaId === est.empresas[0]!.id)).toBe(true);
  });

  it("nao duplica a organizacao quando a arvore ja a traz", () => {
    const e = construirEstruturaReal({ empresa, filiais: [{ id: "org-1", name: "Mudelar Teste" }, ...filiais], locais: [] });
    expect(e.filiais.map((f) => f.id)).toEqual(["org-1", "org-2", "org-3"]);
  });

  it("cada centro fica na filial do seu no; sem no ou com no desconhecido fica na propria organizacao", () => {
    const porId = Object.fromEntries(est.centros.map((c) => [c.id, c.filialId]));
    expect(porId).toEqual({ "loc-a": "org-2", "loc-b": "org-1", "loc-c": "org-1" });
  });

  it("a morada do centro junta rua e cidade, e fica vazia quando nao ha nenhuma", () => {
    const m = Object.fromEntries(est.centros.map((c) => [c.id, c.morada]));
    expect(m).toEqual({ "loc-a": "Rua A 1, Porto", "loc-b": "", "loc-c": "Faro" });
  });

  it("sem organizacao activa devolve uma estrutura vazia mas valida", () => {
    const e = construirEstruturaReal({ empresa: { id: "", name: "" }, filiais: [], locais: [] });
    expect(e.empresas).toEqual([]);
    expect(e.filiais).toEqual([]);
    expect(e.centros).toEqual([]);
  });
});

describe("ligacoesReais", () => {
  const est = construirEstruturaReal({ empresa, filiais, locais });
  const emp = est.empresas[0]!.id;

  it("liga quem tem colocacao em vigor num no da arvore, com o centro da ficha", () => {
    const l = ligacoesReais(est, [{ id: "p1", local_id: "loc-a" }], new Map([["p1", col("p1", "org-2", "2026-03-01")]]));
    expect(l).toEqual([{ pessoaId: "p1", empresaId: emp, filialId: "org-2", centroId: "loc-a", desde: "2026-03-01" }]);
  });

  it("quem nao tem centro fica com centro vazio (cai em «Sem centro atribuido»)", () => {
    const l = ligacoesReais(est, [{ id: "p1", local_id: null }], new Map([["p1", col("p1", "org-3")]]));
    expect(l[0]!.centroId).toBe("");
  });

  it("nao liga quem nao tem colocacao, nem quem esta «sem classificacao» (no nulo), nem no desconhecido", () => {
    const pessoas = [{ id: "p1", local_id: null }, { id: "p2", local_id: null }, { id: "p3", local_id: null }];
    const vig = new Map([["p2", col("p2", null)], ["p3", col("p3", "org-99")]]);
    expect(ligacoesReais(est, pessoas, vig)).toEqual([]);
  });
});

describe("pessoasOrgReais", () => {
  it("so inclui fichas activas e usa o nome completo, cargo e chefia", () => {
    const r = pessoasOrgReais([
      { id: "a", nome_completo: "Ana", cargo: "Gerente", reporta_a_pessoa_id: null, estado_registo: "activo" },
      { id: "b", nome_completo: "Bruno", cargo: null, reporta_a_pessoa_id: "a", estado_registo: "activo" },
      { id: "c", nome_completo: "Carla", cargo: null, reporta_a_pessoa_id: null, estado_registo: "arquivado" },
    ]);
    expect(r).toEqual([
      { id: "a", nome: "Ana", cargo: "Gerente", reportaAId: null },
      { id: "b", nome: "Bruno", cargo: null, reportaAId: "a" },
    ]);
  });
});

describe("validarPedidoReal", () => {
  const est = construirEstruturaReal({ empresa, filiais, locais });
  const emp = est.empresas[0]!.id;
  const ok = { pessoaId: "p1", empresaId: emp, filialId: "org-2", centroId: null, desde: "2026-10-26", motivo: "" };

  it("aceita um pedido completo", () => {
    expect(validarPedidoReal(est, ok)).toBeNull();
  });
  it("recusa sem pessoa, empresa, filial ou com data invalida", () => {
    expect(validarPedidoReal(est, { ...ok, pessoaId: "" })).toBe("pessoaEmFalta");
    expect(validarPedidoReal(est, { ...ok, empresaId: "x" })).toBe("empresaInvalida");
    expect(validarPedidoReal(est, { ...ok, filialId: "" })).toBe("filialInvalida");
    expect(validarPedidoReal(est, { ...ok, desde: "26/10/2026" })).toBe("dataInvalida");
    expect(validarPedidoReal(est, { ...ok, desde: "" })).toBe("dataInvalida");
  });
});
