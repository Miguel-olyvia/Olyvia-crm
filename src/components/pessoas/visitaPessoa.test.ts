import { describe, expect, it } from "vitest";
import type { EstadoAcoes } from "./acoesPessoa";
import { registarChamada, adiar } from "./acoesPessoa";
import { MORADA_VISITA_VAZIA, destinoInicial } from "./moradaVisita";
import type { Pessoa } from "./pessoasTipos";
import { alterarVisita, concluirVisita, marcarVisita, validarVisita, type DadosVisita } from "./visitaPessoa";

const HOJE = "2026-10-13";
const MORADA = { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" };
const pessoa = (id: string, extra: Partial<Pessoa> = {}): Pessoa => ({
  id, nome: id, contacto: { telefone: null, email: null }, comercial: "Ana Ribeiro", origem: "site", viaEntrada: "formulario", saude: 50,
  etapa: "emContacto", ultimoContactoDias: 9, morada: MORADA, ...extra,
});
const estado = (pessoas: Pessoa[] = [pessoa("a")]): EstadoAcoes => ({ pessoas, atividade: [], contactadas: [] });
const dados = (extra: Partial<DadosVisita> = {}): DadosVisita => ({ data: "2026-10-20", hora: "10:30", nota: "", servico: "Cozinha", ...extra });
const outraMorada = { igualALead: false, outra: { ...MORADA_VISITA_VAZIA, rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga" }, notaAcesso: "Portão azul" };

describe("marcarVisita: a morada da visita", () => {
  it("sem escolha, a visita é na morada da lead e fica marcada como igual", () => {
    const p = marcarVisita(estado(), "a", dados(), HOJE).pessoas[0];
    expect(p.visita).toMatchObject({
      data: "2026-10-20", hora: "10:30", comercial: "Ana Ribeiro", igualALead: true,
      moradaVisita: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa" },
    });
    expect(p.etapa).toBe("visitaMarcada");
    expect(p.morada).toEqual(MORADA);
  });

  it("outra morada: guarda-a na visita, com a nota de acesso, e a morada da lead não muda", () => {
    const novo = marcarVisita(estado(), "a", dados({ destino: outraMorada }), HOJE);
    expect(novo.pessoas[0].visita).toMatchObject({ igualALead: false, moradaVisita: { rua: "Rua B 2", localidade: "Braga" }, notaAcesso: "Portão azul" });
    expect(novo.pessoas[0].morada).toEqual(MORADA);
    expect(novo.atividade[0].detalhe).toContain("Rua B 2, 4700-010 Braga");
  });

  it("outra morada sem rua, ou com código postal mal escrito, não marca nada; sem morada da lead exige a rua", () => {
    const antes = estado();
    expect(marcarVisita(antes, "a", dados({ destino: { ...outraMorada, outra: { ...outraMorada.outra, rua: "" } } }), HOJE)).toBe(antes);
    expect(marcarVisita(antes, "a", dados({ destino: { ...outraMorada, outra: { ...outraMorada.outra, codigoPostal: "47" } } }), HOJE)).toBe(antes);
    const semMorada = estado([pessoa("a", { morada: undefined })]);
    expect(marcarVisita(semMorada, "a", dados({ destino: destinoInicial(null) }), HOJE)).toBe(semMorada);
  });

  it("validarVisita valida a morada depois do dia, da hora e da nota", () => {
    expect(validarVisita({ ...dados(), destino: outraMorada }, HOJE, null)).toBeNull();
    expect(validarVisita({ ...dados({ data: "" }), destino: { ...outraMorada, outra: MORADA_VISITA_VAZIA } }, HOJE, null)).toBe("dataVazia");
    expect(validarVisita({ ...dados(), destino: { ...outraMorada, outra: MORADA_VISITA_VAZIA } }, HOJE, null)).toBe("ruaVazia");
  });
});

describe("registarChamada com visita", () => {
  const chamada = { resultado: "atendeuInteressado", nota: "", passo: "marcarVisita", data: "2026-10-16", hora: "09:30", hoje: HOJE } as const;
  it("a morada da visita escolhida na chamada fica na visita e na linha da atividade", () => {
    const novo = registarChamada(estado(), "a", { ...chamada, destinoVisita: outraMorada });
    expect(novo.pessoas[0].visita).toMatchObject({ igualALead: false, moradaVisita: { rua: "Rua B 2" } });
    expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.visitBooked", detalhe: "16/10 · 09:30 · Rua B 2, 4700-010 Braga" });
  });
  it("na morada da lead: a atividade mostra a morada da lead; uma outra morada inválida não grava nada", () => {
    const igual = registarChamada(estado(), "a", { ...chamada, destinoVisita: destinoInicial({ rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" }) });
    expect(igual.pessoas[0].visita?.igualALead).toBe(true);
    expect(igual.atividade[0].detalhe).toBe("16/10 · 09:30 · Rua A 1, 1000-001 Lisboa");
    const antes = estado();
    expect(registarChamada(antes, "a", { ...chamada, destinoVisita: { ...outraMorada, outra: MORADA_VISITA_VAZIA } })).toBe(antes);
  });
});

describe("alterarVisita", () => {
  const marcada = () => marcarVisita(estado(), "a", dados(), HOJE);
  it("a nova morada, o dia e a hora passam a valer, e fica registado", () => {
    const novo = alterarVisita(marcada(), "a", { data: "2026-10-22", hora: "14:00", destino: outraMorada }, HOJE);
    expect(novo.pessoas[0].visita).toMatchObject({ data: "2026-10-22", hora: "14:00", igualALead: false, moradaVisita: { rua: "Rua B 2" }, notaAcesso: "Portão azul" });
    expect(novo.pessoas[0]).toMatchObject({ proximoContacto: "2026-10-22", proximoHora: "14:00" });
    expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.visitChanged" });
    expect(novo.atividade[0].detalhe).toContain("Rua B 2");
  });
  it("voltar à morada da lead tira a nota de acesso", () => {
    const outra = alterarVisita(marcada(), "a", { data: "2026-10-22", hora: "", destino: outraMorada }, HOJE);
    const igual = alterarVisita(outra, "a", { data: "2026-10-22", hora: "", destino: destinoInicial({ rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" }) }, HOJE);
    expect(igual.pessoas[0].visita).toMatchObject({ igualALead: true });
    expect(igual.pessoas[0].visita).not.toHaveProperty("notaAcesso");
  });
  it("sem visita, dia no passado ou morada inválida, o estado fica como está", () => {
    const sem = estado();
    expect(alterarVisita(sem, "a", { data: "2026-10-22", hora: "", destino: outraMorada }, HOJE)).toBe(sem);
    const com = marcada();
    expect(alterarVisita(com, "a", { data: "2026-10-01", hora: "", destino: outraMorada }, HOJE)).toBe(com);
    expect(alterarVisita(com, "a", { data: "2026-10-22", hora: "", destino: { ...outraMorada, outra: MORADA_VISITA_VAZIA } }, HOJE)).toBe(com);
  });
});

describe("concluirVisita", () => {
  it("a visita sai da ficha, o próximo contacto que era a visita fica vazio e a atividade regista-o", () => {
    const novo = concluirVisita(marcarVisita(estado(), "a", dados({ destino: outraMorada }), HOJE), "a", HOJE);
    expect(novo.pessoas[0].visita).toBeUndefined();
    expect(novo.pessoas[0]).toMatchObject({ proximoContacto: null, ultimoContactoDias: 0 });
    expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.visitDone" });
    expect(novo.atividade[0].detalhe).toContain("Rua B 2");
  });
  it("se o próximo contacto já era outro, mantém-no; sem visita ou perdida, não muda nada", () => {
    const comLigacao = adiar(marcarVisita(estado(), "a", dados(), HOJE), "a", 7, HOJE);
    expect(comLigacao.pessoas[0].visita?.data).toBe("2026-10-20");
    const com = estado([pessoa("a", { visita: { data: "2026-10-20", hora: "", comercial: "Ana Ribeiro", igualALead: true, moradaVisita: MORADA_VISITA_VAZIA }, proximoContacto: "2026-10-25" })]);
    expect(concluirVisita(com, "a", HOJE).pessoas[0].proximoContacto).toBe("2026-10-25");
    const sem = estado();
    expect(concluirVisita(sem, "a", HOJE)).toBe(sem);
    expect(concluirVisita(sem, "x", HOJE)).toBe(sem);
  });
  it("uma ficha antiga na etapa 'Com visita' também se conclui", () => {
    const antiga = estado([pessoa("a", { etapa: "visitaMarcada", proximoContacto: "2026-10-14" })]);
    const novo = concluirVisita(antiga, "a", HOJE);
    expect(novo.pessoas[0].proximoContacto).toBeNull();
    expect(novo.atividade).toHaveLength(1);
  });
});
