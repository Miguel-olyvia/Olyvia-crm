import { describe, expect, it } from "vitest";
import { adaptarRegistos } from "./adaptarRegistos";
import {
  PESSOA_ID, contactoDb, fichaDb, levantamentoDb, seccaoDb, visitaDb,
} from "./fichaFabrica";

describe("adaptarRegistos: contactos", () => {
  it("o instante passa a dia e hora de Lisboa e a nota nula a texto vazio", () => {
    const { contactos } = adaptarRegistos(fichaDb({ contactos: seccaoDb([contactoDb({ em: "2026-07-01T23:30:00Z", notas: null })]) }));
    expect(contactos).toEqual([{
      id: "c1", pessoaId: PESSOA_ID, data: "2026-07-02", hora: "00:30", resultado: "atendeuInteressado", nota: "", negocioId: null,
    }]);
  });

  it("um resultado que não é uma das 5 chaves mantém o contacto, sem resultado (os totais batem)", () => {
    const { contactos } = adaptarRegistos(fichaDb({
      contactos: seccaoDb([contactoDb({ id: "a", resultado: "naoAtendeu" }), contactoDb({ id: "b", resultado: "talvez" }), contactoDb({ id: "c", resultado: null })]),
    }));
    expect(contactos.map((c) => [c.id, c.resultado])).toEqual([["a", "naoAtendeu"], ["b", null], ["c", null]]);
  });

  it("guarda o negócio a que o contacto está ligado", () => {
    expect(adaptarRegistos(fichaDb({ contactos: seccaoDb([contactoDb({ negocio_id: "n9" })]) })).contactos[0].negocioId).toBe("n9");
  });
});

describe("adaptarRegistos: visitas", () => {
  const estadoDe = (status: string) => adaptarRegistos(fichaDb({ visitas: seccaoDb([visitaDb({ status })]) })).visitas[0].estado;

  it.each(["draft", "scheduled", "confirmed", "in_progress", "rescheduled"])("%s vale por fazer", (s) => {
    expect(estadoDe(s)).toBe("porFazer");
  });

  it("completed vale feita e um estado desconhecido nunca rebenta (por fazer)", () => {
    expect(estadoDe("completed")).toBe("feita");
    expect(estadoDe("inventado")).toBe("porFazer");
  });

  it("dia, hora, comercial e nota; sem morada própria usa o local como rua", () => {
    const [v] = adaptarRegistos(fichaDb({
      visitas: seccaoDb([visitaDb({ inicio: "2026-10-20T09:00:00Z", feito_por_nome: null, local: "Rua do Ouro 5", notas: "Tocar à campainha" })]),
    })).visitas;
    expect(v).toMatchObject({
      id: "v1", pessoaId: PESSOA_ID, data: "2026-10-20", hora: "10:00", feitoPor: "", nota: "Tocar à campainha", negocioId: null,
      morada: { rua: "Rua do Ouro 5", codigoPostal: "", localidade: "", andar: "" }, igualALead: null,
    });
  });

  it("a morada dos detalhes tem prioridade sobre o local, e leva o igual_a_lead e quem vai estar", () => {
    const [v] = adaptarRegistos(fichaDb({
      visitas: seccaoDb([visitaDb({
        local: "outro sítio",
        detalhes: { morada: { rua: "Rua B 2", codigo_postal: "2000-002", localidade: "Santarém", andar: "1.º" }, igual_a_lead: false, presentes: "casal" },
      })]),
    })).visitas;
    expect(v.morada).toEqual({ rua: "Rua B 2", codigoPostal: "2000-002", localidade: "Santarém", andar: "1.º" });
    expect(v).toMatchObject({ igualALead: false, quemVaiEstar: "casal" });
  });

  it("o tipo nulo ou desconhecido fica vazio; os conhecidos mantêm-se", () => {
    const tipo = (t: string | null) => adaptarRegistos(fichaDb({ visitas: seccaoDb([visitaDb({ tipo: t })]) })).visitas[0].tipo;
    expect(tipo(null)).toBe("");
    expect(tipo("desconhecido")).toBe("");
    expect(tipo("medicao")).toBe("medicao");
  });

  it("o resultado só passa se for um dos quatro conhecidos", () => {
    const resultado = (r: string | null) => adaptarRegistos(fichaDb({ visitas: seccaoDb([visitaDb({ resultado: r })]) })).visitas[0].resultado;
    expect(resultado("aPensar")).toBe("aPensar");
    expect(resultado("estranho")).toBeUndefined();
    expect(resultado(null)).toBeUndefined();
  });
});

describe("adaptarRegistos: levantamentos", () => {
  it("leva a data, quem fez, as linhas e o negócio; as respostas ficam para o P5", () => {
    const [l] = adaptarRegistos(fichaDb({
      levantamentos: seccaoDb([levantamentoDb({
        data: "2026-10-12", visita_id: "v1", negocio_id: "n1", notas: "Obs", n_linhas: 1, n_respostas: 3,
        linhas: [{ divisao: "cozinha", trabalho: "pintura", trabalho_outro: null, medida: "12.5", unidade: "m2", observacoes: null, ordem: 1 }],
      })]),
    })).levantamentos;
    expect(l).toMatchObject({ id: "l1", pessoaId: PESSOA_ID, visitaId: "v1", negocioId: "n1", data: "2026-10-12", feitoPor: "Rita Gomes" });
    expect(l.rascunho.observacoes).toBe("Obs");
    expect(l.rascunho.respostas).toEqual({});
    expect(l.rascunho.linhas).toHaveLength(1);
    expect(l.rascunho.linhas[0]).toMatchObject({ divisao: "cozinha", trabalho: "pintura", medida: "12.5", unidade: "m2" });
  });

  it("n_linhas conta mesmo sem as linhas (a ficha mostra quantas há)", () => {
    const [l] = adaptarRegistos(fichaDb({ levantamentos: seccaoDb([levantamentoDb({ n_linhas: 3, linhas: [] })]) })).levantamentos;
    expect(l.rascunho.linhas).toHaveLength(3);
  });

  it("uma data com hora passa a dia de Lisboa", () => {
    const [l] = adaptarRegistos(fichaDb({ levantamentos: seccaoDb([levantamentoDb({ data: "2026-07-01T23:30:00Z" })]) })).levantamentos;
    expect(l.data).toBe("2026-07-02");
  });
});

describe("adaptarRegistos: ordem e secções em falta", () => {
  it("mantém a ordem da base (estável) e não muda a ficha", () => {
    const ficha = fichaDb({ contactos: seccaoDb([contactoDb({ id: "x" }), contactoDb({ id: "y" }), contactoDb({ id: "z" })]) });
    const antes = JSON.stringify(ficha);
    expect(adaptarRegistos(ficha).contactos.map((c) => c.id)).toEqual(["x", "y", "z"]);
    expect(JSON.stringify(ficha)).toBe(antes);
  });

  it("secções nulas (leitura parcial) dão listas vazias", () => {
    expect(adaptarRegistos(fichaDb({ contactos: null, visitas: null, levantamentos: null }))).toEqual({ contactos: [], visitas: [], levantamentos: [] });
  });
});
