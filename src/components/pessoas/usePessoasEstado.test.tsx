// O estado da página «Pessoas»: as ações da pessoa escrevem REGISTOS da pessoa (contacto, visita, levantamento) e já não pedidos.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { repor as reporAlterados } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporNovos } from "@/components/negocio-metas/negociosNovos";
import { registosAtuais, repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { repor as reporPessoasNovas } from "./pessoasNovas";
import { usePessoasEstado } from "./usePessoasEstado";

const reporTudo = () => { reporRegistos(); reporPessoasNovas(); reporNovos(); reporAlterados(); };
beforeEach(() => { reporTudo(); localStorage.clear(); });
afterEach(() => { cleanup(); reporTudo(); });

const montar = () => renderHook(() => usePessoasEstado(true));
const lead = { nome: "Teresa Lobo", telefone: "912 345 678", email: "", localidade: "Braga", origem: "indicacao" as const, formulario: "", comercial: "Ana Ribeiro", nota: "" };
const resumoDe = (r: ReturnType<typeof montar>, id: string) => r.result.current.resumos.find((x) => x.pessoa.id === id)!;

function criarLead(r: ReturnType<typeof montar>): string {
  let id = "";
  act(() => { id = r.result.current.criarLead(lead).id; });
  return id;
}

describe("a página não tem pedidos", () => {
  it("o estado devolvido não traz pedidos, nem ações de pedido", () => {
    const r = montar();
    expect(r.result.current).not.toHaveProperty("pedidos");
    expect(r.result.current).not.toHaveProperty("removerPedido");
    expect(r.result.current).not.toHaveProperty("guardarPedido");
    expect(r.result.current).not.toHaveProperty("criarPedidoComVisitas");
  });

  it("a lead criada nasce na Parte 1, por contactar, sem registos", () => {
    const r = montar();
    const id = criarLead(r);
    expect(resumoDe(r, id)).toMatchObject({ etapa: "nova", parte: "abordagem", coluna: "porContactar" });
    expect(registosAtuais().contactos.filter((c) => c.pessoaId === id)).toEqual([]);
  });
});

describe("registar a chamada", () => {
  it("deixa um contacto na pessoa (por ligar) e passa-a a Contactado", () => {
    const r = montar();
    const id = criarLead(r);
    act(() => r.result.current.registarChamada(id, { resultado: "atendeuInteressado", nota: " ok ", passo: "ligarAmanha" }));
    expect(registosAtuais().contactos.filter((c) => c.pessoaId === id)).toMatchObject([{ resultado: "atendeuInteressado", nota: "ok", negocioId: null }]);
    expect(resumoDe(r, id)).toMatchObject({ etapa: "emContacto", coluna: "contactado" });
  });

  it("marcar a visita na chamada regista também a visita da pessoa", () => {
    const r = montar();
    const id = criarLead(r);
    act(() => r.result.current.registarChamada(id, {
      resultado: "atendeuInteressado", nota: "", passo: "marcarVisita", data: "2026-10-30", hora: "10:00",
      destinoVisita: { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "", localidade: "Braga", andar: "" }, notaAcesso: "" },
    }));
    const visitas = registosAtuais().visitas.filter((v) => v.pessoaId === id);
    expect(visitas).toMatchObject([{ data: "2026-10-30", hora: "10:00", estado: "porFazer", tipo: "levantamento", negocioId: null }]);
    expect(resumoDe(r, id)).toMatchObject({ etapa: "visitaMarcada", coluna: "visita" });
    expect(r.result.current.atividade.some((a) => a.pessoaId === id && a.chaveTitulo === "pessoasPagina.activity.visitBooked")).toBe(true);
  });

  it("uma chamada que não se aplica (visita sem dia) não deixa nenhum registo", () => {
    const r = montar();
    const id = criarLead(r);
    act(() => r.result.current.registarChamada(id, { resultado: "atendeuInteressado", nota: "", passo: "marcarVisita", data: "", hora: "" }));
    expect(registosAtuais().contactos.filter((c) => c.pessoaId === id)).toEqual([]);
    expect(registosAtuais().visitas.filter((v) => v.pessoaId === id)).toEqual([]);
  });

  it("sem interesse + perder encerra a abordagem: fica o resultado e o motivo na pessoa e não há negócio", () => {
    const r = montar();
    const id = criarLead(r);
    act(() => r.result.current.registarChamada(id, { resultado: "semInteresse", nota: "", passo: "perder", motivo: "preco" }));
    expect(resumoDe(r, id).pessoa.encerrada).toMatchObject({ resultado: "semInteresse", motivo: "preco" });
    expect(resumoDe(r, id)).toMatchObject({ parte: "nenhuma", semNegocio: true });
    expect(registosAtuais().contactos.filter((c) => c.pessoaId === id)).toHaveLength(1);
  });
});

describe("a visita", () => {
  it("marcar a visita regista-a na pessoa e conta como contacto; alterá-la muda o dia e a hora", () => {
    const r = montar();
    const id = criarLead(r);
    const destino = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "", localidade: "Braga", andar: "" }, notaAcesso: "" };
    act(() => r.result.current.marcarVisita(id, { data: "2026-10-30", hora: "10:00", nota: "", destino }));
    const [v] = registosAtuais().visitas.filter((x) => x.pessoaId === id);
    expect(v).toMatchObject({ estado: "porFazer", data: "2026-10-30" });
    act(() => r.result.current.alterarVisita(v.id, { data: "2026-11-02", hora: "15:30", destino }));
    expect(registosAtuais().visitas.find((x) => x.id === v.id)).toMatchObject({ data: "2026-11-02", hora: "15:30" });
    expect(resumoDe(r, id).registos.visitas[0]).toMatchObject({ data: "2026-11-02", hora: "15:30" });
  });

  it("guardar a visita feita e o levantamento escreve na pessoa; a visita feita pede criar o negócio", () => {
    const r = montar();
    const id = criarLead(r);
    const destino = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "", localidade: "Braga", andar: "" }, notaAcesso: "" };
    act(() => r.result.current.marcarVisita(id, { data: "2026-10-30", hora: "10:00", nota: "", destino }));
    const [v] = registosAtuais().visitas.filter((x) => x.pessoaId === id);
    act(() => r.result.current.guardarRegistos(id, {
      visitas: [{ ...v, estado: "feita" }], levantamento: { linhas: [], observacoes: "Parede torta", respostas: {} }, comercial: "Ana Ribeiro",
    }));
    expect(registosAtuais().visitas.find((x) => x.id === v.id)?.estado).toBe("feita");
    expect(registosAtuais().levantamentos.filter((l) => l.pessoaId === id)).toHaveLength(1);
    expect(resumoDe(r, id).proximo?.id).toBe("criarNegocio");
    expect(r.result.current.atividade.filter((a) => a.pessoaId === id).map((a) => a.chaveTitulo)).toContain("pessoasPagina.process.activity.visitMarkedDone");
  });

  it("o resultado «interessado» ou «a pensar» fica na visita e a abordagem segue", () => {
    const r = montar();
    const id = criarLead(r);
    const destino = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "", localidade: "Braga", andar: "" }, notaAcesso: "" };
    act(() => r.result.current.marcarVisita(id, { data: "2026-10-30", hora: "", nota: "", destino }));
    const [v] = registosAtuais().visitas.filter((x) => x.pessoaId === id);
    act(() => r.result.current.registarResultadoVisita(v.id, { resultado: "aPensar" }));
    expect(registosAtuais().visitas.find((x) => x.id === v.id)?.resultado).toBe("aPensar");
    expect(resumoDe(r, id).pessoa.encerrada).toBeUndefined();
  });

  it("o resultado «sem interesse» ou «obra inviável» encerra a abordagem, com o motivo, e não cria negócio", () => {
    const r = montar();
    const id = criarLead(r);
    const destino = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "", localidade: "Braga", andar: "" }, notaAcesso: "" };
    act(() => r.result.current.marcarVisita(id, { data: "2026-10-30", hora: "", nota: "", destino }));
    const [v] = registosAtuais().visitas.filter((x) => x.pessoaId === id);
    act(() => r.result.current.registarResultadoVisita(v.id, { resultado: "obraInviavel", motivo: "outro", motivoOutro: "Prédio em ruínas" }));
    expect(registosAtuais().visitas.find((x) => x.id === v.id)?.resultado).toBe("obraInviavel");
    expect(resumoDe(r, id).pessoa.encerrada).toMatchObject({ resultado: "obraInviavel", motivo: "outro", motivoOutro: "Prédio em ruínas" });
    expect(resumoDe(r, id).abertos).toEqual([]);
  });

  it("um resultado que encerra sem motivo não grava nada", () => {
    const r = montar();
    const id = criarLead(r);
    const destino = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "", localidade: "Braga", andar: "" }, notaAcesso: "" };
    act(() => r.result.current.marcarVisita(id, { data: "2026-10-30", hora: "", nota: "", destino }));
    const [v] = registosAtuais().visitas.filter((x) => x.pessoaId === id);
    act(() => r.result.current.registarResultadoVisita(v.id, { resultado: "semInteresse" }));
    expect(registosAtuais().visitas.find((x) => x.id === v.id)?.resultado).toBeUndefined();
    expect(resumoDe(r, id).pessoa.encerrada).toBeUndefined();
  });
});

describe("encerrar e reativar a abordagem", () => {
  it("encerrar tira a pessoa da Parte 1 e reativar volta a pô-la, com a linha na atividade", () => {
    const r = montar();
    const id = criarLead(r);
    act(() => r.result.current.encerrar(id, { resultado: "semInteresse", motivo: "preco" }));
    expect(resumoDe(r, id).parte).toBe("nenhuma");
    act(() => r.result.current.reativar(id));
    expect(resumoDe(r, id).pessoa.encerrada).toBeUndefined();
    expect(resumoDe(r, id).parte).toBe("abordagem");
  });
});

describe("adiar", () => {
  it("com o próximo contacto numa visita por fazer não muda nada; com uma chamada agendada adia", () => {
    const r = montar();
    const id = criarLead(r);
    const destino = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "", localidade: "Braga", andar: "" }, notaAcesso: "" };
    act(() => r.result.current.adiar(id, 3));
    expect(resumoDe(r, id).pessoa.proximoContacto).toBe("2026-10-16");
    act(() => r.result.current.marcarVisita(id, { data: "2026-10-14", hora: "", nota: "", destino }));
    act(() => r.result.current.adiar(id, 7));
    expect(resumoDe(r, id).pessoa.proximoContacto).toBe("2026-10-16");
  });
});
