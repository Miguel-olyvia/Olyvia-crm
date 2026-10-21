// O levantamento livre da ficha: o mais recente (por data) que não está ligado a nenhum negócio. É o que o painel «Visita e levantamento» edita; um
// ligado a um negócio nunca se altera. A mesma escolha serve o painel (valores iniciais e respostas gravadas) e a gravação.
import { describe, expect, it } from "vitest";
import { fichaDb, levantamentoDb, seccaoDb } from "./fichaFabrica";
import { levantamentoLivreDaFicha } from "./livreDaFicha";

describe("levantamentoLivreDaFicha", () => {
  it("sem levantamentos (ou sem a secção) não há livre", () => {
    expect(levantamentoLivreDaFicha(fichaDb())).toBeNull();
    expect(levantamentoLivreDaFicha(fichaDb({ levantamentos: null }))).toBeNull();
  });

  it("só ligados a um negócio: não há livre (o painel abre vazio e grava um novo)", () => {
    expect(levantamentoLivreDaFicha(fichaDb({ levantamentos: seccaoDb([levantamentoDb({ id: "l1", negocio_id: "n1" })]) }))).toBeNull();
  });

  it("escolhe o livre mais recente por data, ignorando os ligados mesmo que sejam mais recentes", () => {
    const ficha = fichaDb({ levantamentos: seccaoDb([
      levantamentoDb({ id: "ligado", data: "2026-10-20", negocio_id: "n1" }),
      levantamentoDb({ id: "velho", data: "2026-09-01" }),
      levantamentoDb({ id: "novo", data: "2026-10-12" }),
    ]) });
    expect(levantamentoLivreDaFicha(ficha)?.id).toBe("novo");
  });

  it("traz o que a gravação precisa de conservar: a visita, a data, o estado e a morada da obra", () => {
    const ficha = fichaDb({ levantamentos: seccaoDb([levantamentoDb({
      id: "l1", visita_id: "v1", data: "2026-10-12", estado: "feito", notas: "obs",
      morada: { rua: "Rua B 2", codigo_postal: "2000-002", localidade: null, andar: null },
    })]) });
    expect(levantamentoLivreDaFicha(ficha)).toMatchObject({
      id: "l1", visitaId: "v1", data: "2026-10-12", estado: "feito", morada: { rua: "Rua B 2", codigoPostal: "2000-002", localidade: "", andar: "" },
      rascunho: { observacoes: "obs", linhas: [], respostas: {} },
    });
  });

  it("sem morada gravada, a morada é nula", () => {
    expect(levantamentoLivreDaFicha(fichaDb({ levantamentos: seccaoDb([levantamentoDb()]) }))?.morada).toBeNull();
  });
});

describe("levantamentoLivreDaFicha: o comercial que fez", () => {
  it("traz o id (feito_por_id) para a gravação saber se mudou", () => {
    const ficha = fichaDb({ levantamentos: seccaoDb([levantamentoDb({ id: "l1", feito_por_id: "u-carla" })]) });
    expect(levantamentoLivreDaFicha(ficha)?.feitoPorId).toBe("u-carla");
  });

  it("sem comercial gravado o id é nulo", () => {
    const ficha = fichaDb({ levantamentos: seccaoDb([levantamentoDb({ id: "l1", feito_por_id: null })]) });
    expect(levantamentoLivreDaFicha(ficha)?.feitoPorId).toBeNull();
  });
});
