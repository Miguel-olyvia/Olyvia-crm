// A atividade da ficha real: os eventos dos negócios, os contactos sem resultado conhecido e o motivo de encerrar.
import { describe, expect, it } from "vitest";
import { ASSUNTOS_SUPOSTOS, adaptarAtividade } from "./adaptarAtividade";
import { adaptarRegistos } from "./adaptarRegistos";
import { atividadeDb, contactoDb, fichaDb, negocioDb, seccaoDb } from "./fichaFabrica";
import type { EventoNegocioDb } from "./fichaTipos";

const evento = (sobre: Partial<EventoNegocioDb> = {}): EventoNegocioDb => ({
  id: "e1", tipo: "perdeu", fase: "proposta", motivo: "Preço", motivo_reabertura: null, criado_em: "2026-10-14T09:00:00Z", criado_por_nome: "Rita", ...sobre,
});
const comEventos = (...eventos: EventoNegocioDb[]) => fichaDb({ negocios: { total: 1, itens: [negocioDb({ titulo: "Casa de banho", eventos })] } });

describe("eventos dos negócios (negocios.itens[].eventos) no histórico", () => {
  it.each([
    ["perdeu", "lost"], ["ganhou", "won"], ["reabriu", "reopened"], ["apagado", "deleted"], ["restaurado", "restored"],
  ])("o evento %s passa a histórico com a chave %s e o nome do negócio", (tipo, chave) => {
    const [item] = adaptarAtividade(comEventos(evento({ tipo, motivo: null })));
    expect(item).toMatchObject({
      id: "evento-e1", tipo: "historico", chaveTitulo: `pessoasPagina.real.ficha.activity.${chave}`, exemplo: false, quando: "2026-10-14", hora: "10:00",
    });
    expect(item.detalhe).toContain("Casa de banho");
  });

  it("a perda leva o motivo escrito e a reabertura o motivo da reabertura", () => {
    const [perda] = adaptarAtividade(comEventos(evento({ tipo: "perdeu", motivo: "Preço" })));
    expect(perda.detalhe).toBe("Casa de banho · Preço");
    const [reabriu] = adaptarAtividade(comEventos(evento({ tipo: "reabriu", motivo: null, motivo_reabertura: "Voltou a ligar" })));
    expect(reabriu.detalhe).toBe("Casa de banho · Voltou a ligar");
  });

  it("os eventos de outros tipos (fases, criação...) não entram", () => {
    expect(adaptarAtividade(comEventos(evento({ tipo: "fase" }), evento({ id: "e2", tipo: "criado" })))).toEqual([]);
  });

  it("misturam-se com as interações pela ordem do mais recente para o mais antigo", () => {
    const ficha = fichaDb({
      atividade: seccaoDb([atividadeDb({ id: "novo", em: "2026-10-16T09:00:00Z" }), atividadeDb({ id: "velho", em: "2026-10-10T09:00:00Z" })]),
      negocios: { total: 1, itens: [negocioDb({ eventos: [evento({ id: "meio", criado_em: "2026-10-13T09:00:00Z" })] })] },
    });
    expect(adaptarAtividade(ficha).map((i) => i.id)).toEqual(["novo", "evento-meio", "velho"]);
  });

  it("um evento sem data válida vai para o fim, sem rebentar", () => {
    const ficha = fichaDb({
      atividade: seccaoDb([atividadeDb({ id: "a" })]),
      negocios: { total: 1, itens: [negocioDb({ eventos: [evento({ id: "x", criado_em: null })] })] },
    });
    expect(adaptarAtividade(ficha).map((i) => i.id)).toEqual(["a", "evento-x"]);
  });

  it("não muda a ficha de entrada", () => {
    const ficha = comEventos(evento());
    const antes = JSON.stringify(ficha);
    adaptarAtividade(ficha);
    expect(JSON.stringify(ficha)).toBe(antes);
  });
});

describe("contacto sem resultado conhecido", () => {
  it("na atividade tem um título neutro traduzido", () => {
    for (const resultado of ["xpto", null]) {
      const [item] = adaptarAtividade(fichaDb({ atividade: seccaoDb([atividadeDb({ tipo: "call", resultado })]) }));
      expect(item).toMatchObject({ tipo: "chamada", chaveTitulo: "pessoasPagina.real.ficha.unknownResult" });
    }
  });

  it("nos registos continua a ver-se (os totais batem), sem resultado", () => {
    const { contactos } = adaptarRegistos(fichaDb({ contactos: seccaoDb([contactoDb({ id: "a" }), contactoDb({ id: "b", resultado: "talvez" }), contactoDb({ id: "c", resultado: null })]) }));
    expect(contactos.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(contactos.map((c) => c.resultado)).toEqual(["atendeuInteressado", null, null]);
  });
});

describe("assuntos supostos das notas (por confirmar na base)", () => {
  it("os assuntos que o código reconhece estão num sítio só, explícito", () => {
    expect(ASSUNTOS_SUPOSTOS).toEqual({
      encerrada: "Abordagem encerrada", reaberta: "Abordagem reaberta", adiado: "Contacto adiado",
    });
  });

  it("uma nota com outro assunto é uma nota livre (nada se assume)", () => {
    const [item] = adaptarAtividade(fichaDb({ atividade: seccaoDb([atividadeDb({ tipo: "note", assunto: "Contacto  adiado", notas: "x" })]) }));
    expect(item.tipo).toBe("nota");
  });
});

describe("o motivo ao encerrar a abordagem", () => {
  const encerramento = (motivo: string | null, motivoOutro: string | null = null) => ({
    id: "l", estado: "closed", aberta: false,
    encerramento: { resultado: "semInteresse", motivo, motivo_outro: motivoOutro, em: "2026-10-15T09:00:00Z" },
  });
  const nota = (sobre = {}) => atividadeDb({ id: "enc", tipo: "note", assunto: "Abordagem encerrada", notas: null, em: "2026-10-15T09:00:01Z", ...sobre });

  it("um motivo da lista aparece traduzido (por chave) no histórico", () => {
    const [item] = adaptarAtividade(fichaDb({ lead: encerramento("preco"), atividade: seccaoDb([nota()]) }));
    expect(item).toMatchObject({ tipo: "historico", chaveTitulo: "pessoasPagina.close.activity.closed", chaveMotivo: "pessoasPagina.lost.preco" });
  });

  it("o motivo «outro» leva o texto que se escreveu", () => {
    const [item] = adaptarAtividade(fichaDb({ lead: encerramento("outro", "Mudou de casa"), atividade: seccaoDb([nota()]) }));
    expect(item).toMatchObject({ chaveMotivo: "pessoasPagina.close.reason.other", detalhe: "Mudou de casa" });
  });

  it("só a nota de encerrar mais recente leva o motivo; as anteriores ficam com as notas", () => {
    const itens = adaptarAtividade(fichaDb({
      lead: encerramento("preco"),
      atividade: seccaoDb([nota({ id: "recente" }), nota({ id: "antiga", em: "2026-09-01T09:00:00Z", notas: "texto antigo" })]),
    }));
    expect(itens[0].chaveMotivo).toBe("pessoasPagina.lost.preco");
    expect(itens[1].chaveMotivo).toBeUndefined();
    expect(itens[1].detalhe).toBe("texto antigo");
  });

  it("sem encerramento na ficha (já reaberta), a nota fica só com o que escreveu", () => {
    const [item] = adaptarAtividade(fichaDb({ lead: null, atividade: seccaoDb([nota({ notas: "Sem interesse" })]) }));
    expect(item.chaveMotivo).toBeUndefined();
    expect(item.detalhe).toBe("Sem interesse");
  });
});
