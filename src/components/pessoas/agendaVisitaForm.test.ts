// A parte pura do formulário de uma visita na base: validação (hora obrigatória, quadro, recursos), intervalo e a entrada que o hook envia.
import { describe, expect, it } from "vitest";
import { destinoInicial, MORADA_VISITA_VAZIA } from "./moradaVisita";
import {
  DURACAO_POR_OMISSAO, entradaDaVisita, intervaloDaVisita, opcoesDeDuracao, validarFormVisita, validarAgenda, type ValorAgenda,
} from "./agendaVisitaForm";

const HOJE = "2026-10-20";
const agenda = (sobre: Partial<ValorAgenda> = {}): ValorAgenda => ({
  boardId: "q1", recursos: ["r1"], data: "2026-10-24", hora: "10:00", duracao: "h1", ...sobre,
});
const LEAD = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" };

describe("validarAgenda", () => {
  it("uma agenda completa é válida", () => {
    expect(validarAgenda(agenda(), HOJE)).toBeNull();
  });

  it("sem quadro ou sem recursos diz qual falta (o quadro primeiro)", () => {
    expect(validarAgenda(agenda({ boardId: null }), HOJE)).toBe("quadroEmFalta");
    expect(validarAgenda(agenda({ recursos: [] }), HOJE)).toBe("recursoEmFalta");
    expect(validarAgenda(agenda({ boardId: null, recursos: [] }), HOJE)).toBe("quadroEmFalta");
  });

  it("o dia: vazio, malformado ou anterior a hoje; hoje serve", () => {
    expect(validarAgenda(agenda({ data: "" }), HOJE)).toBe("dataVazia");
    expect(validarAgenda(agenda({ data: "24/10/2026" }), HOJE)).toBe("dataVazia");
    expect(validarAgenda(agenda({ data: "2026-10-19" }), HOJE)).toBe("dataPassada");
    expect(validarAgenda(agenda({ data: HOJE }), HOJE)).toBeNull();
  });

  it("a hora é obrigatória (vazia dá horaVazia) e tem de ser HH:MM", () => {
    expect(validarAgenda(agenda({ hora: "" }), HOJE)).toBe("horaVazia");
    expect(validarAgenda(agenda({ hora: "25:00" }), HOJE)).toBe("horaInvalida");
    expect(validarAgenda(agenda({ hora: "9:5" }), HOJE)).toBe("horaInvalida");
    expect(validarAgenda(agenda({ hora: "23:59" }), HOJE)).toBeNull();
  });

  it("um dia em falta ganha à hora em falta (o primeiro campo da página)", () => {
    expect(validarAgenda(agenda({ data: "", hora: "" }), HOJE)).toBe("dataVazia");
  });
});

describe("validarFormVisita", () => {
  const base = { agenda: agenda(), nota: "", destino: destinoInicial(LEAD), moradaLead: LEAD, hoje: HOJE };

  it("válido com a morada da lead; sem erros", () => {
    expect(validarFormVisita(base)).toBeNull();
  });

  it("a agenda manda primeiro, depois a nota (140), depois a morada", () => {
    expect(validarFormVisita({ ...base, agenda: agenda({ hora: "" }) })).toBe("horaVazia");
    expect(validarFormVisita({ ...base, nota: "x".repeat(141) })).toBe("notaComprida");
    expect(validarFormVisita({ ...base, nota: "x".repeat(140) })).toBeNull();
    const semRua = { igualALead: false, outra: MORADA_VISITA_VAZIA, notaAcesso: "" };
    expect(validarFormVisita({ ...base, destino: semRua })).toBe("ruaVazia");
    expect(validarFormVisita({ ...base, destino: { ...semRua, outra: { ...LEAD, codigoPostal: "10" } } })).toBe("codigoPostalInvalido");
    expect(validarFormVisita({ ...base, destino: { ...semRua, outra: LEAD, notaAcesso: "y".repeat(141) } })).toBe("notaAcessoComprida");
  });
});

describe("intervaloDaVisita", () => {
  it("o início em Lisboa (hora de verão) e o fim pela duração", () => {
    expect(intervaloDaVisita(agenda({ duracao: "h1m30" }))).toEqual({ inicio: "2026-10-24T09:00:00.000Z", fim: "2026-10-24T10:30:00.000Z" });
  });

  it("no inverno (UTC+0) o início é a própria hora", () => {
    expect(intervaloDaVisita(agenda({ data: "2026-12-10", duracao: "m30" }))).toEqual({ inicio: "2026-12-10T10:00:00.000Z", fim: "2026-12-10T10:30:00.000Z" });
  });

  it("uma duração fora das quatro preserva-se em minutos e manda sobre a chave", () => {
    expect(intervaloDaVisita(agenda({ duracao: "", duracaoMinutos: 45 }))?.fim).toBe("2026-10-24T09:45:00.000Z");
  });

  it("sem hora, hora inválida ou duração desconhecida dá null", () => {
    expect(intervaloDaVisita(agenda({ hora: "" }))).toBeNull();
    expect(intervaloDaVisita(agenda({ data: "" }))).toBeNull();
    expect(intervaloDaVisita(agenda({ duracao: "h9" }))).toBeNull();
  });

  it("a duração por omissão é 1 h", () => {
    expect(DURACAO_POR_OMISSAO).toBe("h1");
  });
});

describe("opcoesDeDuracao", () => {
  it("as quatro durações; com uma duração da base fora delas acrescenta-se uma opção «custom»", () => {
    expect(opcoesDeDuracao(undefined)).toEqual(["m30", "h1", "h1m30", "h2"]);
    expect(opcoesDeDuracao(60)).toEqual(["m30", "h1", "h1m30", "h2"]);
    expect(opcoesDeDuracao(45)).toEqual(["m30", "h1", "h1m30", "h2", "custom"]);
  });
});

describe("entradaDaVisita", () => {
  const comum = { agenda: agenda(), nome: "Ana Lopes", tipo: "levantamento" as const, tituloTipo: "Levantamento", moradaLead: LEAD };

  it("o título é «tipo · nome»; sem tipo é só o nome", () => {
    const e = entradaDaVisita({ ...comum, destino: destinoInicial(LEAD), nota: "", quemVaiEstar: "" });
    expect(e.titulo).toBe("Levantamento · Ana Lopes");
    expect(entradaDaVisita({ ...comum, tipo: "", tituloTipo: "", destino: destinoInicial(LEAD), nota: "", quemVaiEstar: "" }).titulo).toBe("Ana Lopes");
  });

  it("na morada da lead: morada e «igual à da lead»; a nota de acesso não se perde", () => {
    const e = entradaDaVisita({ ...comum, destino: { igualALead: true, outra: MORADA_VISITA_VAZIA, notaAcesso: " Portão azul " }, nota: "", quemVaiEstar: "" });
    expect(e.morada).toEqual(LEAD);
    expect(e.igualALead).toBe(true);
    expect(e.nota).toBe("Portão azul");
  });

  it("noutra morada: a escrita, aparada, e igualALead falso", () => {
    const outra = { rua: " Rua B 2 ", codigoPostal: "2000-002", localidade: " Santarém ", andar: " 1.º " };
    const e = entradaDaVisita({ ...comum, destino: { igualALead: false, outra, notaAcesso: "" }, nota: "", quemVaiEstar: "" });
    expect(e.morada).toEqual({ rua: "Rua B 2", codigoPostal: "2000-002", localidade: "Santarém", andar: "1.º" });
    expect(e.igualALead).toBe(false);
  });

  it("a nota da visita e a de acesso juntam-se; só uma, fica só ela; nenhuma, vazio", () => {
    const d = (notaAcesso: string) => ({ igualALead: true, outra: MORADA_VISITA_VAZIA, notaAcesso });
    expect(entradaDaVisita({ ...comum, destino: d("Tocar duas vezes"), nota: "Trazer trena", quemVaiEstar: "" }).nota).toBe("Trazer trena · Tocar duas vezes");
    expect(entradaDaVisita({ ...comum, destino: d(""), nota: "Trazer trena", quemVaiEstar: "" }).nota).toBe("Trazer trena");
    expect(entradaDaVisita({ ...comum, destino: d(""), nota: "  ", quemVaiEstar: "" }).nota).toBe("");
  });

  it("leva quadro, recursos, dia, hora, duração, «quem vai estar» e o negócio tal como vieram", () => {
    const e = entradaDaVisita({
      ...comum, agenda: agenda({ recursos: ["r1", "r2"], duracao: "", duracaoMinutos: 45 }), destino: destinoInicial(LEAD), nota: "", quemVaiEstar: "casal", negocioId: "n1",
    });
    expect(e).toMatchObject({
      boardId: "q1", data: "2026-10-24", hora: "10:00", duracao: "", duracaoMinutos: 45, recursos: ["r1", "r2"], tipo: "levantamento", quemVaiEstar: "casal", negocioId: "n1",
    });
  });

  it("sem negócio, negocioId fica de fora (o alterar não o leva)", () => {
    const e = entradaDaVisita({ ...comum, destino: destinoInicial(LEAD), nota: "", quemVaiEstar: "" });
    expect(e.negocioId).toBeUndefined();
  });
});
