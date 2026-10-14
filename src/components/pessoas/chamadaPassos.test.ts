import { describe, expect, it } from "vitest";
import {
  ehRecomendado, errosChamada, errosDiaHora, exigeDiaHora, passoPorDefeito, passosDisponiveis, temErros, textoAgenda,
} from "./chamadaPassos";

const lead = { papel: "lead", perdida: false } as const;
const cliente = { papel: "cliente", perdida: false } as const;
const perdida = { papel: "lead", perdida: true } as const;
const HOJE = "2026-10-13";

describe("passosDisponiveis", () => {
  it("muda com o resultado e a visita vem primeiro a quem se interessou", () => {
    expect(passosDisponiveis("atendeuInteressado", lead)).toEqual(["marcarVisita", "ligarAmanha", "ligarHoje", "nenhum"]);
    expect(passosDisponiveis("atendeuMaisTarde", lead)).toEqual(["ligarData", "ligarAmanha"]);
    expect(passosDisponiveis("naoAtendeu", lead)).toEqual(["ligarAmanha", "ligarHoje"]);
    expect(passosDisponiveis("semInteresse", lead)).toEqual(["perder", "nenhum"]);
    expect(passosDisponiveis("numeroErrado", lead)).toEqual(["nenhum", "perder"]);
  });

  it("nenhum resultado oferece orçamento", () => {
    const todos = (["atendeuInteressado", "atendeuMaisTarde", "naoAtendeu", "semInteresse", "numeroErrado"] as const)
      .flatMap((r) => passosDisponiveis(r, lead));
    expect(todos.map(String)).not.toContain("visitaOuOrcamento");
  });

  it("um cliente não se perde, mas pode ter visita", () => {
    expect(passosDisponiveis("semInteresse", cliente)).toEqual(["nenhum"]);
    expect(passosDisponiveis("atendeuInteressado", cliente)).toContain("marcarVisita");
  });

  it("uma perdida não leva visita nem se volta a perder", () => {
    expect(passosDisponiveis("atendeuInteressado", perdida)).toEqual(["ligarAmanha", "ligarHoje", "nenhum"]);
    expect(passosDisponiveis("semInteresse", perdida)).toEqual(["nenhum"]);
  });
});

describe("passoPorDefeito e ehRecomendado", () => {
  it("a visita para quem se interessou; nunca perder por defeito", () => {
    expect(passoPorDefeito("atendeuInteressado", lead)).toBe("marcarVisita");
    expect(passoPorDefeito("atendeuMaisTarde", lead)).toBe("ligarData");
    expect(passoPorDefeito("naoAtendeu", lead)).toBe("ligarAmanha");
    expect(passoPorDefeito("semInteresse", lead)).toBe("nenhum");
    expect(passoPorDefeito("numeroErrado", lead)).toBe("nenhum");
    expect(passoPorDefeito("atendeuInteressado", perdida)).toBe("ligarAmanha");
  });

  it("só a visita a quem se interessou é recomendada", () => {
    expect(ehRecomendado("atendeuInteressado", "marcarVisita")).toBe(true);
    expect(ehRecomendado("atendeuInteressado", "ligarAmanha")).toBe(false);
    expect(ehRecomendado("atendeuMaisTarde", "ligarData")).toBe(false);
  });
});

describe("dia e hora", () => {
  it("só a visita e o ligar numa data pedem dia e hora", () => {
    expect(["marcarVisita", "ligarData"].every((p) => exigeDiaHora(p as "marcarVisita"))).toBe(true);
    expect(["ligarAmanha", "ligarHoje", "perder", "nenhum"].some((p) => exigeDiaHora(p as "nenhum"))).toBe(false);
  });

  it("o dia é obrigatório e não pode ser passado; a hora é obrigatória e HH:MM", () => {
    expect(errosDiaHora("", "10:00", HOJE)).toEqual({ data: "dataVazia", hora: null });
    expect(errosDiaHora("2026-10-12", "10:00", HOJE)).toEqual({ data: "dataPassada", hora: null });
    expect(errosDiaHora(HOJE, "10:00", HOJE)).toEqual({ data: null, hora: null });
    expect(errosDiaHora("2026-10-20", "", HOJE)).toEqual({ data: null, hora: "horaVazia" });
    expect(errosDiaHora("2026-10-20", "25:00", HOJE)).toEqual({ data: null, hora: "horaInvalida" });
  });

  it("errosChamada só valida o que o passo pede", () => {
    const vazio = { data: "", hora: "", motivo: "" } as const;
    expect(temErros(errosChamada({ ...vazio, passo: "ligarAmanha" }, HOJE))).toBe(false);
    expect(temErros(errosChamada({ ...vazio, passo: "nenhum" }, HOJE))).toBe(false);
    expect(errosChamada({ ...vazio, passo: "marcarVisita" }, HOJE)).toEqual({ data: "dataVazia", hora: "horaVazia", motivo: null });
    expect(errosChamada({ ...vazio, passo: "perder" }, HOJE).motivo).toBe("motivoVazio");
    expect(temErros(errosChamada({ passo: "perder", data: "", hora: "", motivo: "preco" }, HOJE))).toBe(false);
    expect(temErros(errosChamada({ passo: "ligarData", data: "2026-10-14", hora: "15:00", motivo: "" }, HOJE))).toBe(false);
  });

  it("textoAgenda escreve dia/mês e hora", () => {
    expect(textoAgenda("2026-10-16", "09:30")).toBe("16/10 · 09:30");
    expect(textoAgenda("2026-10-16", "")).toBe("16/10");
  });
});
