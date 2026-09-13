/**
 * `ordenarColocacoes` reaproveita `estaEmAberto` de `afectacoes.ts` (ver o
 * cabecalho de `colocacaoOrganograma.ts`) -- este teste cobre so o que e
 * proprio desta tabela: a ordenacao, e o nome do erro de sobreposicao.
 */
import { describe, it, expect } from "vitest";
import { ERRO_COLOCACAO_SOBREPOSTA, ordenarColocacoes } from "@/lib/hr/colocacaoOrganograma";
import { ehErroNomeado } from "@/lib/hr/afectacoes";
import type { PessoaColocacaoOrganograma } from "@/types/hr";

function linha(parciais: Partial<PessoaColocacaoOrganograma>): PessoaColocacaoOrganograma {
  return {
    id: "c1",
    pessoa_id: "p1",
    organization_id: "org",
    organograma_node_id: null,
    valido_de: "2026-01-01",
    valido_ate: null,
    motivo: null,
    ...parciais,
  };
}

describe("ordenarColocacoes", () => {
  it("poe a em aberto primeiro, e ordena o resto por inicio mais recente", () => {
    const aberta = linha({ id: "aberta", valido_de: "2020-01-01", valido_ate: null });
    const antiga = linha({ id: "antiga", valido_de: "2019-01-01", valido_ate: "2019-06-01" });
    const recente = linha({ id: "recente", valido_de: "2021-01-01", valido_ate: "2021-06-01" });

    const ordenadas = ordenarColocacoes([antiga, recente, aberta]);

    expect(ordenadas.map((c) => c.id)).toEqual(["aberta", "recente", "antiga"]);
  });

  it("aceita uma colocacao sem no do organograma (null e sempre legitimo)", () => {
    const semNo = linha({ id: "sem-no", organograma_node_id: null });
    expect(ordenarColocacoes([semNo])[0].organograma_node_id).toBeNull();
  });
});

describe("ERRO_COLOCACAO_SOBREPOSTA", () => {
  it("reconhece o erro nomeado que a base levanta na sobreposicao de intervalos", () => {
    const erro = { message: "colocacao_organograma_sobreposta: o intervalo cruza-se com a versao anterior." };
    expect(ehErroNomeado(erro, ERRO_COLOCACAO_SOBREPOSTA)).toBe(true);
    expect(ehErroNomeado(erro, "afectacao_sobreposta")).toBe(false);
  });
});
