// Contratos dentro do negócio (fecho v4, migration E): como a página de contratos grava um contrato NOVO a partir de um negócio
// (neg_criar_contrato, 16 argumentos), o que se diz antes de anular um contrato que deu um ganho (o substituto reabre o negócio) e a leitura
// do negócio de um contrato. Puro (sem rede), para se testar sem montar a página, que tem milhares de linhas.
import { describe, expect, it } from "vitest";
import {
  avisoDeSubstituicao, escolherGravacaoDeContrato, lerNegocioDoContrato, parametrosNegCriarContrato, substitutoBloqueado, substitutoSemVerificar, type NegocioDoContrato,
} from "./contratoNoNegocio";

const DADOS = {
  p_client_id: "c1", p_entity_id: "e1", p_organization_id: "org", p_root_organization_id: "root", p_proposal_id: "pr1", p_contract_template_id: null,
  p_total_value: 100, p_currency: "EUR", p_start_date: null, p_end_date: null, p_notes: null, p_payment_terms: null,
  p_contract_body_html: "<p/>", p_final_body_html: "<p/>", p_prompt_values: null,
};

describe("escolherGravacaoDeContrato", () => {
  it("sem negócio grava por rpc_create_client_contract, como sempre", () => {
    expect(escolherGravacaoDeContrato({})).toBe("rpc_create_client_contract");
    expect(escolherGravacaoDeContrato({ criarNoNegocioId: undefined })).toBe("rpc_create_client_contract");
    expect(escolherGravacaoDeContrato({ criarNoNegocioId: null })).toBe("rpc_create_client_contract");
    expect(escolherGravacaoDeContrato({ criarNoNegocioId: "" })).toBe("rpc_create_client_contract");
  });

  it("a criar a partir de um negócio grava por neg_criar_contrato", () => {
    expect(escolherGravacaoDeContrato({ criarNoNegocioId: "neg-1" })).toBe("neg_criar_contrato");
  });
});

describe("parametrosNegCriarContrato", () => {
  it("leva o negócio e os 15 argumentos de rpc_create_client_contract, e mais nada (16 no total)", () => {
    const p = parametrosNegCriarContrato("neg-1", DADOS);
    expect(p).toEqual({ p_negocio_id: "neg-1", ...DADOS });
    expect(Object.keys(p)).toHaveLength(16);
  });

  it("não altera os parâmetros de entrada", () => {
    const antes = { ...DADOS };
    parametrosNegCriarContrato("neg-1", DADOS);
    expect(DADOS).toEqual(antes);
  });
});

const ganhoPorContrato = (extra: Partial<NegocioDoContrato> = {}): NegocioDoContrato => ({
  id: "n1", titulo: "Cozinha", fecho: "contrato", estado: "ganho", decisaoOrigemTipo: "contrato", decisaoOrigemId: "k1", ...extra,
});

describe("avisoDeSubstituicao: o que se diz antes de anular com substituto", () => {
  const base = { contratoId: "k1", vaiGerarSubstituto: true, podeEditarNegocio: true };

  it("contrato sem negócio (a Mudelar e tudo o que não é do fecho): nenhum aviso", () => {
    expect(avisoDeSubstituicao({ ...base, negocio: null })).toBeNull();
  });

  it("sem substituto não há aviso", () => {
    expect(avisoDeSubstituicao({ ...base, negocio: ganhoPorContrato(), vaiGerarSubstituto: false })).toBeNull();
  });

  it("o substituído era a origem do ganho: avisa que o negócio reabre até nova assinatura", () => {
    expect(avisoDeSubstituicao({ ...base, negocio: ganhoPorContrato() })).toBe("reabre");
  });

  it("ganho decidido por outro contrato, pela proposta ou à mão: não reabre, sem aviso", () => {
    expect(avisoDeSubstituicao({ ...base, negocio: ganhoPorContrato({ decisaoOrigemId: "outro" }) })).toBeNull();
    expect(avisoDeSubstituicao({ ...base, negocio: ganhoPorContrato({ decisaoOrigemTipo: "proposta", decisaoOrigemId: "k1" }) })).toBeNull();
    expect(avisoDeSubstituicao({ ...base, negocio: ganhoPorContrato({ decisaoOrigemTipo: null, decisaoOrigemId: null }) })).toBeNull();
  });

  it("negócio aberto: o substituto liga-se e não há nada a avisar", () => {
    expect(avisoDeSubstituicao({ ...base, negocio: ganhoPorContrato({ estado: "aberto", decisaoOrigemTipo: null, decisaoOrigemId: null }) })).toBeNull();
  });

  it("negócio perdido: o substituto não herda o negócio, e diz-se", () => {
    expect(avisoDeSubstituicao({ ...base, negocio: ganhoPorContrato({ estado: "perdido" }) })).toBe("perdido");
  });

  it("a leitura do negócio ainda não chegou: avisa que está a verificar e não deixa gerar o substituto às cegas", () => {
    expect(avisoDeSubstituicao({ ...base, negocio: null, leitura: "pendente" })).toBe("a_verificar");
    expect(substitutoSemVerificar("a_verificar")).toBe(true);
  });

  it("a leitura do negócio falhou: diz que não foi possível verificar e também trava o substituto", () => {
    expect(avisoDeSubstituicao({ ...base, negocio: null, leitura: "falhou" })).toBe("indisponivel");
    expect(substitutoSemVerificar("indisponivel")).toBe(true);
  });

  it("sem substituto a leitura pendente ou falhada não diz nada; com a leitura pronta segue o resultado de sempre", () => {
    expect(avisoDeSubstituicao({ ...base, vaiGerarSubstituto: false, negocio: null, leitura: "pendente" })).toBeNull();
    expect(avisoDeSubstituicao({ ...base, vaiGerarSubstituto: false, negocio: null, leitura: "falhou" })).toBeNull();
    expect(avisoDeSubstituicao({ ...base, negocio: ganhoPorContrato(), leitura: "pronta" })).toBe("reabre");
    expect(substitutoSemVerificar("reabre")).toBe(false);
    expect(substitutoSemVerificar(null)).toBe(false);
  });

  it("sem pessoas.edit o substituto não se liga, mesmo que fosse a origem do ganho", () => {
    expect(avisoDeSubstituicao({ ...base, podeEditarNegocio: false, negocio: ganhoPorContrato() })).toBe("sem_permissao");
    expect(avisoDeSubstituicao({ ...base, podeEditarNegocio: false, negocio: ganhoPorContrato({ estado: "aberto" }) })).toBe("sem_permissao");
  });
});

describe("substitutoBloqueado: cada botão pede a permissão do negócio e a do documento", () => {
  it("um contrato ligado a um negócio só gera substituto a quem tem pessoas.edit", () => {
    expect(substitutoBloqueado({ temNegocio: true, podeEditarNegocio: false })).toBe(true);
    expect(substitutoBloqueado({ temNegocio: true, podeEditarNegocio: true })).toBe(false);
  });

  it("um contrato sem negócio nunca é bloqueado (como hoje)", () => {
    expect(substitutoBloqueado({ temNegocio: false, podeEditarNegocio: false })).toBe(false);
  });
});

describe("lerNegocioDoContrato", () => {
  it("lê as colunas e aceita só texto", () => {
    expect(lerNegocioDoContrato({ id: "n1", titulo: "Cozinha", fecho: "contrato", estado: "ganho", decisao_origem_tipo: "contrato", decisao_origem_id: "k1" })).toEqual(ganhoPorContrato());
  });

  it("sem linha, sem id ou com lixo devolve null ou campos nulos, nunca rebenta", () => {
    expect(lerNegocioDoContrato(null)).toBeNull();
    expect(lerNegocioDoContrato(undefined)).toBeNull();
    expect(lerNegocioDoContrato({ titulo: "x" })).toBeNull();
    expect(lerNegocioDoContrato({ id: "n1", titulo: 5, fecho: {}, estado: [], decisao_origem_tipo: 1, decisao_origem_id: false })).toEqual({
      id: "n1", titulo: null, fecho: null, estado: null, decisaoOrigemTipo: null, decisaoOrigemId: null,
    });
  });
});
