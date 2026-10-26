// A origem da morada da obra (entidade, manual ou localizacao) segue em `morada_origem` quando o ecrã a conhece e há morada; a base exige que haja
// origem exatamente quando há morada (CHECK levantamentos_morada_coerente). Sem origem do ecrã (o exemplo) nada muda: a base deriva-a.
import { describe, expect, it } from "vitest";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { planoGravacao, type EntradaPlano, type LevantamentoLivre, type Passo } from "./planoGravacao";

const MORADA = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };
const VAZIO: RascunhoLevantamento = { linhas: [], observacoes: "", respostas: {} };

function entrada(sobre: Partial<EntradaPlano> = {}): EntradaPlano {
  return {
    organizationId: "org-1", pessoaId: "p1", nome: "Ana", visitas: [], base: new Map(), omissao: { boardId: "q", recursoId: "r" },
    tituloDoTipo: () => "", agora: Date.parse("2026-10-20T12:00:00Z"), hoje: "2026-10-20", comercial: "Bruno", negocioId: null,
    rascunho: VAZIO, levantamentoLivre: null, novoIdLevantamento: () => "lev-novo", ...sobre,
  };
}
type PassoLev = Extract<Passo, { tipo: "levantamento" }>;
function levantamento(e: EntradaPlano): PassoLev | undefined {
  const p = planoGravacao(e);
  if (!p.ok) throw new Error("recusado");
  return p.passos.find((x): x is PassoLev => x.tipo === "levantamento");
}

describe("morada_origem no passo do levantamento", () => {
  it.each(["entidade", "manual", "localizacao"] as const)("envia '%s' com a morada", (origem) => {
    const l = levantamento(entrada({ rascunho: { ...VAZIO, moradaObra: MORADA, moradaOrigem: origem } }));
    expect(l?.dados).toMatchObject({ morada_rua: "Rua A 1", morada_origem: origem });
  });

  it("sem morada não envia origem (a base recusaria uma origem sem morada)", () => {
    const l = levantamento(entrada({ rascunho: { ...VAZIO, observacoes: "x", moradaObra: { rua: "", codigoPostal: "", localidade: "", andar: "" }, moradaOrigem: "manual" } }));
    expect(l?.dados).not.toHaveProperty("morada_origem");
  });

  it("um código postal inválido sozinho não cria morada, logo nem origem", () => {
    const l = levantamento(entrada({ rascunho: { ...VAZIO, observacoes: "x", moradaObra: { rua: "", codigoPostal: "10", localidade: "", andar: "" }, moradaOrigem: "manual" } }));
    expect(l?.dados).not.toHaveProperty("morada_origem");
  });

  it("sem origem do ecrã (o exemplo) não envia nada e a base deriva-a", () => {
    const l = levantamento(entrada({ rascunho: { ...VAZIO, moradaObra: MORADA } }));
    expect(l?.dados).toMatchObject({ morada_rua: "Rua A 1" });
    expect(l?.dados).not.toHaveProperty("morada_origem");
  });

  it("uma morada copiada da entidade conta como escrita mesmo igual à de uma visita (não é herança)", () => {
    const l = levantamento(entrada({ rascunho: { ...VAZIO, moradaObra: MORADA, moradaOrigem: "entidade" } }));
    expect(l).toBeDefined();
  });

  it("mudar só a origem de uma morada igual regrava o levantamento; igual com a mesma origem não", () => {
    const livre: LevantamentoLivre = {
      id: "lev-1", rascunho: VAZIO, visitaId: null, data: "2026-10-19", estado: "por_fazer", morada: MORADA, moradaOrigem: "manual",
    };
    expect(levantamento(entrada({ levantamentoLivre: livre, rascunho: { ...VAZIO, moradaObra: MORADA, moradaOrigem: "manual" } }))).toBeUndefined();
    const l = levantamento(entrada({ levantamentoLivre: livre, rascunho: { ...VAZIO, moradaObra: MORADA, moradaOrigem: "localizacao" } }));
    expect(l?.dados).toMatchObject({ morada_origem: "localizacao" });
  });
});
