import { describe, expect, it } from "vitest";
import { diaAnterior, planearGravacao, validoAteDeDesligar, vigentesPorPessoa } from "@/lib/hr/colocacoesOrganizacao";
import type { PessoaColocacaoOrganograma } from "@/types/hr";

const linha = (o: Partial<PessoaColocacaoOrganograma>): PessoaColocacaoOrganograma => ({
  id: "c1", pessoa_id: "p1", organization_id: "o1", organograma_node_id: "n1",
  valido_de: "2026-01-01", valido_ate: null, motivo: null, ...o,
});

describe("diaAnterior", () => {
  it("recua um dia, mesmo na viragem de mes e de ano", () => {
    expect(diaAnterior("2026-03-01")).toBe("2026-02-28");
    expect(diaAnterior("2026-01-01")).toBe("2025-12-31");
  });
});

describe("vigentesPorPessoa", () => {
  const hoje = "2026-10-26";

  it("escolhe a linha em vigor de cada pessoa", () => {
    const m = vigentesPorPessoa([linha({ id: "a" }), linha({ id: "b", pessoa_id: "p2" })], hoje);
    expect(m.get("p1")?.id).toBe("a");
    expect(m.get("p2")?.id).toBe("b");
  });

  it("ignora o que ja terminou e o que ainda nao comecou", () => {
    const m = vigentesPorPessoa(
      [linha({ id: "velha", valido_ate: "2026-06-30" }), linha({ id: "futura", valido_de: "2026-11-01" })],
      hoje,
    );
    expect(m.size).toBe(0);
  });

  it("um fim igual a hoje ainda esta em vigor", () => {
    expect(vigentesPorPessoa([linha({ valido_ate: hoje })], hoje).get("p1")).toBeDefined();
  });

  it("com duas em vigor fica a que comecou mais tarde", () => {
    const m = vigentesPorPessoa([linha({ id: "a", valido_de: "2026-01-01" }), linha({ id: "b", valido_de: "2026-05-01" })], hoje);
    expect(m.get("p1")?.id).toBe("b");
  });

  it("lista vazia dá mapa vazio", () => {
    expect(vigentesPorPessoa([], hoje).size).toBe(0);
  });
});

describe("planearGravacao", () => {
  it("sem linha em vigor so cria (ligar)", () => {
    expect(planearGravacao(null, "2026-10-26")).toEqual({ tipo: "ligar", fechar: null });
  });

  it("com linha em vigor fecha-a na vespera e cria a nova (alterar)", () => {
    const p = planearGravacao(linha({ id: "x", valido_de: "2026-01-01" }), "2026-10-26");
    expect(p).toEqual({ tipo: "alterar", fechar: { id: "x", validoAte: "2026-10-25" } });
  });

  it("recusa um inicio que nao e posterior ao da linha em vigor", () => {
    expect(planearGravacao(linha({ valido_de: "2026-10-26" }), "2026-10-26")).toEqual({ erro: "inicioNaoPosterior" });
    expect(planearGravacao(linha({ valido_de: "2026-10-26" }), "2026-10-01")).toEqual({ erro: "inicioNaoPosterior" });
  });
});

describe("validoAteDeDesligar", () => {
  const hoje = "2026-10-26";

  it("fecha na vespera, para a pessoa deixar de estar em vigor ja hoje", () => {
    const fechada = linha({ valido_de: "2026-01-01", valido_ate: validoAteDeDesligar("2026-01-01", hoje) });
    expect(fechada.valido_ate).toBe("2026-10-25");
    expect(vigentesPorPessoa([fechada], hoje).size).toBe(0);
  });

  it("numa ligacao que comecou hoje fecha no proprio dia (valido_ate nunca antes de valido_de)", () => {
    expect(validoAteDeDesligar(hoje, hoje)).toBe(hoje);
  });
});
