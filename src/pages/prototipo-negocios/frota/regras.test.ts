// As regras principais da Frota (as do protótipo HTML) e as ligações aos dados de exemplo do protótipo: obras e técnicos do motor,
// armazéns móveis do Inventário e recursos da Agenda.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TECS, seed } from "../motor";
import { criarSeed, criarSeedComCarrinhas, CARRINHAS } from "../inventario/seed";
import { reservas } from "../inventario/ec";
import { contadores, estadoStock } from "../inventario/contadores";
import { armazemServe } from "../inventario/stock";
import { opcoesExpedicao } from "../inventario/opcoes";
import { comoSistema } from "../inventario/base";
import { MOVEL_NAO_SERVE, alternarArmazem, definirArmazemPorDefeito, definirCampoArmazem } from "../inventario/cadastros";
import { agendaInicial } from "../v2/agendaDefinicoes";
import {
  gravarAbastecer, gravarConcluir, gravarDevolver, gravarImportar, gravarKm, gravarManut, gravarNova, gravarOcorrencia, iniNova, validarAbastecer, validarAtribuir,
  validarDevolver, validarManut, iniAtribuir, gravarAtribuir,
} from "./acoes";
import { ErroFrota, diasUteis, fKm } from "./base";
import { esquecerFrota, executar, lerFrota } from "./loja";
import { esquecerPerfilFrota, mudarPerfilFrota } from "./perfil";
import { obrasDoEstado, recursosFrota } from "./pontes";
import { criarArmazemCarrinha, pedirReposicao, stockCarrinha } from "./pontesInv";
import {
  KM_FIXO, alertas, atribEm, bloqueios, cartaOk, cobre, consumo, custoKm, custoKmDeslocacao, kmPeriodo, pessoa, prazoMulta, quemConduzia, revisao, tomData, utilizacao,
  vencimentos, viatura, viaturasDaObra,
} from "./regras";
import { seedFrota } from "./seed";
import type { Frota } from "./tipos";

const fresca = (): Frota => seedFrota();
const V = (F: Frota, id: string) => viatura(F, id)!;
beforeEach(() => { localStorage.clear(); esquecerFrota(); });
afterEach(() => { esquecerPerfilFrota(); localStorage.clear(); });

describe("revisão, vencimentos e alertas", () => {
  it("a revisão é por km ou por data, a que chegar primeiro", () => {
    const F = fresca();
    // 12-TT-90: faltam 8600 km, mas a data (01/10/2026) já passou → vermelho
    const r4 = revisao(V(F, "v4"));
    expect(r4.faltaKm).toBe(8600);
    expect(r4.tom).toBe("bad");
    expect(r4.txt).toBe("Data passou há 13 d");
    // AA-12-BC: faltam 1770 km (≤ 3000) → aviso
    const r1 = revisao(V(F, "v1"));
    expect([r1.faltaKm, r1.tom]).toEqual([1770, "warn"]);
    // 45-XZ-78: em dia
    expect(revisao(V(F, "v2")).tom).toBe("ok");
  });

  it("os vencimentos: vencido, a 30 dias, a 60 dias; o elétrico não tem IUC e o renting tem fim de contrato", () => {
    expect(tomData("2026-10-05")).toBe("bad");
    expect(tomData("2026-10-28")).toBe("warn");
    expect(tomData("2026-12-01")).toBe("info");
    expect(tomData(null)).toBe("neu");
    const F = fresca();
    expect(vencimentos(V(F, "v5")).map((x) => [x.tipo, x.data])).toEqual([["Seguro", "2028-02-29"], ["Inspeção (IPO)", "2027-03-15"], ["IUC", null], ["Fim do renting", "2028-02-29"]]);
  });

  it("os alertas juntam vencimentos, revisão, carta do condutor e stock abaixo do mínimo; uma viatura vendida não tem alertas", () => {
    const F = fresca();
    const al4 = alertas(F, V(F, "v4")).map((a) => a.txt);
    expect(al4).toContain("Inspeção (IPO): vencido há 9 d");
    expect(al4.some((t) => t.startsWith("Revisão:"))).toBe(true);
    // o Rui Alves (45-XZ-78) tem a carta a caducar a 20/11/2026
    expect(alertas(F, V(F, "v2")).map((a) => a.txt)).toContain("Carta de Rui Alves: faltam 37 d");
    expect(alertas(F, V(F, "v1"), [{ sku: "SIL-N", nome: "Silicone", qty: 3, un: "un", min: 5 }]).map((a) => a.txt)).toContain("1 artigo(s) da carrinha abaixo do mínimo");
    expect(alertas(F, V(F, "v8"))).toEqual([]);
  });
});

describe("condutores, atribuições e multas", () => {
  it("a carta: sem carta, caducada na data, ou sem a categoria", () => {
    const F = fresca();
    expect(cartaOk(pessoa(F, "p7")!, V(F, "v7"))).toBe("Paulo Mota não tem carta de condução registada no RH.");
    expect(cartaOk(pessoa(F, "p2")!, V(F, "v2"), "2026-12-01")).toBe("A carta de Rui Alves caducou a 20/11/2026.");
    expect(cartaOk(pessoa(F, "p1")!, { ...V(F, "v7"), cat: "C" })).toBe("João Silva não tem a categoria C.");
    expect(cartaOk(pessoa(F, "p3")!, { ...V(F, "v7"), cat: "C" })).toBeNull();
  });

  it("a atribuição cobre o dia do fim, exceto se a viatura foi devolvida nesse dia", () => {
    const F = fresca();
    const a6 = F.atrib.find((a) => a.id === "a6")!;
    expect(cobre(a6, "2026-10-08")).toBe(true);
    expect(cobre({ ...a6, devolvida: true }, "2026-10-08")).toBe(false);
    expect(cobre(a6, "2026-10-09")).toBe(false);
    expect(atribEm(F, "v7", "2026-10-15")?.id).toBe("a7");
  });

  it("o prazo da multa são 15 dias úteis desde a notificação e o condutor sugerido é quem tinha a viatura nesse dia", () => {
    const F = fresca();
    const o1 = F.ocorr.find((o) => o.id === "o1")!, o2 = F.ocorr.find((o) => o.id === "o2")!;
    expect(diasUteis("2026-10-09", 15)).toBe("2026-10-30");
    expect(prazoMulta(o1)).toBe("2026-10-30");
    expect(quemConduzia(F, o1.vid, o1.quando)?.nome).toBe("Marco Antunes");
    // a partilhada BX-55-RT estava com o João Silva na demolição da obra #1050
    expect(quemConduzia(F, o2.vid, o2.quando)?.nome).toBe("João Silva");
  });

  it("a atribuição recusa carta inválida, sobreposições, km que descem e dias de manutenção marcada", () => {
    const F = fresca();
    const base = iniAtribuir(F, { v: "v7" });
    expect(validarAtribuir(F, { ...base, pid: "p7" }).pid).toBe("Paulo Mota não tem carta de condução registada no RH.");
    expect(validarAtribuir(F, { ...base, pid: "p8", tipo: "pontual", ini: "2026-10-15", fim: "2026-10-15" }).ini).toBe("A BX-55-RT já está com Hugo Neves de 15/10/2026 a 16/10/2026.");
    expect(validarAtribuir(F, { ...base, pid: "p8", km: "100" }).km).toBe(`Não pode ser menos do que a última leitura (${fKm(176020)}).`);
    expect(validarAtribuir(F, { ...iniAtribuir(F, { v: "v1" }), pid: "p8" }).ini).toMatch(/^A AA-12-BC já está com João Silva/);
    expect(validarAtribuir(F, { ...base, pid: "p1" }).pid).toBe("João Silva já tem a AA-12-BC. Devolve-a primeiro.");
    gravarManut(F, { vid: "v7", tipo: "Revisão", data: "2026-10-25", oficina: "Oficina Auto Sul", valor: "" });
    expect(validarAtribuir(F, { ...base, pid: "p8", tipo: "pontual", ini: "2026-10-24", fim: "2026-10-26" }).ini).toBe("A BX-55-RT tem Revisão marcada a 25/10/2026: está bloqueada na agenda.");
    // e a manutenção não pode cair numa reserva pontual
    expect(validarManut(F, { vid: "v7", tipo: "Revisão", data: "2026-10-15", oficina: "Oficina Auto Sul", valor: "" }).data).toMatch(/^A viatura está reservada a Hugo Neves/);
  });
});

describe("a loja: uma regra que recusa não muda nada", () => {
  it("registar km que descem é recusado e a base fica igual", () => {
    const antes = lerFrota();
    const r = executar((F) => gravarKm(F, { vid: "v1", km: "100", data: "2026-10-14" }));
    expect(r.ok).toBe(false);
    expect(r.erro).toBe(`Os km não podem descer. Última leitura: ${fKm(148230)}.`);
    expect(lerFrota()).toBe(antes);
    expect(V(lerFrota(), "v1").km).toBe(148230);
    const ok = executar((F) => gravarKm(F, { vid: "v1", km: "148500", data: "2026-10-14" }));
    expect(ok.ok).toBe(true);
    expect(V(lerFrota(), "v1").km).toBe(148500);
    expect(V(antes, "v1").km).toBe(148230); // a cópia: a base antiga não mudou
  });

  it("o perfil técnico não atribui viaturas (a regra recusa, não só o botão)", () => {
    mudarPerfilFrota("tecnico");
    const r = executar((F) => gravarAtribuir(F, { ...iniAtribuir(F, { v: "v7" }), pid: "p8" }));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/Como técnico/);
    expect(() => gravarKm(seedFrota(), { vid: "v1", km: "1", data: "2026-10-14" })).toThrow(ErroFrota);
  });

  it("os dados guardam-se no localStorage com a chave da Frota e esquecerFrota volta ao início", () => {
    executar((F) => gravarKm(F, { vid: "v1", km: "148600", data: "2026-10-14" }));
    expect(localStorage.getItem("olyvia-prototipo-frota")).toContain("148600");
    esquecerFrota();
    expect(localStorage.getItem("olyvia-prototipo-frota")).toBeNull();
    expect(V(lerFrota(), "v1").km).toBe(148230);
  });
});

describe("custos, consumo e utilização", () => {
  it("custo por km, consumo e utilização no período (1/9 a 14/10)", () => {
    const F = fresca();
    expect(kmPeriodo(F, "v1")).toBe(3610);
    expect(consumo(F, "v1")!).toBeCloseTo(10.2, 0);
    expect(custoKm(F, "v1")!).toBeGreaterThan(0.2);
    // a partilhada só esteve atribuída 3 dias (29/09 a 01/10) dos 44
    expect(utilizacao(F, V(F, "v7"))).toBeCloseTo((3 / 44) * 100, 5);
    expect(custoKmDeslocacao(F, "v1")).toBe(custoKm(F, "v1"));
    expect(custoKmDeslocacao({ ...F, viaturas: [], custos: [], leituras: [] })).toBe(KM_FIXO);
  });
});

describe("ligações com os dados de exemplo do protótipo", () => {
  it("os condutores técnicos são os técnicos do motor (TECS)", () => {
    const F = fresca();
    for (const p of F.pessoas.filter((x) => x.tec)) expect(TECS.find((t) => t.id === p.tec)?.n).toBe(p.nome);
  });

  it("as obras e as tarefas (ordens) da Frota existem no Estado de exemplo, com o mesmo técnico", () => {
    const F = fresca(), obras = obrasDoEstado(seed());
    expect(obras.map((o) => o.id).sort()).toEqual([1022, 1050]);
    for (const c of F.agenda.filter((x) => x.obra)) {
      const o = obras.find((x) => x.id === c.obra)!;
      const t = o.tarefas.find((x) => x.nome === c.tarefa);
      expect(t, `${c.ref} · ${c.tarefa}`).toBeDefined();
      expect(t!.tec).toBe(pessoa(F, c.pid)!.tec);
    }
    for (const a of F.atrib.filter((x) => x.obra)) expect(obras.some((o) => o.id === a.obra)).toBe(true);
    for (const c of F.custos.filter((x) => x.centro?.startsWith("Obra #"))) expect(obras.some((o) => `Obra #${o.id}` === c.centro)).toBe(true);
    expect(viaturasDaObra(F, 1022).map((x) => x.v.mat).sort()).toEqual(["12-TT-90", "AA-12-BC", "BX-55-RT"]);
  });

  it("cada carrinha com armazém é um armazém do tipo viatura no Inventário, com o stock de exemplo", () => {
    const F = fresca(), inv = criarSeedComCarrinhas();
    for (const v of F.viaturas.filter((x) => x.armazem)) {
      const w = inv.warehouses.find((x) => x.id === v.armazemId);
      expect(w, v.mat).toBeDefined();
      expect([w!.tipo, w!.matricula, w!.serves]).toEqual(["viatura", v.mat, false]);
    }
    expect(stockCarrinha(inv, "VIA-AA-12-BC").map((s) => [s.sku, s.qty, s.min])).toEqual([["TM-16", 45, 50], ["VE-12", 12, 6], ["FT-01", 18, 10], ["SIL-N", 3, 5], ["ABR-48", 100, 50]]);
    expect(CARRINHAS).toHaveLength(F.viaturas.filter((x) => x.armazem).length);
  });

  it("as carrinhas não mexem no que já existia no Inventário: a reserva FIFO, as POs e as ECs ficam iguais", () => {
    const sem = criarSeed(), com = criarSeedComCarrinhas();
    expect(reservas(com).res).toEqual(reservas(sem).res);
    const [a, b] = [contadores(sem), contadores(com)];
    // só o valor do stock muda (as carrinhas são inventário da empresa); todos os outros contadores, o stock baixo incluído, são os do mockup
    expect({ ...b, stockValue: 0 }).toEqual({ ...a, stockValue: 0 });
    expect(com.moves.slice(-6)).toEqual(sem.moves.slice(-6)); // a carga das carrinhas não aparece nos últimos movimentos
    expect(com.seq).toBeGreaterThan(sem.seq);
  });

  it("com as carrinhas: stock baixo igual ao do mockup (13), mas o valor e as existências contam o que as carrinhas levam", () => {
    const sem = criarSeed(), com = criarSeedComCarrinhas();
    const unidades = (db: typeof sem) => db.stocks.filter((s) => !s.deleted).reduce((n, s) => n + s.qty, 0);
    const linhasComStock = (db: typeof sem) => db.stocks.filter((s) => !s.deleted && s.qty > 0).length;
    expect(contadores(sem).low).toBe(13);
    expect(contadores(com).low).toBe(13);
    expect(Math.round(contadores(sem).stockValue * 100) / 100).toBe(28233.8);
    expect(Math.round(contadores(com).stockValue * 100) / 100).toBe(29152.75);
    expect([linhasComStock(sem), unidades(sem)]).toEqual([17, 1974]);
    expect([linhasComStock(com), unidades(com)]).toEqual([37, 2291]);
    // a linha do silicone na AA-12-BC está abaixo do mínimo (3 < 5): na Frota é falta, no Inventário não é "a encomendar"
    const sil = com.stocks.find((s) => s.wh === "VIA-AA-12-BC" && s.sku === "SIL-N")!;
    expect(sil.qty < sil.min).toBe(true);
    expect(estadoStock(com, sil)).toBe("ok");
  });

  it("um armazém móvel nunca serve clientes: nem na reserva FIFO, nem na expedição, nem ligando o interruptor", () => {
    const com = criarSeedComCarrinhas();
    const w = com.warehouses.find((x) => x.id === "VIA-AA-12-BC")!;
    w.serves = true; // mesmo que alguém o ligue à mão
    expect(armazemServe(com, w.id)).toBe(false);
    expect(opcoesExpedicao(com).map((o) => o[0])).not.toContain(w.id);
    expect(reservas(com).res).toEqual(reservas(criarSeed()).res);
    w.serves = false;
    expect(() => comoSistema(() => alternarArmazem(com, w.id, "serves", true))).toThrow(MOVEL_NAO_SERVE);
    expect(() => comoSistema(() => definirCampoArmazem(com, w.id, "serves", true))).toThrow(MOVEL_NAO_SERVE);
    expect(() => comoSistema(() => definirArmazemPorDefeito(com, w.id))).toThrow();
  });

  it("pedir reposição cria pedidos de transferência reais (Armazém Central → carrinha) e não os repete", () => {
    const inv = criarSeedComCarrinhas();
    const ids = pedirReposicao(inv, "VIA-AA-12-BC");
    expect(ids).toHaveLength(2);
    const novos = inv.transfers.filter((t) => ids.includes(t.id));
    expect(novos.map((t) => [t.sku, t.from, t.to, t.qty, t.state])).toEqual([["TM-16", "LIS", "VIA-AA-12-BC", 5, "pending"], ["SIL-N", "LIS", "VIA-AA-12-BC", 2, "pending"]]);
    expect(() => pedirReposicao(inv, "VIA-AA-12-BC")).toThrow("Já há pedidos de transferência pendentes para todos os artigos em falta.");
    expect(() => pedirReposicao(inv, "VIA-BX-55-RT")).toThrow("Nenhum artigo da carrinha está abaixo do mínimo.");
    expect(criarArmazemCarrinha(inv, "99-ZZ-99", "Porto")).toBe("VIA-99-ZZ-99");
    // vazio, reaproveita-se (por exemplo depois de "Repor" na Frota); com stock, recusa
    expect(criarArmazemCarrinha(inv, "99-ZZ-99", "")).toBe("VIA-99-ZZ-99");
    expect(inv.warehouses.filter((w) => w.id === "VIA-99-ZZ-99")).toHaveLength(1);
    expect(() => criarArmazemCarrinha(inv, "AA-12-BC", "")).toThrow(/já existe no Inventário e tem stock/);
  });

  it("as viaturas ativas são os recursos Veículo da Agenda; a AA-12-BC é a Carrinha Renault Master", () => {
    const r = recursosFrota(fresca());
    expect(r.every((x) => x.tipo === "Veículo")).toBe(true);
    expect(r.map((x) => x.mat)).toEqual(["AA-12-BC", "45-XZ-78", "BR-03-QP", "12-TT-90", "AF-77-LM", "88-PL-21", "BX-55-RT"]);
    const antigo = agendaInicial().recursos.find((x) => x.tipo === "Veículo")!;
    expect(r.find((x) => x.antigo === antigo.nome)?.mat).toBe("AA-12-BC");
  });

  it("as reservas pontuais, as manutenções e a oficina bloqueiam a viatura na agenda", () => {
    const F = fresca();
    expect(bloqueios(F, "v4", "2026-10-16").map((b) => [b.tipo, b.txt])).toEqual([["manutencao", "IPO"], ["permanente", "Marco Antunes"]]);
    expect(bloqueios(F, "v7", "2026-10-15").map((b) => b.tipo)).toEqual(["pontual"]);
    expect(bloqueios(F, "v3", "2026-10-20").map((b) => b.tipo)).toEqual(["oficina"]);
    expect(bloqueios(F, "v7", "2026-10-14")).toEqual([]);
  });
});

describe("correções da revisão", () => {
  it("a carta tem de servir também no último dia da reserva", () => {
    const F = fresca();
    // o Rui Alves tem a carta até 20/11/2026: uma reserva de 19/11 a 21/11 é recusada pelo fim
    const x = { ...iniAtribuir(F, { v: "v7" }), pid: "p2", tipo: "pontual", ini: "2026-11-19", fim: "2026-11-21" };
    expect(validarAtribuir(F, x).pid).toBe("A carta de Rui Alves caducou a 20/11/2026.");
    expect(validarAtribuir(F, { ...x, fim: "2026-11-20" }).pid).toBeUndefined();
  });

  it("a reserva pontual percorre todos os dias, incluindo uma manutenção em curso até à data prevista", () => {
    const F = fresca();
    F.manut.push({ id: "mx", vid: "v7", tipo: "Reparação", data: "2026-10-22", prev: "2026-10-27", estado: "em curso", oficina: "Oficina Auto Sul", valor: 0 });
    const x = { ...iniAtribuir(F, { v: "v7" }), pid: "p8", tipo: "pontual", ini: "2026-10-25", fim: "2026-10-26" };
    expect(validarAtribuir(F, x).ini).toBe("A BX-55-RT está em Reparação (em curso, prevista até 27/10/2026): está bloqueada na agenda.");
    expect(validarAtribuir(F, { ...x, ini: "2026-10-28", fim: "2026-10-29" }).ini).toBeUndefined();
  });

  it("devolver, abastecer e registar km recusam datas no futuro; não se devolve duas vezes", () => {
    const F = fresca();
    expect(validarDevolver(F, { a: "a1", km: "148300", data: "2026-10-20", danos: "" }).data).toBe("Não pode ser no futuro.");
    gravarDevolver(F, { a: "a1", km: "148300", data: "2026-10-14", danos: "" });
    expect(validarDevolver(F, { a: "a1", km: "148400", data: "2026-10-14", danos: "" }).a).toBe("Esta atribuição já foi devolvida.");
    expect(() => gravarDevolver(F, { a: "a1", km: "148400", data: "2026-10-14", danos: "" })).toThrow("Esta atribuição já foi devolvida.");
    expect(validarAbastecer(F, { vid: "v2", qtd: "10", valor: "20", km: "61300", fonte: "Cartão frota · Galp", data: "2026-10-15" }).data).toBe("Não pode ser no futuro.");
    expect(() => gravarKm(F, { vid: "v2", km: "61300", data: "2026-10-15" })).toThrow("Não pode ser no futuro.");
  });

  it("importar o mesmo extrato duas vezes não duplica os custos", () => {
    const F = fresca(), n = F.custos.length;
    expect(gravarImportar(F)).toBe("4 abastecimentos importados. 1 ficou para rever.");
    expect(F.custos).toHaveLength(n + 4);
    expect(() => gravarImportar(F)).toThrow(/já foi importado/);
    expect(F.custos).toHaveLength(n + 4);
  });

  it("concluir uma intervenção diz o estado real da viatura", () => {
    const F = fresca();
    expect(gravarConcluir(F, { m: "m2", km: "231500", valor: "37.3", data: "2026-10-14" })).toBe("Inspeção periódica (IPO) concluída. A 12-TT-90 continua ativa.");
    expect(gravarConcluir(F, { m: "m1", km: "203880", valor: "980", data: "2026-10-14" })).toBe("Reparação · embraiagem concluída. BR-03-QP volta a estar ativa.");
  });

  it("o técnico só age sobre a sua própria viatura", () => {
    mudarPerfilFrota("tecnico");
    const F = fresca();
    expect(() => gravarKm(F, { vid: "v2", km: "61300", data: "2026-10-14" })).toThrow("Como técnico, só podes agir sobre a tua viatura (AA-12-BC).");
    expect(() => gravarOcorrencia(F, { vid: "v4", tipo: "Avaria", quando: "2026-10-14T09:00", local: "Lisboa", desc: "Luz do motor", valor: "" })).toThrow(/só podes agir sobre a tua viatura/);
    expect(gravarKm(F, { vid: "v1", km: "148300", data: "2026-10-14" })).toMatch(/^Km registados\./);
    expect(() => gravarAbastecer(F, { vid: "v1", qtd: "10", valor: "20", km: "148400", fonte: "Cartão frota · Galp", data: "2026-10-14" })).not.toThrow();
  });

  it("'Criar recurso na Agenda' tem efeito: sem a opção, a viatura não é recurso da Agenda", () => {
    const F = fresca();
    expect(F.viaturas.every((v) => v.agenda)).toBe(true);
    const com = gravarNova(F, { ...iniNova(), mat: "AB-12-CD", marca: "Fiat", modelo: "Doblò", seguro: "2027-10-01" }, null);
    const sem = gravarNova(F, { ...iniNova(), mat: "AB-12-CE", marca: "Fiat", modelo: "Doblò", seguro: "2027-10-01", agenda: "" }, null);
    const mats = recursosFrota(F).map((r) => r.mat);
    expect(mats).toContain("AB-12-CD");
    expect(mats).not.toContain("AB-12-CE");
    expect([viatura(F, com)!.agenda, viatura(F, sem)!.agenda]).toEqual([true, false]);
  });

  it("quando a data chega antes dos km, a revisão diz a data e a percentagem segue a data", () => {
    const F = fresca();
    const v = { ...V(F, "v2"), km: 61240, rev: { cadaKm: 30000, cadaMeses: 12, ultKm: 60000, ultData: "2025-10-24" } };
    const r = revisao(v);
    expect(r.txt).toBe("Faltam 10 d (até 24/10/2026)");
    expect(r.tom).toBe("warn");
    expect(r.pct).toBeGreaterThan(95);
  });
});

