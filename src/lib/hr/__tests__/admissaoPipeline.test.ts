/**
 * A parte pura do pipeline de admissoes (P4 da V3a): a forma que `rpc_hr_admissao_listar` devolve -> a do ecra, os
 * grupos de filtro (que viram `p_estados`), o passo da faixa de progresso e a leitura dos erros da base.
 */
import { describe, expect, it } from "vitest";
import { ESTADOS_ADMISSAO } from "@/lib/hr/estadoAdmissao";
import {
  GRUPOS_PIPELINE,
  PASSOS_FAIXA,
  codigoDeErroRpc,
  contagemDoGrupo,
  paginaDaRpc,
  passoDaFaixa,
} from "@/lib/hr/admissaoPipeline";

describe("paginaDaRpc", () => {
  it("normaliza os itens, os contadores e o cursor", () => {
    const pagina = paginaDaRpc({
      itens: [
        {
          convite_id: "c1",
          pessoa_id: "p1",
          nome: "Ana Silva",
          cargo: "Operadora",
          estado: "submetida",
          estado_portal: "ativo",
          valid_until: "2026-12-20T10:00:00Z",
          submetido_em: "2026-12-14T09:00:00Z",
          devolvida_em: null,
          atualizado_em: "2026-12-14T09:00:00Z",
        },
      ],
      contadores: { submetida: 1, convidada: 4 },
      seguinte: { apos_criado_em: "2026-12-10T08:00:00Z", apos_id: "c0" },
    });
    expect(pagina.itens).toEqual([
      {
        conviteId: "c1",
        pessoaId: "p1",
        nome: "Ana Silva",
        cargo: "Operadora",
        estado: "submetida",
        estadoPortal: "ativo",
        validUntil: "2026-12-20T10:00:00Z",
        submetidoEm: "2026-12-14T09:00:00Z",
        devolvidaEm: null,
        atualizadoEm: "2026-12-14T09:00:00Z",
      },
    ]);
    expect(pagina.contadores).toEqual({ submetida: 1, convidada: 4 });
    expect(pagina.seguinte).toEqual({ criadoEm: "2026-12-10T08:00:00Z", id: "c0" });
  });

  it("um terminado mascarado chega sem datas nem cargo, e continua a ser um item valido", () => {
    const pagina = paginaDaRpc({
      itens: [{ convite_id: "c2", pessoa_id: "p2", nome: "Rui", estado: "terminado", estado_portal: "revogado" }],
      contadores: {},
      seguinte: null,
    });
    expect(pagina.itens[0]).toMatchObject({
      estado: "terminado",
      estadoPortal: "revogado",
      cargo: null,
      validUntil: null,
      submetidoEm: null,
    });
    expect(pagina.seguinte).toBeNull();
  });

  it("um estado que a base nao conhece vira `desconhecido` (nunca um estado aberto inventado)", () => {
    const pagina = paginaDaRpc({
      itens: [{ convite_id: "c3", pessoa_id: "p3", nome: "Eva", estado: "usado", estado_portal: "xpto" }],
    });
    expect(pagina.itens[0].estado).toBe("desconhecido");
    expect(pagina.itens[0].estadoPortal).toBe("desconhecido");
  });

  it.each([null, undefined, "texto", 42, [], {}])("%j: lista vazia, sem rebentar", (bruto) => {
    expect(paginaDaRpc(bruto)).toEqual({ itens: [], contadores: {}, seguinte: null });
  });

  it("o cursor antigo {criado_em, id} NAO e o da base: ignora-se (a base devolve apos_criado_em e apos_id)", () => {
    const pagina = paginaDaRpc({ itens: [], contadores: {}, seguinte: { criado_em: "2026-12-10T08:00:00Z", id: "c0" } });
    expect(pagina.seguinte).toBeNull();
  });

  it("ignora itens sem convite ou sem pessoa e contadores que nao sao numeros", () => {
    const pagina = paginaDaRpc({
      itens: [{ nome: "sem ids" }, null, { convite_id: "c4", pessoa_id: "p4", nome: "Ok", estado: "convidada" }],
      contadores: { convidada: 2, submetida: "x", aprovada: -1 },
      seguinte: { apos_criado_em: "", apos_id: "c4" },
    });
    expect(pagina.itens.map((i) => i.conviteId)).toEqual(["c4"]);
    expect(pagina.contadores).toEqual({ convidada: 2 });
    expect(pagina.seguinte).toBeNull();
  });
});

describe("grupos de filtro", () => {
  it("cada estado real pertence a exatamente um grupo (nenhum fica sem filtro, nenhum conta duas vezes)", () => {
    const todos = GRUPOS_PIPELINE.flatMap((g) => g.estados);
    expect([...todos].sort()).toEqual([...ESTADOS_ADMISSAO].sort());
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("o primeiro grupo e o que pede trabalho ao RH: as fichas por rever", () => {
    expect(GRUPOS_PIPELINE[0]).toMatchObject({ id: "por_rever", estados: ["submetida"] });
  });

  it("a contagem de um grupo soma os seus estados; os terminados mascarados contam nas terminadas", () => {
    const contadores = { convidada: 2, em_preenchimento: 3, devolvida: 1, submetida: 5, rejeitada: 1, cancelada: 2, terminado: 4 };
    const por = (id: string) => GRUPOS_PIPELINE.find((g) => g.id === id)!;
    expect(contagemDoGrupo(por("com_a_pessoa"), contadores)).toBe(6);
    expect(contagemDoGrupo(por("por_rever"), contadores)).toBe(5);
    expect(contagemDoGrupo(por("terminadas"), contadores)).toBe(7);
    expect(contagemDoGrupo(por("concluidas"), contadores)).toBe(0);
  });
});

describe("passoDaFaixa", () => {
  it("convidada esta no convite e a seguir vem a ficha", () => {
    expect(passoDaFaixa("convidada")).toEqual({ atual: 0, rejeitada: false });
    expect(passoDaFaixa("em_preenchimento")).toEqual({ atual: 1, rejeitada: false });
    expect(passoDaFaixa("devolvida")).toEqual({ atual: 1, rejeitada: false });
  });

  it("submetida espera a aprovacao do RH; aprovada passa ao contrato", () => {
    expect(passoDaFaixa("submetida")).toEqual({ atual: 2, rejeitada: false });
    expect(passoDaFaixa("aprovada")).toEqual({ atual: 3, rejeitada: false });
    expect(passoDaFaixa("a_aguardar_assinaturas")).toEqual({ atual: 4, rejeitada: false });
    expect(passoDaFaixa("assinaturas_concluidas")).toEqual({ atual: 5, rejeitada: false });
    expect(passoDaFaixa("a_aguardar_ativacao")).toEqual({ atual: 5, rejeitada: false });
  });

  it("concluida tem todos os passos feitos (atual depois do ultimo)", () => {
    expect(passoDaFaixa("concluida")).toEqual({ atual: PASSOS_FAIXA.length, rejeitada: false });
  });

  it("rejeitada para na aprovacao e di-lo", () => {
    expect(passoDaFaixa("rejeitada")).toEqual({ atual: 2, rejeitada: true });
  });

  it.each(["cancelada", "terminado", "desconhecido"] as const)("%s nao tem faixa (nao se sabe onde parou)", (estado) => {
    expect(passoDaFaixa(estado)).toBeNull();
  });
});

describe("codigoDeErroRpc", () => {
  it.each([
    [{ code: "HRA31", message: "nao_encontrado" }, "nao_encontrado"],
    [{ code: "HRA41", message: "limite_excedido" }, "limite_excedido"],
    [{ code: "HRA33", message: "organizacao_nao_empregadora" }, "organizacao_nao_empregadora"],
    [{ code: "HRA38", message: "x" }, "estado_invalido"],
    [{ code: "42501", message: "permission denied" }, "insufficient_privilege"],
    [{ code: "HRA10", message: "pedido_invalido" }, "pedido_invalido"],
  ])("%j -> %s", (erro, esperado) => {
    expect(codigoDeErroRpc(erro)).toBe(esperado);
  });

  it("sem codigo reconhecivel e um defeito: null (o texto cru da base nunca sobe)", () => {
    expect(codigoDeErroRpc({ message: "relation x does not exist", details: "segredo" })).toBeNull();
    expect(codigoDeErroRpc({ code: "57014", message: "statement timeout" })).toBeNull();
    expect(codigoDeErroRpc(null)).toBeNull();
    expect(codigoDeErroRpc("boom")).toBeNull();
  });
});
