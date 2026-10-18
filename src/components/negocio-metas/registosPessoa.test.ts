// Os registos da pessoa (contacto, visita, levantamento): o store de módulo, ligar a um só negócio e desfazer a ligação.
import { afterEach, describe, expect, it } from "vitest";
import { MORADA_VAZIA } from "./moradaObra";
import {
  desligarDoNegocio, ligarAoNegocio, ligarRegistos, podeLigar, registosDaPessoa, registosDoNegocio, registosPorLigar,
} from "./acoesRegistos";
import {
  desligarRegisto, iniciarRegistos, ligarRegisto, registarContacto, registarLevantamento, registarVisita, registosAtuais, repor,
} from "./registosPessoa";
import { REGISTOS_VAZIOS, type EstadoRegistos } from "./registosTipos";

afterEach(repor);

const visitaDados = {
  data: "2026-10-15", hora: "10:00", feitoPor: "Ana", estado: "feita" as const, tipo: "levantamento" as const, quemVaiEstar: "", duracao: "",
  morada: MORADA_VAZIA, igualALead: true, nota: "",
};
const rascunho = { linhas: [], observacoes: "", respostas: {} };

function comTres(): EstadoRegistos {
  repor();
  registarContacto({ pessoaId: "p1", data: "2026-10-10", resultado: "atendeuInteressado", nota: "" });
  registarVisita({ pessoaId: "p1", ...visitaDados });
  registarLevantamento({ pessoaId: "p1", visitaId: null, data: "2026-10-15", feitoPor: "Ana", rascunho });
  return registosAtuais();
}

describe("o store de registos", () => {
  it("começa vazio e repor() esquece tudo e recomeça a numeração", () => {
    expect(registosAtuais()).toEqual(REGISTOS_VAZIOS);
    const a = registarContacto({ pessoaId: "p1", data: "2026-10-10", resultado: "naoAtendeu", nota: "" });
    repor();
    expect(registosAtuais()).toEqual(REGISTOS_VAZIOS);
    expect(registarContacto({ pessoaId: "p1", data: "2026-10-10", resultado: "naoAtendeu", nota: "" }).id).toBe(a.id);
  });

  it("um registo novo nasce por ligar e com um id próprio do tipo", () => {
    const c = registarContacto({ pessoaId: "p1", data: "2026-10-10", hora: "09:30", resultado: "atendeuInteressado", nota: "ok" });
    const v = registarVisita({ pessoaId: "p1", ...visitaDados });
    const l = registarLevantamento({ pessoaId: "p1", visitaId: v.id, data: "2026-10-15", feitoPor: "Ana", rascunho });
    expect([c.negocioId, v.negocioId, l.negocioId]).toEqual([null, null, null]);
    expect(new Set([c.id, v.id, l.id]).size).toBe(3);
    expect(registosAtuais().contactos).toEqual([c]);
    expect(registosAtuais().levantamentos[0].visitaId).toBe(v.id);
  });

  it("dois registos seguidos nunca partilham o id", () => {
    const a = registarContacto({ pessoaId: "p1", data: "2026-10-10", resultado: "naoAtendeu", nota: "" });
    const b = registarContacto({ pessoaId: "p1", data: "2026-10-11", resultado: "naoAtendeu", nota: "" });
    expect(a.id).not.toBe(b.id);
  });

  it("iniciarRegistos só semeia uma vez e a numeração segue depois do maior id da semente", () => {
    const semente: EstadoRegistos = {
      ...REGISTOS_VAZIOS,
      contactos: [{ id: "rc-7", pessoaId: "p9", data: "2026-10-01", resultado: "naoAtendeu", nota: "", negocioId: null }],
    };
    iniciarRegistos(semente);
    iniciarRegistos(REGISTOS_VAZIOS);
    expect(registosAtuais().contactos).toHaveLength(1);
    expect(registarContacto({ pessoaId: "p9", data: "2026-10-02", resultado: "naoAtendeu", nota: "" }).id).toBe("rc-8");
  });

  it("ligarRegisto e desligarRegisto mudam o store e dizem se fizeram alguma coisa", () => {
    const c = registarContacto({ pessoaId: "p1", data: "2026-10-10", resultado: "atendeuInteressado", nota: "" });
    expect(ligarRegisto({ tipo: "contacto", id: c.id }, "n1")).toBe(true);
    expect(registosAtuais().contactos[0].negocioId).toBe("n1");
    expect(ligarRegisto({ tipo: "contacto", id: c.id }, "n2")).toBe(false);
    expect(registosAtuais().contactos[0].negocioId).toBe("n1");
    expect(desligarRegisto({ tipo: "contacto", id: c.id }, "n1", true)).toBe(true);
    expect(registosAtuais().contactos[0].negocioId).toBeNull();
  });
});

describe("ligarAoNegocio: um registo liga-se a um só negócio", () => {
  it("liga um registo por ligar e não mexe nos outros", () => {
    const e = comTres();
    const r = ligarAoNegocio(e, { tipo: "visita", id: e.visitas[0].id }, "n1");
    expect(r.visitas[0].negocioId).toBe("n1");
    expect(r.contactos).toBe(e.contactos);
    expect(r.levantamentos).toBe(e.levantamentos);
    expect(e.visitas[0].negocioId).toBeNull();
  });

  it("recusa um registo já ligado a OUTRO negócio (devolve o mesmo estado)", () => {
    const e = ligarAoNegocio(comTres(), { tipo: "contacto", id: "rc-1" }, "n1");
    const r = ligarAoNegocio(e, { tipo: "contacto", id: "rc-1" }, "n2");
    expect(r).toBe(e);
    expect(r.contactos[0].negocioId).toBe("n1");
  });

  it("ligar outra vez ao mesmo negócio não muda nada", () => {
    const e = ligarAoNegocio(comTres(), { tipo: "contacto", id: "rc-1" }, "n1");
    expect(ligarAoNegocio(e, { tipo: "contacto", id: "rc-1" }, "n1")).toBe(e);
  });

  it("um registo que não existe, ou um negócio vazio, devolvem o mesmo estado", () => {
    const e = comTres();
    expect(ligarAoNegocio(e, { tipo: "visita", id: "nao-existe" }, "n1")).toBe(e);
    expect(ligarAoNegocio(e, { tipo: "contacto", id: e.contactos[0].id }, "")).toBe(e);
  });

  it("o mesmo id em tipos diferentes não se confunde", () => {
    const e: EstadoRegistos = {
      contactos: [{ id: "x", pessoaId: "p", data: "2026-10-01", resultado: "naoAtendeu", nota: "", negocioId: null }],
      visitas: [{ ...visitaDados, id: "x", pessoaId: "p", negocioId: null }], levantamentos: [],
    };
    const r = ligarAoNegocio(e, { tipo: "visita", id: "x" }, "n1");
    expect(r.visitas[0].negocioId).toBe("n1");
    expect(r.contactos[0].negocioId).toBeNull();
  });

  it("podeLigar diz o mesmo que ligarAoNegocio", () => {
    const e = ligarAoNegocio(comTres(), { tipo: "contacto", id: "rc-1" }, "n1");
    expect(podeLigar(e, { tipo: "contacto", id: "rc-1" }, "n1")).toBe(true);
    expect(podeLigar(e, { tipo: "contacto", id: "rc-1" }, "n2")).toBe(false);
    expect(podeLigar(e, { tipo: "visita", id: "nada" }, "n2")).toBe(false);
  });

  it("ligarRegistos liga os livres e devolve os recusados, sem partir a lista", () => {
    const e0 = ligarAoNegocio(comTres(), { tipo: "contacto", id: "rc-1" }, "n9");
    const refs = [{ tipo: "contacto", id: "rc-1" }, { tipo: "visita", id: e0.visitas[0].id }, { tipo: "levantamento", id: "nada" }] as const;
    const { estado, recusados } = ligarRegistos(e0, refs, "n1");
    expect(recusados).toEqual([refs[0], refs[2]]);
    expect(estado.visitas[0].negocioId).toBe("n1");
    expect(estado.contactos[0].negocioId).toBe("n9");
  });
});

describe("desligarDoNegocio: só enquanto o negócio está aberto", () => {
  it("desfaz a ligação de um registo ligado a esse negócio", () => {
    const e = ligarAoNegocio(comTres(), { tipo: "contacto", id: "rc-1" }, "n1");
    expect(desligarDoNegocio(e, { tipo: "contacto", id: "rc-1" }, "n1", true).contactos[0].negocioId).toBeNull();
  });

  it("recusa com o negócio já fechado (ganho ou perdido)", () => {
    const e = ligarAoNegocio(comTres(), { tipo: "contacto", id: "rc-1" }, "n1");
    expect(desligarDoNegocio(e, { tipo: "contacto", id: "rc-1" }, "n1", false)).toBe(e);
  });

  it("recusa desligar de um negócio a que o registo não pertence", () => {
    const e = ligarAoNegocio(comTres(), { tipo: "contacto", id: "rc-1" }, "n1");
    expect(desligarDoNegocio(e, { tipo: "contacto", id: "rc-1" }, "n2", true)).toBe(e);
    const solto = comTres();
    expect(desligarDoNegocio(solto, { tipo: "contacto", id: "rc-1" }, "n1", true)).toBe(solto);
  });

  it("depois de desligado o registo pode ligar-se a outro negócio", () => {
    const e = ligarAoNegocio(comTres(), { tipo: "contacto", id: "rc-1" }, "n1");
    const solto = desligarDoNegocio(e, { tipo: "contacto", id: "rc-1" }, "n1", true);
    expect(ligarAoNegocio(solto, { tipo: "contacto", id: "rc-1" }, "n2").contactos[0].negocioId).toBe("n2");
  });
});

describe("leituras por pessoa e por negócio", () => {
  it("registosDaPessoa só devolve os da pessoa; registosPorLigar só os sem negócio", () => {
    let e = comTres();
    e = { ...e, contactos: [...e.contactos, { id: "rc-9", pessoaId: "p2", data: "2026-10-01", resultado: "naoAtendeu", nota: "", negocioId: null }] };
    expect(registosDaPessoa(e, "p1").contactos).toHaveLength(1);
    expect(registosDaPessoa(e, "p2").visitas).toHaveLength(0);
    const e2 = ligarAoNegocio(e, { tipo: "visita", id: e.visitas[0].id }, "n1");
    expect(registosPorLigar(e2, "p1").visitas).toHaveLength(0);
    expect(registosPorLigar(e2, "p1").contactos).toHaveLength(1);
    expect(registosDoNegocio(e2, "n1").visitas).toHaveLength(1);
    expect(registosDoNegocio(e2, "n1").contactos).toHaveLength(0);
    expect(registosDaPessoa(REGISTOS_VAZIOS, "ninguem")).toEqual(REGISTOS_VAZIOS);
  });
});
