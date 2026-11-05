import { describe, expect, it } from "vitest";
import {
  accoesDoItem,
  agruparPorPessoa,
  construirItens,
  contagemPorTipo,
  diaAnterior,
  filtrarPessoas,
  janelaDosDesvios,
  ordenarPessoas,
  rotuloDoContador,
  todasLidasComSucesso,
  type AjudasDeDesvio,
  type ItemFila,
} from "@/lib/hr/filaDeTrabalho";
import type { HoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import type { Desvio } from "@/types/hrAssiduidade";

const hora = (parcial: Partial<HoraExtra> & Pick<HoraExtra, "id" | "pessoaId" | "data">): HoraExtra =>
  ({ minutos: 90, nocturnoMin: 0, origem: "diaria", motivoOrigem: "", estado: "pendente", acimaDoLimite: false, motivoDecisao: null, decididoPor: null, ...parcial }) as HoraExtra;

const justificacao = (parcial: Partial<JustificacaoDia> & Pick<JustificacaoDia, "id" | "pessoaId" | "data">): JustificacaoDia =>
  ({ tipo: "transporte", motivo: "autocarro", estado: "pendente", enviadaEm: "2026-10-12T10:00:00.000Z", ...parcial }) as JustificacaoDia;

const desvio = (parcial: Partial<Desvio> & Pick<Desvio, "pessoa_id" | "data">): Desvio =>
  ({ organization_id: "o", tipo: "planeado_sem_realizado", hora_inicio: "09:00", hora_fim: "13:00", minutos: 240, planeado_id: "pl", local_id: null, referencia_id: null, detalhe: null, ...parcial }) as Desvio;

const AJUDAS: AjudasDeDesvio = {
  accoesDoDesvio: (d) => (d.tipo === "planeado_sem_realizado" ? ["marcar_falta"] : d.tipo === "realizado_sem_planeado" ? ["corrigir"] : []),
  chaveDoDesvio: (d, i) => `${d.pessoa_id}|${d.data}|${i}`,
};

const NOMES: Record<string, string> = { ana: "Ana Silva", rui: "Rui Matos", ines: "Inês Costa" };
const nomeDe = (id: string): string => NOMES[id] ?? id;

const itens = (): ItemFila[] =>
  construirItens(
    {
      horasExtra: [hora({ id: "h1", pessoaId: "ana", data: "2026-10-20" }), hora({ id: "h2", pessoaId: "ana", data: "2026-10-14", estado: "confirmada" })],
      justificacoes: [justificacao({ id: "j1", pessoaId: "ana", data: "2026-10-12" }), justificacao({ id: "j2", pessoaId: "rui", data: "2026-10-30" })],
      desvios: [desvio({ pessoa_id: "rui", data: "2026-10-25" }), desvio({ pessoa_id: "ines", data: "2026-10-02", tipo: "realizado_sem_planeado", referencia_id: "r1" })],
    },
    AJUDAS,
  );

describe("construirItens e agruparPorPessoa", () => {
  it("só entram os itens por decidir, e cada item leva o id do seu tipo", () => {
    const todos = itens();
    expect(todos).toHaveLength(5);
    expect(todos.map((i) => i.id)).toContain("he:h1");
    expect(todos.map((i) => i.id)).not.toContain("he:h2");
  });

  it("agrupa por pessoa, com os itens do mais antigo para o mais recente e os contadores por tipo", () => {
    const pessoas = agruparPorPessoa(itens(), nomeDe);
    expect(pessoas).toHaveLength(3);
    const ana = pessoas.find((p) => p.pessoaId === "ana");
    expect(ana?.itens.map((i) => i.id)).toEqual(["jd:j1", "he:h1"]);
    expect(ana?.contagem).toEqual({ hora_extra: 1, justificacao: 1, alerta: 0 });
    expect(ana?.total).toBe(2);
    expect(ana?.maisAntigo).toBe("2026-10-12");
  });

  it("o contador de pessoas e o total de pendencias saem do mesmo agrupamento", () => {
    const pessoas = agruparPorPessoa(itens(), nomeDe);
    expect(pessoas.length).toBe(3);
    expect(pessoas.reduce((s, p) => s + p.total, 0)).toBe(itens().length);
    expect(contagemPorTipo(itens())).toEqual({ hora_extra: 1, justificacao: 2, alerta: 2 });
  });
});

describe("ordenarPessoas", () => {
  const pessoas = () => agruparPorPessoa(itens(), nomeDe);

  it("sem periodo ordena pelo item mais antigo, depois pelo nome", () => {
    const ordem = ordenarPessoas(pessoas(), { hoje: "2026-11-05", periodo: null }).map((p) => p.pessoaId);
    expect(ordem).toEqual(["ines", "ana", "rui"]);
  });

  it("perto do fecho (5 dias ou menos) sobem as pessoas com itens dentro do periodo", () => {
    // Periodo 22/10 a 21/11 e hoje 18/11: faltam 3 dias; so a Ana e o Rui têm itens a partir de 22/10 (20/10 não conta, 25/10 e 30/10 sim).
    const ordenadas = ordenarPessoas(pessoas(), { hoje: "2026-11-18", periodo: { de: "2026-10-22", ate: "2026-11-21" } });
    expect(ordenadas.map((p) => p.pessoaId)).toEqual(["rui", "ines", "ana"]);
    expect(ordenadas[0].fechaEmDias).toBe(3);
    expect(ordenadas[1].fechaEmDias).toBeNull();
  });

  it("longe do fecho ninguem sobe e ninguem leva o selo", () => {
    const ordenadas = ordenarPessoas(pessoas(), { hoje: "2026-11-05", periodo: { de: "2026-10-22", ate: "2026-11-21" } });
    expect(ordenadas.map((p) => p.pessoaId)).toEqual(["ines", "ana", "rui"]);
    expect(ordenadas.every((p) => p.fechaEmDias === null)).toBe(true);
  });
});

describe("filtrarPessoas", () => {
  it("filtra por tipo e pesquisa por nome sem acentos nem maiusculas", () => {
    const pessoas = agruparPorPessoa(itens(), nomeDe);
    expect(filtrarPessoas(pessoas, { tipo: "alerta", texto: "" }).map((p) => p.pessoaId).sort()).toEqual(["ines", "rui"]);
    expect(filtrarPessoas(pessoas, { tipo: null, texto: "INES" }).map((p) => p.pessoaId)).toEqual(["ines"]);
    expect(filtrarPessoas(pessoas, { tipo: "hora_extra", texto: "rui" })).toEqual([]);
  });
});

describe("contador, limite de 500 e leitura das fontes", () => {
  it("«N+» quando as horas extra foram cortadas no limite", () => {
    expect(rotuloDoContador(41, false)).toBe("41");
    expect(rotuloDoContador(41, true)).toBe("41+");
  });

  it("uma fonte que falhou, foi recusada ou esta indisponivel nunca da «tudo lido»", () => {
    expect(todasLidasComSucesso({ horas_extra: "ok", justificacoes: "ok", desvios: "ok" })).toBe(true);
    expect(todasLidasComSucesso({ horas_extra: "ok", justificacoes: "erro", desvios: "ok" })).toBe(false);
    expect(todasLidasComSucesso({ horas_extra: "recusado", justificacoes: "ok", desvios: "ok" })).toBe(false);
    expect(todasLidasComSucesso({ horas_extra: "ok", justificacoes: "ok", desvios: "indisponivel" })).toBe(false);
  });

  it("a janela dos desvios começa no período ANTERIOR ao em curso e vai até hoje; sem períodos, no dia 1 do mês anterior", () => {
    expect(janelaDosDesvios({ de: "2026-10-22" }, { de: "2026-09-22" }, "2026-11-05")).toEqual({ de: "2026-09-22", ate: "2026-11-05" });
    expect(janelaDosDesvios(null, null, "2026-11-05")).toEqual({ de: "2026-10-01", ate: "2026-11-05" });
    expect(janelaDosDesvios(null, null, "2026-01-10")).toEqual({ de: "2025-12-01", ate: "2026-01-10" });
  });

  it("o dia anterior passa o fim do mês e do ano", () => {
    expect(diaAnterior("2026-11-01")).toBe("2026-10-31");
    expect(diaAnterior("2026-01-01")).toBe("2025-12-31");
  });
});

describe("accoesDoItem", () => {
  const todos = itens();
  const dela = (id: string): ItemFila => todos.find((i) => i.id === id) as ItemFila;
  const tudo = { gerir: true, corrigir: true, faltasEdit: true, justificacaoEdit: true };

  it("hora extra: confirmar e rejeitar exigem gerir, com a razao quando falta", () => {
    expect(accoesDoItem(dela("he:h1"), tudo, null).every((a) => a.permitida)).toBe(true);
    const sem = accoesDoItem(dela("he:h1"), { ...tudo, gerir: false }, null);
    expect(sem.map((a) => [a.id, a.permitida, a.porque])).toEqual([
      ["confirmar", false, "rhFila.semPermissao.gerir"],
      ["rejeitar", false, "rhFila.semPermissao.gerir"],
    ]);
  });

  it("justificacao: ninguem decide a sua", () => {
    expect(accoesDoItem(dela("jd:j1"), tudo, "outra").every((a) => a.permitida)).toBe(true);
    const propria = accoesDoItem(dela("jd:j1"), tudo, "ana");
    expect(propria.every((a) => !a.permitida && a.porque === "rhJust.rh.propriaSemDecisao")).toBe(true);
  });

  it("justificacao: sem justificacaoEdit as accoes ficam desactivadas com a razao", () => {
    const sem = accoesDoItem(dela("jd:j1"), { ...tudo, justificacaoEdit: false }, "outra");
    expect(sem.map((a) => [a.id, a.permitida, a.porque])).toEqual([
      ["aceitar", false, "rhFila.semPermissao.justificacao"],
      ["recusar", false, "rhFila.semPermissao.justificacao"],
    ]);
  });

  it("alerta: corrigir exige corrigir, faltas exigem faltasEdit, cada accao com a sua razao", () => {
    const marcar = dela("al:rui|2026-10-25|0");
    expect(accoesDoItem(marcar, { ...tudo, faltasEdit: false }, null)).toEqual([{ id: "marcar_falta", permitida: false, porque: "rhFila.semPermissao.faltas" }]);
    const corrigir = dela("al:ines|2026-10-02|1");
    expect(accoesDoItem(corrigir, { ...tudo, corrigir: false }, null)).toEqual([{ id: "corrigir", permitida: false, porque: "rhFila.semPermissao.corrigir" }]);
    expect(accoesDoItem(corrigir, tudo, null)).toEqual([{ id: "corrigir", permitida: true, porque: null }]);
  });
});
