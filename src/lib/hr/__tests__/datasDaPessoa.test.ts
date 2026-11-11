/**
 * `datasDaPessoa`: as tres datas da pessoa (contratacao, antiguidade, saida) derivadas dos contratos. A regra e a do desenho
 * fechado (vault: datas-pessoa-contratos-desenho.md, «Desenho» e «Correccoes da revisao», H4): so contam contratos vivos;
 * cadeias continuas; cadeia de referencia = a mais recente com pelo menos um contrato que nao seja `futuro`; saida so se a
 * cadeia inteira esta `terminado`. E a MESMA tabela de casos que a funcao SQL `hr_pessoa_datas_calcular` tem de cumprir.
 */
import { describe, expect, it } from "vitest";
import { datasDaPessoa, eRecusaDasDatasDerivadas, type VinculoParaDatas } from "@/lib/hr/datasDaPessoa";

type Estado = VinculoParaDatas["estado"];

const v = (
  estado: Estado,
  data_inicio: string,
  data_fim: string | null = null,
  extra: Partial<VinculoParaDatas> = {},
): VinculoParaDatas => ({ estado, data_inicio, data_fim, data_antiguidade: null, deleted_at: null, ...extra });

const NULAS = { data_admissao: null, data_antiguidade: null, data_saida: null };

interface Caso {
  nome: string;
  vinculos: VinculoParaDatas[];
  esperado: { data_admissao: string | null; data_antiguidade: string | null; data_saida: string | null };
}

const CASOS: Caso[] = [
  {
    nome: "sem contrato: as tres a null",
    vinculos: [],
    esperado: NULAS,
  },
  {
    nome: "um contrato sem termo em vigor: contratacao = inicio, antiguidade = inicio, sem saida",
    vinculos: [v("activo", "2024-03-01")],
    esperado: { data_admissao: "2024-03-01", data_antiguidade: "2024-03-01", data_saida: null },
  },
  {
    nome: "a termo em vigor: a saida fica a null ate o contrato terminar (D2)",
    vinculos: [v("activo", "2026-02-01", "2027-02-01")],
    esperado: { data_admissao: "2026-02-01", data_antiguidade: "2026-02-01", data_saida: null },
  },
  {
    nome: "terminado: a saida e o fim do contrato",
    vinculos: [v("terminado", "2020-01-01", "2022-06-30")],
    esperado: { data_admissao: "2020-01-01", data_antiguidade: "2020-01-01", data_saida: "2022-06-30" },
  },
  {
    nome: "sobrepostos fundem-se: o inicio e o do primeiro e a saida o maior fim",
    vinculos: [v("terminado", "2024-06-01", "2025-06-30"), v("terminado", "2024-01-01", "2024-12-31")],
    esperado: { data_admissao: "2024-01-01", data_antiguidade: "2024-01-01", data_saida: "2025-06-30" },
  },
  {
    nome: "sobreposto contido noutro: o maior fim e o do que o contem",
    vinculos: [v("terminado", "2024-01-01", "2025-12-31"), v("terminado", "2024-03-01", "2024-05-31")],
    esperado: { data_admissao: "2024-01-01", data_antiguidade: "2024-01-01", data_saida: "2025-12-31" },
  },
  {
    nome: "intervalo entre contratos: a cadeia de referencia e a mais recente (readmissao, D1)",
    vinculos: [v("terminado", "2022-01-01", "2022-12-31"), v("terminado", "2023-02-01", "2023-12-31")],
    esperado: { data_admissao: "2023-02-01", data_antiguidade: "2023-02-01", data_saida: "2023-12-31" },
  },
  {
    nome: "intervalo com o segundo em vigor: nao ha saida",
    vinculos: [v("terminado", "2022-01-01", "2022-12-31"), v("activo", "2023-02-01")],
    esperado: { data_admissao: "2023-02-01", data_antiguidade: "2023-02-01", data_saida: null },
  },
  {
    nome: "o seguinte comeca no dia em que o anterior acaba: mesma cadeia",
    vinculos: [v("terminado", "2024-01-01", "2024-06-30"), v("activo", "2024-06-30")],
    esperado: { data_admissao: "2024-01-01", data_antiguidade: "2024-01-01", data_saida: null },
  },
  {
    nome: "o seguinte comeca 1 dia depois do fim do anterior: ainda e a mesma cadeia",
    vinculos: [v("terminado", "2024-01-01", "2024-06-30"), v("terminado", "2024-07-01", "2024-12-31")],
    esperado: { data_admissao: "2024-01-01", data_antiguidade: "2024-01-01", data_saida: "2024-12-31" },
  },
  {
    nome: "o seguinte comeca 2 dias depois do fim do anterior: ja ha intervalo, cadeia nova",
    vinculos: [v("terminado", "2024-01-01", "2024-06-30"), v("terminado", "2024-07-02", "2024-12-31")],
    esperado: { data_admissao: "2024-07-02", data_antiguidade: "2024-07-02", data_saida: "2024-12-31" },
  },
  {
    nome: "mudanca de mes e de ano (31 de dezembro para 1 de janeiro) liga",
    vinculos: [v("terminado", "2023-01-01", "2023-12-31"), v("terminado", "2024-01-01", "2024-12-31")],
    esperado: { data_admissao: "2023-01-01", data_antiguidade: "2023-01-01", data_saida: "2024-12-31" },
  },
  {
    nome: "um contrato sem fim abre a cadeia: o que comeca depois junta-se a ela",
    vinculos: [v("activo", "2020-01-01"), v("futuro", "2025-01-01", "2025-12-31")],
    esperado: { data_admissao: "2020-01-01", data_antiguidade: "2020-01-01", data_saida: null },
  },
  {
    nome: "apagados nao contam: so existe o que esta vivo",
    vinculos: [
      v("terminado", "2018-01-01", "2019-12-31", { deleted_at: "2024-01-01T10:00:00Z" }),
      v("activo", "2023-05-01"),
    ],
    esperado: { data_admissao: "2023-05-01", data_antiguidade: "2023-05-01", data_saida: null },
  },
  {
    nome: "so contratos apagados: como se nao houvesse contrato (D8)",
    vinculos: [v("activo", "2023-05-01", null, { deleted_at: "2024-01-01T10:00:00Z" })],
    esperado: NULAS,
  },
  {
    nome: "so ha um futuro: nao havendo mais nada, entra (pessoa nova com admissao futura)",
    vinculos: [v("futuro", "2027-01-01", "2027-12-31")],
    esperado: { data_admissao: "2027-01-01", data_antiguidade: "2027-01-01", data_saida: null },
  },
  {
    nome: "futuro depois de uma cadeia terminada (H4): nao apaga a saida anterior",
    vinculos: [v("terminado", "2020-01-01", "2022-06-30"), v("futuro", "2027-01-01")],
    esperado: { data_admissao: "2020-01-01", data_antiguidade: "2020-01-01", data_saida: "2022-06-30" },
  },
  {
    nome: "futuro ligado a uma cadeia terminada: entra na cadeia, que ja nao esta toda terminada",
    vinculos: [v("terminado", "2024-01-01", "2024-12-31"), v("futuro", "2025-01-01", "2025-12-31")],
    esperado: { data_admissao: "2024-01-01", data_antiguidade: "2024-01-01", data_saida: null },
  },
  {
    nome: "varios futuros e nenhum outro: a cadeia mais recente",
    vinculos: [v("futuro", "2027-01-01", "2027-06-30"), v("futuro", "2029-01-01", "2029-06-30")],
    esperado: { data_admissao: "2029-01-01", data_antiguidade: "2029-01-01", data_saida: null },
  },
  {
    nome: "suspenso: esta parado, nao acabado; sem saida",
    vinculos: [v("suspenso", "2021-09-01")],
    esperado: { data_admissao: "2021-09-01", data_antiguidade: "2021-09-01", data_saida: null },
  },
  {
    nome: "suspenso com data de fim preenchida continua sem saida (so `terminado` fecha)",
    vinculos: [v("suspenso", "2021-09-01", "2022-09-01")],
    esperado: { data_admissao: "2021-09-01", data_antiguidade: "2021-09-01", data_saida: null },
  },
  {
    // Inalcancavel na base (CHECK pessoas_vinculos_terminado_tem_data_fim): aqui so se fixa o que a funcao faz com ele.
    nome: "terminado sem data de fim (a base nao o permite): a cadeia fica aberta e a saida e null",
    vinculos: [v("terminado", "2021-09-01", null)],
    esperado: { data_admissao: "2021-09-01", data_antiguidade: "2021-09-01", data_saida: null },
  },
  {
    nome: "terminado sem data de fim a seguir a um terminado com fim (a base nao o permite): saida null",
    vinculos: [v("terminado", "2021-01-01", "2021-12-31"), v("terminado", "2022-01-01", null)],
    esperado: { data_admissao: "2021-01-01", data_antiguidade: "2021-01-01", data_saida: null },
  },
  {
    nome: "empate no inicio: a antiguidade e a do ultimo por (inicio, id), como o ORDER BY di DESC, id DESC do SQL",
    vinculos: [
      v("terminado", "2024-01-01", "2024-06-30", { id: "a", data_antiguidade: "2020-01-01" }),
      v("terminado", "2024-01-01", "2024-12-31", { id: "b", data_antiguidade: "2021-01-01" }),
    ],
    esperado: { data_admissao: "2024-01-01", data_antiguidade: "2021-01-01", data_saida: "2024-12-31" },
  },
  {
    nome: "empate no inicio: o id decide, nao o fim (o de id maior tem o fim mais cedo)",
    vinculos: [
      v("terminado", "2024-01-01", "2024-12-31", { id: "a", data_antiguidade: "2020-01-01" }),
      v("terminado", "2024-01-01", "2024-06-30", { id: "b", data_antiguidade: "2021-01-01" }),
    ],
    esperado: { data_admissao: "2024-01-01", data_antiguidade: "2021-01-01", data_saida: "2024-12-31" },
  },
  {
    nome: "empate no inicio: o ultimo sem antiguidade nao conta, vale o anterior preenchido",
    vinculos: [
      v("terminado", "2024-01-01", "2024-12-31", { id: "a", data_antiguidade: "2020-01-01" }),
      v("terminado", "2024-01-01", "2024-12-31", { id: "b" }),
    ],
    esperado: { data_admissao: "2024-01-01", data_antiguidade: "2020-01-01", data_saida: "2024-12-31" },
  },
  {
    nome: "readmissao: o inicio da cadeia actual e a contratacao e a antiguidade tambem, se o contrato novo nao a tem",
    vinculos: [
      v("terminado", "2018-01-01", "2019-12-31", { data_antiguidade: "2018-01-01" }),
      v("activo", "2023-05-01"),
    ],
    esperado: { data_admissao: "2023-05-01", data_antiguidade: "2023-05-01", data_saida: null },
  },
  {
    nome: "antiguidade preenchida no contrato que abre a cadeia (readmissao com antiguidade reconhecida)",
    vinculos: [
      v("terminado", "2018-01-01", "2019-12-31"),
      v("activo", "2023-05-01", null, { data_antiguidade: "2018-01-01" }),
    ],
    esperado: { data_admissao: "2023-05-01", data_antiguidade: "2018-01-01", data_saida: null },
  },
  {
    nome: "antiguidade: o valor mais recente preenchido na cadeia (por inicio do contrato)",
    vinculos: [
      v("terminado", "2021-01-01", "2021-12-31", { data_antiguidade: "2020-01-01" }),
      v("terminado", "2022-01-01", "2022-12-31", { data_antiguidade: "2019-06-01" }),
      v("activo", "2023-01-01"),
    ],
    esperado: { data_admissao: "2021-01-01", data_antiguidade: "2019-06-01", data_saida: null },
  },
  {
    nome: "antiguidade: um valor mais antigo da cadeia vale se os mais recentes estao vazios",
    vinculos: [v("terminado", "2021-01-01", "2021-12-31", { data_antiguidade: "2020-01-01" }), v("activo", "2022-01-01")],
    esperado: { data_admissao: "2021-01-01", data_antiguidade: "2020-01-01", data_saida: null },
  },
  {
    nome: "antiguidade de uma cadeia que nao e a de referencia nao conta",
    vinculos: [
      v("terminado", "2010-01-01", "2011-12-31", { data_antiguidade: "2005-01-01" }),
      v("activo", "2023-01-01"),
    ],
    esperado: { data_admissao: "2023-01-01", data_antiguidade: "2023-01-01", data_saida: null },
  },
  {
    nome: "os contratos apagados nao dao antiguidade",
    vinculos: [v("activo", "2023-01-01", null, { data_antiguidade: "2000-01-01", deleted_at: "2024-01-01T00:00:00Z" }), v("activo", "2023-06-01")],
    esperado: { data_admissao: "2023-06-01", data_antiguidade: "2023-06-01", data_saida: null },
  },
];

describe("datasDaPessoa: tabela de casos", () => {
  it.each(CASOS)("$nome", ({ vinculos, esperado }) => {
    expect(datasDaPessoa(vinculos)).toEqual(esperado);
  });
});

describe("datasDaPessoa: entradas e propriedades", () => {
  it("null e undefined sao como uma lista vazia", () => {
    expect(datasDaPessoa(null)).toEqual(NULAS);
    expect(datasDaPessoa(undefined)).toEqual(NULAS);
  });

  it("a ordem da lista nao muda o resultado", () => {
    const lista = [
      v("terminado", "2024-01-01", "2024-06-30"),
      v("terminado", "2024-07-01", "2024-12-31"),
      v("activo", "2026-03-01"),
    ];
    const certo = datasDaPessoa(lista);
    expect(datasDaPessoa([...lista].reverse())).toEqual(certo);
    expect(datasDaPessoa([lista[1], lista[2], lista[0]])).toEqual(certo);
  });

  it("a ordem da lista nao muda o resultado nos empates com ids", () => {
    const lista = [
      v("terminado", "2024-01-01", "2024-06-30", { id: "a", data_antiguidade: "2020-01-01" }),
      v("terminado", "2024-01-01", "2024-12-31", { id: "b", data_antiguidade: "2021-01-01" }),
      v("terminado", "2024-01-01", "2024-03-31", { id: "c", data_antiguidade: "2019-01-01" }),
    ];
    const certo = datasDaPessoa(lista);
    expect(certo.data_antiguidade).toBe("2019-01-01");
    expect(datasDaPessoa([...lista].reverse())).toEqual(certo);
    expect(datasDaPessoa([lista[1], lista[2], lista[0]])).toEqual(certo);
  });

  it("aceita datas com hora (so os dez primeiros caracteres contam)", () => {
    expect(datasDaPessoa([v("terminado", "2024-01-01T00:00:00Z", "2024-06-30T23:59:59Z")])).toEqual({
      data_admissao: "2024-01-01", data_antiguidade: "2024-01-01", data_saida: "2024-06-30",
    });
  });

  it("um contrato sem os campos opcionais (sem data_antiguidade nem deleted_at) conta como vivo", () => {
    expect(datasDaPessoa([{ estado: "activo", data_inicio: "2024-01-01", data_fim: null }])).toEqual({
      data_admissao: "2024-01-01", data_antiguidade: "2024-01-01", data_saida: null,
    });
  });

  it("nao altera a lista recebida nem os contratos", () => {
    const lista = Object.freeze([
      Object.freeze(v("terminado", "2024-07-01", "2024-12-31")),
      Object.freeze(v("terminado", "2024-01-01", "2024-06-30")),
    ]);
    expect(() => datasDaPessoa(lista)).not.toThrow();
    expect(lista[0].data_inicio).toBe("2024-07-01");
  });

  it("muitos contratos (10 000) continuam a dar o resultado certo", () => {
    const lista: VinculoParaDatas[] = [];
    for (let i = 0; i < 10_000; i += 1) {
      const dia = new Date(Date.UTC(1990, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      lista.push(v("terminado", dia, dia));
    }
    const r = datasDaPessoa(lista);
    expect(r.data_admissao).toBe("1990-01-01");
    expect(r.data_saida).toBe(lista[lista.length - 1].data_fim);
  });
});

describe("eRecusaDasDatasDerivadas", () => {
  it("reconhece o 23514 do trigger das datas derivadas, por mensagem ou por detalhe", () => {
    expect(eRecusaDasDatasDerivadas({ code: "23514", message: "pessoas_datas_derivadas: a data de contratacao deriva dos contratos" })).toBe(true);
    expect(eRecusaDasDatasDerivadas(new Error("pessoas_datas_derivadas: x"))).toBe(true);
  });

  it("nao confunde outros erros (nem um 23514 de outra regra)", () => {
    expect(eRecusaDasDatasDerivadas({ code: "23514", message: 'violates check constraint "pessoas_vinculos_horas_periodo_nao_negativa"' })).toBe(false);
    expect(eRecusaDasDatasDerivadas({ code: "42501", message: "permission denied" })).toBe(false);
    for (const x of [null, undefined, "", 42, {}]) expect(eRecusaDasDatasDerivadas(x)).toBe(false);
  });
});

describe("datasDaPessoa: saida gravada sem contrato (D8 revista)", () => {
  it("sem contrato vivo, a saida ja gravada mantem-se (barreira de acesso); contratacao e antiguidade voltam a null", () => {
    expect(datasDaPessoa([], "2024-05-01")).toEqual({ data_admissao: null, data_antiguidade: null, data_saida: "2024-05-01" });
    expect(datasDaPessoa(null, "2024-05-01")).toEqual({ data_admissao: null, data_antiguidade: null, data_saida: "2024-05-01" });
  });

  it("so contratos apagados contam como sem contrato: a saida gravada mantem-se", () => {
    const apagado = v("terminado", "2020-01-01", "2024-05-01", { deleted_at: "2024-06-01T00:00:00Z" });
    expect(datasDaPessoa([apagado], "2024-05-01")).toEqual({ data_admissao: null, data_antiguidade: null, data_saida: "2024-05-01" });
  });

  it("sem contrato e sem saida gravada: tudo null (null, undefined e vazio)", () => {
    expect(datasDaPessoa([], null)).toEqual(NULAS);
    expect(datasDaPessoa([])).toEqual(NULAS);
  });

  it("com contrato vivo vale a regra normal e a saida gravada e ignorada", () => {
    expect(datasDaPessoa([v("activo", "2024-03-01")], "2020-01-01")).toEqual({
      data_admissao: "2024-03-01", data_antiguidade: "2024-03-01", data_saida: null,
    });
    expect(datasDaPessoa([v("terminado", "2020-01-01", "2022-06-30")], "1999-01-01").data_saida).toBe("2022-06-30");
  });

  it("uma saida gravada com hora fica so com a data", () => {
    expect(datasDaPessoa([], "2024-05-01T00:00:00Z").data_saida).toBe("2024-05-01");
  });
});
