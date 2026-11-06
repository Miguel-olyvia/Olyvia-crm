// O campo «Pessoa do RH»: que fichas se oferecem e quando se liga depois de gravar.
import { describe, expect, it, vi } from "vitest";
import { pessoaALigar, pessoasLigaveis, temVinculoNaOrganizacao, type EstadoPessoaRh } from "./pessoaRh";

const linhas = [
  { id: "p1", nome_completo: "Ana Silva", numero_interno: "007", email_trabalho: "ana@x.pt" },
  { id: "p2", nome_completo: "Bruno Costa", numero_interno: null, email_trabalho: "bruno@x.pt" },
  { id: "p3", nome_completo: "Carla Dias", numero_interno: null, email_trabalho: null },
];
const vinc = (organizacaoId: string, roleId = "r1") => ({ organizacaoId, roleId, ativo: true, ambitos: {} });
const estado = (parcial: Partial<EstadoPessoaRh> = {}): EstadoPessoaRh => ({
  podeLigar: true, organizacaoId: "org-a", pessoas: [], ligadaId: null, carregando: false, erro: null, ligar: vi.fn(), ...parcial,
});

describe("pessoasLigaveis", () => {
  it("tira as fichas com conta ativa de outro utilizador e mostra o número interno ou o e-mail", () => {
    const r = pessoasLigaveis(linhas, [{ pessoa_id: "p2", anew_user_id: "outro" }]);
    expect(r.pessoas).toEqual([
      { id: "p1", nome: "Ana Silva", detalhe: "007" },
      { id: "p3", nome: "Carla Dias", detalhe: null },
    ]);
    expect(r.ligadaId).toBeNull();
  });
  it("mantém e assinala a ficha já ligada a este utilizador", () => {
    const r = pessoasLigaveis(linhas, [{ pessoa_id: "p2", anew_user_id: "u1" }, { pessoa_id: "p3", anew_user_id: "outro" }], "u1");
    expect(r.pessoas.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(r.ligadaId).toBe("p2");
  });
});

describe("pessoaALigar", () => {
  it("liga a ficha escolhida com permissão e vínculo completo na organização ativa", () => {
    expect(pessoaALigar(estado(), "p1", [vinc("org-a")])).toBe("p1");
  });
  it("não liga sem permissão, sem escolha, se já estiver ligada ou sem vínculo na organização", () => {
    expect(pessoaALigar(undefined, "p1", [vinc("org-a")])).toBeNull();
    expect(pessoaALigar(estado({ podeLigar: false }), "p1", [vinc("org-a")])).toBeNull();
    expect(pessoaALigar(estado(), "", [vinc("org-a")])).toBeNull();
    expect(pessoaALigar(estado({ ligadaId: "p9" }), "p1", [vinc("org-a")])).toBeNull();
    expect(pessoaALigar(estado(), "p1", [vinc("org-b")])).toBeNull();
    expect(pessoaALigar(estado(), "p1", [vinc("org-a", "")])).toBeNull();
  });
  it("temVinculoNaOrganizacao exige organização e role", () => {
    expect(temVinculoNaOrganizacao([vinc("org-a")], "org-a")).toBe(true);
    expect(temVinculoNaOrganizacao([vinc("org-a")], null)).toBe(false);
  });
});
