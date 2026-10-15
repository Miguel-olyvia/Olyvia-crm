// Justificar um dia com falta sugerida ou atraso (puro): quando se pode justificar (prazo, desvio), as transições
// pendente → aceite paga / não paga / recusada e o que cada decisão faz ao desconto (pela regra das faltas).
import { describe, expect, it } from "vitest";
import {
  criarJustificacaoDia,
  decidirJustificacaoDia,
  descontoDaDecisao,
  diasDesdeEnvio,
  mesDoDia,
  podeEnviar,
  resumoDoMotivo,
  situacaoDoDia,
  type ContextoEnvio,
  type EstadoDoDia,
  type JustificacaoDia,
} from "./justificacaoDia";

const HOJE = "2026-10-14";
const ENVIO_VALIDO = { tipo: "transporte", motivo: "O autocarro avariou", horaReal: "09:12", anexos: [] as string[] };

function justificacao(campos: Partial<JustificacaoDia> = {}): JustificacaoDia {
  return {
    id: "j1", origem: "sugestao", pessoaId: "p-sofia", data: "2026-10-08", tipo: "transporte", motivo: "O autocarro avariou",
    horaReal: "09:12", anexos: [], minutos: 12, periodoInicio: "09:00", periodoFim: "09:12", deAtraso: true,
    enviadaEm: "2026-10-09T10:00:00.000Z", estado: "pendente", decididaPor: null, decididaEm: null, motivoRecusa: null,
    faltaId: null, mesFechado: false, ...campos,
  };
}

const situacao = (data: string, temDesvio: boolean, js: JustificacaoDia[] = [], prazoDias = 5) =>
  situacaoDoDia({ data, hoje: HOJE, prazoDias, temDesvio, justificacoes: js });

describe("quando se pode justificar", () => {
  it("um dia com desvio dentro do prazo (5 dias úteis) deixa justificar, e diz quantos dias restam", () => {
    const s = situacao("2026-10-08", true);
    expect(s.estado).toBe("pode_justificar");
    expect(s.prazoAte).toBe("2026-10-15");
    expect(s.diasRestantes).toBe(1);
  });

  it("no último dia do prazo ainda deixa, com 0 dias restantes", () => {
    const s = situacao("2026-10-07", true);
    expect(s.estado).toBe("pode_justificar");
    expect(s.diasRestantes).toBe(0);
  });

  it("passado o prazo fica «prazo terminado», sem justificação, e já não deixa enviar", () => {
    const s = situacao("2026-10-06", true);
    expect(s.estado).toBe("prazo_terminado");
    expect(s.justificacao).toBeNull();
    expect(podeEnviar(s.estado)).toBe(false);
  });

  it("o prazo é o da organização: com 1 dia útil, o dia 8 já não deixa", () => {
    expect(situacao("2026-10-08", true, [], 1).estado).toBe("prazo_terminado");
    expect(situacao("2026-10-08", true, [], 10).estado).toBe("pode_justificar");
  });

  it("um dia sem falta sugerida nem atraso não se justifica", () => {
    const s = situacao("2026-10-08", false);
    expect(s.estado).toBe("nao_aplica");
    expect(podeEnviar(s.estado)).toBe(false);
  });

  it("só conta a justificação do próprio dia", () => {
    expect(situacao("2026-10-08", true, [justificacao({ data: "2026-10-09" })]).estado).toBe("pode_justificar");
  });
});

describe("o estado do dia depois de enviar", () => {
  const estados: Array<[JustificacaoDia["estado"], EstadoDoDia]> = [
    ["pendente", "enviada"],
    ["aceite_paga", "aceite_paga"],
    ["aceite_nao_paga", "aceite_nao_paga"],
    ["recusada", "recusada_com_prazo"],
  ];
  it.each(estados)("%s mostra %s", (estado, esperado) => {
    expect(situacao("2026-10-08", false, [justificacao({ estado })]).estado).toBe(esperado);
  });

  it("enviada deixa de deixar justificar; recusada deixa voltar a enviar só dentro do prazo", () => {
    expect(podeEnviar(situacao("2026-10-08", true, [justificacao()]).estado)).toBe(false);
    const recusada = justificacao({ estado: "recusada" });
    expect(podeEnviar(situacao("2026-10-08", true, [recusada]).estado)).toBe(true);
    expect(situacao("2026-10-06", true, [{ ...recusada, data: "2026-10-06" }]).estado).toBe("recusada_sem_prazo");
  });

  it("usa a última justificação do dia", () => {
    const antiga = justificacao({ id: "a", estado: "recusada" });
    const nova = justificacao({ id: "b", estado: "pendente" });
    expect(situacao("2026-10-08", true, [antiga, nova]).justificacao?.id).toBe("b");
  });
});

describe("enviar a justificação", () => {
  const ctx: ContextoEnvio = {
    id: "j9", pessoaId: "p-sofia", data: "2026-10-08", estado: "pode_justificar", minutos: 12,
    periodoInicio: "09:00", periodoFim: "09:12", deAtraso: true, agora: "2026-10-14T10:00:00.000Z",
  };

  it("cria uma justificação pendente, de origem sugestão, com o motivo aparado", () => {
    const r = criarJustificacaoDia(ctx, { ...ENVIO_VALIDO, motivo: "  O autocarro avariou  ", horaReal: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor).toMatchObject({ estado: "pendente", origem: "sugestao", motivo: "O autocarro avariou", horaReal: null, faltaId: null });
    }
  });

  it("devolve um erro por campo: tipo, motivo curto, hora inválida e anexos a mais", () => {
    const r = criarJustificacaoDia(ctx, { tipo: "ferias", motivo: "ab", horaReal: "25:99", anexos: ["a", "b", "c", "d", "e"] });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(Object.keys(r.erros).sort()).toEqual(["anexos", "horaReal", "motivo", "tipo"]);
    }
  });

  it("aceita 4 anexos e motivo com 3 caracteres, mas não 5 anexos nem 2 caracteres", () => {
    expect(criarJustificacaoDia(ctx, { ...ENVIO_VALIDO, motivo: "abc", anexos: ["a", "b", "c", "d"] }).ok).toBe(true);
    expect(criarJustificacaoDia(ctx, { ...ENVIO_VALIDO, motivo: "ab" }).ok).toBe(false);
    expect(criarJustificacaoDia(ctx, { ...ENVIO_VALIDO, anexos: ["a", "b", "c", "d", "e"] }).ok).toBe(false);
  });

  it("depois do prazo, ou com uma já enviada, recusa com erro geral", () => {
    for (const estado of ["prazo_terminado", "recusada_sem_prazo", "enviada", "aceite_paga", "nao_aplica"] as const) {
      const r = criarJustificacaoDia({ ...ctx, estado }, ENVIO_VALIDO);
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.erros.geral).toMatch(/^rhJust\.erro\./);
    }
  });

  it("voltar a enviar depois de uma recusa dentro do prazo é permitido", () => {
    expect(criarJustificacaoDia({ ...ctx, estado: "recusada_com_prazo" }, ENVIO_VALIDO).ok).toBe(true);
  });
});

describe("a decisão do RH", () => {
  const dados = { motivo: "", quem: "Marta", agora: "2026-10-14T11:00:00.000Z", mesFechado: false };

  it("aceitar paga e aceitar não paga passam a aceite, com quem e quando", () => {
    const paga = decidirJustificacaoDia(justificacao(), "aceitar_paga", dados);
    const naoPaga = decidirJustificacaoDia(justificacao(), "aceitar_nao_paga", dados);
    expect(paga.ok && paga.valor).toMatchObject({ estado: "aceite_paga", decididaPor: "Marta", motivoRecusa: null });
    expect(naoPaga.ok && naoPaga.valor).toMatchObject({ estado: "aceite_nao_paga" });
  });

  it("recusar exige motivo de pelo menos 3 caracteres e guarda-o", () => {
    expect(decidirJustificacaoDia(justificacao(), "recusar", { ...dados, motivo: "ab" }).ok).toBe(false);
    const r = decidirJustificacaoDia(justificacao(), "recusar", { ...dados, motivo: " Sem comprovativo " });
    expect(r.ok && r.valor).toMatchObject({ estado: "recusada", motivoRecusa: "Sem comprovativo" });
  });

  it("uma justificação já decidida não se decide outra vez", () => {
    const r = decidirJustificacaoDia(justificacao({ estado: "aceite_paga" }), "recusar", { ...dados, motivo: "motivo" });
    expect(r).toEqual({ ok: false, erro: "rhJust.erro.jaDecidida" });
  });

  it("num mês fechado a decisão fica registada com a marca de mês fechado", () => {
    const r = decidirJustificacaoDia(justificacao(), "aceitar_nao_paga", { ...dados, mesFechado: true });
    expect(r.ok && r.valor).toMatchObject({ estado: "aceite_nao_paga", mesFechado: true });
  });
});

describe("o que cada decisão faz ao desconto (regra das faltas)", () => {
  const j = { minutos: 12, deAtraso: true };

  it("aceitar paga: sem desconto; aceitar não paga: desconta o tempo ao valor da hora; recusar: nada muda", () => {
    expect(descontoDaDecisao(j, "aceitar_paga", 10)).toMatchObject({ desconta: false, valor: 0, razao: "justificada_paga" });
    expect(descontoDaDecisao(j, "aceitar_nao_paga", 10)).toMatchObject({ desconta: true, minutos: 12, valor: 2, razao: "justificada_nao_paga" });
    expect(descontoDaDecisao(j, "recusar", 10)).toBeNull();
  });

  it("o valor segue o valor da hora e o tempo", () => {
    expect(descontoDaDecisao({ minutos: 60, deAtraso: false }, "aceitar_nao_paga", 6.25)?.valor).toBe(6.25);
    expect(descontoDaDecisao({ minutos: 30, deAtraso: false }, "aceitar_nao_paga", 6.25)?.valor).toBe(3.13);
  });
});

describe("pequenos auxiliares", () => {
  it("mês do dia, dias desde o envio e resumo do motivo", () => {
    expect(mesDoDia("2026-09-30")).toBe("2026-09");
    expect(diasDesdeEnvio("2026-10-14T08:00:00.000Z", HOJE)).toBe(0);
    expect(diasDesdeEnvio("2026-10-12T23:00:00.000Z", HOJE)).toBe(2);
    expect(diasDesdeEnvio("2026-10-20T08:00:00.000Z", HOJE)).toBe(0);
    expect(resumoDoMotivo("  curto   e  limpo ")).toBe("curto e limpo");
    expect(resumoDoMotivo("x".repeat(100), 10)).toHaveLength(10);
  });
});
