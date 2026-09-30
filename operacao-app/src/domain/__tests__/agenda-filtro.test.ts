import { describe, expect, it } from "vitest";
import {
  FILTRO_VAZIO,
  equipaVisivel,
  filtrarOrdens,
  quantosFiltros,
  temFiltro,
  type OrdemNaAgenda,
} from "../agenda";

const o = (p: Partial<OrdemNaAgenda> & { id: string }): OrdemNaAgenda => ({
  codigo: "OT-1",
  titulo: "Visita",
  estado: "agendada",
  origem: "preventiva",
  prioridade: "normal",
  responsavel_id: null,
  local_id: null,
  cliente_id: null,
  tipo_trabalho_id: null,
  fornecedor_id: null,
  agendada_para: null,
  janela_inicio: null,
  janela_fim: null,
  ...p,
});

const ORDENS = [
  o({ id: "1", cliente_id: "cA", responsavel_id: "p1", tipo_trabalho_id: "tRotina" }),
  o({ id: "2", cliente_id: "cB", responsavel_id: "p2", tipo_trabalho_id: "tObra" }),
  o({ id: "3", cliente_id: "cA", responsavel_id: "p2", tipo_trabalho_id: "tObra" }),
  o({ id: "4", cliente_id: "cA", responsavel_id: null, fornecedor_id: "f1" }),
];

/** p1 é eletricista; p2 não é nada. */
const QUEM_TEM = new Map([["eletricista", ["p1"]]]);

describe("o filtro vazio", () => {
  it("deixa passar tudo — vazio é 'todos', não 'nenhum'", () => {
    expect(filtrarOrdens(ORDENS, FILTRO_VAZIO).length).toBe(4);
    expect(temFiltro(FILTRO_VAZIO)).toBe(false);
    expect(quantosFiltros(FILTRO_VAZIO)).toBe(0);
  });

  it("um campo a null ou a vazio também não filtra", () => {
    expect(filtrarOrdens(ORDENS, { clienteId: null }).length).toBe(4);
    expect(filtrarOrdens(ORDENS, { clienteId: "" }).length).toBe(4);
    expect(temFiltro({ clienteId: "" })).toBe(false);
  });
});

describe("filtrar por cada dimensão", () => {
  it("por cliente", () => {
    expect(filtrarOrdens(ORDENS, { clienteId: "cA" }).map((x) => x.id)).toEqual(["1", "3", "4"]);
  });

  it("por tipo de trabalho", () => {
    expect(filtrarOrdens(ORDENS, { tipoTrabalhoId: "tObra" }).map((x) => x.id)).toEqual(["2", "3"]);
  });

  it("por responsável", () => {
    expect(filtrarOrdens(ORDENS, { responsavelId: "p2" }).map((x) => x.id)).toEqual(["2", "3"]);
  });

  it("por fornecedor", () => {
    expect(filtrarOrdens(ORDENS, { fornecedorId: "f1" }).map((x) => x.id)).toEqual(["4"]);
  });

  it("por especialidade, que é de quem faz e não da ordem", () => {
    const r = filtrarOrdens(ORDENS, { especialidadeId: "eletricista" }, QUEM_TEM);
    expect(r.map((x) => x.id)).toEqual(["1"]);
  });
});

describe("os filtros somam-se", () => {
  it("cliente e tipo ao mesmo tempo", () => {
    const r = filtrarOrdens(ORDENS, { clienteId: "cA", tipoTrabalhoId: "tObra" });
    expect(r.map((x) => x.id)).toEqual(["3"]);
    expect(quantosFiltros({ clienteId: "cA", tipoTrabalhoId: "tObra" })).toBe(2);
  });

  it("uma combinação sem nada devolve nada, e não tudo", () => {
    expect(filtrarOrdens(ORDENS, { clienteId: "cB", tipoTrabalhoId: "tRotina" }).length).toBe(0);
  });
});

describe("as ordens sem dono e a especialidade", () => {
  it("uma ordem por atribuir nunca passa um filtro de especialidade", () => {
    // Não se sabe de quem é. Dizer que passa seria adivinhar.
    const r = filtrarOrdens(ORDENS, { especialidadeId: "eletricista" }, QUEM_TEM);
    expect(r.some((x) => x.responsavel_id === null)).toBe(false);
  });

  it("sem o mapa de quem tem o quê, não passa ninguém", () => {
    expect(filtrarOrdens(ORDENS, { especialidadeId: "eletricista" }).length).toBe(0);
  });
});

describe("quem aparece na grelha", () => {
  const EQUIPA = [
    { utilizador_id: "p1", nome: "Ana" },
    { utilizador_id: "p2", nome: "Bruno" },
    { utilizador_id: "p3", nome: "Carla" },
  ];

  it("sem filtro, aparecem todos — uma pessoa livre é informação", () => {
    expect(equipaVisivel(EQUIPA, ORDENS, FILTRO_VAZIO).length).toBe(3);
  });

  it("com filtro, só quem tem trabalho que sobreviveu", () => {
    const ordens = filtrarOrdens(ORDENS, { tipoTrabalhoId: "tObra" });
    expect(equipaVisivel(EQUIPA, ordens, { tipoTrabalhoId: "tObra" }).map((p) => p.nome)).toEqual([
      "Bruno",
    ]);
  });

  it("mas com especialidade, quem a tem aparece mesmo sem trabalho", () => {
    // É precisamente a pergunta "quem está livre e sabe fazer isto?".
    const vazio: OrdemNaAgenda[] = [];
    const r = equipaVisivel(EQUIPA, vazio, { especialidadeId: "eletricista" }, QUEM_TEM);
    expect(r.map((p) => p.nome)).toEqual(["Ana"]);
  });
});
