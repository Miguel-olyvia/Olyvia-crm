// Marcar uma visita A PARTIR DE UM NEGÓCIO no exemplo (memória): a visita nasce ligada a ele e aparece nos seus registos. Só a mesma pessoa
// liga registos seus, e um negócio fechado não recebe nada. O levantamento não mostra a visita; a visita diz que houve levantamento.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registosDoNegocio } from "@/components/negocio-metas/acoesRegistos";
import { repor as reporAlterados } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporNovos } from "@/components/negocio-metas/negociosNovos";
import { registosAtuais, repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { repor as reporPessoasNovas } from "./pessoasNovas";
import { usePessoasEstado } from "./usePessoasEstado";

const reporTudo = () => { reporRegistos(); reporPessoasNovas(); reporNovos(); reporAlterados(); };
beforeEach(() => { reporTudo(); localStorage.clear(); });
afterEach(() => { cleanup(); reporTudo(); });

const montar = () => renderHook(() => usePessoasEstado(true));
const destino = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "", localidade: "Braga", andar: "" }, notaAcesso: "" };
const dados = { data: "2026-12-30", hora: "10:00", nota: "", destino };

/** Duas pessoas que não perderam nem encerraram, ambas com um negócio aberto. */
function duasComNegocio(r: ReturnType<typeof montar>) {
  const com = r.result.current.resumos.filter((x) => x.abertos.length > 0 && !x.pessoa.perdida && !x.pessoa.encerrada);
  return { a: com[0], b: com[1] };
}

describe("marcarVisita diz se a visita ficou onde se pediu", () => {
  it("liga ao negócio aberto da pessoa: devolve true", () => {
    const r = montar();
    const { a } = duasComNegocio(r);
    let ligou: unknown;
    act(() => { ligou = r.result.current.marcarVisita(a.pessoa.id, dados, a.abertos[0].id); });
    expect(ligou).toBe(true);
  });

  it("sem negócio pedido: não há ligação a falhar (true)", () => {
    const r = montar();
    const { a } = duasComNegocio(r);
    let ligou: unknown;
    act(() => { ligou = r.result.current.marcarVisita(a.pessoa.id, dados); });
    expect(ligou).toBe(true);
  });

  it("negócio recusado (de outra pessoa ou inexistente): a visita fica registada por ligar e devolve false", () => {
    const r = montar();
    const { a, b } = duasComNegocio(r);
    let deOutra: unknown;
    let inexistente: unknown;
    act(() => { deOutra = r.result.current.marcarVisita(a.pessoa.id, dados, b.abertos[0].id); });
    act(() => { inexistente = r.result.current.marcarVisita(a.pessoa.id, { ...dados, data: "2026-12-31" }, "nao-existe"); });
    expect(deOutra).toBe(false);
    expect(inexistente).toBe(false);
    const novas = registosAtuais().visitas.filter((v) => v.pessoaId === a.pessoa.id && v.data >= "2026-12-30");
    expect(novas).toHaveLength(2);
    expect(novas.every((v) => v.negocioId === null)).toBe(true);
  });
});

describe("marcar visita a partir do negócio", () => {
  it("a visita fica ligada ao negócio e aparece nos registos dele", () => {
    const r = montar();
    const { a } = duasComNegocio(r);
    const negocio = a.abertos[0];
    act(() => r.result.current.marcarVisita(a.pessoa.id, dados, negocio.id));
    const nova = registosAtuais().visitas.find((v) => v.pessoaId === a.pessoa.id && v.data === "2026-12-30");
    expect(nova).toMatchObject({ negocioId: negocio.id, estado: "porFazer", hora: "10:00" });
    expect(registosDoNegocio(registosAtuais(), negocio.id).visitas.map((v) => v.id)).toContain(nova?.id);
  });

  it("sem negócio, a visita fica por ligar, como sempre", () => {
    const r = montar();
    const { a } = duasComNegocio(r);
    act(() => r.result.current.marcarVisita(a.pessoa.id, dados));
    expect(registosAtuais().visitas.find((v) => v.pessoaId === a.pessoa.id && v.data === "2026-12-30")?.negocioId).toBeNull();
  });

  it("não liga a visita a um negócio de OUTRA pessoa: fica por ligar", () => {
    const r = montar();
    const { a, b } = duasComNegocio(r);
    act(() => r.result.current.marcarVisita(a.pessoa.id, dados, b.abertos[0].id));
    const nova = registosAtuais().visitas.find((v) => v.pessoaId === a.pessoa.id && v.data === "2026-12-30");
    expect(nova?.negocioId).toBeNull();
    expect(registosDoNegocio(registosAtuais(), b.abertos[0].id).visitas.map((v) => v.id)).not.toContain(nova?.id);
  });

  it("não liga a visita a um negócio fechado: fica por ligar", () => {
    const r = montar();
    const fechado = r.result.current.resumos.flatMap((x) => x.negocios.filter((n) => !x.abertos.includes(n as never)).map((n) => ({ x, n })))
      .find(({ x }) => !x.pessoa.perdida && !x.pessoa.encerrada);
    expect(fechado).toBeDefined();
    const { x, n } = fechado!;
    act(() => r.result.current.marcarVisita(x.pessoa.id, dados, n.id));
    const nova = registosAtuais().visitas.find((v) => v.pessoaId === x.pessoa.id && v.data === "2026-12-30");
    expect(nova?.negocioId).toBeNull();
  });

  it("um negócio que não existe também não recebe a visita", () => {
    const r = montar();
    const { a } = duasComNegocio(r);
    act(() => r.result.current.marcarVisita(a.pessoa.id, dados, "negocio-que-nao-existe"));
    expect(registosAtuais().visitas.find((v) => v.pessoaId === a.pessoa.id && v.data === "2026-12-30")?.negocioId).toBeNull();
  });
});
