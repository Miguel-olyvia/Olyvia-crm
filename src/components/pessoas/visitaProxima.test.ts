import { describe, expect, it } from "vitest";
import { MORADA_VISITA_VAZIA } from "./moradaVisita";
import { PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { Pessoa, VisitaPessoa } from "./pessoasTipos";
import { diaDaSemana, proximaVisita, valoresIniciaisDaVisita, visitaDaPessoa } from "./visitaProxima";

const HOJE = "2026-10-13";
const MORADA = { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" };
const pessoa = (extra: Partial<Pessoa> = {}): Pessoa => ({
  id: "a", nome: "A", contacto: { telefone: null, email: null }, comercial: "Ana Ribeiro", origem: "site", viaEntrada: "formulario", saude: 50,
  etapa: "emContacto", ultimoContactoDias: 9, morada: MORADA, ...extra,
});
const visita = (extra: Partial<VisitaPessoa> = {}): VisitaPessoa => ({
  data: "2026-10-20", hora: "10:30", comercial: "Bruno Costa", igualALead: false,
  moradaVisita: { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "Loja" }, ...extra,
});

describe("proximaVisita", () => {
  it("sem visita (ou sem etapa Com visita) não há bloco", () => {
    expect(proximaVisita(pessoa(), "emContacto", HOJE)).toBeNull();
    expect(proximaVisita(pessoa({ etapa: "visitaMarcada" }), "visitaMarcada", HOJE)).toBeNull();
  });
  it("com visita à frente (ou hoje) está marcada; com o dia passado fica por concluir", () => {
    expect(proximaVisita(pessoa({ visita: visita() }), "visitaMarcada", HOJE)).toMatchObject({ estado: "marcada", data: "2026-10-20" });
    expect(proximaVisita(pessoa({ visita: visita({ data: HOJE }) }), "cliente", HOJE)?.estado).toBe("marcada");
    expect(proximaVisita(pessoa({ visita: visita({ data: "2026-10-12" }) }), "visitaMarcada", HOJE)?.estado).toBe("porConcluir");
  });
  it("vale também para clientes com visita marcada; uma perdida não tem visita", () => {
    expect(proximaVisita(pessoa({ visita: visita() }), "cliente", HOJE)).not.toBeNull();
    expect(proximaVisita(pessoa({ visita: visita(), perdida: { motivo: "preco", data: HOJE } }), "visitaMarcada", HOJE)).toBeNull();
  });
  it("uma ficha antiga na etapa Com visita usa o próximo contacto e a morada da lead (igual)", () => {
    const v = proximaVisita(pessoa({ etapa: "visitaMarcada", proximoContacto: "2026-10-15", proximoHora: "09:00" }), "visitaMarcada", HOJE);
    expect(v).toMatchObject({ data: "2026-10-15", hora: "09:00", igualALead: true, moradaVisita: { rua: "Rua A 1", localidade: "Lisboa" } });
    const sem = proximaVisita(pessoa({ etapa: "visitaMarcada", proximoContacto: "2026-10-15", morada: undefined }), "visitaMarcada", HOJE);
    expect(sem).toMatchObject({ igualALead: false, moradaVisita: MORADA_VISITA_VAZIA });
  });
  it("visitaDaPessoa dá a visita sem estado", () => {
    expect(visitaDaPessoa(pessoa({ visita: visita() }), "visitaMarcada")).toEqual(visita());
    expect(visitaDaPessoa(pessoa(), "emContacto")).toBeNull();
  });
});

describe("diaDaSemana", () => {
  it("0 é domingo e 6 é sábado, sem depender do fuso", () => {
    expect(diaDaSemana("2026-10-13")).toBe(2);
    expect(diaDaSemana("2026-10-18")).toBe(0);
    expect(diaDaSemana("2026-10-17")).toBe(6);
  });
});

describe("valoresIniciaisDaVisita", () => {
  it("traz a pessoa, o comercial da visita e a aba Visita (data, quem fez, Feito) com a morada da VISITA como morada da obra", () => {
    const p = pessoa();
    const v = valoresIniciaisDaVisita(p, visita());
    expect(v).toEqual({
      pessoaId: "a", comercial: "Bruno Costa",
      visita: {
        data: "2026-10-20", quemFez: "Bruno Costa", estado: "feito", igualALead: false, hora: "10:30",
        moradaObra: { rua: "Rua B 2", codigoPostal: "4700-010", localidade: "Braga", andar: "Loja" },
      },
    });
    expect(v.visita?.moradaObra.rua).not.toBe(p.morada?.linha);
  });
  it("visita igual à da lead: a origem diz igual e a morada da obra é a da lead", () => {
    const v = valoresIniciaisDaVisita(pessoa(), visita({ igualALead: true, moradaVisita: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" } }));
    expect(v.visita).toMatchObject({ igualALead: true, moradaObra: { rua: "Rua A 1", codigoPostal: "1000-001" } });
  });
  it("não partilha o objeto da morada com a visita (copiar, não referir)", () => {
    const vis = visita();
    expect(valoresIniciaisDaVisita(pessoa(), vis).visita?.moradaObra).not.toBe(vis.moradaVisita);
  });
});

describe("pessoas de exemplo com visita", () => {
  const resolvida = (id: string) => {
    const p = PESSOAS_EXEMPLO.find((x) => x.id === id)!;
    return proximaVisita(p, p.etapa, HOJE);
  };
  it("uma com a morada igual à da lead, uma com outra morada e uma por concluir no passado", () => {
    expect(resolvida("p-rita")).toMatchObject({ estado: "marcada", igualALead: true });
    expect(resolvida("p-paulo")).toMatchObject({ estado: "marcada", igualALead: false });
    expect(resolvida("p-goncalo")).toMatchObject({ estado: "porConcluir", igualALead: false });
  });
});
