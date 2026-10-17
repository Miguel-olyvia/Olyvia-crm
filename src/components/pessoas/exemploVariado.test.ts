// Integridade dos exemplos variados (a matriz de pessoas, pedidos e negócios para testar o fluxo): ids únicos, cada negócio e cada
// pedido ligado a uma pessoa que existe, datas coerentes com HOJE_EXEMPLO, visitas e levantamentos bem formados e o papel
// Lead/Cliente derivado como esperado. Nada disto vem da base de dados.
import { describe, expect, it } from "vitest";
import { ehHistorico, type NegocioPessoa, type PedidoNegocio } from "./pessoasTipos";
import { faseDoNegocio, isNegocioGanho, valorDoNegocio, verificarCoerencia, type VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { COMERCIAIS_EXEMPLO } from "@/components/negocio-metas/novoNegocio";
import { DIVISOES, OUTRO, UNIDADES, trabalhosPorDivisao } from "@/components/negocio-metas/levantamentoExemplo";
import { validarLevantamento } from "@/components/negocio-metas/levantamento";
import { ESTADOS_VISITA, TIPOS_VISITA, ordenarVisitas } from "@/components/negocio-metas/visitasNegocio";
import { perguntaVisivel } from "@/components/negocio-metas/respostasVisita";
import { SECCOES_VISITA } from "@/components/negocio-metas/visitaExemplo";
import { temMorada, validarCodigoPostal } from "@/components/negocio-metas/moradaObra";
import { papelEAbertos } from "./juntarPessoas";
import { rotuloDoPedido, textoDoRotulo } from "./pedidoNegocio";
import { PEDIDOS_EXEMPLO } from "./pedidosDeExemplo";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import { NEGOCIOS_VARIADO } from "./negociosExemploVariado";
import { PEDIDOS_VARIADO } from "./pedidosExemploVariado";
import { PESSOAS_VARIADO } from "./pessoasExemploVariado";
import { extrasAtuais } from "./processo/processoNegocios";
import { EXTRAS_VARIADO } from "./processo/extrasExemploVariado";
import { orcamentoDoNegocio } from "./processo/orcamentoDetalhado";
import { verificarOrcamento } from "./processo/orcamentoCalculo";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;
const IDS_PESSOAS = new Set(PESSOAS_VARIADO.map((p) => p.id));
const LEADS = ["pv-ema", "pv-duarte", "pv-filipa", "pv-gaspar", "pv-helga", "pv-ivo", "pv-jaime", "pv-leonor"];
const CLIENTES = [
  "pv-otilia", "pv-pascoal", "pv-quiteria", "pv-rodrigo", "pv-sara", "pv-tomas", "pv-ursula", "pv-vitor", "pv-zita",
];
const OPCOES_PRESENTES = ["", "cliente", "casal", "familia", "outra"];
const OPCOES_DURACAO = ["", "m30", "h1", "h1m30", "h2"];

const visitasDe = (n: NegocioPessoa): VisitaNegocio[] => n.visitas ?? [];
const todasVisitas = (): { dono: string; v: VisitaNegocio }[] => [
  ...PEDIDOS_VARIADO.flatMap((p) => p.visitas.map((v) => ({ dono: p.id, v }))),
  ...NEGOCIOS_VARIADO.flatMap((n) => visitasDe(n).map((v) => ({ dono: n.id, v }))),
];

describe("exemplos variados: ligações e ids", () => {
  it("tem 8 leads e 9 clientes novos, todos com ids próprios", () => {
    expect(PESSOAS_VARIADO).toHaveLength(17);
    expect(PEDIDOS_VARIADO).toHaveLength(12);
    expect(NEGOCIOS_VARIADO).toHaveLength(21);
    expect([PESSOAS_EXEMPLO.length, PEDIDOS_EXEMPLO.length, NEGOCIOS_PESSOAS_EXEMPLO.length]).toEqual([34, 20, 39]);
    expect([...IDS_PESSOAS].sort()).toEqual([...LEADS, ...CLIENTES].sort());
  });

  it("os ids de pessoas, negócios, pedidos e visitas são únicos em todo o exemplo", () => {
    const grupos: Record<string, string[]> = {
      pessoas: PESSOAS_EXEMPLO.map((p) => p.id), negocios: NEGOCIOS_PESSOAS_EXEMPLO.map((n) => n.id), pedidos: PEDIDOS_EXEMPLO.map((p) => p.id),
      visitas: [...PEDIDOS_EXEMPLO.flatMap((p) => p.visitas), ...NEGOCIOS_PESSOAS_EXEMPLO.flatMap(visitasDe)].map((v) => v.id),
    };
    for (const [nome, ids] of Object.entries(grupos)) expect(new Set(ids).size, nome).toBe(ids.length);
  });

  it("cada negócio e cada pedido está ligado a uma pessoa que existe, com o mesmo nome, contacto e comercial", () => {
    for (const n of NEGOCIOS_VARIADO) {
      const p = PESSOAS_VARIADO.find((x) => x.id === n.pessoaId);
      expect(p, n.id).toBeDefined();
      expect(n.pessoa, n.id).toBe(p?.nome);
      expect(n.contacto, n.id).toEqual(p?.contacto);
      expect(n.comercial, n.id).toBe(p?.comercial);
      expect(COMERCIAIS_EXEMPLO, n.id).toContain(n.comercial);
    }
    for (const d of PEDIDOS_VARIADO) {
      expect(IDS_PESSOAS.has(d.pessoaId), d.id).toBe(true);
      expect(d.comercial, d.id).toBe(PESSOAS_VARIADO.find((x) => x.id === d.pessoaId)?.comercial);
    }
  });

  it("os casos que já existiam ficam como estavam: as 17 pessoas, os 10 negócios do quadro e os 8 pedidos de antes", () => {
    const antigas = PESSOAS_EXEMPLO.filter((p) => !IDS_PESSOAS.has(p.id));
    expect(antigas).toHaveLength(17);
    expect(PESSOAS_EXEMPLO.slice(0, 17).map((p) => p.id)).toEqual(antigas.map((p) => p.id));
    expect(NEGOCIOS_PESSOAS_EXEMPLO.slice(0, 10)).toEqual(DADOS_EXEMPLO.negocios);
    expect(PEDIDOS_EXEMPLO.slice(0, 8).map((p) => p.id)).toEqual(["pd-1", "pd-2", "pd-3", "pd-4", "pd-5", "pd-6", "pd-7", "pd-8"]);
    expect(PEDIDOS_EXEMPLO.slice(0, 8).every((p) => !IDS_PESSOAS.has(p.pessoaId))).toBe(true);
  });

  it("os negócios novos ficam fora do quadro de Negócio e metas (só o Quadro de Pessoas e as fichas os mostram)", () => {
    const idsDoQuadro = new Set(DADOS_EXEMPLO.negocios.map((n) => n.id));
    expect(NEGOCIOS_VARIADO.some((n) => idsDoQuadro.has(n.id))).toBe(false);
    expect(verificarCoerencia(DADOS_EXEMPLO)).toEqual([]);
  });
});

describe("exemplos variados: o papel deriva dos negócios", () => {
  const papelDe = (id: string) => papelEAbertos(NEGOCIOS_PESSOAS_EXEMPLO.filter((n) => n.pessoaId === id)).papel;

  it("as 8 leads não têm nenhum negócio ganho e os 9 clientes têm pelo menos um", () => {
    LEADS.forEach((id) => expect(papelDe(id), id).toBe("lead"));
    CLIENTES.forEach((id) => expect(papelDe(id), id).toBe("cliente"));
  });

  it("nenhuma lead tem negócios terminados ganhos, e os ganhos dos clientes são todos de meses anteriores", () => {
    const ganhos = NEGOCIOS_VARIADO.filter((n) => isNegocioGanho(n) || (ehHistorico(n) && n.resultado === "ganho"));
    expect(ganhos.length).toBeGreaterThanOrEqual(CLIENTES.length);
    ganhos.forEach((n) => {
      expect(CLIENTES, n.id).toContain(n.pessoaId);
      expect(ehHistorico(n) && n.mes < DADOS_EXEMPLO.mesAtual, n.id).toBe(true);
    });
  });
});

describe("exemplos variados: negócios", () => {
  it("cada negócio é coerente com o Quadro (um orçamento escolhido, proposta só com orçamento escolhido, contrato só com proposta)", () => {
    expect(verificarCoerencia({ ...DADOS_EXEMPLO, negocios: NEGOCIOS_VARIADO })).toEqual([]);
  });

  it("os abertos têm fase e valor de Negócio e metas; os terminados têm mês anterior ao atual", () => {
    for (const n of NEGOCIOS_VARIADO) {
      expect(n.dias, n.id).toBeGreaterThan(0);
      if (n.proximoPrazo !== null) expect(n.proximoPrazo, n.id).toMatch(ISO);
      if (ehHistorico(n)) {
        expect(n.mes, n.id).toMatch(/^\d{4}-\d{2}$/);
        expect(n.mes < DADOS_EXEMPLO.mesAtual, n.id).toBe(true);
        expect(valorDoNegocio(n), n.id).toBeGreaterThan(0);
      } else {
        expect(["orcamento", "proposta", "contrato"], n.id).toContain(faseDoNegocio(n));
      }
    }
  });

  it("os perdidos de exemplo trazem o motivo e os ganhos antigos têm contrato assinado", () => {
    const historicos = NEGOCIOS_VARIADO.filter(ehHistorico);
    historicos.filter((n) => n.resultado === "perdido").forEach((n) => expect((n as { motivoPerda?: string }).motivoPerda?.length, n.id).toBeGreaterThan(3));
    historicos.filter((n) => n.resultado === "ganho").forEach((n) => expect(n.contrato?.estado, n.id).toBe("assinado"));
  });
});

describe("exemplos variados: datas e visitas", () => {
  it("os pedidos foram criados até hoje, e uma visita feita não está no futuro nem uma por fazer no passado", () => {
    PEDIDOS_VARIADO.forEach((d) => {
      expect(d.criadoEm, d.id).toMatch(ISO);
      expect(d.criadoEm <= HOJE_EXEMPLO, d.id).toBe(true);
    });
    for (const { dono, v } of todasVisitas()) {
      expect(v.data, v.id).toMatch(ISO);
      if (v.estado === "feita") expect(v.data <= HOJE_EXEMPLO, `${dono}/${v.id}`).toBe(true);
      if (v.estado === "porFazer") expect(v.data >= HOJE_EXEMPLO, `${dono}/${v.id}`).toBe(true);
    }
  });

  it("cada visita está bem formada: estado, tipo, hora, quem foi, quem vai estar, duração e morada", () => {
    for (const { v } of todasVisitas()) {
      expect(ESTADOS_VISITA, v.id).toContain(v.estado);
      expect(TIPOS_VISITA, v.id).toContain(v.tipo);
      expect(v.hora === "" || HORA.test(v.hora), v.id).toBe(true);
      expect(v.feitoPor.length, v.id).toBeGreaterThan(0);
      expect(OPCOES_PRESENTES, v.id).toContain(v.quemVaiEstar);
      expect(OPCOES_DURACAO, v.id).toContain(v.duracao);
      expect(temMorada(v.morada), v.id).toBe(true);
      expect(v.morada.codigoPostal !== "" && validarCodigoPostal(v.morada.codigoPostal) === null, v.id).toBe(true);
    }
  });

  it("as visitas de cada pedido e de cada negócio estão por ordem cronológica", () => {
    const listas: VisitaNegocio[][] = [...PEDIDOS_VARIADO.map((p) => p.visitas), ...NEGOCIOS_VARIADO.map(visitasDe)];
    listas.forEach((l) => expect(l.map((v) => v.id)).toEqual(ordenarVisitas(l).map((v) => v.id)));
  });

  it("há uma visita cancelada, com o motivo na nota, e tipos de visita variados", () => {
    const canceladas = todasVisitas().filter(({ v }) => v.estado === "cancelada");
    expect(canceladas.length).toBeGreaterThanOrEqual(1);
    canceladas.forEach(({ v }) => expect(v.nota.length, v.id).toBeGreaterThan(10));
    const tipos = new Set(todasVisitas().map(({ v }) => v.tipo));
    expect([...tipos]).toEqual(expect.arrayContaining(["levantamento", "medicao", "revisita"]));
  });
});

describe("exemplos variados: o levantamento do pedido", () => {
  const comLevantamento = (): PedidoNegocio[] => PEDIDOS_VARIADO.filter((p) => p.levantamento !== undefined);

  it("há um pedido com várias linhas de medidas, válidas, e respostas das secções da visita", () => {
    expect(comLevantamento().length).toBeGreaterThanOrEqual(1);
    for (const d of comLevantamento()) {
      const lev = d.levantamento!;
      expect(lev.linhas.length, d.id).toBeGreaterThanOrEqual(4);
      expect(validarLevantamento({ data: HOJE_EXEMPLO, feitoPor: d.comercial, estado: "feito", linhas: lev.linhas, observacoes: lev.observacoes }), d.id).toEqual({});
      for (const l of lev.linhas) {
        expect(DIVISOES, l.id).toContain(l.divisao);
        expect(UNIDADES, l.id).toContain(l.unidade);
        expect([...trabalhosPorDivisao(l.divisao), OUTRO], l.id).toContain(l.trabalho);
      }
      expect(new Set(lev.linhas.map((l) => l.id)).size, d.id).toBe(lev.linhas.length);
      expect(d.visitas.some((v) => v.estado === "feita"), d.id).toBe(true);
    }
  });

  it("as respostas são de perguntas que existem, com opções que existem e visíveis, em pelo menos 4 secções", () => {
    const perguntas = SECCOES_VISITA.flatMap((s) => s.blocos.flatMap((b) => b.perguntas.map((p) => ({ secao: s.id, p }))));
    const rascunhos = comLevantamento().map((d) => d.levantamento!);
    for (const lev of rascunhos) {
      const secoes = new Set<string>();
      for (const [id, opcao] of Object.entries(lev.respostas)) {
        const achada = perguntas.find((x) => x.p.id === id);
        expect(achada, id).toBeDefined();
        expect(achada?.p.opcoes.map(([c]) => c), id).toContain(opcao);
        expect(perguntaVisivel(achada!.p, lev.respostas), id).toBe(true);
        secoes.add(achada!.secao);
      }
      expect(secoes.size).toBeGreaterThanOrEqual(4);
    }
  });

  it("os negócios com levantamento trazem linhas com medida positiva e as secções da visita em texto", () => {
    const comLev = NEGOCIOS_VARIADO.filter((n) => n.levantamento !== undefined);
    expect(comLev.length).toBeGreaterThanOrEqual(2);
    for (const n of comLev) {
      expect(n.levantamento?.estado, n.id).toBe("feito");
      expect(n.levantamento?.linhas.length, n.id).toBeGreaterThanOrEqual(3);
      n.levantamento?.linhas.forEach((l) => expect(l.medida, n.id).toBeGreaterThan(0));
      expect((n.visita ?? []).length, n.id).toBeGreaterThanOrEqual(3);
      expect(visitasDe(n).some((v) => v.estado === "feita"), n.id).toBe(true);
    }
  });
});

describe("exemplos variados: pedidos sem serviço", () => {
  const sem = PEDIDOS_VARIADO.filter((p) => p.servico === "");
  const t = (chave: string, params?: Record<string, string | number>) => `${chave}|${JSON.stringify(params ?? {})}`;

  it("a Quitéria tem 2 pedidos sem serviço, criados no mesmo dia, e os nomes saem distintos («1 de 2» e «2 de 2»)", () => {
    expect(sem.map((p) => p.pessoaId)).toEqual(["pv-quiteria", "pv-quiteria"]);
    expect(sem[0].criadoEm).toBe(sem[1].criadoEm);
    const todos = PEDIDOS_VARIADO.filter((p) => p.pessoaId === "pv-quiteria");
    const rotulos = sem.map((p) => rotuloDoPedido(p, todos));
    expect(rotulos.map((r) => [r.posicao, r.total])).toEqual([[1, 2], [2, 2]]);
    const nomes = rotulos.map((r) => textoDoRotulo(t, r));
    expect(new Set(nomes).size).toBe(2);
  });
});

describe("exemplos variados: orçamentos detalhados semeados", () => {
  const negocio = (id: string) => NEGOCIOS_VARIADO.find((n) => n.id === id)!;

  it("o store dos extras já arranca com os exemplos (só em memória)", () => {
    expect(extrasAtuais()).toBe(EXTRAS_VARIADO);
  });

  it("cada orçamento detalhado é o do orçamento escolhido do negócio e o valor do negócio é o total com IVA", () => {
    expect(Object.keys(EXTRAS_VARIADO)).toHaveLength(3);
    for (const [id, extras] of Object.entries(EXTRAS_VARIADO)) {
      const n = negocio(id);
      const o = orcamentoDoNegocio(n, EXTRAS_VARIADO);
      expect(o, id).toBeDefined();
      expect(extras.orcamento?.versao, id).toBe(1);
      expect(faseDoNegocio(n), id).toBe("orcamento");
      const total = verificarOrcamento({ linhas: o!.linhas, desconto: o!.desconto }).totais.total;
      expect(valorDoNegocio(n), id).toBeCloseTo(total, 2);
    }
  });

  it("Sara: verificado e sem bloqueios; Tomás: bloqueio de margem por resolver; Úrsula: aprovação da Direção pedida", () => {
    const de = (id: string) => EXTRAS_VARIADO[id].orcamento!;
    const sara = de("vn-sara-orc");
    expect(sara).toMatchObject({ verificado: true, direcao: null });
    expect(verificarOrcamento({ linhas: sara.linhas, desconto: sara.desconto }).bloqueios).toEqual([]);
    const tomas = de("vn-tomas-orc");
    expect(tomas).toMatchObject({ verificado: false, direcao: null });
    const vt = verificarOrcamento({ linhas: tomas.linhas, desconto: tomas.desconto });
    expect(vt.bloqueios).toHaveLength(1);
    expect(vt.duro).toBe(false);
    const ursula = de("vn-ursula-orc");
    expect(ursula).toMatchObject({ verificado: false, direcao: "pedida" });
    expect(verificarOrcamento({ linhas: ursula.linhas, desconto: ursula.desconto }).bloqueios).toHaveLength(1);
  });
});
