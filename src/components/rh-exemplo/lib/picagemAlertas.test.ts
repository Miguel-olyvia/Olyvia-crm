import { describe, expect, it } from "vitest";
import { diasUteisEntre, ehDiaUtil, somarDiasUteis } from "@/components/rh-exemplo/lib/diasUteis";
import {
  DISTANCIA_DE_EXEMPLO,
  LIMITE_FORA_DO_LOCAL_METROS,
  REFERENCIA_EXEMPLO,
  avaliarPicagem,
  distanciaDaPicagem,
  distanciaMetros,
  foraDoLocal,
  localizacaoDeExemplo,
  referenciaDoLocal,
} from "@/components/rh-exemplo/lib/picagemLocal";
import {
  aplicarAccao,
  alertasPorTratar,
  decidirJustificacaoPicagem,
  diasUteisRestantes,
  prazoDaJustificacao,
  situacaoDoPrazo,
  submeterJustificacao,
  type AlertaDia,
} from "@/components/rh-exemplo/lib/alertasFimDia";

// 2026-12-09 e uma quarta-feira.
const alerta = (campos: Partial<AlertaDia> = {}): AlertaDia => ({
  id: "al1",
  pessoaId: "p1",
  data: "2026-12-09",
  tipo: "pendente_par",
  horaInicio: "14:00",
  horaFim: null,
  minutos: null,
  distanciaM: null,
  estado: "pendente",
  motivo: null,
  tratadoPor: null,
  tratadoEm: null,
  ...campos,
});

const AGORA = "2026-12-10T09:00:00.000Z";

describe("dias uteis", () => {
  it("fim de semana nao e dia util", () => {
    expect(ehDiaUtil("2026-12-12")).toBe(false);
    expect(ehDiaUtil("2026-12-13")).toBe(false);
    expect(ehDiaUtil("2026-12-14")).toBe(true);
  });

  it("5 dias uteis depois de quarta 09/12 e quarta 16/12 (salta o fim de semana)", () => {
    expect(somarDiasUteis("2026-12-09", 5)).toBe("2026-12-16");
    expect(somarDiasUteis("2026-12-09", 0)).toBe("2026-12-09");
  });

  it("conta os dias uteis depois de uma data, inclusive o ultimo", () => {
    expect(diasUteisEntre("2026-12-09", "2026-12-16")).toBe(5);
    expect(diasUteisEntre("2026-12-11", "2026-12-14")).toBe(1);
    expect(diasUteisEntre("2026-12-10", "2026-12-10")).toBe(0);
    expect(diasUteisEntre("2026-12-10", "2026-12-01")).toBe(0);
  });
});

describe("localizacao simulada", () => {
  it("distancia nula entre o mesmo ponto", () => {
    expect(distanciaMetros(REFERENCIA_EXEMPLO, REFERENCIA_EXEMPLO)).toBe(0);
  });

  it("«Estou no local» fica a menos de 200 m e nao marca fora do local", () => {
    const resultado = avaliarPicagem("no_local", REFERENCIA_EXEMPLO);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.localizacao.distanciaM).toBeLessThanOrEqual(LIMITE_FORA_DO_LOCAL_METROS);
    expect(resultado.localizacao.fora).toBe(false);
  });

  it("«Estou fora do local» fica a mais de 200 m e marca fora do local, com a distancia de exemplo", () => {
    const loc = localizacaoDeExemplo("fora_do_local", REFERENCIA_EXEMPLO);
    expect(loc.fora).toBe(true);
    expect(Math.abs(loc.distanciaM - DISTANCIA_DE_EXEMPLO.fora_do_local)).toBeLessThanOrEqual(2);
  });

  it("sem escolher onde esta, picar recusa", () => {
    expect(avaliarPicagem(null, REFERENCIA_EXEMPLO)).toEqual({ ok: false, erro: "rhExemplo.pic.erro.semLocalizacao" });
  });

  it("o limite e 200 m: 200 nao e fora, 201 e", () => {
    expect(foraDoLocal(200)).toBe(false);
    expect(foraDoLocal(201)).toBe(true);
  });

  it("usa as coordenadas do local quando existem, e a referencia de exemplo quando nao", () => {
    expect(referenciaDoLocal({ latitude: 41.15, longitude: -8.61 })).toEqual({ latitude: 41.15, longitude: -8.61 });
    expect(referenciaDoLocal({ latitude: null, longitude: null })).toEqual(REFERENCIA_EXEMPLO);
    expect(referenciaDoLocal(null)).toEqual(REFERENCIA_EXEMPLO);
  });

  it("a distancia de uma picagem gravada usa as suas coordenadas; sem coordenadas devolve null", () => {
    const loc = localizacaoDeExemplo("fora_do_local", REFERENCIA_EXEMPLO);
    expect(distanciaDaPicagem({ latitude: loc.latitude, longitude: loc.longitude }, REFERENCIA_EXEMPLO)).toBe(loc.distanciaM);
    expect(distanciaDaPicagem({ latitude: null, longitude: null }, REFERENCIA_EXEMPLO)).toBeNull();
  });
});

describe("accoes do RH sobre um alerta do fim do dia", () => {
  const dados = (motivo: string) => ({ motivo, quem: "Sofia", agora: AGORA });

  it("corrigir e marcar falta exigem motivo de 3 caracteres", () => {
    expect(aplicarAccao(alerta(), "corrigir", dados("ab"))).toEqual({ ok: false, erro: "rhExemplo.pic.erro.motivoCurto" });
    expect(aplicarAccao(alerta(), "marcar_falta", dados(""))).toEqual({ ok: false, erro: "rhExemplo.pic.erro.motivoCurto" });
  });

  it("cada accao muda o estado e regista quem e quando", () => {
    const corrigido = aplicarAccao(alerta(), "corrigir", dados("Relogio atrasado"));
    expect(corrigido.ok && corrigido.valor).toMatchObject({ estado: "corrigido", motivo: "Relogio atrasado", tratadoPor: "Sofia", tratadoEm: AGORA });
    const pedido = aplicarAccao(alerta(), "pedir_justificacao", dados(""));
    expect(pedido.ok && pedido.valor.estado).toBe("justificacao_pedida");
    const falta = aplicarAccao(alerta(), "marcar_falta", dados("Nao veio"));
    expect(falta.ok && falta.valor.estado).toBe("falta_marcada");
    const aceite = aplicarAccao(alerta(), "aceitar", dados(""));
    expect(aceite.ok && aceite.valor.estado).toBe("aceite");
  });

  it("um alerta ja tratado nao se trata outra vez, e a lista de pendentes deixa de o mostrar", () => {
    expect(aplicarAccao(alerta({ estado: "aceite" }), "aceitar", dados(""))).toEqual({ ok: false, erro: "rhExemplo.pic.erro.jaTratado" });
    const todos = [alerta(), alerta({ id: "b", estado: "aceite" }), alerta({ id: "c", estado: "justificacao_recebida" }), alerta({ id: "d", estado: "justificacao_pedida" })];
    expect(alertasPorTratar(todos).map((a) => a.id)).toEqual(["al1", "c"]);
  });
});

describe("justificar a falha de marcacao em 5 dias uteis", () => {
  const justificar = (hoje: string, campos = {}) =>
    submeterJustificacao(alerta(), { id: "j1", horaReal: "18:00", motivo: "Esqueci-me de picar", anexoNome: null, hoje, agora: AGORA, ...campos });

  it("o prazo acaba 5 dias uteis depois do dia do alerta", () => {
    expect(prazoDaJustificacao("2026-12-09")).toBe("2026-12-16");
  });

  it("conta os dias uteis que restam e chega a 0 no ultimo dia", () => {
    expect(diasUteisRestantes("2026-12-09", "2026-12-10")).toBe(4);
    expect(diasUteisRestantes("2026-12-09", "2026-12-16")).toBe(0);
    expect(diasUteisRestantes("2026-12-09", "2026-12-20")).toBe(0);
  });

  it("dentro do prazo fica pendente, com hora real, motivo e anexo", () => {
    const resultado = justificar("2026-12-10", { anexoNome: "print.png" });
    expect(resultado.ok && resultado.valor).toMatchObject({ estado: "pendente", horaReal: "18:00", anexoNome: "print.png", alertaId: "al1" });
  });

  it("no ultimo dia ainda aceita; no dia seguinte recusa por fora do prazo", () => {
    expect(justificar("2026-12-16").ok).toBe(true);
    expect(justificar("2026-12-17")).toEqual({ ok: false, erro: "rhExemplo.pic.erro.foraDoPrazo" });
  });

  it("recusa hora invalida e motivo curto", () => {
    expect(justificar("2026-12-10", { horaReal: "25:00" })).toEqual({ ok: false, erro: "rhExemplo.pic.erro.horaInvalida" });
    expect(justificar("2026-12-10", { motivo: "ab" })).toEqual({ ok: false, erro: "rhExemplo.pic.erro.motivoCurto" });
  });

  it("passado o prazo sem justificacao a diferenca fica «sem justificacao»", () => {
    expect(situacaoDoPrazo(alerta(), "2026-12-10")).toBe("dentro_do_prazo");
    expect(situacaoDoPrazo(alerta(), "2026-12-17")).toBe("sem_justificacao");
    expect(situacaoDoPrazo(alerta({ estado: "corrigido" }), "2026-12-17")).toBe("nao_aplica");
  });

  it("o RH aceita: a picagem fica lancada a mao e o alerta resolve-se", () => {
    const j = justificar("2026-12-10");
    if (!j.ok) throw new Error("justificacao devia ser valida");
    const decidido = decidirJustificacaoPicagem(j.valor, alerta({ estado: "justificacao_recebida" }), { aceitar: true, motivo: "", quem: "Sofia", agora: AGORA });
    expect(decidido.ok && decidido.valor.justificacao.estado).toBe("aceite");
    expect(decidido.ok && decidido.valor.alerta.estado).toBe("corrigido");
  });

  it("o RH recusa so com motivo, e a diferenca volta a pendente", () => {
    const j = justificar("2026-12-10");
    if (!j.ok) throw new Error("justificacao devia ser valida");
    const base = { aceitar: false, quem: "Sofia", agora: AGORA };
    expect(decidirJustificacaoPicagem(j.valor, alerta(), { ...base, motivo: "  " })).toEqual({ ok: false, erro: "rhExemplo.pic.erro.motivoCurto" });
    const recusado = decidirJustificacaoPicagem(j.valor, alerta({ estado: "justificacao_recebida" }), { ...base, motivo: "Nao confere" });
    expect(recusado.ok && recusado.valor.justificacao).toMatchObject({ estado: "recusada", motivoRecusa: "Nao confere" });
    expect(recusado.ok && recusado.valor.alerta.estado).toBe("pendente");
  });

  it("uma justificacao ja decidida nao se decide outra vez", () => {
    const j = justificar("2026-12-10");
    if (!j.ok) throw new Error("justificacao devia ser valida");
    const decidida = { ...j.valor, estado: "aceite" as const };
    expect(decidirJustificacaoPicagem(decidida, alerta(), { aceitar: true, motivo: "", quem: "S", agora: AGORA })).toEqual({ ok: false, erro: "rhExemplo.pic.erro.jaTratado" });
  });
});
