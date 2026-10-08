import { describe, expect, it } from "vitest";
import { acoes, alertas, bloqueado, conflitos, seed, tot } from "./motor";

// O fluxo da Ana Martins, da lead à obra (era o #teste do prototipo.html).
describe("protótipo de Negócios", () => {
  it("leva a Ana Martins da Lead à Obra", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const id = 1043;
    const d = () => S.deals.find((x) => x.id === id)!;

    A.contactar(id);
    expect(d().fase).toBe(1);
    A.marcarVisita(id);
    expect(d().fase).toBe(2);
    A.fecharVisita(id);
    expect(d().fase).toBe(2); // não fecha sem medidas

    Object.assign(d().visita.med, { pav: 6, par: 18, pts: 3, pcs: 4 });
    A.fecharVisita(id);
    expect(d().fase).toBe(3);

    let T = tot(d(), S);
    expect(T.custo).toBeCloseTo(2454.55, 0);
    expect(T.pf).toBeCloseTo(3606.12, 0);

    A.verificar(id);
    expect(bloqueado(d(), S)).toBe(true); // a margem do revestimento
    const al = alertas(d(), S).find((a) => a.sug)!;
    A.sugerido(id, al.i!, al.sug!);
    expect(bloqueado(d(), S)).toBe(false);
    T = tot(d(), S);

    A.enviar(id);
    A.aceitar(id);
    A.enviarContrato(id);
    A.assinar(id);
    expect(d().fase).toBe(4);
    expect(S.clientes.some((c) => c.deal === id)).toBe(true);

    A.emitir(id);
    A.validar(id);
    expect(d().fase).toBe(5);
    expect(d().obra.plano).toBeTruthy();
    expect(d().obra.mats).toBeTruthy();
    expect(conflitos(d().obra.plano!)).toHaveLength(1); // férias do Sérgio

    A.trocar(id, 2);
    expect(conflitos(d().obra.plano!)).toHaveLength(0);

    A.aprovarPlano(id);
    A.confirmarEnc(id);
    A.receberEnc(id);
    A.arrancar(id);
    expect(d().obra.plano!.estado).toBe("em curso");

    A.fimObra(id);
    expect(d().obra.real!.m).toBeLessThan(T.m);
    A.aprender(id);
    expect(S.svc.revest.h).toBeGreaterThan(0.75);
  });

  it("a Direção aprova uma exceção à margem", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const id = 1035; // Hugo Matos, visita com medidas
    A.fecharVisita(id);
    A.verificar(id);
    const d = S.deals.find((x) => x.id === id)!;
    expect(bloqueado(d, S)).toBe(true);
    A.pedirAprov(id);
    A.aprovar(id);
    expect(bloqueado(d, S)).toBe(false);
  });
});
