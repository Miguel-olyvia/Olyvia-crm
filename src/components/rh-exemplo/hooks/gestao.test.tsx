// Os hooks em memória da gestão de RH de exemplo: mesmas assinaturas dos reais, estado partilhado e acções que
// escrevem de verdade (picar, marcar falta, aprovar pedidos, abrir períodos, configurar a admissão).
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { lerGestao, reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { mesAnterior, picagensDasFichas } from "@/components/rh-exemplo/dados/gestaoExemplo";
import { useAssiduidadeDaOrganizacao } from "@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao";
import { useAssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import { useAusenciasDaOrganizacao } from "@/components/rh-exemplo/hooks/useAusenciasDaOrganizacao";
import { useClausulasDocumentosRH } from "@/components/rh-exemplo/hooks/useClausulasDocumentosRH";
import { useCodigosProcessamento } from "@/components/rh-exemplo/hooks/useCodigosProcessamento";
import { useConfiguracaoObrigatoriosAdmissao } from "@/components/rh-exemplo/hooks/useConfiguracaoObrigatoriosAdmissao";
import { TOKEN_CONVITE_EXEMPLO, useConviteAdmissaoPublico } from "@/components/rh-exemplo/hooks/useConviteAdmissaoPublico";
import { useConviteAnexos } from "@/components/rh-exemplo/hooks/useConviteAnexos";
import { useModelosDocumentosRH } from "@/components/rh-exemplo/hooks/useModelosDocumentosRH";
import { useProcessamentoLancamentos } from "@/components/rh-exemplo/hooks/useProcessamentoLancamentos";
import { useProcessamentoPeriodo } from "@/components/rh-exemplo/hooks/useProcessamentoPeriodo";
import { useRegrasFimContrato } from "@/components/rh-exemplo/hooks/useRegrasFimContrato";
import { useRegrasSubsidioAlimentacao } from "@/components/rh-exemplo/hooks/useRegrasSubsidioAlimentacao";
import { useRelatorioAssiduidadeMensal } from "@/components/rh-exemplo/hooks/useRelatorioAssiduidadeMensal";
import {
  escolherRetribuicaoVigente,
  limitesDoMes,
  useRetribuicoesVigentesDaOrganizacao,
} from "@/components/rh-exemplo/hooks/useRetribuicoesVigentesDaOrganizacao";
import { chaveDeErroFimContrato } from "@/components/rh-exemplo/lib/errosFimContrato";
import { resumoCodigoProcessamento } from "@/components/rh-exemplo/lib/resumoCodigoProcessamento";
import { ORGANIZACAO_EXEMPLO_ID } from "@/components/rh-exemplo/dados/constantes";

const JANELA = { de: diaIso(-30), ate: diaIso(0) };

beforeEach(() => {
  repor();
  reporGestao();
});

describe("dados de exemplo da gestão", () => {
  it("as picagens saem das horas realizadas, duas por linha, com identificadores únicos", () => {
    const picagens = picagensDasFichas(lerEstado());
    const realizadasPorPicagem = Object.values(lerEstado().fichas)
      .flatMap((f) => f.horarioRealizado)
      .filter((r) => r.origem === "picagem");
    expect(realizadasPorPicagem.length).toBeGreaterThan(20);
    expect(picagens).toHaveLength(realizadasPorPicagem.length * 2);
    expect(new Set(picagens.map((p) => p.id)).size).toBe(picagens.length);
    expect(picagens.every((p) => p.estado === "valida")).toBe(true);
  });

  it("mesAnterior devolve um mês de 1 a 12", () => {
    const { ano, mes } = mesAnterior();
    expect(mes).toBeGreaterThanOrEqual(1);
    expect(mes).toBeLessThanOrEqual(12);
    expect(ano).toBeGreaterThan(2000);
  });

  it("reporGestao volta ao estado inicial", () => {
    const antes = lerGestao().faltas.length;
    const { result } = renderHook(() => useAssiduidadeDaPessoa("p-rui", JANELA));
    act(() => void result.current.marcarFalta({ data: diaIso(-1), horaInicio: "09:00", horaFim: "10:00", motivoCodigo: "atraso" }));
    expect(lerGestao().faltas.length).toBe(antes + 1);
    reporGestao();
    expect(lerGestao().faltas.length).toBe(antes);
  });
});

describe("assiduidade de uma pessoa", () => {
  it("lê só as picagens e faltas da pessoa, dentro da janela", () => {
    const { result } = renderHook(() => useAssiduidadeDaPessoa("p-tiago", JANELA));
    expect(result.current.picagens.length).toBeGreaterThan(0);
    expect(result.current.picagens.every((p) => p.pessoa_id === "p-tiago")).toBe(true);
    expect(result.current.faltas.map((f) => f.id)).toContain("fa-tiago");
    const estreita = renderHook(() => useAssiduidadeDaPessoa("p-tiago", { de: diaIso(-1), ate: diaIso(-1) }));
    expect(estreita.result.current.faltas).toHaveLength(0);
  });

  it("uma pessoa que não existe fica vazia e as acções recusam", async () => {
    const { result } = renderHook(() => useAssiduidadeDaPessoa("nao-existe", JANELA));
    expect(result.current.picagens).toEqual([]);
    expect(result.current.realizado).toEqual([]);
    let erro: string | null = null;
    await act(async () => {
      erro = await result.current.marcarFalta({ data: diaIso(-1), horaInicio: "09:00", horaFim: "10:00", motivoCodigo: "atraso" });
    });
    expect(erro).not.toBeNull();
  });

  it("picar entrada e saída cria as duas picagens e uma linha de horas realizadas", async () => {
    const { result } = renderHook(() => useAssiduidadeDaPessoa("p-andre", { de: diaIso(0), ate: diaIso(0) }));
    const antesPicagens = result.current.picagens.length;
    const antesRealizado = result.current.realizado.length;
    const hoje = diaIso(0);
    await act(async () => {
      await result.current.picar({ sentido: "entrada", momento: new Date(`${hoje}T08:00:00`).toISOString() });
    });
    await act(async () => {
      await result.current.picar({ sentido: "saida", momento: new Date(`${hoje}T12:30:00`).toISOString() });
    });
    expect(result.current.picagens).toHaveLength(antesPicagens + 2);
    expect(result.current.realizado).toHaveLength(antesRealizado + 1);
    const nova = result.current.realizado.find((r) => r.hora_inicio === "08:00:00");
    expect(nova?.minutos).toBe(270);
    expect(nova?.origem).toBe("picagem");
  });

  it("corrigir uma picagem marca a antiga como corrigida e a nova aponta a ela; anular fecha a linha", async () => {
    const { result } = renderHook(() => useAssiduidadeDaPessoa("p-hugo", JANELA));
    const original = result.current.picagens.find((p) => p.sentido === "entrada")!;
    await act(async () => {
      await result.current.corrigirPicagem({
        picagemId: original.id,
        momento: new Date(`${original.data_local}T07:45:00`).toISOString(),
        sentido: "entrada",
        localId: null,
        tipo: "hora_errada",
        motivo: "Relógio avariado",
      });
    });
    const todas = lerGestao().picagens;
    expect(todas.find((p) => p.id === original.id)?.estado).toBe("corrigida");
    const nova = todas.find((p) => p.corrige_picagem_id === original.id)!;
    expect(nova.hora_local).toBe("07:45:00");
    expect(nova.correccao_motivo).toBe("Relógio avariado");
    await act(async () => {
      await result.current.anularPicagem(nova.id, "Lançada por engano");
    });
    expect(lerGestao().picagens.find((p) => p.id === nova.id)?.estado).toBe("anulada");
  });

  it("corrigir horas realizadas acrescenta uma linha que corrige a original", async () => {
    const { result } = renderHook(() => useAssiduidadeDaPessoa("p-rui", JANELA));
    const original = result.current.realizado[0];
    await act(async () => {
      await result.current.corrigirRealizado({ realizadoId: original.id, horaInicio: "09:10:00", horaFim: "13:00:00", localId: null, motivo: "Esqueceu-se de picar" });
    });
    const corrigida = result.current.realizado.find((r) => r.corrige_realizado_id === original.id);
    expect(corrigida?.minutos).toBe(230);
    expect(corrigida?.correccao_motivo).toBe("Esqueceu-se de picar");
  });

  it("validar e rejeitar horas mudam o estado", async () => {
    const { result } = renderHook(() => useAssiduidadeDaPessoa("p-rui", { de: diaIso(0), ate: diaIso(0) }));
    const linha = result.current.realizado[0];
    expect(linha.estado).toBe("registado");
    await act(async () => {
      await result.current.validarRealizado(linha.id);
    });
    expect(result.current.realizado.find((r) => r.id === linha.id)?.estado).toBe("validado");
    await act(async () => {
      await result.current.rejeitarRealizado(linha.id, "Horas a mais");
    });
    const rejeitada = result.current.realizado.find((r) => r.id === linha.id);
    expect(rejeitada?.estado).toBe("rejeitado");
    expect(rejeitada?.motivo_rejeicao).toBe("Horas a mais");
  });

  it("marcar, corrigir, justificar e anular uma falta", async () => {
    const { result } = renderHook(() => useAssiduidadeDaPessoa("p-sofia", JANELA));
    await act(async () => {
      await result.current.marcarFalta({
        data: diaIso(-3),
        horaInicio: "09:00",
        horaFim: "13:00",
        motivoCodigo: "doenca",
        justificacao: { tipoDocumento: "atestado_medico", documentoRef: "ATM-1", texto: null, entidadeEmissora: null, dataDocumento: null, diasAtestados: 1 },
      });
    });
    const falta = result.current.faltas.find((f) => f.motivo_codigo === "doenca")!;
    expect(falta.minutos).toBe(240);
    expect(falta.justificacao_estado).toBe("pendente_documento");

    await act(async () => {
      await result.current.decidirJustificacao({ faltaId: falta.id, resultado: "justificada", motivo: null });
    });
    expect(result.current.faltas.find((f) => f.id === falta.id)).toMatchObject({ justificada: true, justificacao_estado: "justificada" });

    await act(async () => {
      await result.current.corrigirFalta({ faltaId: falta.id, horaInicio: "09:00", horaFim: "12:00", motivoCodigo: "doenca", motivo: "Só de manhã" });
    });
    const nova = lerGestao().faltas.find((f) => f.corrige_falta_id === falta.id)!;
    expect(nova.minutos).toBe(180);
    expect(lerGestao().faltas.find((f) => f.id === falta.id)?.estado).toBe("corrigida");

    await act(async () => {
      await result.current.anularFalta(nova.id, "Marcada ao engano");
    });
    expect(lerGestao().faltas.find((f) => f.id === nova.id)?.estado).toBe("anulada");
  });

  it("revelar a justificação devolve um documento de exemplo", async () => {
    const { result } = renderHook(() => useAssiduidadeDaPessoa("p-tiago", JANELA));
    const revelada = await result.current.revelarJustificacao("fa-tiago");
    expect(revelada).toHaveLength(1);
    expect(revelada[0].documento_ref).toBe("ATM-0192");
  });
});

describe("assiduidade da organização", () => {
  it("agrega as células por pessoa e dia, e conta as pessoas com registo", () => {
    const { result } = renderHook(() => useAssiduidadeDaOrganizacao(JANELA));
    expect(result.current.pessoasComRegisto.size).toBeGreaterThan(5);
    const falta = lerGestao().faltas.find((f) => f.id === "fa-hugo")!;
    const celula = result.current.celulas.get(`${falta.pessoa_id}|${falta.data}`);
    expect(celula?.faltas).toBe(1);
    expect(celula?.faltasJustificadas).toBe(1);
    expect(celula?.minutosEmFalta).toBe(240);
    expect(result.current.desvios).toHaveLength(3);
    const desvio = result.current.desvios[0];
    expect(result.current.celulas.get(`${desvio.pessoa_id}|${desvio.data}`)?.temDesvio).toBe(true);
  });

  it("uma janela sem nada devolve tudo vazio", () => {
    const { result } = renderHook(() => useAssiduidadeDaOrganizacao({ de: "2000-01-01", ate: "2000-01-31" }));
    expect(result.current.pessoasComRegisto.size).toBe(0);
    expect(result.current.celulas.size).toBe(0);
  });
});

describe("relatório mensal", () => {
  it("tem um dia por dia do mês e totais coerentes", () => {
    const hoje = new Date();
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal("p-rui", hoje.getFullYear(), hoje.getMonth()));
    const dias = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    expect(result.current.dias).toHaveLength(dias);
    const soma = result.current.dias.reduce((s, d) => s + d.realizadoMinutos, 0);
    expect(result.current.totais.realizadoMinutos).toBe(soma);
  });

  it("registar e anular horas de obra", async () => {
    const hoje = new Date();
    const { result } = renderHook(() => useRelatorioAssiduidadeMensal("p-rui", hoje.getFullYear(), hoje.getMonth()));
    const data = diaIso(0);
    await act(async () => {
      await result.current.registarObra({ data, horas: 2.5, descricao: "Montagem" });
    });
    if (data.slice(0, 7) === `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`) {
      expect(result.current.obras).toHaveLength(1);
      await act(async () => {
        await result.current.anularObra(result.current.obras[0].id, "Duplicada");
      });
      expect(lerGestao().obras[0].anulado_motivo).toBe("Duplicada");
    }
  });
});

describe("ausências da organização", () => {
  it("junta os pedidos de toda a gente e separa os pendentes", () => {
    const { result } = renderHook(() => useAusenciasDaOrganizacao({ anoDoMapa: Number(diaIso(0).slice(0, 4)) }));
    expect(result.current.pedidos.length).toBeGreaterThanOrEqual(7);
    expect(result.current.pendentes.length).toBeGreaterThanOrEqual(2);
    expect(result.current.pendentes.every((p) => p.estado === "pendente_chefia" || p.estado === "pendente_rh")).toBe(true);
    expect(result.current.dias.length).toBeGreaterThan(0);
  });

  it("a chefia aprova um pedido pendente e os dias passam a aprovados", async () => {
    const { result } = renderHook(() => useAusenciasDaOrganizacao({ anoDoMapa: Number(diaIso(30).slice(0, 4)) }));
    const pedido = result.current.pendentes.find((p) => p.pessoa_id === "p-carolina")!;
    let erro: string | null = "x";
    await act(async () => {
      erro = await result.current.decidirChefia({ pedidoId: pedido.id, resultado: "aprovado" });
    });
    expect(erro).toBeNull();
    const depois = result.current.pedidos.find((p) => p.id === pedido.id)!;
    expect(["aprovado", "pendente_rh"]).toContain(depois.estado);
    expect(result.current.decisoesPorPedido.get(pedido.id)?.at(-1)?.passo).toBe("chefia");
  });

  it("a chefia recusa e o pedido deixa de estar pendente", async () => {
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    const pedido = result.current.pendentes[0];
    await act(async () => {
      await result.current.decidirChefia({ pedidoId: pedido.id, resultado: "recusado", motivo: "Equipa curta" });
    });
    expect(result.current.pedidos.find((p) => p.id === pedido.id)?.estado).toBe("recusado");
    expect(result.current.pendentes.find((p) => p.id === pedido.id)).toBeUndefined();
  });

  it("cancelar e decidir um pedido que não existe devolvem erro", async () => {
    const { result } = renderHook(() => useAusenciasDaOrganizacao());
    let a: string | null = null;
    let b: string | null = null;
    await act(async () => {
      a = await result.current.cancelar("nao-existe", "x");
      b = await result.current.decidirRh({ pedidoId: "nao-existe", resultado: "aprovado" });
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });
});

describe("modelos e cláusulas", () => {
  it("criar, editar e desactivar um modelo reflecte-se no estado das fichas", async () => {
    const { result } = renderHook(() => useModelosDocumentosRH());
    const antes = result.current.modelos.length;
    await act(async () => {
      await result.current.criar({ nome: "Aditamento", tipo: "adenda", corpo_html: "<p>x</p>", variaveis: [] });
    });
    expect(result.current.modelos).toHaveLength(antes + 1);
    expect(lerEstado().modelos).toHaveLength(antes + 1);
    const novo = result.current.modelos.find((m) => m.nome === "Aditamento")!;
    await act(async () => {
      await result.current.editar({ id: novo.id, nome: "Aditamento 2", tipo: "adenda", corpo_html: "<p>y</p>", variaveis: ["pessoa.nome_completo"] });
    });
    expect(result.current.modelos.find((m) => m.id === novo.id)).toMatchObject({ nome: "Aditamento 2", corpo_html: "<p>y</p>" });
    await act(async () => {
      await result.current.definirActivo(novo.id, false);
    });
    expect(result.current.modelos.find((m) => m.id === novo.id)?.activo).toBe(false);
  });

  it("as cláusulas criam-se, editam-se e desactivam-se", async () => {
    const { result } = renderHook(() => useClausulasDocumentosRH());
    const antes = result.current.clausulas.length;
    await act(async () => {
      await result.current.criar({ nome: "Exclusividade", categoria: null, corpo_html: "<p>x</p>" });
    });
    expect(result.current.clausulas).toHaveLength(antes + 1);
    const nova = result.current.clausulas.find((c) => c.nome === "Exclusividade")!;
    expect(nova.organization_id).toBe(ORGANIZACAO_EXEMPLO_ID);
    await act(async () => {
      await result.current.editar({ id: nova.id, nome: "Exclusividade parcial", categoria: "Geral", corpo_html: "<p>z</p>" });
      await result.current.definirActivo(nova.id, false);
    });
    expect(result.current.clausulas.find((c) => c.id === nova.id)).toMatchObject({ nome: "Exclusividade parcial", categoria: "Geral", activo: false });
  });
});

describe("processamento salarial", () => {
  it("os códigos criam-se, actualizam-se e desactivam-se", async () => {
    const { result } = renderHook(() => useCodigosProcessamento());
    expect(result.current.codigos.map((c) => c.codigo)).toEqual([...result.current.codigos.map((c) => c.codigo)].sort());
    await act(async () => {
      await result.current.criar({ codigo: "NOVO", nome: "Novo", descricao: null });
    });
    const novo = result.current.codigos.find((c) => c.codigo === "NOVO")!;
    expect(novo.modo_calculo).toBe("manual");
    await act(async () => {
      await result.current.actualizar(novo.id, { nome: "Novo 2", descricao: "d", modo_calculo: "valor_fixo_mensal", percentagem: null, valor_fixo: 10, origem_automatica: null });
      await result.current.definirActivo(novo.id, false);
    });
    expect(result.current.codigos.find((c) => c.id === novo.id)).toMatchObject({ nome: "Novo 2", valor_fixo: 10, activo: false });
  });

  it("o resumo de um código diz como se calcula", () => {
    const t = (chave: string, params?: Record<string, string | number>) => `${chave}|${JSON.stringify(params ?? {})}`;
    const he = lerGestao().codigos.find((c) => c.codigo === "HE")!;
    expect(resumoCodigoProcessamento(he, t)).toContain("hr.vencimento.codigos.resumo.percentagem");
    const desc = lerGestao().codigos.find((c) => c.codigo === "DESC")!;
    expect(resumoCodigoProcessamento(desc, t)).toContain("valorFixoDescanso");
    const manual = lerGestao().codigos.find((c) => c.codigo === "AJUSTE")!;
    expect(resumoCodigoProcessamento(manual, t)).toContain("resumo.manual");
  });

  it("a regra do subsídio grava e começa com os minutos de exemplo", async () => {
    const { result } = renderHook(() => useRegrasSubsidioAlimentacao());
    expect(result.current.temRegraGravada).toBe(true);
    expect(result.current.regra.minutosMinimosDia).toBe(240);
    await act(async () => {
      await result.current.gravar({ minutosMinimosDia: 300 });
    });
    expect(result.current.regra.minutosMinimosDia).toBe(300);
  });

  it("abrir o período do mês cria-o uma só vez, e fechar fecha-o", async () => {
    const hoje = diaIso(0);
    const ano = Number(hoje.slice(0, 4));
    const mes = Number(hoje.slice(5, 7));
    const { result } = renderHook(() => useProcessamentoPeriodo(ano, mes));
    expect(result.current.periodo).toBeNull();
    await act(async () => {
      await result.current.abrir();
      await result.current.abrir();
    });
    expect(lerGestao().periodos.filter((p) => p.ano === ano && p.mes === mes)).toHaveLength(1);
    expect(result.current.periodo?.estado).toBe("aberto");
    await act(async () => {
      await result.current.fechar();
    });
    expect(result.current.periodo?.estado).toBe("fechado");
    expect(result.current.periodo?.fechado_em).not.toBeNull();
  });

  it("fechar sem período devolve erro; o mês anterior já vem fechado", async () => {
    const { result } = renderHook(() => useProcessamentoPeriodo(1999, 1));
    let erro: string | null = null;
    await act(async () => {
      erro = await result.current.fechar();
    });
    expect(erro).not.toBeNull();
    const { ano, mes } = mesAnterior();
    const anterior = renderHook(() => useProcessamentoPeriodo(ano, mes));
    expect(anterior.result.current.periodo?.estado).toBe("fechado");
  });

  it("lançamentos: lista os do período, cria e anula", async () => {
    const { ano, mes } = mesAnterior();
    const periodo = renderHook(() => useProcessamentoPeriodo(ano, mes)).result.current.periodo!;
    const { result } = renderHook(() => useProcessamentoLancamentos(periodo.id));
    expect(result.current.lancamentos).toHaveLength(2);
    await act(async () => {
      await result.current.criar({ pessoaId: "p-ines", descricao: "Prémio", valor: 50, codigoProcessamentoId: null });
    });
    expect(result.current.lancamentos).toHaveLength(3);
    const novo = result.current.lancamentos.find((l) => l.descricao === "Prémio")!;
    await act(async () => {
      await result.current.anular(novo.id, "Enganado");
    });
    expect(result.current.lancamentos.find((l) => l.id === novo.id)?.anulado_motivo).toBe("Enganado");
  });

  it("sem período, os lançamentos ficam vazios e criar recusa", async () => {
    const { result } = renderHook(() => useProcessamentoLancamentos(undefined));
    expect(result.current.lancamentos).toEqual([]);
    let erro: string | null = null;
    await act(async () => {
      erro = await result.current.criar({ pessoaId: "p-ines", descricao: "x", valor: 1, codigoProcessamentoId: null });
    });
    expect(erro).not.toBeNull();
  });

  it("as retribuições vigentes do mês saem das fichas, e só da organização pedida", () => {
    const hoje = diaIso(0);
    const ano = Number(hoje.slice(0, 4));
    const mes = Number(hoje.slice(5, 7));
    const { result } = renderHook(() => useRetribuicoesVigentesDaOrganizacao(ORGANIZACAO_EXEMPLO_ID, ano, mes));
    expect(result.current.porPessoa.size).toBeGreaterThan(5);
    const nenhuma = renderHook(() => useRetribuicoesVigentesDaOrganizacao(undefined, ano, mes));
    expect(nenhuma.result.current.porPessoa.size).toBe(0);
  });

  it("limitesDoMes trata fevereiro bissexto e escolherRetribuicaoVigente avisa de mudança a meio do mês", () => {
    expect(limitesDoMes(2024, 2)).toEqual({ primeiroDia: "2024-02-01", ultimoDia: "2024-02-29" });
    expect(limitesDoMes(2025, 2).ultimoDia).toBe("2025-02-28");
    expect(limitesDoMes(2025, 12).ultimoDia).toBe("2025-12-31");
    const base = { pessoa_id: "p", valor_base: 1000, periodicidade: "mensal" as const, duodecimos_pct: null, subsidio_alimentacao: null };
    expect(escolherRetribuicaoVigente([], "2025-03-31")).toEqual({ retribuicao: null, mudouAMeioDoMes: false });
    const unica = { ...base, valido_de: "2025-01-01", valido_ate: null };
    expect(escolherRetribuicaoVigente([unica], "2025-03-31")).toEqual({ retribuicao: unica, mudouAMeioDoMes: false });
    const antiga = { ...base, valido_de: "2025-01-01", valido_ate: "2025-03-15" };
    const nova = { ...base, valor_base: 1200, valido_de: "2025-03-15", valido_ate: null };
    const escolha = escolherRetribuicaoVigente([antiga, nova], "2025-03-31");
    expect(escolha.retribuicao?.valor_base).toBe(1200);
    expect(escolha.mudouAMeioDoMes).toBe(true);
  });
});

describe("admissão e fim de contrato", () => {
  it("só os campos configuráveis mudam de posição", async () => {
    const { result } = renderHook(() => useConfiguracaoObrigatoriosAdmissao());
    const configuravel = result.current.campos.find((c) => c.configuravel && c.posicao === "convite")!;
    const fixo = result.current.campos.find((c) => !c.configuravel)!;
    await act(async () => {
      await result.current.definirPosicao(configuravel.codigo, "ficha");
      await result.current.definirPosicao(fixo.codigo, "opcional");
    });
    expect(result.current.campos.find((c) => c.codigo === configuravel.codigo)?.posicao).toBe("ficha");
    expect(result.current.campos.find((c) => c.codigo === fixo.codigo)?.posicao).toBe(fixo.posicao);
  });

  it("as regras de fim de contrato começam ligadas e guardam", async () => {
    const { result } = renderHook(() => useRegrasFimContrato());
    expect(result.current.temRegraGravada).toBe(true);
    expect(result.current.regra.ativo).toBe(true);
    await act(async () => {
      await result.current.guardar({
        ativo: false,
        diasAviso: 45,
        renovacaoAutomatica: true,
        maxRenovacoes: 3,
        duracaoValor: 12,
        duracaoUnidade: "meses",
        aoAtingirLimite: "decisao_manual_rh",
      });
    });
    expect(result.current.regra).toMatchObject({ ativo: false, dias_aviso: 45, renovacao_automatica: true, max_renovacoes: 3 });
  });

  it("chaveDeErroFimContrato só reconhece códigos conhecidos e não confunde propriedades herdadas", () => {
    expect(chaveDeErroFimContrato({ code: "HRV05" })).toBe("hr.fimContrato.erro.HRV05");
    expect(chaveDeErroFimContrato({ code: "XYZ" })).toBeNull();
    expect(chaveDeErroFimContrato({ code: "constructor" })).toBeNull();
    expect(chaveDeErroFimContrato(null)).toBeNull();
    expect(chaveDeErroFimContrato("texto")).toBeNull();
  });
});

describe("convite de admissão público", () => {
  it("só o token de exemplo abre um convite, com os campos configurados para o convite", () => {
    const valido = renderHook(() => useConviteAdmissaoPublico(TOKEN_CONVITE_EXEMPLO)).result.current;
    expect(valido.estado?.pessoa_nome).toBe("Beatriz Lopes");
    expect(valido.erroInicial).toBeNull();
    expect(valido.estado?.campos_obrigatorios?.length).toBeGreaterThan(10);
    const invalido = renderHook(() => useConviteAdmissaoPublico("qualquer")).result.current;
    expect(invalido.estado).toBeNull();
    expect(invalido.erroInicial).toBe("convite_invalido");
    expect(invalido.motivo).not.toBeNull();
    expect(renderHook(() => useConviteAdmissaoPublico(undefined)).result.current.estado).toBeNull();
  });

  it("os campos movidos para a ficha deixam de ser pedidos no convite", async () => {
    const config = renderHook(() => useConfiguracaoObrigatoriosAdmissao());
    const convite = renderHook(() => useConviteAdmissaoPublico(TOKEN_CONVITE_EXEMPLO));
    const antes = convite.result.current.estado!.campos_obrigatorios!.length;
    await act(async () => {
      await config.result.current.definirPosicao("tamanho_cima", "ficha");
    });
    expect(convite.result.current.estado!.campos_obrigatorios!.length).toBe(antes - 1);
  });

  it("submeter devolve sucesso sem enviar nada", async () => {
    const { result } = renderHook(() => useConviteAdmissaoPublico(TOKEN_CONVITE_EXEMPLO));
    let resultado: Awaited<ReturnType<typeof result.current.submeter>> | null = null;
    await act(async () => {
      resultado = await result.current.submeter({}, "Beatriz Lopes");
    });
    expect(resultado).toEqual({ ok: true, avisos: [] });
    expect(result.current.submetendo).toBe(false);
  });

  it("os anexos validam formato, tamanho e limites, e guardam só em memória", async () => {
    const { result } = renderHook(() => useConviteAnexos(TOKEN_CONVITE_EXEMPLO));
    const pdf = new File(["x"], "cc.pdf", { type: "application/pdf" });
    await act(async () => {
      await result.current.adicionar("cartao_cidadao", pdf);
    });
    expect(result.current.anexos).toHaveLength(1);
    expect(result.current.contagem).toEqual({ total: 1, porTipo: { cartao_cidadao: 1 } });

    await act(async () => {
      await result.current.adicionar("fotografia", new File(["x"], "doc.pdf", { type: "application/pdf" }));
    });
    expect(result.current.anexos).toHaveLength(1);
    expect(Object.values(result.current.envios)[0]).toMatchObject({ fase: "erro", codigoErro: "anexo_fotografia_formato" });

    await act(async () => {
      await result.current.adicionar("comprovativo_iban", new File([""], "vazio.pdf", { type: "application/pdf" }));
    });
    expect(Object.values(result.current.envios).some((e) => e.codigoErro === "anexo_vazio")).toBe(true);

    const id = result.current.anexos[0].id;
    await act(async () => {
      await result.current.remover(id);
    });
    expect(result.current.anexos).toHaveLength(0);
  });

  it("o tipo cheio recusa o terceiro cartão de cidadão", async () => {
    const { result } = renderHook(() => useConviteAnexos(TOKEN_CONVITE_EXEMPLO));
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await result.current.adicionar("cartao_cidadao", new File(["x"], `cc${i}.pdf`, { type: "application/pdf" }));
      });
    }
    expect(result.current.anexos).toHaveLength(2);
    expect(Object.values(result.current.envios).some((e) => e.codigoErro === "anexo_tipo_cheio")).toBe(true);
  });
});
