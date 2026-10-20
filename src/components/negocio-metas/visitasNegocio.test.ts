// Lógica pura das Visitas de "Novo negócio": migrar a visita única para lista, adicionar, remover, marcar feita, a
// próxima visita, as visitas de um pedido e o levantamento que se deriva da lista.
import { describe, expect, it } from "vitest";
import type { NegocioMes, VisitaNegocio } from "./negocioMetas";
import { MORADA_VAZIA } from "./moradaObra";
import {
  acrescentarVisita, alterarVisita, camposDoLevantamento, contarVisitas, marcarFeita, migrarVisitaUnica, novaVisita, ordenarVisitas,
  moradaDasVisitas, proximaVisitaDoNegocio, removerVisita, resumoDaVisita, visitaParaAbrir, visitasDoNegocio, visitasIniciais,
  visitasComCodigoPostalInvalido, visitasParaGuardar,
} from "./visitasNegocio";

const HOJE = "2026-10-13";
const visita = (id: string, parcial: Partial<VisitaNegocio> = {}): VisitaNegocio => ({
  id, data: "2026-10-15", hora: "10:00", feitoPor: "Bruno Costa", estado: "porFazer", tipo: "revisita", quemVaiEstar: "", duracao: "",
  morada: MORADA_VAZIA, igualALead: false, nota: "", ...parcial,
});
const MORADA_B = { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "Loja" };

describe("novaVisita", () => {
  it("nasce Por fazer, do tipo Revisita, daqui a 2 dias, com o comercial pedido e sem hora", () => {
    expect(novaVisita("v1", HOJE, "Ana Ribeiro")).toMatchObject({
      id: "v1", data: "2026-10-15", hora: "", feitoPor: "Ana Ribeiro", estado: "porFazer", tipo: "revisita", nota: "",
    });
  });
  it("passa o mês e o ano ao somar os 2 dias", () => {
    expect(novaVisita("v1", "2026-12-31", "Ana Ribeiro").data).toBe("2027-01-02");
  });
  it("copia a morada da visita anterior, sem partilhar o objeto", () => {
    const anterior = visita("v0", { morada: { ...MORADA_B }, igualALead: true });
    const nova = novaVisita("v1", HOJE, "Ana Ribeiro", anterior);
    expect(nova.morada).toEqual(MORADA_B);
    expect(nova.morada).not.toBe(anterior.morada);
    expect(nova.igualALead).toBe(true);
  });
  it("sem visita anterior a morada fica vazia e deixa de ser a da lead", () => {
    expect(novaVisita("v1", HOJE, "Ana Ribeiro")).toMatchObject({ morada: MORADA_VAZIA, igualALead: false });
  });
});

describe("ordem, adicionar, alterar e remover", () => {
  it("ordena por data e hora; sem hora fica depois das que a têm no mesmo dia; sem data fica no fim; não altera a lista", () => {
    const lista = [
      visita("c", { data: "2026-10-20" }), visita("sem", { data: "" }), visita("b", { data: "2026-10-15", hora: "" }), visita("a", { data: "2026-10-15", hora: "09:00" }),
    ];
    expect(ordenarVisitas(lista).map((v) => v.id)).toEqual(["a", "b", "c", "sem"]);
    expect(lista.map((v) => v.id)).toEqual(["c", "sem", "b", "a"]);
  });
  it("visitas à mesma hora mantêm a ordem em que foram acrescentadas", () => {
    expect(ordenarVisitas([visita("x"), visita("y")]).map((v) => v.id)).toEqual(["x", "y"]);
  });
  it("acrescentar devolve uma lista nova com a visita no fim", () => {
    const lista = [visita("a")];
    const nova = acrescentarVisita(lista, visita("b"));
    expect(nova.map((v) => v.id)).toEqual(["a", "b"]);
    expect(lista).toHaveLength(1);
  });
  it("alterar muda só a visita pedida; um id desconhecido deixa tudo igual", () => {
    const lista = [visita("a"), visita("b")];
    const nova = alterarVisita(lista, "b", { hora: "15:00" });
    expect(nova.map((v) => v.hora)).toEqual(["10:00", "15:00"]);
    expect(alterarVisita(lista, "zz", { hora: "15:00" })).toEqual(lista);
  });
  it("remover tira a visita pedida, seja qual for (também uma já feita); um id desconhecido deixa tudo igual", () => {
    const lista = [visita("a"), visita("p", { estado: "feita" })];
    expect(removerVisita(lista, "a").map((v) => v.id)).toEqual(["p"]);
    expect(removerVisita(lista, "p").map((v) => v.id)).toEqual(["a"]);
    expect(removerVisita(lista, "zz").map((v) => v.id)).toEqual(["a", "p"]);
  });
  it("editar a morada de uma visita deixa-a sem origem (escrita à mão)", () => {
    const lista = [visita("a", { igualALead: true })];
    expect(alterarVisita(lista, "a", { morada: { ...MORADA_VAZIA, rua: "Rua C" }, igualALead: null })[0].igualALead).toBeNull();
  });
});

describe("marcar como Feita e contar", () => {
  it("marca como Feita só uma visita Por fazer; Cancelada e Feita ficam como estavam", () => {
    const lista = [visita("a"), visita("b", { estado: "cancelada" }), visita("c", { estado: "feita" })];
    expect(marcarFeita(lista, "a").map((v) => v.estado)).toEqual(["feita", "cancelada", "feita"]);
    expect(marcarFeita(lista, "b")).toEqual(lista);
    expect(marcarFeita(lista, "c")).toEqual(lista);
  });
  it("conta as visitas e as feitas (as canceladas contam como visitas, não como feitas)", () => {
    expect(contarVisitas([])).toEqual({ total: 0, feitas: 0 });
    expect(contarVisitas([visita("a"), visita("b", { estado: "feita" }), visita("c", { estado: "cancelada" })])).toEqual({ total: 3, feitas: 1 });
  });
});

describe("próxima visita", () => {
  it("é a primeira Por fazer por ordem cronológica; sem nenhuma, não há", () => {
    const lista = [visita("tarde", { data: "2026-11-01" }), visita("feita", { estado: "feita", data: "2026-10-01" }), visita("cedo", { data: "2026-10-20" })];
    expect(proximaVisitaDoNegocio(lista)?.id).toBe("cedo");
    expect(proximaVisitaDoNegocio([visita("f", { estado: "feita" }), visita("c", { estado: "cancelada" })])).toBeUndefined();
    expect(proximaVisitaDoNegocio([])).toBeUndefined();
  });
});

describe("resumoDaVisita", () => {
  const rotulos = { estado: "Feita", tipo: "Levantamento" };
  it("diz estado, data, hora, quem fez e tipo", () => {
    expect(resumoDaVisita(visita("a", { estado: "feita" }), rotulos)).toBe("Feita · 15/10/2026 · 10:00 · Bruno Costa · Levantamento");
  });
  it("salta a hora e a data quando não existem", () => {
    expect(resumoDaVisita(visita("a", { hora: "", data: "" }), rotulos)).toBe("Feita · Bruno Costa · Levantamento");
  });
});

describe("levantamento derivado da lista", () => {
  it("sem visitas é o de hoje, do comercial, Por fazer", () => {
    expect(camposDoLevantamento([], HOJE, "Ana Ribeiro")).toEqual({ data: HOJE, feitoPor: "Ana Ribeiro", estado: "porFazer" });
  });
  it("uma visita Feita dá estado feito, com os seus dados", () => {
    expect(camposDoLevantamento([visita("a", { estado: "feita", tipo: "levantamento" })], HOJE, "Ana Ribeiro")).toEqual({
      data: "2026-10-15", feitoPor: "Bruno Costa", estado: "feito",
    });
  });
  it("com várias, vale a Feita de Levantamento; depois qualquer Feita; depois a primeira Por fazer", () => {
    const porFazer = visita("p", { data: "2026-10-14" });
    const revisitaFeita = visita("r", { estado: "feita", data: "2026-10-16", feitoPor: "Carla" });
    const levFeita = visita("l", { estado: "feita", tipo: "levantamento", data: "2026-10-18", feitoPor: "Diogo" });
    expect(camposDoLevantamento([porFazer, revisitaFeita, levFeita], HOJE, "Ana").feitoPor).toBe("Diogo");
    expect(camposDoLevantamento([porFazer, revisitaFeita], HOJE, "Ana")).toMatchObject({ feitoPor: "Carla", estado: "feito" });
    expect(camposDoLevantamento([visita("q", { data: "2026-10-30" }), porFazer], HOJE, "Ana")).toMatchObject({ data: "2026-10-14", estado: "porFazer" });
  });
  it("só Canceladas dá estado porFazer (nada foi feito)", () => {
    expect(camposDoLevantamento([visita("c", { estado: "cancelada" })], HOJE, "Ana").estado).toBe("porFazer");
  });
});

describe("migrar a visita única para a lista", () => {
  it("leva data, quem fez, estado, tipo, hora, quem vai estar e duração para a primeira visita, sem perder nada", () => {
    const v = migrarVisitaUnica("v1", {
      data: "2026-10-13", feitoPor: "Ana Ribeiro", estado: "feito", tipo: "medicao", hora: "h14", quemVaiEstar: "casal", duracao: "h1m30",
      morada: { rua: "Rua A", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" },
    });
    expect(v).toMatchObject({
      id: "v1", data: "2026-10-13", feitoPor: "Ana Ribeiro", estado: "feita", tipo: "medicao", hora: "14:00", quemVaiEstar: "casal",
      duracao: "h1m30", morada: { rua: "Rua A" }, 
    });
  });
  it("sem os campos de escolha, usa Levantamento e vazios; porFazer continua Por fazer; hora já em HH:MM mantém-se", () => {
    expect(migrarVisitaUnica("v1", { data: "2026-10-13", feitoPor: "Ana", estado: "porFazer" })).toMatchObject({
      estado: "porFazer", tipo: "levantamento", hora: "", quemVaiEstar: "", duracao: "", morada: MORADA_VAZIA,
    });
    expect(migrarVisitaUnica("v1", { data: "2026-10-13", feitoPor: "Ana", estado: "porFazer", hora: "16:30" }).hora).toBe("16:30");
  });
  it("visitasDoNegocio: usa as visitas; senão migra o levantamento; sem nada, lista vazia (os negócios de exemplo)", () => {
    const base = { id: "n1" } as NegocioMes;
    const lista = [visita("a")];
    expect(visitasDoNegocio({ ...base, visitas: lista })).toBe(lista);
    expect(visitasDoNegocio({ ...base, levantamento: { data: "2026-10-13", feitoPor: "Ana", estado: "feito", linhas: [], observacoes: "" } })).toMatchObject([
      { estado: "feita", feitoPor: "Ana", data: "2026-10-13", tipo: "levantamento" },
    ]);
    expect(visitasDoNegocio(base)).toEqual([]);
  });
});

describe("visitasParaGuardar", () => {
  it("apara os textos, ordena por data e hora, e não mexe na lista de partida", () => {
    const lista = [
      visita("b", { data: "2026-10-20", nota: "  portão azul  ", morada: { rua: " Rua A ", codigoPostal: " 1000-001 ", localidade: "", andar: "" } }),
      visita("a", { data: "2026-10-14" }),
    ];
    const guardadas = visitasParaGuardar(lista);
    expect(guardadas.map((v) => v.id)).toEqual(["a", "b"]);
    expect(guardadas[1].nota).toBe("portão azul");
    expect(guardadas[1].morada).toEqual({ rua: "Rua A", codigoPostal: "1000-001", localidade: "", andar: "" });
    expect(lista[0].nota).toBe("  portão azul  ");
  });
});

describe("visitasComCodigoPostalInvalido", () => {
  const mau = { ...MORADA_B, codigoPostal: "12" };
  const lista = [
    visita("por-fazer", { data: "2026-10-14", morada: mau }),
    visita("cancelada", { data: "2026-10-15", estado: "cancelada", morada: mau }),
    visita("feita-gravada", { data: "2026-10-16", estado: "feita", morada: mau }),
    visita("feita-nova", { data: "2026-10-17", estado: "feita", morada: mau }),
    visita("boa", { data: "2026-10-18", morada: MORADA_B }),
  ];

  it("sem saber quais estão na base, só as canceladas ficam de fora", () => {
    expect(visitasComCodigoPostalInvalido(lista)).toEqual(["por-fazer", "feita-gravada", "feita-nova"]);
  });

  it("uma visita da base já feita ou cancelada só se lê: com código postal antigo fora do formato não bloqueia o guardar (não se consegue corrigir)", () => {
    expect(visitasComCodigoPostalInvalido(lista, new Set(["por-fazer", "cancelada", "feita-gravada"]))).toEqual(["por-fazer", "feita-nova"]);
  });
});

describe("a lista de visitas de um pedido", () => {
  const lista = [
    visita("pd-1-v1", { estado: "feita", tipo: "levantamento", morada: MORADA_B, igualALead: true }),
    visita("pd-1-v2", { data: "2026-10-20" }),
  ];

  it("visitasIniciais: a lista do pedido chega como cópia (as moradas também), na mesma ordem", () => {
    const iniciais = visitasIniciais(lista);
    expect(iniciais).toEqual(lista);
    expect(iniciais[0]).not.toBe(lista[0]);
    expect(iniciais[0].morada).not.toBe(lista[0].morada);
  });

  it("visitasIniciais: sem pedido, ou com uma lista vazia, a lista começa vazia", () => {
    expect(visitasIniciais(undefined)).toEqual([]);
    expect(visitasIniciais([])).toEqual([]);
  });

  it("visitaParaAbrir: a primeira Feita por ordem cronológica; sem nenhuma Feita, nenhuma", () => {
    expect(visitaParaAbrir(lista)).toBe("pd-1-v1");
    const duas = [visita("a", { estado: "feita", data: "2026-10-20" }), visita("b", { estado: "feita", data: "2026-10-16" })];
    expect(visitaParaAbrir(duas)).toBe("b");
    expect(visitaParaAbrir([visita("c")])).toBeNull();
    expect(visitaParaAbrir([])).toBeNull();
  });

  it("moradaDasVisitas: a da visita que representa o levantamento, com a origem; sem morada escrita, nenhuma", () => {
    expect(moradaDasVisitas(lista)).toEqual({ moradaObra: MORADA_B, igualALead: true });
    const so = [visita("x", { morada: MORADA_VAZIA }), visita("y", { estado: "feita", morada: { ...MORADA_B }, igualALead: null })];
    expect(moradaDasVisitas(so)).toEqual({ moradaObra: MORADA_B, igualALead: null });
    expect(moradaDasVisitas([visita("z", { morada: MORADA_VAZIA })])).toBeUndefined();
    expect(moradaDasVisitas([])).toBeUndefined();
  });
});
