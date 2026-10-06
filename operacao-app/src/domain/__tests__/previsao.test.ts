import { describe, expect, it } from "vitest";
import {
  GERAL,
  analisarOrcamento,
  calcularTarifas,
  capacidadeDaEquipa,
  obrasEmSimultaneo,
  ocupacao,
  ordenarFila,
  segundaFeira,
  simularFila,
  type ExpansaoOrcamento,
  type OrcamentoPrevisao,
  type PessoaPrevisao,
} from "../previsao";

const orc = (p: Partial<OrcamentoPrevisao> = {}): OrcamentoPrevisao => ({
  id: "q1",
  numero: "Q-1",
  titulo: "WC",
  estado: "aceite",
  cliente_id: "c1",
  data: "2026-09-01T10:00:00Z",
  aceite_em: "2026-09-01T10:00:00Z",
  comercial_id: null,
  comercial_nome: null,
  total: 1230,
  valor_sem_iva: 1000,
  custo_material: 300,
  mao_obra_orcada: 400,
  linhas: 2,
  contrato_id: null,
  contrato_numero: null,
  contrato_estado: null,
  contratado: false,
  ...p,
});

// Canalização 180 min (1 pessoa, fase 2) + revestimento 120 min (2 pessoas,
// fase 3, 24 h de espera) + uma linha sem modelo.
const exp = (id = "q1"): ExpansaoOrcamento => ({
  id,
  linhas: [
    {
      id: "l1", ordem: 0, descricao: "WC", qt: 4, unidade: "un", servico_id: "s1", servico_nome: "WC",
      cruzamento: "modelo",
      passos: [
        { fase: 2, nome: "Canalização", minutos: 180, pessoas: 1, skill_id: "can", espera_antes_horas: 0, origem: "padrao" },
        { fase: 3, nome: "Revestimento", minutos: 120, pessoas: 2, skill_id: "rev", espera_antes_horas: 24, origem: "padrao" },
      ],
    },
    {
      id: "l2", ordem: 1, descricao: "Extra", qt: 1, unidade: null, servico_id: "s2", servico_nome: "Extra",
      cruzamento: "sem_ficha",
      passos: [{ fase: 3, nome: "Extra", minutos: 60, pessoas: 1, skill_id: null, espera_antes_horas: 0, origem: "padrao" }],
    },
    { id: "l3", ordem: 2, descricao: "Torneira", qt: 1, unidade: null, servico_id: null, servico_nome: null, cruzamento: "sem_servico", passos: [] },
  ],
});

const pessoa = (p: Partial<PessoaPrevisao>): PessoaPrevisao => ({
  utilizador_id: "u", nome: "X", funcao: "tecnico", horas_dia: 8, custo_hora: 20, skills: [], ...p,
});
const EQUIPA = [
  pessoa({ utilizador_id: "a", skills: ["can"], custo_hora: 20 }),
  pessoa({ utilizador_id: "b", skills: ["rev", "can"], custo_hora: 24 }),
];

describe("analisarOrcamento", () => {
  const tarifas = calcularTarifas(EQUIPA, 22);
  const a = analisarOrcamento(orc(), exp(), tarifas);

  it("soma o trabalho (pessoa × minuto) por especialidade, com a maior equipa", () => {
    expect(a.minutos).toBe(360);
    expect(a.porSkill.get("can")).toEqual({ minutos: 180, pessoas: 1 });
    expect(a.porSkill.get("rev")).toEqual({ minutos: 120, pessoas: 2 });
    expect(a.porSkill.get(GERAL)).toEqual({ minutos: 60, pessoas: 1 });
  });

  it("duração: fases em série, especialidades em paralelo, espera em dias", () => {
    // fase 2: 180 min; fase 3: max(120/2, 60) = 60 → 240 min = 1 dia; + 1 dia de espera
    expect(a.dias).toBe(2);
  });

  it("custo de mão de obra pelas tarifas de quem tem a especialidade, e a margem", () => {
    // can: (20+24)/2 = 22 €/h × 3 h = 66; rev: 24 €/h × 2 h = 48; geral: média 22 × 1 h = 22
    expect(a.custoMaoObra).toBe(136);
    expect(a.margem).toBe(1000 - 300 - 136);
    expect(a.margemPercent).toBe(56.4);
  });

  it("conta as linhas cujo cruzamento falhou", () => {
    expect(a.linhasFalhadas).toBe(1);
    expect(a.linhasSemFicha).toBe(1);
  });

  it("sem custos visíveis não inventa margem", () => {
    const b = analisarOrcamento(orc({ custo_material: null }), exp(), tarifas);
    expect(b.margem).toBeNull();
  });
});

describe("capacidade e obras em simultâneo", () => {
  it("quem tem várias especialidades conta uma parte em cada", () => {
    const cap = capacidadeDaEquipa(EQUIPA);
    expect(cap.get("can")).toEqual({ minutosDia: 480 + 240, pessoas: 2 });
    expect(cap.get("rev")).toEqual({ minutosDia: 240, pessoas: 1 });
    expect(cap.get(GERAL)).toEqual({ minutosDia: 960, pessoas: 2 });
  });

  it("o gargalo é a especialidade que dá menos obras — aqui pelas pessoas", () => {
    const cap = capacidadeDaEquipa(EQUIPA);
    const a = analisarOrcamento(orc(), exp(), calcularTarifas(EQUIPA, 22));
    const s = obrasEmSimultaneo([a], cap);
    // revestimento pede 2 pessoas ao mesmo tempo e só há 1 com a especialidade
    expect(s.gargalo).toBe("rev");
    expect(s.obras).toBe(0);
  });

  it("com gente que chegue, conta pelo tempo", () => {
    const equipa = [
      pessoa({ utilizador_id: "a", skills: ["can"] }),
      pessoa({ utilizador_id: "d", skills: ["can"] }),
      pessoa({ utilizador_id: "b", skills: ["rev"] }),
      pessoa({ utilizador_id: "c", skills: ["rev"] }),
    ];
    const a = analisarOrcamento(orc(), exp(), calcularTarifas(equipa, 20));
    const s = obrasEmSimultaneo([a], capacidadeDaEquipa(equipa));
    // por dia (2 dias): can 90 min, rev 60, geral 30
    // can: 960/90 = 10 pelo tempo, 2 pessoas → 2; rev: 960/60 = 16 pelo tempo, mas 2 pessoas ÷ 2 por obra = 1
    expect(s.gargalo).toBe("rev");
    expect(s.obras).toBe(1);
    expect(s.porSkill.find((x) => x.skill === "can")?.obras).toBe(2);
    expect(s.porSkill.find((x) => x.skill === GERAL)?.obras).toBe(4);
  });
});

describe("a fila", () => {
  const dias = ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14"];
  const equipa = [pessoa({ utilizador_id: "a", skills: ["can"] })];
  const cap = capacidadeDaEquipa(equipa);
  const so = (id: string, min: number, aceite: string): ReturnType<typeof analisarOrcamento> =>
    analisarOrcamento(
      orc({ id, aceite_em: aceite }),
      { id, linhas: [{ id: "l", ordem: 0, descricao: "", qt: 1, unidade: null, servico_id: "s", servico_nome: null, cruzamento: "modelo",
        passos: [{ fase: 2, nome: "Can", minutos: min, pessoas: 1, skill_id: "can", espera_antes_horas: 0, origem: null }] }] },
      calcularTarifas(equipa, 20)
    );

  it("uma atrás da outra quando a especialidade está cheia", () => {
    const f = simularFila(ordenarFila([so("b", 960, "2026-09-02"), so("a", 960, "2026-09-01")], "data"), cap, dias);
    expect(f.lugares.map((l) => [l.id, l.inicio, l.fim])).toEqual([
      ["a", "2026-10-07", "2026-10-08"],
      ["b", "2026-10-09", "2026-10-12"],
    ]);
  });

  it("a carga das obras já planeadas empurra a fila", () => {
    const f = simularFila([so("a", 480, "x")], cap, dias, [{ skill_id: "can", dia: "2026-10-07", minutos: 480 }]);
    expect(f.lugares[0].inicio).toBe("2026-10-08");
  });

  it("sem ninguém com a especialidade: bloqueada, e diz qual", () => {
    const outra = { ...so("z", 60, "x") };
    outra.porSkill = new Map([["rev", { minutos: 60, pessoas: 1 }]]);
    const f = simularFila([outra], cap, dias, [], (k) => (k === "rev" ? "Revestimentos" : k));
    expect(f.lugares[0].bloqueio).toBe("Ninguém na equipa com Revestimentos.");
  });

  it("não cabe no horizonte", () => {
    const f = simularFila([so("a", 480 * 10, "x")], cap, dias);
    expect(f.lugares[0].bloqueio).toBe("Não cabe no horizonte da previsão.");
  });

  it("ocupação por semana", () => {
    const f = simularFila([so("a", 960, "x")], cap, dias);
    const o = ocupacao(f, cap, "semana");
    expect(o.periodos).toEqual(["2026-10-05", "2026-10-12"]);
    expect(o.porSkill.get("can")).toEqual([960 / (3 * 480), 0]);
  });

  it("segunda-feira da semana", () => {
    expect(segundaFeira("2026-10-11")).toBe("2026-10-05");
    expect(segundaFeira("2026-10-12")).toBe("2026-10-12");
  });
});
