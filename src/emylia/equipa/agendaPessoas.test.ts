// 22/10/2026: cada papel do "A ver como" é uma pessoa do RH, a equipa é quem lhe reporta e a agenda de cada pessoa (RH › Agenda e
// "A minha agenda" no Hoje) junta as obras, as visitas, as ausências aprovadas no RH e os feriados.
import { beforeEach, describe, expect, it, vi } from "vitest";

// a sincronização importa o cliente da base: aqui não se fala com ninguém
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { seed, type Estado } from "../motor";
import { seedFrota } from "../frota/seed";
import { atualizarFicha, lerEstado as lerRh, repor as reporRh } from "@/components/rh-exemplo/dados/loja";
import { diasDoPeriodo } from "./regrasAgenda";
import { agendaDaPessoa, agendaDasPessoas, equipaDe, garantirTecnicosNoRh, juntarPapeisAoRh, pessoaRhDoPapel, PESSOA_DO_PAPEL } from "./pontes";
import { garantirTecnicos } from "./tecnicos";

const HOJE = new Date(2026, 9, 14, 10);
function estado(papel: Estado["role"] = "direcao", tec?: string) {
  const S = seed();
  S.role = papel;
  if (tec) S.tec = tec;
  garantirTecnicos(S);
  return S;
}
const entrada = (S: Estado) => ({ deals: S.deals, tecnicos: S.tecnicos!, frota: seedFrota(), hoje: HOJE, rh: lerRh() });
const TECS_RH = ["p-tec-js", "p-tec-ra", "p-tec-ma", "p-tec-sf", "p-tec-hn", "p-tec-pm"];

beforeEach(() => { reporRh(); garantirTecnicosNoRh(); });

describe("a pessoa do RH de cada papel", () => {
  it("cada papel é uma pessoa (ids próprios, sem reutilizar o p-ruben nem a p-ines do RH de exemplo); o técnico é a dele", () => {
    expect(pessoaRhDoPapel(estado("direcao"))).toBe("p-marta");
    expect(pessoaRhDoPapel(estado("operacoes"))).toBe("p-op-filipe");
    expect(pessoaRhDoPapel(estado("comercial"))).toBe("p-com-ruben");
    expect(pessoaRhDoPapel(estado("financeiro"))).toBe("p-fin-sandra");
    expect(pessoaRhDoPapel(estado("armazem"))).toBe("p-arm-nuno");
    expect(pessoaRhDoPapel(estado("juridico"))).toBe("p-jur-ines");
    expect(pessoaRhDoPapel(estado("tecnico", "ma"))).toBe("p-tec-ma");
    const e = lerRh();
    for (const id of Object.values(PESSOA_DO_PAPEL)) expect(e.fichas[id], id).toBeDefined();
    expect(e.fichas["p-op-filipe"].pessoa).toMatchObject({ nome_completo: "Filipe Rocha", cargo: "Gestor/a de Operações", reporta_a_pessoa_id: "p-marta" });
    expect(e.fichas["p-com-ruben"].pessoa).toMatchObject({ nome_completo: "Rúben Costa", reporta_a_pessoa_id: "p-rui" });
    expect(e.fichas["p-jur-ines"].pessoa).toMatchObject({ nome_completo: "Inês Carvalho", cargo: "Jurista" });
    // o Rúben de Braga e a Inês do Porto ficam como estavam
    expect(e.fichas["p-ruben"].pessoa.nome_completo).toBe("Rúben Faria");
    expect(e.fichas["p-ines"].pessoa.nome_completo).toBe("Inês Cardoso");
    // os técnicos reportam ao Filipe
    for (const id of TECS_RH) expect(e.fichas[id].pessoa.reporta_a_pessoa_id, id).toBe("p-op-filipe");
    // só uma vez
    expect(juntarPapeisAoRh(e)).toBe(e);
  });

  it("a equipa: o Filipe tem os técnicos, a Marta toda a gente (menos quem saiu), a Sandra só a si", () => {
    const e = lerRh();
    expect(equipaDe(e, "p-op-filipe")).toEqual(["p-op-filipe", ...TECS_RH]);
    expect(equipaDe(e, "p-fin-sandra")).toEqual(["p-fin-sandra"]);
    expect(equipaDe(e, "p-com-ruben")).toEqual(["p-com-ruben"]);
    const marta = equipaDe(e, "p-marta");
    expect(marta[0]).toBe("p-marta");
    expect(new Set(marta).size).toBe(marta.length);
    for (const id of [...TECS_RH, ...Object.values(PESSOA_DO_PAPEL), "p-rui", "p-tiago", "p-sofia", "p-daniel"]) expect(marta, id).toContain(id);
    expect(marta).not.toContain("p-pedro"); // terminado: arquivado
    // o Filipe vem antes dos técnicos (quem gere primeiro)
    expect(marta.indexOf("p-op-filipe")).toBeLessThan(marta.indexOf("p-tec-js"));
    // o Rui tem os vendedores dele e o Rúben comercial
    expect(equipaDe(e, "p-rui")).toEqual(expect.arrayContaining(["p-rui", "p-tiago", "p-carolina", "p-com-ruben"]));
  });
});

describe("a agenda de cada pessoa", () => {
  it("o técnico tem as tarefas da obra; o Rúben, as visitas; quem não tem nada, uma linha vazia", () => {
    const S = estado();
    const dias = diasDoPeriodo("semana", "2026-10-14");
    const hugo = agendaDaPessoa(entrada(S), "p-tec-hn", dias);
    expect(hugo).toMatchObject({ id: "hn", tipo: "tecnico", pessoaRhId: "p-tec-hn" });
    expect(hugo.celulas.find((c) => c.data === "2026-10-15")!.itens[0]).toMatchObject({ tipo: "tarefa", obra: 1022 });
    const ruben = agendaDaPessoa(entrada(S), "p-com-ruben", dias);
    expect(ruben).toMatchObject({ id: "com:Rúben", nome: "Rúben Costa", pessoaRhId: "p-com-ruben" });
    expect(ruben.celulas.find((c) => c.data === "2026-10-15")!.itens).toEqual([expect.objectContaining({ tipo: "visita", negocio: 1036, hora: "10:00" })]);
    const sandra = agendaDaPessoa(entrada(S), "p-fin-sandra", dias);
    expect(sandra).toMatchObject({ id: "rh:p-fin-sandra", tipo: "pessoa", nome: "Sandra Moreira", papel: "Técnico/a Financeiro/a" });
    expect(sandra.celulas).toHaveLength(7);
    expect(sandra.celulas.flatMap((c) => c.itens).filter((x) => x.tipo === "tarefa" || x.tipo === "visita")).toEqual([]);
  });

  it("toda a gente tem as ausências aprovadas no RH e os feriados nacionais", () => {
    const S = estado();
    // um dia de férias aprovado da Sandra, na terça 9/12/2026 (o modelo é um dia de ausência de outra pessoa)
    const modelo = Object.values(lerRh().fichas).flatMap((f) => f.ausencias.dias)[0];
    expect(modelo).toBeDefined();
    atualizarFicha("p-fin-sandra", (f) => ({ ...f, ausencias: { ...f.ausencias, dias: [...f.ausencias.dias, { ...modelo, pessoa_id: "p-fin-sandra", data: "2026-12-09", estado: "aprovado", e_fim_semana: false }] } }));
    const dias = diasDoPeriodo("semana", "2026-12-08");
    const sandra = agendaDaPessoa(entrada(S), "p-fin-sandra", dias);
    expect(sandra.celulas.find((c) => c.data === "2026-12-08")!.itens).toEqual([expect.objectContaining({ tipo: "feriado", titulo: "Imaculada Conceição" })]);
    expect(sandra.celulas.find((c) => c.data === "2026-12-09")!.itens).toEqual([expect.objectContaining({ tipo: "ausencia", sub: "Ausência aprovada no RH" })]);
    // o feriado também na linha do técnico
    expect(agendaDaPessoa(entrada(S), "p-tec-js", dias).celulas.find((c) => c.data === "2026-12-08")!.itens[0]).toMatchObject({ tipo: "feriado" });
  });

  it("a agenda da equipa do Filipe: ele e os técnicos, pela ordem; a da Direção junta as visitas de quem não é pessoa do RH", () => {
    const S = estado();
    const dias = diasDoPeriodo("semana", "2026-10-14"), e = lerRh();
    const L = agendaDasPessoas(entrada(S), equipaDe(e, "p-op-filipe"), dias);
    expect(L.map((l) => l.pessoaRhId)).toEqual(["p-op-filipe", ...TECS_RH]);
    expect(L[0]).toMatchObject({ nome: "Filipe Rocha", tipo: "pessoa" });
    const D = agendaDasPessoas(entrada(S), equipaDe(e, "p-marta"), dias, true);
    expect(D.filter((l) => l.id === "com:Rúben")).toHaveLength(1); // o Rúben uma só vez (a linha dele)
    expect(D.filter((l) => l.tipo === "tecnico")).toHaveLength(6);
  });
});
