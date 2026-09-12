/**
 * `bucketDePermissao`/`periodoDecorrido` tem de espelhar EXACTAMENTE
 * `public.hr_periodo_decorrido(date)` (20261130060000): NULL ou uma data de
 * hoje/futuro nao e decorrido (ALTERAR, `.edit`); so um `valido_ate`
 * estritamente anterior a hoje o e (CORRIGIR, `.corrigir`). Um desvio aqui
 * faz o ecra mostrar o botao errado -- ou pior, deixar submeter um pedido que
 * a base ia sempre recusar.
 */
import { describe, it, expect } from "vitest";
import {
  bucketDePermissao,
  dataDeHojeISO,
  diaSeguinte,
  ehErroNomeado,
  estaEmAberto,
  ordenarAfectacoes,
  periodoDecorrido,
} from "@/lib/hr/afectacoes";
import type { PessoaAfectacao } from "@/types/hr";

function linha(parciais: Partial<PessoaAfectacao>): PessoaAfectacao {
  return {
    id: "a1",
    pessoa_id: "p1",
    organization_id: "org",
    vinculo_id: null,
    local_id: "l1",
    valido_de: "2026-01-01",
    valido_ate: null,
    motivo: null,
    origem: "declarada",
    confirmada_por: null,
    confirmada_em: null,
    ...parciais,
  };
}

describe("periodoDecorrido / bucketDePermissao", () => {
  it("null nao e decorrido -- ALTERAR", () => {
    expect(periodoDecorrido(null)).toBe(false);
    expect(bucketDePermissao(null)).toBe("editar");
  });

  it("hoje nao e decorrido -- ALTERAR", () => {
    const hoje = dataDeHojeISO();
    expect(periodoDecorrido(hoje)).toBe(false);
    expect(bucketDePermissao(hoje)).toBe("editar");
  });

  it("uma data futura nao e decorrida -- ALTERAR", () => {
    expect(periodoDecorrido("2999-01-01")).toBe(false);
    expect(bucketDePermissao("2999-01-01")).toBe("editar");
  });

  it("uma data passada E decorrida -- CORRIGIR", () => {
    expect(periodoDecorrido("2000-01-01")).toBe(true);
    expect(bucketDePermissao("2000-01-01")).toBe("corrigir");
  });
});

describe("estaEmAberto", () => {
  it("valido_ate null esta em aberto", () => {
    expect(estaEmAberto(linha({ valido_ate: null }))).toBe(true);
  });

  it("valido_ate preenchido nao esta em aberto, mesmo no futuro", () => {
    expect(estaEmAberto(linha({ valido_ate: "2999-01-01" }))).toBe(false);
  });
});

describe("ordenarAfectacoes", () => {
  it("poe as em aberto primeiro, e ordena o resto por inicio mais recente", () => {
    const aberta = linha({ id: "aberta", valido_de: "2020-01-01", valido_ate: null });
    const antiga = linha({ id: "antiga", valido_de: "2019-01-01", valido_ate: "2019-06-01" });
    const recente = linha({ id: "recente", valido_de: "2021-01-01", valido_ate: "2021-06-01" });

    const ordenadas = ordenarAfectacoes([antiga, recente, aberta]);

    expect(ordenadas.map((a) => a.id)).toEqual(["aberta", "recente", "antiga"]);
  });
});

describe("diaSeguinte", () => {
  it("avanca um dia dentro do mesmo mes", () => {
    expect(diaSeguinte("2026-03-10")).toBe("2026-03-11");
  });

  it("atravessa a fronteira do mes", () => {
    expect(diaSeguinte("2026-01-31")).toBe("2026-02-01");
  });

  it("atravessa a fronteira do ano", () => {
    expect(diaSeguinte("2026-12-31")).toBe("2027-01-01");
  });
});

describe("ehErroNomeado", () => {
  it("reconhece o erro nomeado pelo prefixo da mensagem", () => {
    const erro = { message: "afectacao_tem_horario_a_frente: ha 2 blocos depois de 2026-03-01." };
    expect(ehErroNomeado(erro, "afectacao_tem_horario_a_frente")).toBe(true);
    expect(ehErroNomeado(erro, "afectacao_sobreposta")).toBe(false);
  });

  it("nao rebenta com um erro sem mensagem, ou sem forma nenhuma", () => {
    expect(ehErroNomeado(null, "afectacao_sobreposta")).toBe(false);
    expect(ehErroNomeado({}, "afectacao_sobreposta")).toBe(false);
    expect(ehErroNomeado("texto solto", "afectacao_sobreposta")).toBe(false);
  });
});
