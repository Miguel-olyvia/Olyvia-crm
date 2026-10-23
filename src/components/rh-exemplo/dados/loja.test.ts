import { beforeEach, describe, expect, it } from "vitest";
import { hojeIso, diaIso, minutosEntre, diaDaSemana } from "@/components/rh-exemplo/dados/datas";
import { atualizarFicha, lerEstado, novoId, repor } from "@/components/rh-exemplo/dados/loja";
import { derivarEstadoContrato } from "@/components/rh-exemplo/lib/estadoContrato";
import { calcularPedido } from "@/components/rh-exemplo/lib/ausencias";

beforeEach(() => repor());

describe("datas de exemplo", () => {
  it("diaIso desloca a data de hoje", () => {
    expect(diaIso(0)).toBe(hojeIso());
    expect(diaIso(1) > diaIso(0)).toBe(true);
    expect(diaIso(-1) < diaIso(0)).toBe(true);
  });

  it("calcula minutos e dia da semana", () => {
    expect(minutosEntre("09:00", "13:05")).toBe(245);
    expect(diaDaSemana("2026-10-14")).toBe(3);
  });
});

describe("dados de exemplo de Recursos Humanos", () => {
  it("tem 13 pessoas com ficha completa e filiais, mais 5 em admissao", () => {
    const e = lerEstado();
    expect(e.ordem).toHaveLength(13 + 5);
    expect(e.ordem.slice(0, 13)[0]).toBe("p-marta");
    expect(e.ordem.slice(13)).toEqual(["p-marco", "p-nadia", "p-vasco", "p-eva", "p-ruben"]);
    expect(Object.keys(e.fichas)).toHaveLength(13 + 5);
    expect(e.filiais.length).toBeGreaterThanOrEqual(4);
    expect(e.locais.length).toBeGreaterThanOrEqual(6);
    for (const id of e.ordem) {
      const ficha = e.fichas[id];
      expect(ficha.vinculos).toHaveLength(1);
      expect(ficha.retribuicoes.length).toBeGreaterThan(0);
    }
  });

  it("tem contratos a terminar nos próximos 90 dias e estados de contrato variados", () => {
    const fichas = Object.values(lerEstado().fichas);
    const aTerminar = fichas.filter((f) => {
      const fim = f.vinculos[0].data_fim;
      return f.vinculos[0].estado === "activo" && fim !== null && fim >= hojeIso() && fim <= diaIso(90);
    });
    expect(aTerminar.length).toBeGreaterThanOrEqual(3);
    const estados = new Set(fichas.map((f) => derivarEstadoContrato(f.vinculos)));
    expect(estados).toEqual(new Set(["em_curso", "suspenso", "terminado", "por_iniciar"]));
  });

  it("os segredos de exemplo acabam nos mesmos 4 dígitos que a máscara mostra", () => {
    for (const f of Object.values(lerEstado().fichas)) {
      expect(f.segredos.niss.endsWith(f.identificacao?.niss_ultimos4 ?? "?")).toBe(true);
      expect(f.segredos.conta.endsWith(f.bancarios?.conta_ultimos4 ?? "?")).toBe(true);
    }
  });

  it("atualizarFicha altera só a pessoa pedida e repor() volta ao início", () => {
    atualizarFicha("p-rui", (f) => ({ ...f, pessoa: { ...f.pessoa, cargo: "Outro cargo" } }));
    expect(lerEstado().fichas["p-rui"].pessoa.cargo).toBe("Outro cargo");
    expect(lerEstado().fichas["p-hugo"].pessoa.cargo).not.toBe("Outro cargo");
    repor();
    expect(lerEstado().fichas["p-rui"].pessoa.cargo).not.toBe("Outro cargo");
  });

  it("atualizarFicha ignora um id que não existe", () => {
    const antes = lerEstado();
    atualizarFicha("nao-existe", (f) => f);
    expect(lerEstado()).toBe(antes);
  });

  it("novoId gera identificadores diferentes", () => {
    expect(novoId("x")).not.toBe(novoId("x"));
  });
});

describe("cálculo de dias de ausência reutilizado", () => {
  it("não conta o fim de semana nas férias", () => {
    const tipo = { inclui_fim_de_semana: false, inclui_feriados: false };
    const r = calcularPedido({ dataInicio: "2026-10-12", dataFim: "2026-10-18", tipo });
    expect(r.total).toBe(5);
  });
});
