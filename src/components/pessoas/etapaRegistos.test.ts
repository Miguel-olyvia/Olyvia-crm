// A etapa, o próximo passo, o "atrasada" e a Parte do Quadro de uma pessoa, lidos dos REGISTOS dela (contacto, visita, levantamento)
// e não de pedidos. As decisões por defeito: ver o cabeçalho de `etapaPessoa.ts`.
import { describe, expect, it } from "vitest";
import { MORADA_VAZIA } from "@/components/negocio-metas/moradaObra";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { ContactoPessoa, LevantamentoPessoa, RegistosDaPessoa, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import {
  colunaDaPessoa, emAbordagem, estaAtrasadaRegistos, etapaDosRegistos, horaDoProximoContactoRegistos, proximoContactoRegistos,
  proximoContactoVemDeVisitaRegistos, proximoPassoRegistos, registosParaAbordagem, type EntradaRegistos,
} from "./etapaPessoa";
import type { Pessoa } from "./pessoasTipos";

const HOJE = "2026-10-15";
const pessoa = (parcial: Partial<Pessoa> = {}): Pessoa => ({
  id: "p1", nome: "Ana", contacto: { telefone: null, email: null }, comercial: "Bruno", origem: "site", viaEntrada: "manual", saude: 50,
  ultimoContactoDias: 0, ...parcial,
});
const contacto = (id: string, data: string, parcial: Partial<ContactoPessoa> = {}): ContactoPessoa => ({
  id, pessoaId: "p1", data, resultado: "atendeuInteressado", nota: "", negocioId: null, ...parcial,
});
const visita = (id: string, data: string, estado: VisitaPessoa["estado"], parcial: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  id, pessoaId: "p1", negocioId: null, data, hora: "", feitoPor: "Bruno", estado, tipo: "levantamento", quemVaiEstar: "", duracao: "",
  morada: MORADA_VAZIA, igualALead: true, nota: "", ...parcial,
});
const levantamento = (id: string, data: string, parcial: Partial<LevantamentoPessoa> = {}): LevantamentoPessoa => ({
  id, pessoaId: "p1", visitaId: null, data, feitoPor: "Bruno", rascunho: { linhas: [], observacoes: "", respostas: {} }, negocioId: null, ...parcial,
});
const negocio = (id: string, dias: number, parcial: Partial<NegocioMes> = {}): NegocioMes => ({
  id, pessoaId: "p1", pessoa: "Ana", servico: "Cozinha", comercial: "Bruno", dias, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [{ id: "o", valor: 100, escolhido: true }], proposta: null, contrato: null, ...parcial,
});
const ganhoHistorico = (id: string, dias: number) => ({ ...negocio(id, dias), contrato: { estado: "assinado" as const } });
const registos = (r: Partial<RegistosDaPessoa> = {}): RegistosDaPessoa => ({ contactos: [], visitas: [], levantamentos: [], ...r });
const entrada = (parcial: Partial<EntradaRegistos> = {}): EntradaRegistos => ({
  pessoa: pessoa(), papel: "lead", negocios: [], abertos: [], registos: registos(), ...parcial,
});

describe("etapaDosRegistos", () => {
  it("sem registos nem negócios a pessoa é nova (Lead)", () => {
    expect(etapaDosRegistos(entrada(), HOJE)).toBe("nova");
  });

  it("um contacto passa-a a Contacto; uma visita por fazer ou feita, a Visita", () => {
    expect(etapaDosRegistos(entrada({ registos: registos({ contactos: [contacto("c", "2026-10-10")] }) }), HOJE)).toBe("emContacto");
    const comVisita = registos({ contactos: [contacto("c", "2026-10-10")], visitas: [visita("v", "2026-10-20", "porFazer")] });
    expect(etapaDosRegistos(entrada({ registos: comVisita }), HOJE)).toBe("visitaMarcada");
    expect(etapaDosRegistos(entrada({ registos: registos({ visitas: [visita("v", "2026-10-12", "feita")] }) }), HOJE)).toBe("visitaMarcada");
  });

  it("uma visita só cancelada conta como se não houvesse nenhuma", () => {
    const r = registos({ contactos: [contacto("c", "2026-10-10")], visitas: [visita("v", "2026-10-12", "cancelada")] });
    expect(etapaDosRegistos(entrada({ registos: r }), HOJE)).toBe("emContacto");
  });

  it("um formulário não é um contacto: a pessoa com formulário e sem registos continua nova", () => {
    expect(etapaDosRegistos(entrada({ pessoa: pessoa({ formulario: "Pedido de orçamento", viaEntrada: "formulario" }) }), HOJE)).toBe("nova");
  });

  it("um negócio aberto manda (Negócio) e um negócio ganho faz cliente", () => {
    const aberto = negocio("n1", 5);
    expect(etapaDosRegistos(entrada({ negocios: [aberto], abertos: [aberto] }), HOJE)).toBe("qualificada");
    expect(etapaDosRegistos(entrada({ papel: "cliente", negocios: [ganhoHistorico("n1", 5)] }), HOJE)).toBe("cliente");
  });

  it("uma lead com negócios só terminados e nada de novo fica em Contacto, e volta a nova com 'abordagemDesde' posterior", () => {
    const antigo = { ...negocio("n1", 30), mes: "2026-09", resultado: "perdido" as const };
    expect(etapaDosRegistos(entrada({ negocios: [antigo] }), HOJE)).toBe("emContacto");
    expect(etapaDosRegistos(entrada({ negocios: [antigo], pessoa: pessoa({ abordagemDesde: "2026-10-14" }) }), HOJE)).toBe("nova");
  });
});

describe("registosParaAbordagem: o que faz a pessoa voltar à Parte 1", () => {
  it("só conta o que está por ligar e é posterior ao último negócio (criado há `dias`)", () => {
    const n = negocio("n1", 10); // criado a 2026-10-05
    const r = registos({
      contactos: [contacto("antigo", "2026-10-01"), contacto("novo", "2026-10-12"), contacto("ligado", "2026-10-13", { negocioId: "n1" })],
      visitas: [visita("v", "2026-10-20", "porFazer")],
    });
    const rel = registosParaAbordagem(r, [n], HOJE);
    expect(rel.contactos.map((c) => c.id)).toEqual(["novo"]);
    expect(rel.visitas.map((v) => v.id)).toEqual(["v"]);
  });

  it("sem negócios conta tudo o que está por ligar", () => {
    const r = registos({ contactos: [contacto("a", "2020-01-01")], levantamentos: [levantamento("l", "2020-01-02")] });
    expect(registosParaAbordagem(r, [], HOJE).contactos).toHaveLength(1);
    expect(registosParaAbordagem(r, [], HOJE).levantamentos).toHaveLength(1);
  });

  it("o último negócio é o mais recente (o de menos dias)", () => {
    const velho = ganhoHistorico("n1", 100);
    const recente = ganhoHistorico("n2", 2); // 2026-10-13
    const r = registos({ contactos: [contacto("a", "2026-10-10"), contacto("b", "2026-10-14")] });
    expect(registosParaAbordagem(r, [velho, recente], HOJE).contactos.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("emAbordagem e colunaDaPessoa: Parte 1 do Quadro", () => {
  const nova = entrada();
  it("uma pessoa nova está em abordagem, na coluna Por contactar", () => {
    expect(emAbordagem(nova, HOJE)).toBe(true);
    expect(colunaDaPessoa(nova, HOJE)).toBe("porContactar");
  });

  it("a coluna segue o registo mais avançado: contacto, depois visita", () => {
    const c = entrada({ registos: registos({ contactos: [contacto("c", "2026-10-10")] }) });
    const v = entrada({ registos: registos({ visitas: [visita("v", "2026-10-20", "porFazer")] }) });
    expect([colunaDaPessoa(c, HOJE), colunaDaPessoa(v, HOJE)]).toEqual(["contactado", "visita"]);
  });

  it("pessoa com negócio aberto sai da Parte 1, mesmo com registos por ligar (vêem-se na ficha)", () => {
    const aberto = negocio("n1", 20);
    const e = entrada({ negocios: [aberto], abertos: [aberto], registos: registos({ contactos: [contacto("c", "2026-10-14")] }) });
    expect(emAbordagem(e, HOJE)).toBe(false);
    expect(colunaDaPessoa(e, HOJE)).toBeNull();
  });

  it("depois de o negócio fechar, volta à Parte 1 com registos por ligar posteriores, ou com submissão resolvida", () => {
    const fechado = { ...negocio("n1", 10), mes: "2026-10", resultado: "perdido" as const };
    expect(emAbordagem(entrada({ negocios: [fechado] }), HOJE)).toBe(false);
    const comContacto = entrada({ negocios: [fechado], registos: registos({ contactos: [contacto("c", "2026-10-12")] }) });
    expect(emAbordagem(comContacto, HOJE)).toBe(true);
    const comSubmissao = entrada({ negocios: [fechado], pessoa: pessoa({ abordagemDesde: "2026-10-14" }) });
    expect(emAbordagem(comSubmissao, HOJE)).toBe(true);
    const submissaoAntiga = entrada({ negocios: [fechado], pessoa: pessoa({ abordagemDesde: "2026-10-01" }) });
    expect(emAbordagem(submissaoAntiga, HOJE)).toBe(false);
  });

  it("um registo anterior ao último negócio e deixado por ligar não faz a pessoa voltar", () => {
    const fechado = { ...negocio("n1", 10), mes: "2026-10", resultado: "perdido" as const };
    const e = entrada({ negocios: [fechado], registos: registos({ contactos: [contacto("c", "2026-10-02")] }) });
    expect(emAbordagem(e, HOJE)).toBe(false);
  });

  it("uma pessoa com a abordagem encerrada, ou perdida, não está em abordagem", () => {
    const encerrada = pessoa({ encerrada: { resultado: "semInteresse", motivo: "preco", data: "2026-10-10" } });
    expect(emAbordagem(entrada({ pessoa: encerrada }), HOJE)).toBe(false);
    expect(emAbordagem(entrada({ pessoa: pessoa({ perdida: { motivo: "preco", data: "2026-10-10" } }) }), HOJE)).toBe(false);
  });
});

describe("proximoPassoRegistos", () => {
  it("segue os registos: chamar, marcar visita, fechar o levantamento, criar o negócio", () => {
    const passo = (r: RegistosDaPessoa) => proximoPassoRegistos(entrada({ registos: r }), HOJE).id;
    expect(passo(registos())).toBe("registarChamada");
    expect(passo(registos({ contactos: [contacto("c", "2026-10-10")] }))).toBe("marcarVisita");
    expect(passo(registos({ visitas: [visita("v", "2026-10-20", "porFazer")] }))).toBe("fecharLevantamento");
    expect(passo(registos({ visitas: [visita("v", "2026-10-12", "feita")], levantamentos: [] }))).toBe("criarNegocio");
  });

  it("com negócio aberto manda o negócio; encerrada ou perdida não tem passo", () => {
    const aberto = negocio("n1", 3, { orcamentos: [{ id: "o", valor: 1, escolhido: true }] });
    expect(proximoPassoRegistos(entrada({ negocios: [aberto], abertos: [aberto] }), HOJE).id).toBe("criarProposta");
    const encerrada = pessoa({ encerrada: { resultado: "obraInviavel", motivo: "outro", motivoOutro: "Prédio em ruínas", data: "2026-10-10" } });
    expect(proximoPassoRegistos(entrada({ pessoa: encerrada }), HOJE)).toEqual({ id: "nenhum", prazo: null });
  });

  it("uma pessoa fora da abordagem (só negócios terminados) não tem passo", () => {
    const fechado = { ...negocio("n1", 10), mes: "2026-10", resultado: "perdido" as const };
    expect(proximoPassoRegistos(entrada({ negocios: [fechado] }), HOJE)).toEqual({ id: "nenhum", prazo: null });
  });
});

describe("próximo contacto e atraso", () => {
  it("é o mais cedo entre a chamada agendada e as visitas por fazer", () => {
    const e = entrada({
      pessoa: pessoa({ proximoContacto: "2026-10-18" }), registos: registos({ visitas: [visita("v", "2026-10-16", "porFazer"), visita("f", "2026-10-01", "feita")] }),
    });
    expect(proximoContactoRegistos(e, HOJE)).toBe("2026-10-16");
    expect(proximoContactoRegistos(entrada(), HOJE)).toBeNull();
  });

  it("uma lead com o próximo contacto anterior a hoje está atrasada; uma encerrada nunca", () => {
    const e = entrada({ pessoa: pessoa({ proximoContacto: "2026-10-10" }) });
    expect(estaAtrasadaRegistos(e, HOJE)).toBe(true);
    const encerrada = pessoa({ proximoContacto: "2026-10-10", encerrada: { resultado: "semInteresse", motivo: "preco", data: HOJE } });
    expect(estaAtrasadaRegistos(entrada({ pessoa: encerrada }), HOJE)).toBe(false);
  });
});

describe("o próximo contacto vem de uma visita?", () => {
  const comVisita = (dia: string, proximoContacto?: string, hora = "") => entrada({
    pessoa: pessoa({ proximoContacto, proximoHora: proximoContacto ? "08:00" : undefined }), registos: registos({ visitas: [visita("v", dia, "porFazer", { hora })] }),
  });

  it("é a visita quando ela é o dia mais cedo (também quando a chamada cai no mesmo dia)", () => {
    expect(proximoContactoVemDeVisitaRegistos(comVisita("2026-10-16"), HOJE)).toBe(true);
    expect(proximoContactoVemDeVisitaRegistos(comVisita("2026-10-16", "2026-10-16"), HOJE)).toBe(true);
  });

  it("não é a visita quando a chamada agendada é mais cedo, nem sem visitas, nem com a visita feita ou cancelada", () => {
    expect(proximoContactoVemDeVisitaRegistos(comVisita("2026-10-20", "2026-10-16"), HOJE)).toBe(false);
    expect(proximoContactoVemDeVisitaRegistos(entrada({ pessoa: pessoa({ proximoContacto: "2026-10-16" }) }), HOJE)).toBe(false);
    const feita = entrada({ registos: registos({ visitas: [visita("v", "2026-10-16", "feita"), visita("c", "2026-10-15", "cancelada")] }) });
    expect(proximoContactoVemDeVisitaRegistos(feita, HOJE)).toBe(false);
  });

  it("a hora do próximo contacto é a da chamada, se ela é o dia mais cedo, ou a da visita desse dia", () => {
    expect(horaDoProximoContactoRegistos(comVisita("2026-10-20", "2026-10-16"), HOJE)).toBe("08:00");
    expect(horaDoProximoContactoRegistos(comVisita("2026-10-16", undefined, "14:30"), HOJE)).toBe("14:30");
    expect(horaDoProximoContactoRegistos(comVisita("2026-10-16"), HOJE)).toBeUndefined();
    expect(horaDoProximoContactoRegistos(entrada(), HOJE)).toBeUndefined();
  });
});
