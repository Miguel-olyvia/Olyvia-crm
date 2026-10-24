import { describe, expect, it } from "vitest";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import type { AlertaDia, JustificacaoPicagem } from "./alertasFimDia";
import { justificacoesDoDia, permissoesDaVista } from "./vistaDaPessoa";

const TUDO: PermissoesAssiduidade = {
  view: true, viewOwn: true, equipaView: true, picar: true, picarOutros: true, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: true,
};

describe("o que a vista da própria pessoa deixa fazer", () => {
  it("a pessoa perde tudo o que escreve no ponto de alguém, mesmo com a conta cheia de permissões", () => {
    const p = permissoesDaVista(TUDO, true);
    expect([p.corrigir, p.faltasEdit, p.justificacaoEdit, p.picarOutros, p.gerir, p.validarRealizado, p.obrasRegistar]).toEqual(Array(7).fill(false));
  });

  it("mantém o que é só ler e o picar do próprio", () => {
    const p = permissoesDaVista(TUDO, true);
    expect([p.view, p.viewOwn, p.equipaView, p.picar, p.faltasView, p.justificacaoView]).toEqual(Array(6).fill(true));
  });

  it("o RH vê tudo igual, e não se altera o objeto de entrada", () => {
    expect(permissoesDaVista(TUDO, false)).toBe(TUDO);
    permissoesDaVista(TUDO, true);
    expect(TUDO.corrigir).toBe(true);
  });
});

const alerta = (parcial: Partial<AlertaDia>): AlertaDia => ({
  id: "a1", pessoaId: "p1", data: "2026-10-13", tipo: "pendente_par", horaInicio: "14:00:00", horaFim: null, minutos: null,
  distanciaM: null, estado: "pendente", motivo: null, tratadoPor: null, tratadoEm: null, ...parcial,
});

const justificacao = (parcial: Partial<JustificacaoPicagem>): JustificacaoPicagem => ({
  id: "j1", alertaId: "a1", pessoaId: "p1", horaReal: "18:00", motivo: "Esqueci-me", anexoNome: null, enviadaEm: "2026-10-14T09:00:00Z",
  estado: "pendente", decididaPor: null, decididaEm: null, motivoRecusa: null, ...parcial,
});

describe("justificar no dia (5 dias úteis)", () => {
  it("um dia com picagem em falta dentro do prazo pode ser justificado", () => {
    const r = justificacoesDoDia([alerta({})], [], "p1", "2026-10-13", "2026-10-14");
    expect(r.porJustificar.map((a) => a.id)).toEqual(["a1"]);
    expect(r.enviadas).toEqual([]);
  });

  it("no último dia útil do prazo ainda se justifica, e no dia seguinte já não", () => {
    // 2026-10-05 é segunda-feira: 5 dias úteis depois é 2026-10-12.
    const a = alerta({ data: "2026-10-05" });
    expect(justificacoesDoDia([a], [], "p1", "2026-10-05", "2026-10-12").porJustificar).toHaveLength(1);
    expect(justificacoesDoDia([a], [], "p1", "2026-10-05", "2026-10-13").porJustificar).toHaveLength(0);
  });

  it("outros dias, outras pessoas e alertas já tratados não dão nada para justificar", () => {
    const alertas = [alerta({}), alerta({ id: "a2", pessoaId: "p2" }), alerta({ id: "a3", estado: "corrigido" }), alerta({ id: "a4", data: "2026-10-12" })];
    const r = justificacoesDoDia(alertas, [], "p1", "2026-10-13", "2026-10-14");
    expect(r.porJustificar.map((x) => x.id)).toEqual(["a1"]);
    expect(justificacoesDoDia(alertas, [], "p1", "2026-10-01", "2026-10-14").porJustificar).toEqual([]);
  });

  it("o estado das justificações enviadas (pendente, aceite, recusada com motivo) vem com o dia certo", () => {
    const alertas = [alerta({ estado: "justificacao_recebida" }), alerta({ id: "a2", data: "2026-10-09", estado: "corrigido" })];
    const lista = [
      justificacao({}),
      justificacao({ id: "j2", alertaId: "a2", estado: "recusada", motivoRecusa: "Sem prova" }),
      justificacao({ id: "j3", alertaId: "a1", pessoaId: "p9" }),
    ];
    const dia13 = justificacoesDoDia(alertas, lista, "p1", "2026-10-13", "2026-10-14");
    expect(dia13.enviadas.map((e) => [e.justificacao.id, e.justificacao.estado])).toEqual([["j1", "pendente"]]);
    expect(dia13.porJustificar).toEqual([]);
    const dia9 = justificacoesDoDia(alertas, lista, "p1", "2026-10-09", "2026-10-14");
    expect(dia9.enviadas[0].justificacao).toMatchObject({ estado: "recusada", motivoRecusa: "Sem prova" });
  });
});
