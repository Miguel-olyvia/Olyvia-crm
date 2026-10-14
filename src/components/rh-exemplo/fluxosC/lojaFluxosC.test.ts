import { beforeEach, describe, expect, it } from "vitest";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { mesAtual } from "./dadosFluxosC";
import {
  adicionarMovimentoBanco, adicionarPontual, decidirHoraExtraNaLoja, definirPodeHorasExtra,
  fecharMesNaLoja, lerFluxosC, registarTempoAMais, reabrirMesNaLoja, reporFluxosC,
} from "./lojaFluxosC";
import { saldoDoBanco } from "./bancoHorasRegras";

beforeEach(() => {
  repor();
  reporFluxosC();
});

const pedido = (p: Partial<Parameters<typeof registarTempoAMais>[0]> = {}) => ({
  pessoaId: "p-rui", data: hojeIso(), tipo: "normal" as const, feitoMin: 570, planeadoMin: 480,
  diaEspecial: null, nocturnoMin: 0, motivoOrigem: "teste", ...p,
});

describe("pipeline do fluxo 6 na loja", () => {
  it("1 h 30 a mais com a marca cria uma pendente", () => {
    const r = registarTempoAMais(pedido());
    expect(r).toMatchObject({ resultado: "cria_pendente", minutos: 90, criadas: 1 });
    expect(lerFluxosC().horasExtra.at(-1)).toMatchObject({ estado: "pendente", minutos: 90, acimaDoLimite: false });
  });
  it("6 min fica abaixo do mínimo e não cria nada", () => {
    const n = lerFluxosC().horasExtra.length;
    expect(registarTempoAMais(pedido({ feitoMin: 486 })).resultado).toBe("abaixo_minimo");
    expect(lerFluxosC().horasExtra).toHaveLength(n);
  });
  it("sem a marca não cria, e com a marca ligada passa a criar", () => {
    expect(registarTempoAMais(pedido({ pessoaId: "p-marta" })).resultado).toBe("sem_marca");
    definirPodeHorasExtra("p-marta", true);
    expect(registarTempoAMais(pedido({ pessoaId: "p-marta" })).criadas).toBe(1);
  });
  it("3 h num dia divide em 2 h normais + 1 h acima do limite", () => {
    const r = registarTempoAMais(pedido({ feitoMin: 660, data: `${new Date().getUTCFullYear()}-03-10`, nocturnoMin: 150 }));
    expect(r).toMatchObject({ criadas: 2, acimaDoLimiteMin: 60 });
    const novas = lerFluxosC().horasExtra.slice(-2);
    expect(novas.map((h) => [h.minutos, h.acimaDoLimite])).toEqual([[120, false], [60, true]]);
    expect(novas.reduce((s, h) => s + h.nocturnoMin, 0)).toBe(150);
  });
  it("decidir passa o estado e uma segunda decisão é recusada", () => {
    registarTempoAMais(pedido());
    const id = lerFluxosC().horasExtra.at(-1)!.id;
    expect(decidirHoraExtraNaLoja(id, "confirmar", "").ok).toBe(true);
    expect(decidirHoraExtraNaLoja(id, "rejeitar", "motivo bom")).toEqual({ ok: false, erro: "ja_decidida" });
  });
});

describe("banco de horas e pontuais na loja", () => {
  it("crédito manual soma ao saldo e guarda origem manual", () => {
    const antes = saldoDoBanco(lerFluxosC().banco, "p-sofia");
    expect(adicionarMovimentoBanco("p-sofia", 60, "acerto").ok).toBe(true);
    expect(saldoDoBanco(lerFluxosC().banco, "p-sofia")).toBe(antes + 60);
    expect(lerFluxosC().banco.at(-1)?.origem).toBe("manual");
  });
  it("débito acima do máximo em dívida é recusado e não grava", () => {
    const n = lerFluxosC().banco.length;
    expect(adicionarMovimentoBanco("p-sofia", -100 * 60, "acerto")).toEqual({ ok: false, erro: "abaixo_minimo" });
    expect(lerFluxosC().banco).toHaveLength(n);
  });
  it("pontual valida e o mês fechado recusa", () => {
    const mes = mesAtual();
    expect(adicionarPontual("p-rui", mes, " ", 10)).toBe("descricao");
    expect(adicionarPontual("p-rui", mes, "x", 0)).toBe("valor");
    expect(adicionarPontual("p-rui", mes, "x", 2_000_000)).toBe("valor");
    expect(adicionarPontual("p-rui", mes, "x", -5)).toBeNull();
    fecharMesNaLoja(mes, []);
    expect(adicionarPontual("p-rui", mes, "x", 5)).toBe("mes_fechado");
  });
  it("fechar duas vezes não duplica e reabrir remove o fecho e regista", () => {
    const mes = mesAtual();
    expect(fecharMesNaLoja(mes, [])).not.toBeNull();
    expect(fecharMesNaLoja(mes, [])).toBeNull();
    expect(reabrirMesNaLoja(mes, "motivo", false)).toEqual({ ok: false, erro: "sem_autorizacao" });
    expect(reabrirMesNaLoja(mes, "motivo", true).ok).toBe(true);
    expect(lerFluxosC().fechos[mes]).toBeUndefined();
    expect(lerFluxosC().reaberturas).toHaveLength(1);
  });
});
