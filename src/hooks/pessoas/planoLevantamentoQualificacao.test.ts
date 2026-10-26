// O levantamento deixou de levar as respostas da Qualificação (grava-se no negócio): o plano ignora-as para decidir se há algo a gravar e não as envia.
import { describe, expect, it } from "vitest";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { planoGravacao, type EntradaPlano, type LevantamentoLivre, type Passo } from "./planoGravacao";

const QUALIFICACAO = new Set(["imovel", "orcCliente"]);
const VAZIO: RascunhoLevantamento = { linhas: [], observacoes: "", respostas: {} };

function entrada(sobre: Partial<EntradaPlano> = {}): EntradaPlano {
  return {
    organizationId: "org-1", pessoaId: "p1", nome: "Ana", visitas: [], base: new Map(), omissao: { boardId: "q", recursoId: "r" },
    tituloDoTipo: () => "", agora: Date.parse("2026-10-20T12:00:00Z"), hoje: "2026-10-20", comercial: "Bruno", negocioId: null,
    rascunho: VAZIO, levantamentoLivre: null, novoIdLevantamento: () => "lev-novo", chavesQualificacao: QUALIFICACAO, ...sobre,
  };
}
const passos = (e: EntradaPlano): Passo[] => {
  const p = planoGravacao(e);
  if (!p.ok) throw new Error("recusado");
  return p.passos;
};

describe("plano do levantamento e a Qualificação", () => {
  it("só respostas da Qualificação não criam um levantamento", () => {
    expect(passos(entrada({ rascunho: { ...VAZIO, respostas: { imovel: "moradia", orcCliente: "10" } } }))).toEqual([]);
  });

  it("com outras respostas, o passo leva só as da Visita", () => {
    const [l] = passos(entrada({ rascunho: { ...VAZIO, respostas: { acesso: "facil", imovel: "moradia" } } })) as Extract<Passo, { tipo: "levantamento" }>[];
    expect(l.respostas).toEqual({ acesso: "facil" });
  });

  it("mudar só a Qualificação de um levantamento já gravado não o volta a gravar", () => {
    const livre: LevantamentoLivre = {
      id: "lev-1", rascunho: { ...VAZIO, respostas: { acesso: "facil" } }, visitaId: null, data: "2026-10-19", estado: "por_fazer", morada: null,
    };
    const mudou = { ...VAZIO, respostas: { acesso: "facil", imovel: "moradia" } };
    expect(passos(entrada({ rascunho: mudou, levantamentoLivre: livre }))).toEqual([]);
  });

  it("sem chavesQualificacao o comportamento é o de antes (todas as respostas)", () => {
    const [l] = passos(entrada({ chavesQualificacao: undefined, rascunho: { ...VAZIO, respostas: { imovel: "moradia" } } })) as Extract<Passo, { tipo: "levantamento" }>[];
    expect(l.respostas).toEqual({ imovel: "moradia" });
  });
});
