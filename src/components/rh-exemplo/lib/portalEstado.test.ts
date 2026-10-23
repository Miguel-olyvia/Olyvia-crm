// O que o portal mostra, derivado da admissão: etiqueta da ficha, passos, secção por omissão, aviso do prazo e o contrato
// como documento por assinar. Só funções.
import { describe, expect, it } from "vitest";
import { criarAdmissao, type Admissao, type EstadoAdmissao } from "./admissaoFluxo";
import {
  ID_CONTRATO, contratoComoRecebido, etiquetaFicha, lerAbaDocumentos, lerSeccao, passosDaAdmissao, prazoEmAviso,
  recebidosVisiveis, seccaoPorOmissao, temPortal,
} from "./portalEstado";
import type { DocRecebido } from "./portalDocumentos";

const AGORA = new Date("2026-10-14T12:00:00Z");
const base = (): Admissao => criarAdmissao({ pessoaId: "p-1", roleId: null, email: "a@b.pt", token: "t" }, { agora: AGORA, quem: "RH" });
const comEstado = (estado: EstadoAdmissao, extra: Partial<Admissao> = {}): Admissao => ({ ...base(), estado, ...extra });

describe("a etiqueta da ficha de admissão", () => {
  it.each([
    ["convite_enviado", "a_preencher"], ["a_preencher", "a_preencher"], ["devolvida", "devolvida"], ["submetida", "submetida"],
    ["aprovada", "aprovada"], ["contrato_por_assinar", "aprovada"], ["contrato_assinado", "aprovada"], ["rejeitada", "rejeitada"],
  ] as const)("%s mostra «%s»", (estado, etiqueta) => {
    expect(etiquetaFicha(estado)).toBe(etiqueta);
  });
});

describe("os passos Ficha, Aprovação do RH, Contrato, Acesso", () => {
  const situacoes = (e: EstadoAdmissao) => passosDaAdmissao(e).map((p) => p.situacao);

  it("seguem o estado da admissão", () => {
    expect(passosDaAdmissao("a_preencher").map((p) => p.passo)).toEqual(["ficha", "aprovacao", "contrato", "acesso"]);
    expect(situacoes("a_preencher")).toEqual(["atual", "falta", "falta", "falta"]);
    expect(situacoes("devolvida")).toEqual(["atual", "falta", "falta", "falta"]);
    expect(situacoes("submetida")).toEqual(["feito", "atual", "falta", "falta"]);
    expect(situacoes("aprovada")).toEqual(["feito", "feito", "atual", "falta"]);
    expect(situacoes("contrato_por_assinar")).toEqual(["feito", "feito", "atual", "falta"]);
    expect(situacoes("contrato_assinado")).toEqual(["feito", "feito", "feito", "falta"]);
    expect(situacoes("acesso_enviado")).toEqual(["feito", "feito", "feito", "atual"]);
    expect(situacoes("acesso_ativo")).toEqual(["feito", "feito", "feito", "feito"]);
  });

  it("uma ficha rejeitada fica marcada como rejeitada na aprovação", () => {
    expect(situacoes("rejeitada")).toEqual(["feito", "rejeitado", "falta", "falta"]);
  });
});

describe("secção, aba e vistas com portal", () => {
  it("abre em Documentos só com o contrato por assinar; um valor inválido cai na secção por omissão", () => {
    expect(seccaoPorOmissao("contrato_por_assinar")).toBe("documentos");
    expect(seccaoPorOmissao("submetida")).toBe("ficha");
    expect(lerSeccao("documentos", "ficha")).toBe("documentos");
    expect(lerSeccao("ficha", "documentos")).toBe("ficha");
    expect(lerSeccao("xpto", seccaoPorOmissao("contrato_por_assinar"))).toBe("documentos");
    expect(lerSeccao(null, seccaoPorOmissao("devolvida"))).toBe("ficha");
  });

  it("a aba por omissão é «Recebidos»", () => {
    expect(lerAbaDocumentos("pedidos")).toBe("pedidos");
    expect(lerAbaDocumentos("meus")).toBe("meus");
    expect(lerAbaDocumentos("xpto")).toBe("recebidos");
    expect(lerAbaDocumentos(null)).toBe("recebidos");
  });

  it("só há portal enquanto o acesso serve", () => {
    for (const v of ["preencher", "submetida", "contrato", "assinado"] as const) expect(temPortal(v)).toBe(true);
    for (const v of ["invalida", "revogada", "encerrada", "expirada"] as const) expect(temPortal(v)).toBe(false);
  });
});

describe("o aviso do prazo do acesso temporário", () => {
  const comPrazo = (horas: number): Admissao => {
    const a = base();
    return { ...a, login: { ...a.login, expiraEm: new Date(AGORA.getTime() + horas * 3_600_000).toISOString() } };
  };

  it("avisa com menos de 2 dias (47 h) e não avisa a partir de 2 dias (48 h)", () => {
    expect(prazoEmAviso(comPrazo(47), AGORA)).toBe(true);
    expect(prazoEmAviso(comPrazo(48), AGORA)).toBe(false);
    expect(prazoEmAviso(comPrazo(5 * 24), AGORA)).toBe(false);
  });

  it("avisa nas últimas horas e não avisa quando já expirou (outro ecrã)", () => {
    expect(prazoEmAviso(comPrazo(3), AGORA)).toBe(true);
    expect(prazoEmAviso(comPrazo(-5), AGORA)).toBe(false);
  });
});

describe("o contrato como documento recebido", () => {
  const contrato = (assinado: boolean) => comEstado("contrato_por_assinar", {
    contrato: {
      modeloId: "mod-contrato", documentoId: "d1", titulo: "Contrato sem termo", linhas: ["Cláusula."], geradoEm: AGORA.toISOString(),
      recusa: null, assinadoEm: assinado ? AGORA.toISOString() : null, assinaturaNome: assinado ? "Ana" : null,
    },
  });

  it("sem contrato não há documento; com contrato vem à cabeça, por assinar", () => {
    expect(contratoComoRecebido(base())).toBeNull();
    const outro: DocRecebido = {
      id: "dr-1", titulo: "Regulamento", nomeFicheiro: "r.pdf", enviadoEm: AGORA.toISOString(), precisaAssinatura: false,
      assinadoEm: null, assinaturaNome: null, recusa: null, origemPedidoId: null,
    };
    const lista = recebidosVisiveis([outro], contrato(false));
    expect(lista.map((d) => d.id)).toEqual([ID_CONTRATO, "dr-1"]);
    expect(lista[0]).toMatchObject({ precisaAssinatura: true, assinadoEm: null, titulo: "Contrato sem termo" });
    expect(recebidosVisiveis([outro], null).map((d) => d.id)).toEqual(["dr-1"]);
  });

  it("assinado, o documento fica assinado com o nome de quem assinou", () => {
    expect(contratoComoRecebido(contrato(true))).toMatchObject({ assinaturaNome: "Ana" });
  });
});
