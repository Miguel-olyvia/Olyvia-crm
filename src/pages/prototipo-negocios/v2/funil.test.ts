// As regras puras das secções novas das Definições da V2: funil, pontuação, "Experimentar", agenda e o índice.
import { describe, expect, it } from "vitest";
import { acertarHorario, agendaInicial, duracao, resumoDias } from "./agendaDefinicoes";
import { dadosIniciais, esquecerDefinicoes, lerDefinicoes, mudarDefinicoes } from "./definicoesDados";
import { INDICE, SECOES, indiceVisivel, procurar, secoesVisiveis } from "./definicoesIndice";
import {
  AVANCO_INICIAL, LEADS_EXEMPLO, LIMIARES_INICIAIS, OPCOES_AVANCO, REGRAS_PONTOS_INICIAIS, acertarLimiares, cumpre, experimentar, faseDe, fraseAvanco,
  fraseRegra, pontuar, qualificar, regraNova, type RegraPontos,
} from "./funil";

const cfg = { regras: REGRAS_PONTOS_INICIAIS, limiares: LIMIARES_INICIAIS, avanco: AVANCO_INICIAL };

describe("Funil · quando cada fase avança", () => {
  it("as frases leem-se e usam o nome da fase escolhido", () => {
    expect(fraseAvanco(1, "chamada")).toBe("Passa a Contacto quando houver chamada registada.");
    expect(fraseAvanco(2, "visita_feita", ["Lead", "Contacto", "Levantamento"])).toBe("Passa a Levantamento quando a visita estiver feita.");
    expect(fraseAvanco(0, null)).toMatch(/^Entra como Lead quando/);
  });
  it("cada fase depois da Lead tem pelo menos duas escolhas, e a regra inicial está entre elas", () => {
    for (let i = 1; i < 6; i++) {
      expect(OPCOES_AVANCO[i].length).toBeGreaterThanOrEqual(2);
      expect(OPCOES_AVANCO[i]).toContain(AVANCO_INICIAL[i]);
    }
  });
  it("avança fase a fase e não salta fases", () => {
    expect(faseDe([], AVANCO_INICIAL)).toBe(0);
    expect(faseDe(["chamada"], AVANCO_INICIAL)).toBe(1);
    expect(faseDe(["chamada", "visita_marcada", "orcamento_enviado", "contrato_assinado", "sinal_pago"], AVANCO_INICIAL)).toBe(5);
    // visita marcada sem chamada registada: fica em Lead
    expect(faseDe(["visita_marcada", "orcamento_enviado"], AVANCO_INICIAL)).toBe(0);
  });
  it("mudar a regra muda a fase", () => {
    const outra = [...AVANCO_INICIAL];
    outra[2] = "visita_feita";
    expect(faseDe(["chamada", "visita_marcada"], AVANCO_INICIAL)).toBe(2);
    expect(faseDe(["chamada", "visita_marcada"], outra)).toBe(1);
  });
});

describe("Pontuação das leads", () => {
  const campos = LEADS_EXEMPLO[0].campos;
  it("as regras escrevem-se como frase", () => {
    expect(fraseRegra(REGRAS_PONTOS_INICIAIS[0])).toBe("Se Origem é Indicação → +20 pontos");
    expect(fraseRegra({ id: "z", campo: "zona", op: "nao_e", valor: "Até 15 km", pontos: -5 })).toBe("Se Zona não é Até 15 km → -5 pontos");
  });
  it("'é' e 'não é'", () => {
    expect(cumpre({ id: "a", campo: "servico", op: "e", valor: "Cozinha", pontos: 5 }, campos)).toBe(true);
    expect(cumpre({ id: "a", campo: "servico", op: "nao_e", valor: "Cozinha", pontos: 5 }, campos)).toBe(false);
  });
  it("soma os pontos das regras que cumpre, com as razões, e nunca fica abaixo de 0", () => {
    const p = pontuar(campos, REGRAS_PONTOS_INICIAIS);
    expect(p.total).toBe(50);
    expect(p.razoes.map((x) => x.regra.id)).toEqual(["r1", "r2", "r3"]);
    expect(pontuar(LEADS_EXEMPLO[2].campos, REGRAS_PONTOS_INICIAIS).total).toBe(0);
    expect(pontuar(campos, [])).toEqual({ total: 0, razoes: [] });
  });
  it("qualifica pelos limiares", () => {
    expect(qualificar(19, { mql: 20, sql: 40 })).toBe("Por qualificar");
    expect(qualificar(20, { mql: 20, sql: 40 })).toBe("MQL");
    expect(qualificar(40, { mql: 20, sql: 40 })).toBe("SQL");
  });
  it("o MQL nunca passa o SQL", () => {
    expect(acertarLimiares({ mql: 45, sql: 40 }, "mql")).toEqual({ mql: 40, sql: 40 });
    expect(acertarLimiares({ mql: 20, sql: 15 }, "sql")).toEqual({ mql: 20, sql: 20 });
    expect(acertarLimiares({ mql: 10, sql: 30 }, "sql")).toEqual({ mql: 10, sql: 30 });
  });
  it("uma regra nova tem um id que não se repete", () => {
    const regras: RegraPontos[] = [{ ...REGRAS_PONTOS_INICIAIS[0], id: "r2" }];
    expect(regraNova(regras).id).toBe("r3");
    expect(regraNova([]).campo).toBe("origem");
  });
});

describe("Experimentar", () => {
  it("aplica as regras às três leads de exemplo: pontos, qualificação e fase", () => {
    const r = experimentar(LEADS_EXEMPLO, cfg);
    expect(r.map((x) => [x.lead.nome, x.pontos.total, x.qualificacao, x.fase])).toEqual([
      ["Teresa Gomes", 50, "SQL", 3],
      ["Paulo Antunes", 20, "MQL", 1],
      ["Helena Costa", 0, "Por qualificar", 0],
    ]);
  });
  it("muda com as regras e os limiares", () => {
    const r = experimentar(LEADS_EXEMPLO, { ...cfg, regras: [{ id: "x", campo: "origem", op: "e", valor: "Panfleto", pontos: 30 }], limiares: { mql: 10, sql: 25 } });
    expect(r.map((x) => x.qualificacao)).toEqual(["Por qualificar", "Por qualificar", "SQL"]);
  });
});

describe("Agenda", () => {
  it("resume os dias", () => {
    expect(resumoDias([true, true, true, true, true, false, false])).toBe("Seg a Sex");
    expect(resumoDias([true, false, true, false, true, false, false])).toBe("Seg, Qua, Sex");
    expect(resumoDias(Array(7).fill(true))).toBe("Todos os dias");
    expect(resumoDias(Array(7).fill(false))).toBe("Nenhum dia");
  });
  it("o horário acaba sempre depois de começar", () => {
    expect(acertarHorario("09:00", "18:00", "inicio")).toEqual({ inicio: "09:00", fim: "18:00" });
    expect(acertarHorario("19:00", "18:00", "inicio")).toEqual({ inicio: "19:00", fim: "19:30" });
    expect(acertarHorario("09:00", "08:00", "fim")).toEqual({ inicio: "07:30", fim: "08:00" });
  });
  it("escreve as durações", () => {
    expect(duracao(45)).toBe("45 min");
    expect(duracao(60)).toBe("1 h");
    expect(duracao(90)).toBe("1 h 30 min");
  });
  it("os dados de exemplo: três quadros, quatro recursos, três tipos de visita", () => {
    const a = agendaInicial();
    expect(a.quadros).toHaveLength(3);
    expect(new Set(a.recursos.map((r) => r.tipo))).toEqual(new Set(["Pessoa", "Veículo", "Equipamento"]));
    expect(a.regras.duracoes).toHaveLength(3);
  });
});

describe("Store e índice", () => {
  it("esquecerDefinicoes volta a agenda, o funil e os canais ao início", () => {
    mudarDefinicoes((d) => { d.quadros = []; d.regrasPontos = []; d.limiares.mql = 5; d.canalPago.Parcerias = true; d.avanco[1] = "email_respondido"; });
    esquecerDefinicoes();
    const d = lerDefinicoes(), i = dadosIniciais();
    expect(d.quadros).toEqual(i.quadros);
    expect(d.regrasPontos).toEqual(REGRAS_PONTOS_INICIAIS);
    expect(d.limiares).toEqual(LIMIARES_INICIAIS);
    expect(d.canalPago.Parcerias).toBe(false);
    expect(d.avanco[1]).toBe("chamada");
  });
  it("as regras de exemplo não se estragam ao mudar a store", () => {
    mudarDefinicoes((d) => { d.regrasPontos[0].pontos = -20; });
    expect(REGRAS_PONTOS_INICIAIS[0].pontos).toBe(20);
    esquecerDefinicoes();
  });
  it("as secções novas encontram-se pelos nomes do antigo", () => {
    expect(procurar("scoring")[0].ancora).toBe("funil-pontos");
    expect(procurar("mql")[0].ancora).toBe("funil-limiares");
    expect(procurar("dry run")[0].ancora).toBe("funil-experimentar");
    expect(procurar("quadros")[0].ancora).toBe("agenda-quadros");
    expect(procurar("veículos")[0].ancora).toBe("agenda-recursos");
    expect(procurar("antecedência")[0].ancora).toBe("agenda-regras");
    expect(procurar("canais")[0].ancora).toBe("marketing-canais");
    expect(procurar("rgpd")[0].ancora).toBe("plataforma-lista");
  });
  it("a Plataforma só entra no índice e na lista de secções para a Direção", () => {
    expect(secoesVisiveis(false).some((s) => s.id === "plataforma")).toBe(false);
    expect(secoesVisiveis(true)).toEqual(SECOES);
    expect(procurar("rgpd", indiceVisivel(false))).toEqual([]);
    expect(indiceVisivel(true)).toEqual(INDICE);
  });
});
