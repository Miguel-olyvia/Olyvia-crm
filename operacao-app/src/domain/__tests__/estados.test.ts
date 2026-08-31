import { describe, expect, it } from "vitest";
import { avaliar, estaAtrasada, transicoesPossiveis, type Contexto } from "../estados";

const gestor: Contexto = { funcao: "gestor", atribuido: true };
const tecnico = (atribuido: boolean): Contexto => ({ funcao: "tecnico", atribuido });

describe("aprovação", () => {
  it("o gestor aprova uma ordem por aprovar", () => {
    expect(avaliar("por_aprovar", "aprovar", gestor)).toEqual({
      ok: true,
      para: "agendada",
    });
  });

  it("o técnico não aprova", () => {
    const r = avaliar("por_aprovar", "aprovar", tecnico(true));
    expect(r).toEqual({ ok: false, motivo: "Sem permissão para esta ação." });
  });

  it("rejeitar sem motivo é recusado", () => {
    expect(avaliar("por_aprovar", "rejeitar", gestor)).toEqual({
      ok: false,
      motivo: "Rejeitar exige um motivo.",
    });
  });

  it("rejeitar com motivo cancela a ordem", () => {
    const r = avaliar("por_aprovar", "rejeitar", { ...gestor, motivo: "duplicada" });
    expect(r).toEqual({ ok: true, para: "cancelada" });
  });

  it("um motivo só com espaços não conta como motivo", () => {
    const r = avaliar("por_aprovar", "rejeitar", { ...gestor, motivo: "   " });
    expect(r.ok).toBe(false);
  });
});

describe("execução", () => {
  it("o técnico atribuído inicia a ordem", () => {
    expect(avaliar("agendada", "iniciar", tecnico(true))).toEqual({
      ok: true,
      para: "em_curso",
    });
  });

  it("o técnico NÃO atribuído não inicia a ordem de outro", () => {
    const r = avaliar("agendada", "iniciar", tecnico(false));
    expect(r).toEqual({
      ok: false,
      motivo: "Só quem está na ordem a pode iniciar.",
    });
  });

  it("o gestor inicia mesmo sem estar atribuído", () => {
    const r = avaliar("agendada", "iniciar", { funcao: "gestor", atribuido: false });
    expect(r.ok).toBe(true);
  });

  it("não se inicia uma ordem já em curso", () => {
    const r = avaliar("em_curso", "iniciar", gestor);
    expect(r.ok).toBe(false);
  });
});

describe("pausa", () => {
  it("pausar exige motivo E retoma prevista", () => {
    expect(avaliar("em_curso", "pausar", gestor)).toEqual({
      ok: false,
      motivo: "Pausar exige um motivo.",
    });

    expect(
      avaliar("em_curso", "pausar", { ...gestor, motivo: "à espera de material" })
    ).toEqual({
      ok: false,
      motivo: "Pausar exige uma data de retoma prevista.",
    });
  });

  it("com motivo e retoma, pausa", () => {
    const r = avaliar("em_curso", "pausar", {
      ...gestor,
      motivo: "à espera de material",
      retomaPrevista: new Date("2026-09-02T09:00:00Z"),
    });
    expect(r).toEqual({ ok: true, para: "pausada" });
  });

  it("retomar devolve ao estado em curso", () => {
    expect(avaliar("pausada", "retomar", gestor)).toEqual({
      ok: true,
      para: "em_curso",
    });
  });
});

describe("fecho", () => {
  it("não fecha com tarefas obrigatórias por responder", () => {
    const r = avaliar("em_curso", "fechar", {
      ...gestor,
      tarefas: [
        { estado: "feita", obrigatoria: true },
        { estado: "pendente", obrigatoria: true },
        { estado: "pendente", obrigatoria: true },
      ],
    });
    expect(r).toEqual({
      ok: false,
      motivo: "Faltam responder a 2 tarefas obrigatórias.",
    });
  });

  it("o singular também está certo", () => {
    const r = avaliar("em_curso", "fechar", {
      ...gestor,
      tarefas: [{ estado: "pendente", obrigatoria: true }],
    });
    expect(r).toEqual({
      ok: false,
      motivo: "Falta responder a 1 tarefa obrigatória.",
    });
  });

  it("tarefas opcionais pendentes não impedem o fecho", () => {
    const r = avaliar("em_curso", "fechar", {
      ...gestor,
      tarefas: [
        { estado: "feita", obrigatoria: true },
        { estado: "pendente", obrigatoria: false },
      ],
    });
    expect(r).toEqual({ ok: true, para: "fechada" });
  });

  it("'não aplicável' conta como resposta", () => {
    const r = avaliar("em_curso", "fechar", {
      ...gestor,
      tarefas: [{ estado: "nao_aplicavel", obrigatoria: true }],
    });
    expect(r.ok).toBe(true);
  });

  it("'não conforme' também conta como resposta", () => {
    const r = avaliar("em_curso", "fechar", {
      ...gestor,
      tarefas: [{ estado: "nao_conforme", obrigatoria: true }],
    });
    expect(r.ok).toBe(true);
  });
});

describe("confirmação e reabertura", () => {
  it("o gestor confirma uma ordem fechada", () => {
    expect(avaliar("fechada", "confirmar", gestor)).toEqual({
      ok: true,
      para: "confirmada",
    });
  });

  it("o técnico não confirma", () => {
    expect(avaliar("fechada", "confirmar", tecnico(true)).ok).toBe(false);
  });

  it("reabrir devolve ao estado em curso", () => {
    expect(avaliar("fechada", "reabrir", gestor)).toEqual({
      ok: true,
      para: "em_curso",
    });
  });

  it("uma ordem confirmada é terminal", () => {
    expect(transicoesPossiveis("confirmada", gestor)).toEqual([]);
  });

  it("uma ordem cancelada é terminal", () => {
    expect(transicoesPossiveis("cancelada", gestor)).toEqual([]);
  });
});

describe("cancelamento", () => {
  it("cancelar exige motivo", () => {
    expect(avaliar("agendada", "cancelar", gestor)).toEqual({
      ok: false,
      motivo: "Cancelar exige um motivo.",
    });
  });

  it("o técnico não cancela", () => {
    const r = avaliar("agendada", "cancelar", { ...tecnico(true), motivo: "x" });
    expect(r.ok).toBe(false);
  });

  it("não se cancela uma ordem já fechada", () => {
    const r = avaliar("fechada", "cancelar", { ...gestor, motivo: "x" });
    expect(r.ok).toBe(false);
  });
});

describe("transicoesPossiveis", () => {
  it("uma ordem agendada, para o técnico atribuído, só se inicia", () => {
    expect(transicoesPossiveis("agendada", tecnico(true))).toEqual(["iniciar"]);
  });

  it("o técnico não atribuído não faz nada a uma ordem agendada", () => {
    expect(transicoesPossiveis("agendada", tecnico(false))).toEqual([]);
  });
});

describe("estaAtrasada — é badge, não estado", () => {
  const agora = new Date("2026-08-30T10:00:00Z");

  it("uma ordem agendada para ontem está atrasada", () => {
    expect(estaAtrasada("agendada", new Date("2026-08-29T09:00:00Z"), agora)).toBe(true);
  });

  it("uma ordem agendada para amanhã não está atrasada", () => {
    expect(estaAtrasada("agendada", new Date("2026-08-31T09:00:00Z"), agora)).toBe(false);
  });

  it("uma ordem fechada nunca está atrasada, mesmo com data passada", () => {
    expect(estaAtrasada("fechada", new Date("2026-01-01T09:00:00Z"), agora)).toBe(false);
  });

  it("sem data agendada não há atraso", () => {
    expect(estaAtrasada("agendada", null, agora)).toBe(false);
  });
});
