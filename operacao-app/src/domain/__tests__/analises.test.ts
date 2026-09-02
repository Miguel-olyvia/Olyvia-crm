import { describe, expect, it } from "vitest";
import {
  agruparPmp,
  ativoProblematico,
  estadoPmp,
  paraOndeVai,
  resumoAtivo,
  resumoPmp,
  seriesDeLeituras,
  type Intervencao,
  type Leitura,
  type LinhaPmp,
} from "../analises";

const pmp = (p: Partial<LinhaPmp> = {}): LinhaPmp => ({
  ordem_id: "o1",
  cliente_id: "c1",
  codigo: "OT-1",
  titulo: "Preventiva",
  estado: "fechada",
  agendada_para: "2026-03-10T09:00:00Z",
  fechada_em: "2026-03-10T15:00:00Z",
  mes: "2026-03-01",
  cumprida: true,
  a_horas: true,
  em_atraso: false,
  ...p,
});

describe("o PMP, que é o número do contrato", () => {
  it("conta o que foi feito sobre o que estava prometido", () => {
    const r = resumoPmp([pmp(), pmp(), pmp({ cumprida: false, a_horas: false })]);
    expect(r.previstas).toBe(3);
    expect(r.cumpridas).toBe(2);
    expect(r.percentagem).toBe(67);
  });

  it("separa o que foi feito do que foi feito a horas", () => {
    const r = resumoPmp([pmp(), pmp({ a_horas: false })]);
    expect(r.percentagem).toBe(100);
    expect(r.percentagemAHoras).toBe(50);
  });

  it("sem manutenção planeada dá 0 %, não 100 %", () => {
    // Um cliente sem plano não tem manutenção cumprida — tem um plano por
    // montar, e 100 % esconderia exatamente isso.
    expect(resumoPmp([]).percentagem).toBe(0);
  });

  it("conta o que está em atraso, que é o que se pode ainda salvar", () => {
    const r = resumoPmp([pmp({ cumprida: false, a_horas: false, em_atraso: true }), pmp()]);
    expect(r.emAtraso).toBe(1);
    expect(r.porFazer).toBe(1);
  });

  it("agrupa por cliente e resume cada um", () => {
    const g = agruparPmp(
      [
        pmp({ cliente_id: "b" }),
        pmp({ cliente_id: "a" }),
        pmp({ cliente_id: "a", cumprida: false, a_horas: false }),
      ],
      (l) => l.cliente_id
    );
    expect(g.map((x) => x.chave)).toEqual(["a", "b"]);
    expect(g[0].resumo.percentagem).toBe(50);
    expect(g[1].resumo.percentagem).toBe(100);
  });

  it("o semáforo diz o que fazer, não só o número", () => {
    expect(estadoPmp(97)).toBe("bom");
    expect(estadoPmp(95)).toBe("bom");
    expect(estadoPmp(88)).toBe("atencao");
    expect(estadoPmp(79)).toBe("mau");
  });
});

const visita = (p: Partial<Intervencao> = {}): Intervencao => ({
  ordem_id: "o1",
  codigo: "OT-1",
  origem: "preventiva",
  estado: "fechada",
  titulo: "Inspeção",
  quando: "2026-01-10T09:00:00Z",
  nao_conformidades: 0,
  tarefas: 4,
  ...p,
});

describe("a vida de um equipamento", () => {
  it("conta visitas, separa preventivas de avarias, soma o que ficou mal", () => {
    const r = resumoAtivo([
      visita(),
      visita({ origem: "corretiva", nao_conformidades: 1 }),
      visita({ origem: "corretiva", nao_conformidades: 2 }),
    ]);
    expect(r.visitas).toBe(3);
    expect(r.preventivas).toBe(1);
    expect(r.corretivas).toBe(2);
    expect(r.naoConformidades).toBe(3);
  });

  it("um equipamento nunca visitado não rebenta nem inventa datas", () => {
    const r = resumoAtivo([]);
    expect(r.visitas).toBe(0);
    expect(r.ultimaVisita).toBeNull();
    expect(r.diasDeHistorico).toBe(0);
  });

  it("a última visita é a mais recente, venha na ordem que vier", () => {
    const r = resumoAtivo([
      visita({ quando: "2026-05-01T00:00:00Z" }),
      visita({ quando: "2026-01-01T00:00:00Z" }),
    ]);
    expect(r.ultimaVisita?.slice(0, 10)).toBe("2026-05-01");
    expect(r.diasDeHistorico).toBe(120);
  });

  it("três avarias num ano levantam a pergunta de substituir", () => {
    const agora = new Date("2026-08-31T00:00:00Z");
    const tres = [
      visita({ origem: "corretiva", quando: "2026-02-01T00:00:00Z" }),
      visita({ origem: "corretiva", quando: "2026-05-01T00:00:00Z" }),
      visita({ origem: "corretiva", quando: "2026-08-01T00:00:00Z" }),
    ];
    expect(ativoProblematico(tres, agora)).toContain("3 avarias");
  });

  it("duas não chegam — uso normal não é avaria crónica", () => {
    const agora = new Date("2026-08-31T00:00:00Z");
    expect(
      ativoProblematico(
        [
          visita({ origem: "corretiva", quando: "2026-05-01T00:00:00Z" }),
          visita({ origem: "corretiva", quando: "2026-08-01T00:00:00Z" }),
        ],
        agora
      )
    ).toBeNull();
  });

  it("avarias antigas não contam — o que interessa é o último ano", () => {
    const agora = new Date("2026-08-31T00:00:00Z");
    const antigas = [
      visita({ origem: "corretiva", quando: "2020-01-01T00:00:00Z" }),
      visita({ origem: "corretiva", quando: "2020-06-01T00:00:00Z" }),
      visita({ origem: "corretiva", quando: "2021-01-01T00:00:00Z" }),
    ];
    expect(ativoProblematico(antigas, agora)).toBeNull();
  });

  it("preventivas não são avarias, por muitas que sejam", () => {
    const agora = new Date("2026-08-31T00:00:00Z");
    const muitas = Array.from({ length: 12 }, (_, i) =>
      visita({ quando: `2026-0${(i % 9) + 1}-01T00:00:00Z` })
    );
    expect(ativoProblematico(muitas, agora)).toBeNull();
  });
});

const leitura = (p: Partial<Leitura> = {}): Leitura => ({
  leitura_id: "l1",
  medicao_def_id: "d1",
  nome: "Pressão",
  tipo: "gama",
  unidade: "bar",
  limite_min: 10,
  limite_max: 15,
  valor_num: 12,
  valor_texto: null,
  conforme: true,
  lida_em: "2026-01-01T00:00:00Z",
  codigo: "OT-1",
  ...p,
});

describe("a evolução das leituras", () => {
  it("junta a mesma medição e põe-na por ordem de tempo", () => {
    const s = seriesDeLeituras([
      leitura({ leitura_id: "b", lida_em: "2026-03-01T00:00:00Z", valor_num: 11 }),
      leitura({ leitura_id: "a", lida_em: "2026-01-01T00:00:00Z", valor_num: 13 }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].pontos.map((p) => p.leitura_id)).toEqual(["a", "b"]);
  });

  it("separa medições diferentes", () => {
    const s = seriesDeLeituras([
      leitura({ medicao_def_id: "d1", nome: "Pressão" }),
      leitura({ medicao_def_id: "d2", nome: "Horas", unidade: "h" }),
    ]);
    expect(s.map((x) => x.nome)).toEqual(["Horas", "Pressão"]);
  });

  it("uma escolha não é uma evolução — fica de fora", () => {
    expect(
      seriesDeLeituras([leitura({ tipo: "escolha", valor_num: null, valor_texto: "Conforme" })])
    ).toEqual([]);
  });

  it("conta as leituras que ficaram fora de limites", () => {
    const s = seriesDeLeituras([
      leitura({ leitura_id: "a", conforme: true }),
      leitura({ leitura_id: "b", conforme: false, valor_num: 8, lida_em: "2026-02-01T00:00:00Z" }),
    ]);
    expect(s[0].naoConformes).toBe(1);
  });

  it("diz para onde o valor anda, comparando com a leitura anterior", () => {
    const desce = seriesDeLeituras([
      leitura({ leitura_id: "a", valor_num: 14, lida_em: "2026-01-01T00:00:00Z" }),
      leitura({ leitura_id: "b", valor_num: 11, lida_em: "2026-02-01T00:00:00Z" }),
    ]);
    expect(paraOndeVai(desce[0])).toBe("desce");
  });

  it("com uma leitura só não há para onde andar", () => {
    expect(paraOndeVai(seriesDeLeituras([leitura()])[0])).toBeNull();
  });

  it("compara com a anterior, não com a média", () => {
    // 5, 5, 5, 9 — a média diria "acima"; o que interessa é que subiu agora.
    const s = seriesDeLeituras([
      leitura({ leitura_id: "a", valor_num: 5, lida_em: "2026-01-01T00:00:00Z" }),
      leitura({ leitura_id: "b", valor_num: 5, lida_em: "2026-02-01T00:00:00Z" }),
      leitura({ leitura_id: "c", valor_num: 5, lida_em: "2026-03-01T00:00:00Z" }),
      leitura({ leitura_id: "d", valor_num: 9, lida_em: "2026-04-01T00:00:00Z" }),
    ]);
    expect(paraOndeVai(s[0])).toBe("sobe");
  });
});
