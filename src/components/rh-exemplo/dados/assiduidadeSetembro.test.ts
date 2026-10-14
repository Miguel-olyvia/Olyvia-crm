// O gerador da assiduidade de exemplo: deterministico, um registo coerente por dia, e Setembro completo para
// todas as pessoas, ligado aos stores que a interface usa (sem duplicar nem partir os totais).
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { feriadoDe } from "@/components/rh-exemplo/calendarioPessoa/feriados";
import { montarMes } from "@/components/rh-exemplo/calendarioPessoa/montarMes";
import { entradaMesDaFicha } from "@/components/rh-exemplo/calendarioPessoa/fonteMes";
import { totaisDoMes } from "@/components/rh-exemplo/calendarioPessoa/totaisMes";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { lerFluxosB, reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { lerGestao, reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { lerFluxosC, reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { calcularMes, entradaSalarioDaFicha, fichasDoCalculo } from "@/components/rh-exemplo/fluxosC/salarioEntrada";
import { versaoEmVigor } from "@/components/rh-exemplo/lib/horarioTipos";
import { useAssiduidadeDaOrganizacao } from "@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao";
import { gerarPessoa, saidaGeradaDe } from "./assiduidadeSetembro";
import { configDaPessoa } from "./horariosIniciaisB";

beforeEach(() => {
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
});

const SETEMBRO = (d: string): boolean => d.startsWith("2026-09");
const tipoDe = (id: string): string | undefined => {
  const h = lerFluxosB().horarios[id];
  return h ? versaoEmVigor(h, "2026-09-15")?.config.tipo : undefined;
};
const mesDaPessoa = (id: string, ano: number, mes: number) => {
  const ficha = lerEstado().fichas[id];
  const fonte = { gestao: lerGestao(), fluxosB: lerFluxosB(), fluxosC: lerFluxosC(), tiposAusencia: lerEstado().tiposAusencia, locais: lerEstado().locais, hoje: new Date().toISOString().slice(0, 10) };
  return montarMes(entradaMesDaFicha(ficha, ano, mes, fonte));
};

describe("o gerador e puro e deterministico", () => {
  it("as mesmas entradas dao exactamente os mesmos dados, duas vezes", () => {
    const e = lerEstado();
    const ficha = e.fichas["p-sofia"];
    const entrada = {
      pessoaId: "p-sofia", organizationId: ficha.pessoa.organization_id, vinculoId: "vin-p-sofia", localId: ficha.horarioPlaneado[0]?.local_id ?? null,
      config: configDaPessoa("p-sofia", ficha.horarioPlaneado, 40), excecoes: lerFluxosB().horarios["p-sofia"].excecoes,
      contrato: { desde: ficha.pessoa.data_admissao as string, ate: null }, ausencias: new Map(), hoje: "2026-10-14", decididoPor: "p-sofia", decididoPorNome: "Sofia Rebelo",
    };
    expect(gerarPessoa(entrada)).toEqual(gerarPessoa(entrada));
    expect(JSON.stringify(gerarPessoa(entrada))).toBe(JSON.stringify(gerarPessoa({ ...entrada })));
  });
});

describe("Setembro de 2026 esta preenchido para as 13 pessoas (e as 5 em admissao ainda nao comecaram)", () => {
  it("ha pelo menos uma pessoa de cada tipo de horario", () => {
    const tipos = new Set(lerEstado().ordem.map(tipoDe));
    for (const tipo of ["padrao", "repartido", "isencao", "livre", "banco"]) expect(tipos.has(tipo)).toBe(true);
    // As 13 de sempre mais as 5 que estao em admissao (so aparecem na lista; nao tem registos nem entram no Calculo).
    expect(lerEstado().ordem).toHaveLength(13 + 5);
  });

  it("cada dia previsto tem exactamente um desfecho coerente: feito, falta, ausencia, folga do banco ou isencao", () => {
    for (const id of lerEstado().ordem) {
      const dias = mesDaPessoa(id, 2026, 9);
      expect(dias).toHaveLength(30);
      for (const d of dias.filter((x) => x.previsto.kind === "trabalha" && x.previsto.tipo !== "isencao")) {
        const desfechos = [
          d.feitoMin > 0 || d.feitos.length > 0,
          d.faltas.length > 0 && d.feitoMin === 0,
          d.banco.some((m) => m.minutos < 0) && d.feitoMin === 0,
        ].filter(Boolean);
        expect({ id, dia: d.data, desfechos: desfechos.length }).toEqual({ id, dia: d.data, desfechos: 1 });
      }
    }
  });

  it("fins de semana sem trabalho, ausencias sem horas feitas e nenhum feriado em Setembro", () => {
    for (const id of lerEstado().ordem) {
      for (const d of mesDaPessoa(id, 2026, 9)) {
        expect(feriadoDe(d.data)).toBeNull();
        if (d.previsto.kind === "ausencia") expect(d.feitoMin).toBe(0);
        if (d.previsto.kind === "nao_trabalha" && d.feitoMin > 0) {
          // So um dia de descanso trabalhado, que tem sempre a sua hora extra (decidida ou pendente).
          expect(d.horasExtra.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("ninguem com horario que nao seja banco de horas tem movimentos de banco", () => {
    const c = lerFluxosC();
    for (const id of lerEstado().ordem) {
      const movimentos = c.banco.filter((m) => m.pessoaId === id);
      if (tipoDe(id) === "banco") expect(movimentos.length).toBeGreaterThan(0);
      else expect(movimentos).toEqual([]);
    }
  });

  it("as horas extra de Setembro estao decididas, menos UMA pendente de proposito, e ha uma acima do limite", () => {
    const setembro = lerFluxosC().horasExtra.filter((h) => SETEMBRO(h.data));
    expect(setembro.length).toBeGreaterThan(5);
    const pendentes = setembro.filter((h) => h.estado === "pendente");
    expect(pendentes).toHaveLength(1);
    expect(setembro.some((h) => h.acimaDoLimite && h.estado === "confirmada")).toBe(true);
    expect(setembro.some((h) => h.estado === "rejeitada" && h.motivoDecisao)).toBe(true);
    for (const h of setembro.filter((x) => x.acimaDoLimite && x.estado === "confirmada")) expect(h.motivoDecisao).toBeTruthy();
    expect(setembro.every((h) => h.minutos >= 15)).toBe(true);
    // So quem tem a marca «pode fazer horas extra» as tem.
    const comMarca = lerFluxosC().podeHE;
    expect(setembro.every((h) => comMarca[h.pessoaId] === true)).toBe(true);
  });

  it("as faltas de Setembro cobrem as quatro justificacoes", () => {
    const faltas = lerGestao().faltas.filter((f) => SETEMBRO(f.data));
    const rotulos = new Set(faltas.map((f) => (f.justificacao_estado === "justificada" ? (f.remunerada ? "paga" : "naoPaga") : f.justificacao_estado)));
    expect(rotulos).toEqual(new Set(["paga", "naoPaga", "pendente_documento", "sem_justificacao"]));
  });

  it("ha ausencias aprovadas de varios dias seguidos e um dia fora do local", () => {
    const dias = mesDaPessoa("p-sofia", 2026, 9);
    expect(dias.filter((d) => d.previsto.kind === "ausencia")).toHaveLength(3);
    expect(dias.some((d) => d.chips.some((c) => c.tipo === "fora_local"))).toBe(true);
  });

  it("isencao nao pica e o horario livre conta a semana", () => {
    expect(saidaGeradaDe("p-marta").realizado).toEqual([]);
    const ines = mesDaPessoa("p-ines", 2026, 9);
    expect(ines.every((d) => d.previsto.minutos === 0)).toBe(true);
    const semana = ines.find((d) => d.data === "2026-09-17")?.semana;
    expect(semana).toMatchObject({ alvoMin: 2400, feitoMin: 2550 });
  });

  it("Joana esta de baixa o mes inteiro, Pedro saiu a 4 de Setembro e a Lara ainda nao comecou", () => {
    expect(mesDaPessoa("p-joana", 2026, 9).every((d) => d.feitoMin === 0)).toBe(true);
    const pedro = mesDaPessoa("p-pedro", 2026, 9);
    expect(pedro.filter((d) => d.feitoMin > 0).map((d) => d.data)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(pedro.find((d) => d.data === "2026-09-10")?.previsto.kind).toBe("sem_contrato");
    expect(mesDaPessoa("p-lara", 2026, 9).every((d) => d.previsto.kind === "sem_contrato")).toBe(true);
  });
});

describe("os totais do calendario batem certo com o Calculo do mes", () => {
  it("horas planeadas, horas extra, faltas e dias de subsidio sao os mesmos nos dois sitios", () => {
    const estado = lerEstado();
    const c = lerFluxosC();
    for (const id of estado.ordem) {
      const ficha = estado.fichas[id];
      const dias = mesDaPessoa(id, 2026, 9);
      const totais = totaisDoMes(dias, { minimoSubsidioMin: lerGestao().minutosMinimosSubsidio ?? 240 });
      const entrada = entradaSalarioDaFicha(ficha, c, 2026, 9);
      const emFaltaDoCalendario = dias.flatMap((d) => d.faltas);
      expect(entrada.diasElegiveisSubsidio).toBe(totais.diasElegiveisSubsidio);
      const confirmadas = entrada.horasExtra.filter((h) => h.estado === "confirmada").reduce((s, h) => s + h.minutos, 0);
      expect(confirmadas).toBe(totais.extraConfirmadaMin);
      expect(entrada.horasExtra.reduce((s, h) => s + h.minutos, 0)).toBe(totais.extraPendenteMin + totais.extraConfirmadaMin + totais.extraRejeitadaMin);
      expect(emFaltaDoCalendario.reduce((s, f) => s + f.minutos, 0)).toBe(totais.faltasMin);
      // A soma por dia e o total.
      expect(totais.feitoMin).toBe(dias.filter((d) => d.passado).reduce((s, d) => s + (d.previsto.tipo === "isencao" && d.previsto.kind === "trabalha" ? d.previsto.minutos : d.feitoMin), 0));
    }
  });

  it("o Calculo de Setembro da um total bruto por pessoa com contrato nesse mes", () => {
    const estado = lerEstado();
    const linhas = calcularMes(fichasDoCalculo(estado.fichas, estado.ordem, 2026, 9), lerFluxosC(), 2026, 9);
    expect(linhas).toHaveLength(12);
    expect(linhas.map((l) => l.pessoaId)).not.toContain("p-lara");
    for (const l of linhas) {
      expect(l.resultado.totalBruto).not.toBeNull();
      expect(l.resultado.totalBruto as number).toBeGreaterThan(0);
    }
    const pedro = linhas.find((l) => l.pessoaId === "p-pedro");
    expect(pedro?.entrada.diasDeContrato).toEqual({ dias: 4, doMes: 30 });
    const base = (id: string) => linhas.find((l) => l.pessoaId === id)?.resultado.linhas.find((x) => x.chave === "base")?.valor ?? 0;
    expect(base("p-pedro")).toBeLessThan(base("p-beatriz") / 5);
  });

  it("so as horas extra confirmadas pagam e a pendente de Setembro nao bloqueia (avisos so de retribuicao)", () => {
    const estado = lerEstado();
    const andre = calcularMes([estado.fichas["p-andre"]], lerFluxosC(), 2026, 9)[0];
    expect(andre.entrada.horasExtra.some((h) => h.estado === "pendente")).toBe(true);
    expect(andre.resultado.linhas.some((l) => l.chave.startsWith("he_"))).toBe(false);
    expect(andre.resultado.totalBruto).not.toBeNull();
  });
});

describe("Agosto ja esta fechado e Outubro ainda nao", () => {
  it("o fecho de Agosto tem recibo de cada pessoa e Setembro fica por fechar", () => {
    const fechos = lerFluxosC().fechos;
    expect(Object.keys(fechos)).toEqual(["2026-08"]);
    expect(Object.keys(fechos["2026-08"].recibos).length).toBeGreaterThan(8);
    expect(lerGestao().periodos.map((p) => `${p.ano}-${p.mes}:${p.estado}`).sort()).toEqual(["2026-8:fechado", "2026-9:aberto"]);
  });
});

describe("o mapa da organizacao navega ate Setembro e mostra tudo preenchido", () => {
  it("quem pica tem o seu mes (a Marta e de isencao, a Joana esta de baixa e a Lara nao comecou), e o total do mapa e a soma do que foi feito", () => {
    const { result } = renderHook(() => useAssiduidadeDaOrganizacao({ de: "2026-09-01", ate: "2026-09-30" }));
    const estado = lerEstado();
    const emAdmissao = ["p-marco", "p-nadia", "p-vasco", "p-eva", "p-ruben"];
    for (const id of estado.ordem.filter((x) => !["p-marta", "p-joana", "p-lara", ...emAdmissao].includes(x))) {
      expect(result.current.pessoasComRegisto.has(id)).toBe(true);
    }
    for (const id of emAdmissao) expect(result.current.pessoasComRegisto.has(id), id).toBe(false);
    const doMapa = [...result.current.celulas.values()].reduce((s, c) => s + c.minutosRealizados, 0);
    const dasFichas = Object.values(estado.fichas).flatMap((f) => f.horarioRealizado).filter((r) => r.data.startsWith("2026-09")).reduce((s, r) => s + r.minutos, 0);
    expect(doMapa).toBe(dasFichas);
    const faltasDoMapa = [...result.current.celulas.values()].reduce((s, c) => s + c.minutosEmFalta, 0);
    expect(faltasDoMapa).toBe(lerGestao().faltas.filter((f) => f.data.startsWith("2026-09")).reduce((s, f) => s + f.minutos, 0));
  });
});
