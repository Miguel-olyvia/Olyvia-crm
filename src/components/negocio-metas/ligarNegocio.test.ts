// Criar um negócio à mão e LIGAR registos existentes da pessoa (contactos e visitas, e o levantamento: usar um que já existe, fazer um novo,
// ou dispensar). Nada se copia: um registo liga-se a um só negócio. Lógica pura.
import { describe, expect, it } from "vitest";
import { MORADA_VAZIA } from "./moradaObra";
import {
  decisaoDaEscolha, escolhaInicial, ligarRegistosDaPessoa, refsDaLigacao, type LigarRegistos,
} from "./ligarNegocio";
import type { EstadoRegistos } from "./registosTipos";

const visita = (id: string, pessoaId: string, negocioId: string | null = null) => ({
  id, pessoaId, negocioId, data: "2026-10-10", hora: "", feitoPor: "Ana", estado: "feita" as const, tipo: "levantamento" as const, quemVaiEstar: "",
  duracao: "", morada: MORADA_VAZIA, igualALead: true, nota: "",
});
const contacto = (id: string, pessoaId: string, negocioId: string | null = null) => ({
  id, pessoaId, data: "2026-10-09", resultado: "atendeuInteressado" as const, nota: "", negocioId,
});
const levantamento = (id: string, pessoaId: string, data: string, negocioId: string | null = null) => ({
  id, pessoaId, visitaId: null, data, feitoPor: "Ana", rascunho: { linhas: [], observacoes: "", respostas: {} }, negocioId,
});
const ESTADO: EstadoRegistos = {
  contactos: [contacto("rc-1", "p1"), contacto("rc-2", "p1", "n9"), contacto("rc-3", "p2")],
  visitas: [visita("rv-1", "p1"), visita("rv-2", "p2")],
  levantamentos: [levantamento("rl-1", "p1", "2026-10-01"), levantamento("rl-2", "p1", "2026-10-11"), levantamento("rl-3", "p1", "2026-10-12", "n9")],
};

describe("decisaoDaEscolha", () => {
  it("usar um existente e fazer um novo ficam «ligado»; dispensar fica «dispensado»", () => {
    expect(decisaoDaEscolha({ tipo: "existente", id: "rl-1" })).toBe("ligado");
    expect(decisaoDaEscolha({ tipo: "novo" })).toBe("ligado");
    expect(decisaoDaEscolha({ tipo: "dispensar" })).toBe("dispensado");
  });
});

describe("escolhaInicial", () => {
  it("marca os contactos e as visitas por ligar da pessoa e propõe o levantamento mais recente por ligar", () => {
    const { marcados, levantamento: l } = escolhaInicial({ contactos: [contacto("rc-1", "p1")], visitas: [visita("rv-1", "p1")], levantamentos: [levantamento("rl-1", "p1", "2026-10-01"), levantamento("rl-2", "p1", "2026-10-11")] });
    expect(marcados).toEqual([{ tipo: "contacto", id: "rc-1" }, { tipo: "visita", id: "rv-1" }]);
    expect(l).toEqual({ tipo: "existente", id: "rl-2" });
  });

  it("uma visita cancelada não se marca para ligar", () => {
    const cancelada = { ...visita("rv-c", "p1"), estado: "cancelada" as const };
    const { marcados } = escolhaInicial({ contactos: [], visitas: [visita("rv-1", "p1"), cancelada], levantamentos: [] });
    expect(marcados).toEqual([{ tipo: "visita", id: "rv-1" }]);
  });

  it("sem levantamento por ligar propõe fazer um novo; sem nada por ligar não marca nada", () => {
    expect(escolhaInicial({ contactos: [], visitas: [], levantamentos: [] })).toEqual({ marcados: [], levantamento: { tipo: "novo" } });
  });
});

describe("refsDaLigacao", () => {
  it("junta os registos marcados e, se se usa um levantamento existente, esse também", () => {
    const l: LigarRegistos = { registos: [{ tipo: "contacto", id: "rc-1" }], levantamento: { tipo: "existente", id: "rl-1" } };
    expect(refsDaLigacao(l)).toEqual([{ tipo: "contacto", id: "rc-1" }, { tipo: "levantamento", id: "rl-1" }]);
    expect(refsDaLigacao({ registos: l.registos, levantamento: { tipo: "novo" } })).toEqual(l.registos);
    expect(refsDaLigacao({ registos: l.registos, levantamento: { tipo: "dispensar" } })).toEqual(l.registos);
  });
});

describe("ligarRegistosDaPessoa", () => {
  const ligar = (l: LigarRegistos, pessoaId = "p1") => ligarRegistosDaPessoa(ESTADO, "n1", pessoaId, l);

  it("liga ao negócio os registos marcados e o levantamento escolhido, e mais nada", () => {
    const { estado, recusados } = ligar({ registos: [{ tipo: "contacto", id: "rc-1" }, { tipo: "visita", id: "rv-1" }], levantamento: { tipo: "existente", id: "rl-1" } });
    expect(recusados).toEqual([]);
    expect(estado.contactos.filter((c) => c.negocioId === "n1").map((c) => c.id)).toEqual(["rc-1"]);
    expect(estado.visitas.filter((v) => v.negocioId === "n1").map((v) => v.id)).toEqual(["rv-1"]);
    expect(estado.levantamentos.filter((l) => l.negocioId === "n1").map((l) => l.id)).toEqual(["rl-1"]);
    // Os não marcados ficam por ligar.
    expect(estado.levantamentos.find((l) => l.id === "rl-2")?.negocioId).toBeNull();
  });

  it("nada se copia: os registos são os mesmos, só ganham o negocioId", () => {
    const { estado } = ligar({ registos: [{ tipo: "visita", id: "rv-1" }], levantamento: { tipo: "dispensar" } });
    expect(estado.visitas).toHaveLength(ESTADO.visitas.length);
    expect(estado.visitas.find((v) => v.id === "rv-1")).toEqual({ ...ESTADO.visitas[0], negocioId: "n1" });
  });

  it("um registo já ligado a outro negócio é recusado e fica como estava", () => {
    const { estado, recusados } = ligar({ registos: [{ tipo: "contacto", id: "rc-2" }], levantamento: { tipo: "existente", id: "rl-3" } });
    expect(recusados).toEqual([{ tipo: "contacto", id: "rc-2" }, { tipo: "levantamento", id: "rl-3" }]);
    expect(estado.contactos.find((c) => c.id === "rc-2")?.negocioId).toBe("n9");
    expect(estado.levantamentos.find((l) => l.id === "rl-3")?.negocioId).toBe("n9");
  });

  it("um registo de outra pessoa é recusado (só se ligam registos da pessoa do negócio)", () => {
    const { estado, recusados } = ligar({ registos: [{ tipo: "contacto", id: "rc-3" }, { tipo: "visita", id: "rv-2" }], levantamento: { tipo: "novo" } });
    expect(recusados).toEqual([{ tipo: "contacto", id: "rc-3" }, { tipo: "visita", id: "rv-2" }]);
    expect(estado).toBe(ESTADO);
  });

  it("um id que não existe é recusado; ligar duas vezes o mesmo registo ao mesmo negócio não faz mal", () => {
    const { recusados } = ligar({ registos: [{ tipo: "visita", id: "rv-99" }], levantamento: { tipo: "novo" } });
    expect(recusados).toEqual([{ tipo: "visita", id: "rv-99" }]);
    const uma = ligar({ registos: [{ tipo: "visita", id: "rv-1" }], levantamento: { tipo: "novo" } });
    const duas = ligarRegistosDaPessoa(uma.estado, "n1", "p1", { registos: [{ tipo: "visita", id: "rv-1" }], levantamento: { tipo: "novo" } });
    expect(duas.recusados).toEqual([]);
    expect(duas.estado.visitas.filter((v) => v.negocioId === "n1")).toHaveLength(1);
  });

  it("não altera o estado de entrada", () => {
    const copia = JSON.stringify(ESTADO);
    ligar({ registos: [{ tipo: "contacto", id: "rc-1" }], levantamento: { tipo: "existente", id: "rl-1" } });
    expect(JSON.stringify(ESTADO)).toBe(copia);
  });
});
