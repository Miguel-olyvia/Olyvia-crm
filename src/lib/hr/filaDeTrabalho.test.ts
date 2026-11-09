import { describe, expect, it } from "vitest";
import {
  accoesDoItem,
  agruparPorPessoa,
  construirItens,
  construirItensDeAusencias,
  construirItensDeDesviosAValidar,
  contagemPorTipo,
  diaAnterior,
  filtrarPessoas,
  janelaDosDesvios,
  ordenarPessoas,
  rotuloDoContador,
  todasLidasComSucesso,
  TIPOS_ASSIDUIDADE,
  TIPOS_AUSENCIAS,
  TIPOS_DE_ITEM,
  type AjudasDeDesvio,
  type DesvioAValidar,
  type ItemFila,
} from "@/lib/hr/filaDeTrabalho";
import type { HoraExtra } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import type { Desvio } from "@/types/hrAssiduidade";
import type { AusenciaPedido } from "@/types/hrAusencias";

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
    expect(ana?.contagem).toEqual({ hora_extra: 1, justificacao: 1, alerta: 0, desvio_a_validar: 0, ausencia: 0 });
    expect(ana?.total).toBe(2);
    expect(ana?.maisAntigo).toBe("2026-10-12");
  });

  it("o contador de pessoas e o total de pendencias saem do mesmo agrupamento", () => {
    const pessoas = agruparPorPessoa(itens(), nomeDe);
    expect(pessoas.length).toBe(3);
    expect(pessoas.reduce((s, p) => s + p.total, 0)).toBe(itens().length);
    expect(contagemPorTipo(itens())).toEqual({ hora_extra: 1, justificacao: 2, alerta: 2, desvio_a_validar: 0, ausencia: 0 });
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

/* ---------------------------------------------------------------- ausencias por decidir e desvios a validar */

const pedido = (parcial: Partial<AusenciaPedido> & Pick<AusenciaPedido, "id" | "pessoa_id" | "data_inicio" | "data_fim">): AusenciaPedido =>
  ({ organization_id: "o", tipo_id: "ferias", dias_solicitados: 3, estado: "pendente_chefia", aprovador_chefia_pessoa_id: "chefe", substitui_pedido_id: null, ...parcial }) as AusenciaPedido;

const nomeDoTipo = (tipoId: string): string => (tipoId === "ferias" ? "Férias" : "Doença");

const pedidos = (): AusenciaPedido[] => [
  pedido({ id: "a1", pessoa_id: "ana", data_inicio: "2026-11-10", data_fim: "2026-11-12" }),
  pedido({ id: "a2", pessoa_id: "ana", data_inicio: "2026-11-02", data_fim: "2026-11-03", estado: "pendente_rh", tipo_id: "doenca" }),
  pedido({ id: "a3", pessoa_id: "rui", data_inicio: "2026-10-20", data_fim: "2026-10-26" }),
  pedido({ id: "a4", pessoa_id: "rui", data_inicio: "2026-09-01", data_fim: "2026-09-02", estado: "aprovado" }),
  pedido({ id: "a5", pessoa_id: "ines", data_inicio: "2026-08-01", data_fim: "2026-08-02", estado: "recusado" }),
];

describe("ausências por decidir", () => {
  it("só entram os pedidos pendentes (chefia ou RH), com o nome do tipo de ausência", () => {
    const todos = construirItensDeAusencias(pedidos(), nomeDoTipo);
    expect(todos.map((i) => i.id)).toEqual(["au:a1", "au:a2", "au:a3"]);
    const primeiro = todos[0];
    expect(primeiro.tipo === "ausencia" && primeiro.nomeDoTipo).toBe("Férias");
    expect(primeiro.pessoaId).toBe("ana");
    expect(primeiro.data).toBe("2026-11-10");
    expect(primeiro.dataFim).toBe("2026-11-12");
  });

  it("agrupa por pessoa: o número da fila conta pessoas, não pedidos", () => {
    const pessoas = agruparPorPessoa(construirItensDeAusencias(pedidos(), nomeDoTipo), nomeDe);
    expect(pessoas.map((p) => [p.pessoaId, p.total])).toEqual([["ana", 2], ["rui", 1]]);
    expect(pessoas[0].itens.map((i) => i.id)).toEqual(["au:a2", "au:a1"]);
    expect(pessoas[0].contagem.ausencia).toBe(2);
    expect(pessoas[0].maisAntigo).toBe("2026-11-02");
  });

  it("perto do fecho sobe quem tem um pedido que ATRAVESSA o período, mesmo a começar antes dele", () => {
    const pessoas = agruparPorPessoa(construirItensDeAusencias(pedidos(), nomeDoTipo), nomeDe);
    // Período 22/10 a 21/11, hoje 18/11 (faltam 3 dias). O pedido do Rui (20 a 26/10) começa antes mas acaba dentro.
    const ordenadas = ordenarPessoas(pessoas, { hoje: "2026-11-18", periodo: { de: "2026-10-22", ate: "2026-11-21" } });
    expect(ordenadas.map((p) => [p.pessoaId, p.fechaEmDias])).toEqual([["rui", 3], ["ana", 3]]);
    // Um pedido que acabou ANTES do período não conta.
    const antes = agruparPorPessoa(construirItensDeAusencias([pedido({ id: "x", pessoa_id: "rui", data_inicio: "2026-10-01", data_fim: "2026-10-21" })], nomeDoTipo), nomeDe);
    expect(ordenarPessoas(antes, { hoje: "2026-11-18", periodo: { de: "2026-10-22", ate: "2026-11-21" } })[0].fechaEmDias).toBeNull();
  });

  it("chefia e RH continuam separadas: cada passo exige a sua permissão e a razão vem escrita", () => {
    const [naChefia, noRh] = construirItensDeAusencias(pedidos(), nomeDoTipo);
    const base = { gerir: false, corrigir: false, faltasEdit: false, justificacaoEdit: false };
    const soChefia = { ...base, aprovarChefia: true, aprovarRh: false };
    const soRh = { ...base, aprovarChefia: false, aprovarRh: true };

    expect(accoesDoItem(naChefia, soChefia, null)).toEqual([
      { id: "aprovar_chefia", permitida: true, porque: null },
      { id: "recusar_chefia", permitida: true, porque: null },
      { id: "ajustar", permitida: true, porque: null },
    ]);
    expect(accoesDoItem(naChefia, soRh, null).map((a) => [a.id, a.permitida, a.porque])).toEqual([
      ["aprovar_chefia", false, "rhFila.semPermissao.aprovarChefia"],
      ["recusar_chefia", false, "rhFila.semPermissao.aprovarChefia"],
      ["ajustar", false, "rhFila.semPermissao.aprovarChefia"],
    ]);
    expect(accoesDoItem(noRh, soRh, null).map((a) => [a.id, a.permitida])).toEqual([
      ["aprovar_rh", true],
      ["recusar_rh", true],
      ["devolver", true],
    ]);
    expect(accoesDoItem(noRh, soChefia, null).every((a) => !a.permitida && a.porque === "rhFila.semPermissao.aprovarRh")).toBe(true);
    // Sem as permissões nos dados (campo em falta) nada se permite.
    expect(accoesDoItem(noRh, base, null).every((a) => !a.permitida)).toBe(true);
  });

  it("devolver à chefia só existe quando há chefia resolúvel", () => {
    const [semChefia] = construirItensDeAusencias([pedido({ id: "s", pessoa_id: "ana", data_inicio: "2026-11-01", data_fim: "2026-11-01", estado: "pendente_rh", aprovador_chefia_pessoa_id: null })], nomeDoTipo);
    const ids = accoesDoItem(semChefia, { gerir: false, corrigir: false, faltasEdit: false, justificacaoEdit: false, aprovarRh: true }, null).map((a) => a.id);
    expect(ids).toEqual(["aprovar_rh", "recusar_rh"]);
  });

  it("a fila de ausências lê uma só fonte: uma falha nunca dá «tudo lido»", () => {
    expect(todasLidasComSucesso({ ausencias: "ok" })).toBe(true);
    expect(todasLidasComSucesso({ ausencias: "erro" })).toBe(false);
    expect(todasLidasComSucesso({ ausencias: "recusado" })).toBe(false);
  });
});

describe("desvio a validar (tipo preparado, ainda sem fonte)", () => {
  const validacoes = (): DesvioAValidar[] => [
    { id: "v1", pessoaId: "ana", data: "2026-10-28", natureza: "hora_extra", minutos: 45, horaInicio: "18:00", horaFim: "18:45", detalhe: null },
    { id: "v2", pessoaId: "rui", data: "2026-10-15", natureza: "tempo_a_menos", minutos: 20, horaInicio: null, horaFim: null, detalhe: "saiu cedo" },
  ];

  it("está no registo de tipos, com fonte própria, mas fora das listas dos ecrãs até haver fonte", () => {
    const definicao = TIPOS_DE_ITEM.find((d) => d.tipo === "desvio_a_validar");
    expect(definicao).toMatchObject({ fonte: "desvios_a_validar", chaveEtiqueta: "rhFila.tipo.desvio_a_validar" });
    expect(TIPOS_ASSIDUIDADE).toEqual(["hora_extra", "justificacao", "alerta", "desvio_a_validar"]);
    expect(TIPOS_AUSENCIAS).toEqual(["ausencia"]);
  });

  it("entra na fila com dados simulados: agrupa com os outros tipos e conta por tipo", () => {
    const todos = [...itens(), ...construirItensDeDesviosAValidar(validacoes())];
    expect(todos.map((i) => i.id)).toContain("dv:v1");
    const pessoas = agruparPorPessoa(todos, nomeDe);
    const rui = pessoas.find((p) => p.pessoaId === "rui");
    expect(rui?.contagem.desvio_a_validar).toBe(1);
    expect(rui?.itens.map((i) => i.id)).toEqual(["dv:v2", "al:rui|2026-10-25|0", "jd:j2"]);
    expect(filtrarPessoas(pessoas, { tipo: "desvio_a_validar", texto: "" }).map((p) => p.pessoaId).sort()).toEqual(["ana", "rui"]);
    expect(contagemPorTipo(todos).desvio_a_validar).toBe(2);
  });

  it("as acções (normal, hora extra, aceitar desvio) seguem a permissão de validar, e na falta dela a de gerir", () => {
    const [v1] = construirItensDeDesviosAValidar(validacoes());
    const base = { gerir: false, corrigir: false, faltasEdit: false, justificacaoEdit: false };
    expect(accoesDoItem(v1, { ...base, validarDesvios: true }, null)).toEqual([
      { id: "validar_normal", permitida: true, porque: null },
      { id: "validar_hora_extra", permitida: true, porque: null },
      { id: "validar_aceitar_desvio", permitida: true, porque: null },
    ]);
    expect(accoesDoItem(v1, { ...base, gerir: true }, null).every((a) => a.permitida)).toBe(true);
    expect(accoesDoItem(v1, base, null).every((a) => !a.permitida && a.porque === "rhFila.semPermissao.validar")).toBe(true);
    expect(accoesDoItem(v1, { ...base, gerir: true, validarDesvios: false }, null).every((a) => !a.permitida)).toBe(true);
  });
});