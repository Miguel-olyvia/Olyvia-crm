// Os hooks da gestão de RH de /rh-exemplo. Os wrappers de `components/rh-exemplo/hooks` já não guardam nada em memória:
// delegam nos hooks REAIS (`@/hooks/...`), que leem e escrevem no Supabase. Aqui o Supabase é simulado
// (src/test/rhExemploProviders.tsx): os testes alimentam as linhas que a base devolveria e verificam o que cada hook lê
// (tabelas e filtros por organização), o que envia ao escrever (RPC e argumentos, ou insert/update com o conteúdo) e como reage
// quando a base recusa. O que a base faz por dentro (regras, RLS, transacções) é da base e não se prova aqui.
// Ficam também os testes do que continua em memória de propósito: os dados de exemplo da gestão e o convite de
// demonstração (token «exemplo»), que não tem equivalente real.
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());

import { reporRhTeste, rhTeste, ORGANIZACAO_TESTE } from "@/test/rhExemploProviders";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { definirGestao, lerGestao, reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
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

const JANELA = { de: diaIso(-30), ate: diaIso(0) };
const ORG = ORGANIZACAO_TESTE.id;
/** Uma recusa da base por permissão (42501), como a RLS a devolve. */
const RECUSA = { code: "42501", message: "permission denied for table" };

function Envolvente({ children }: { children: ReactNode }) {
  const [cliente] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
const montar = <T,>(hook: () => T) => renderHook(hook, { wrapper: Envolvente });

const rpcsChamadas = (nome: string): unknown[] => rhTeste.chamadas.filter((c) => c.rpc === nome).map((c) => c.args);
const leituras = (tabela: string): number => rhTeste.chamadas.filter((c) => c.tabela === tabela).length;
const escritasDe = (tabela: string, metodo: string): unknown[] =>
  rhTeste.escritas.filter((e) => e.tabela === tabela && e.metodo === metodo).map((e) => e.payload);

beforeEach(() => {
  repor();
  reporGestao();
  reporRhTeste();
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
    const falta = lerGestao().faltas[0];
    definirGestao((g) => ({ ...g, faltas: [...g.faltas, { ...falta, id: "fa-extra" }] }));
    expect(lerGestao().faltas.length).toBe(antes + 1);
    reporGestao();
    expect(lerGestao().faltas.length).toBe(antes);
  });
});

describe("assiduidade de uma pessoa (hook real sobre o Supabase simulado)", () => {
  it("lê as cinco tabelas da pessoa uma vez e mostra as linhas que a base devolve", async () => {
    rhTeste.respostas["pessoas_picagens"] = [{ id: "pi-1", pessoa_id: "p-tiago" }];
    rhTeste.respostas["pessoas_horario_realizado"] = [{ id: "re-1", pessoa_id: "p-tiago" }];
    rhTeste.respostas["pessoas_faltas"] = [{ id: "fa-tiago", pessoa_id: "p-tiago" }];
    rhTeste.respostas["pessoas_horario_planeado"] = [{ id: "pl-1", pessoa_id: "p-tiago" }];
    rhTeste.respostas["pessoas_ausencias_dias"] = [
      { id: "a1", data: "2026-10-05", fraccao_dia: 0.5, estado: "aprovado" },
      { id: "a2", data: "2026-10-05", fraccao_dia: 1, estado: "aprovado" },
      { id: "a3", data: "2026-10-06", fraccao_dia: 1, estado: "pendente_rh" },
    ];
    const { result } = montar(() => useAssiduidadeDaPessoa("p-tiago", JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.picagens.map((p) => p.id)).toEqual(["pi-1"]);
    expect(result.current.realizado.map((r) => r.id)).toEqual(["re-1"]);
    expect(result.current.faltas.map((f) => f.id)).toEqual(["fa-tiago"]);
    expect(result.current.planeado.map((p) => p.id)).toEqual(["pl-1"]);
    // Só conta a ausência APROVADA, e a maior fracção do dia.
    expect(result.current.ausenciaAprovadaPorDia.get("2026-10-05")?.id).toBe("a2");
    expect(result.current.ausenciaAprovadaPorDia.has("2026-10-06")).toBe(false);
    for (const tabela of ["pessoas_picagens", "pessoas_horario_realizado", "pessoas_faltas", "pessoas_horario_planeado", "pessoas_ausencias_dias"]) {
      expect(leituras(tabela), tabela).toBe(1);
    }
  });

  it("sem pessoa ou sem organização activa não lê nada e fica vazio", async () => {
    const semPessoa = montar(() => useAssiduidadeDaPessoa(undefined, JANELA));
    await waitFor(() => expect(semPessoa.result.current.loading).toBe(false));
    rhTeste.empresa = null;
    const semOrganizacao = montar(() => useAssiduidadeDaPessoa("p-tiago", JANELA));
    await waitFor(() => expect(semOrganizacao.result.current.loading).toBe(false));
    expect(semPessoa.result.current.picagens).toEqual([]);
    expect(semOrganizacao.result.current.realizado).toEqual([]);
    expect(rhTeste.chamadas).toEqual([]);
  });

  it("picar manda a RPC com a organização e a pessoa, devolve null e relê a assiduidade", async () => {
    const { result } = montar(() => useAssiduidadeDaPessoa("p-andre", { de: diaIso(0), ate: diaIso(0) }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const momento = new Date(`${diaIso(0)}T08:00:00`).toISOString();
    let erro: string | null = "x";
    await act(async () => {
      erro = await result.current.picar({ sentido: "entrada", momento });
    });
    expect(erro).toBeNull();
    expect(rpcsChamadas("rpc_hr_picar")).toEqual([
      expect.objectContaining({ _organization_id: ORG, _pessoa_id: "p-andre", _sentido: "entrada", _momento: momento, _origem: "web", _local_id: null }),
    ]);
    await waitFor(() => expect(leituras("pessoas_picagens")).toBe(2));
  });

  it("picar sem momento deixa a hora à base (não envia _momento)", async () => {
    const { result } = montar(() => useAssiduidadeDaPessoa("p-andre", JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.picar({ sentido: "saida" });
    });
    expect(rpcsChamadas("rpc_hr_picar")[0]).not.toHaveProperty("_momento");
  });

  it("quando a base recusa, devolve o erro a mostrar e NÃO relê como se tivesse gravado", async () => {
    rhTeste.rpcs["rpc_hr_picar"] = { data: null, error: RECUSA };
    const { result } = montar(() => useAssiduidadeDaPessoa("p-andre", JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let erro: string | null = null;
    await act(async () => {
      erro = await result.current.picar({ sentido: "entrada" });
    });
    expect(erro).toEqual(expect.any(String));
    expect(erro).not.toBe("");
    expect(leituras("pessoas_picagens")).toBe(1);
  });

  it("corrigir e anular uma picagem mandam as RPCs com o motivo", async () => {
    const { result } = montar(() => useAssiduidadeDaPessoa("p-hugo", JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.corrigirPicagem({
        picagemId: "pi-1", momento: "2026-10-02T07:45:00.000Z", sentido: "entrada", localId: null, tipo: "hora_errada", motivo: "Relógio avariado",
      });
      await result.current.anularPicagem("pi-2", "Lançada por engano");
    });
    expect(rpcsChamadas("rpc_hr_picagem_corrigir")).toEqual([
      { _picagem_id: "pi-1", _momento: "2026-10-02T07:45:00.000Z", _sentido: "entrada", _local_id: null, _correccao_tipo: "hora_errada", _correccao_motivo: "Relógio avariado" },
    ]);
    expect(rpcsChamadas("rpc_hr_picagem_anular")).toEqual([{ _picagem_id: "pi-2", _motivo: "Lançada por engano" }]);
  });

  it("corrigir, validar e rejeitar horas realizadas mandam as RPCs; consolidar leva a organização e a pessoa", async () => {
    const { result } = montar(() => useAssiduidadeDaPessoa("p-rui", JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.corrigirRealizado({ realizadoId: "re-1", horaInicio: "09:10:00", horaFim: "13:00:00", localId: null, motivo: "Esqueceu-se de picar" });
      await result.current.validarRealizado("re-2");
      await result.current.rejeitarRealizado("re-3", "Horas a mais");
      await result.current.consolidarDia("2026-10-02");
    });
    expect(rpcsChamadas("rpc_hr_realizado_corrigir")).toEqual([
      { _realizado_id: "re-1", _hora_inicio: "09:10:00", _hora_fim: "13:00:00", _local_id: null, _motivo: "Esqueceu-se de picar" },
    ]);
    expect(rpcsChamadas("rpc_hr_realizado_validar")).toEqual([{ _realizado_id: "re-2" }]);
    expect(rpcsChamadas("rpc_hr_realizado_rejeitar")).toEqual([{ _realizado_id: "re-3", _motivo: "Horas a mais" }]);
    expect(rpcsChamadas("rpc_hr_picagens_consolidar_dia")).toEqual([{ _organization_id: ORG, _pessoa_id: "p-rui", _data: "2026-10-02" }]);
  });

  it("marcar uma falta com justificação são duas chamadas: a segunda usa o id que a primeira devolveu", async () => {
    rhTeste.rpcs["rpc_hr_falta_marcar"] = { data: "falta-nova", error: null };
    const { result } = montar(() => useAssiduidadeDaPessoa("p-sofia", JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let erro: string | null = "x";
    await act(async () => {
      erro = await result.current.marcarFalta({
        data: diaIso(-3), horaInicio: "09:00", horaFim: "13:00", motivoCodigo: "doenca",
        justificacao: { tipoDocumento: "atestado_medico", documentoRef: "ATM-1", texto: null, entidadeEmissora: null, dataDocumento: null, diasAtestados: 1 },
      });
    });
    expect(erro).toBeNull();
    expect(rpcsChamadas("rpc_hr_falta_marcar")).toEqual([
      expect.objectContaining({ _organization_id: ORG, _pessoa_id: "p-sofia", _data: diaIso(-3), _hora_inicio: "09:00", _hora_fim: "13:00", _motivo_codigo: "doenca", _remunerada: false, _desconta_saldo: false }),
    ]);
    expect(rpcsChamadas("rpc_hr_falta_registar_justificacao")).toEqual([
      { _falta_id: "falta-nova", _tipo_documento: "atestado_medico", _documento_ref: "ATM-1", _texto: null, _entidade_emissora: null, _data_documento: null, _dias_atestados: 1 },
    ]);
  });

  it("se a marcação da falta é recusada, a justificação nem chega a ser registada", async () => {
    rhTeste.rpcs["rpc_hr_falta_marcar"] = { data: null, error: RECUSA };
    const { result } = montar(() => useAssiduidadeDaPessoa("p-sofia", JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let erro: string | null = null;
    await act(async () => {
      erro = await result.current.marcarFalta({
        data: diaIso(-3), horaInicio: "09:00", horaFim: "13:00", motivoCodigo: "doenca",
        justificacao: { tipoDocumento: null, documentoRef: "X", texto: null, entidadeEmissora: null, dataDocumento: null, diasAtestados: null },
      });
    });
    expect(erro).toEqual(expect.any(String));
    expect(rpcsChamadas("rpc_hr_falta_registar_justificacao")).toEqual([]);
  });

  it("corrigir, anular, anular por ausência, registar e decidir justificação mandam as RPCs certas", async () => {
    const { result } = montar(() => useAssiduidadeDaPessoa("p-sofia", JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.corrigirFalta({ faltaId: "fa-1", horaInicio: "09:00", horaFim: "12:00", motivoCodigo: "doenca", motivo: "Só de manhã" });
      await result.current.anularFalta("fa-2", "Marcada ao engano");
      await result.current.anularFaltaPorAusencia("fa-3", "aus-dia-1");
      await result.current.registarJustificacao({ faltaId: "fa-4", documentoRef: "ATM-9" });
      await result.current.decidirJustificacao({ faltaId: "fa-4", resultado: "justificada", motivo: null });
    });
    expect(rpcsChamadas("rpc_hr_falta_corrigir")).toEqual([
      { _falta_id: "fa-1", _hora_inicio: "09:00", _hora_fim: "12:00", _motivo_codigo: "doenca", _motivo: "Só de manhã" },
    ]);
    expect(rpcsChamadas("rpc_hr_falta_anular")).toEqual([{ _falta_id: "fa-2", _motivo: "Marcada ao engano" }]);
    expect(rpcsChamadas("rpc_hr_falta_anular_por_ausencia")).toEqual([{ _falta_id: "fa-3", _ausencia_dia_id: "aus-dia-1" }]);
    expect(rpcsChamadas("rpc_hr_falta_registar_justificacao")).toEqual([
      { _falta_id: "fa-4", _tipo_documento: null, _documento_ref: "ATM-9", _texto: null, _entidade_emissora: null, _data_documento: null, _dias_atestados: null },
    ]);
    expect(rpcsChamadas("rpc_hr_falta_decidir_justificacao")).toEqual([{ _falta_id: "fa-4", _resultado: "justificada", _motivo: null }]);
  });

  it("revelar a justificação pede o documento à base (só a pedido) e, se a base recusa, o erro sobe", async () => {
    rhTeste.rpcs["rpc_hr_falta_ver_justificacao"] = { data: [{ documento_ref: "ATM-0192" }], error: null };
    const { result } = montar(() => useAssiduidadeDaPessoa("p-tiago", JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(rpcsChamadas("rpc_hr_falta_ver_justificacao")).toEqual([]);
    const revelada = await result.current.revelarJustificacao("fa-tiago");
    expect(revelada).toHaveLength(1);
    expect(revelada[0].documento_ref).toBe("ATM-0192");

    rhTeste.rpcs["rpc_hr_falta_ver_justificacao"] = { data: null, error: RECUSA };
    await expect(result.current.revelarJustificacao("fa-tiago")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("assiduidade da organização (hook real sobre o Supabase simulado)", () => {
  it("agrega as células por pessoa e dia, lê só a organização activa e conta as pessoas com registo", async () => {
    rhTeste.respostas["v_hr_horario_realizado_em_vigor"] = [
      { id: "r1", pessoa_id: "p-hugo", data: "2026-10-02", minutos: 240, local_id: "l1" },
      { id: "r2", pessoa_id: "p-hugo", data: "2026-10-02", minutos: 120, local_id: "l1" },
    ];
    rhTeste.respostas["v_hr_faltas_em_vigor"] = [
      { id: "fa-hugo", pessoa_id: "p-hugo", data: "2026-10-03", minutos: 240, justificacao_estado: "justificada" },
    ];
    rhTeste.rpcs["hr_assiduidade_desvios"] = { data: [{ pessoa_id: "p-ana", data: "2026-10-04" }], error: null };
    const { result } = montar(() => useAssiduidadeDaOrganizacao(JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect([...result.current.pessoasComRegisto].sort()).toEqual(["p-ana", "p-hugo"]);
    const trabalho = result.current.celulas.get("p-hugo|2026-10-02");
    expect(trabalho).toMatchObject({ minutosRealizados: 360, locais: ["l1"], temDesvio: false });
    const falta = result.current.celulas.get("p-hugo|2026-10-03");
    expect(falta).toMatchObject({ faltas: 1, faltasJustificadas: 1, minutosEmFalta: 240 });
    expect(result.current.celulas.get("p-ana|2026-10-04")?.temDesvio).toBe(true);
    expect(rpcsChamadas("hr_assiduidade_desvios")).toEqual([{ _organization_id: ORG, _data_de: JANELA.de, _data_ate: JANELA.ate }]);
  });

  it("uma janela sem nada devolve tudo vazio", async () => {
    const { result } = montar(() => useAssiduidadeDaOrganizacao({ de: "2000-01-01", ate: "2000-01-31" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pessoasComRegisto.size).toBe(0);
    expect(result.current.celulas.size).toBe(0);
  });

  it("uma recusa só nos desvios não passa por «não há desvios»: vem marcada, e o resto lê-se", async () => {
    rhTeste.respostas["v_hr_horario_realizado_em_vigor"] = [{ id: "r1", pessoa_id: "p-hugo", data: "2026-10-02", minutos: 60, local_id: null }];
    rhTeste.rpcs["hr_assiduidade_desvios"] = { data: null, error: RECUSA };
    const { result } = montar(() => useAssiduidadeDaOrganizacao(JANELA));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.desviosRecusado).toBe(true);
    expect(result.current.recusado).toBe(false);
    expect(result.current.pessoasComRegisto.has("p-hugo")).toBe(true);
  });
});

describe("relatório mensal (hook real sobre o Supabase simulado)", () => {
  // O mês do relatório conta de 0 (9 = Outubro), como `getMonth()`.
  it("tem um dia por dia do mês e totais coerentes com os dias", async () => {
    const { result } = montar(() => useRelatorioAssiduidadeMensal("p-rui", 2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dias).toHaveLength(31);
    const soma = result.current.dias.reduce((s, d) => s + d.realizadoMinutos, 0);
    expect(result.current.totais.realizadoMinutos).toBe(soma);
    expect(leituras("pessoas_horario_realizado")).toBe(1);
  });

  it("registar e anular horas de obra mandam as RPCs e relêem o mês", async () => {
    const { result } = montar(() => useRelatorioAssiduidadeMensal("p-rui", 2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.registarObra({ data: "2026-10-05", horas: 2.5, descricao: "Montagem" });
      await result.current.anularObra("obra-1", "Duplicada");
    });
    expect(rpcsChamadas("rpc_hr_obra_horas_registar")).toEqual([{ p_pessoa_id: "p-rui", p_data: "2026-10-05", p_horas: 2.5, p_descricao: "Montagem" }]);
    expect(rpcsChamadas("rpc_hr_obra_horas_anular")).toEqual([{ p_obra_id: "obra-1", p_motivo: "Duplicada" }]);
    expect(leituras("pessoas_horario_realizado")).toBe(3);
  });

  it("se a base recusa registar horas de obra, devolve o erro e não relê", async () => {
    rhTeste.rpcs["rpc_hr_obra_horas_registar"] = { data: null, error: RECUSA };
    const { result } = montar(() => useRelatorioAssiduidadeMensal("p-rui", 2026, 9));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let erro: string | null = null;
    await act(async () => {
      erro = await result.current.registarObra({ data: "2026-10-05", horas: 1, descricao: "x" });
    });
    expect(erro).toEqual(expect.any(String));
    expect(leituras("pessoas_horario_realizado")).toBe(1);
  });
});

describe("ausências da organização (hook real sobre o Supabase simulado)", () => {
  const pedidos = [
    { id: "pe-1", pessoa_id: "p-carolina", estado: "pendente_chefia", data_inicio: "2026-11-02" },
    { id: "pe-2", pessoa_id: "p-rui", estado: "pendente_rh", data_inicio: "2026-11-09" },
    { id: "pe-3", pessoa_id: "p-ana", estado: "aprovado", data_inicio: "2026-10-01" },
  ];

  it("junta os pedidos de toda a organização e separa os pendentes; os dias só vêm com o ano do mapa", async () => {
    rhTeste.respostas["pessoas_ausencias_pedidos"] = pedidos;
    rhTeste.respostas["pessoas_ausencias_pedido_decisoes"] = [
      { id: "d1", pedido_id: "pe-3", passo: "chefia", resultado: "aprovado" },
      { id: "d2", pedido_id: "pe-3", passo: "rh", resultado: "aprovado" },
    ];
    rhTeste.respostas["pessoas_ausencias_dias"] = [{ id: "di-1", pedido_id: "pe-3", data: "2026-10-01" }];
    const semAno = montar(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(semAno.result.current.loading).toBe(false));
    expect(semAno.result.current.pedidos).toHaveLength(3);
    expect(semAno.result.current.pendentes.map((p) => p.id)).toEqual(["pe-1", "pe-2"]);
    expect(semAno.result.current.dias).toEqual([]);
    expect(leituras("pessoas_ausencias_dias")).toBe(0);
    expect(semAno.result.current.decisoesPorPedido.get("pe-3")?.at(-1)?.passo).toBe("rh");

    const comAno = montar(() => useAusenciasDaOrganizacao({ anoDoMapa: 2026 }));
    await waitFor(() => expect(comAno.result.current.loading).toBe(false));
    expect(comAno.result.current.dias.map((d) => d.id)).toEqual(["di-1"]);
    expect(leituras("pessoas_ausencias_dias")).toBe(1);
  });

  it("a chefia e o RH decidem pelas RPCs, cancelar e corrigir também, e cada uma relê a lista", async () => {
    rhTeste.respostas["pessoas_ausencias_pedidos"] = pedidos;
    const { result } = montar(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const erros: Array<string | null> = [];
    await act(async () => {
      erros.push(await result.current.decidirChefia({ pedidoId: "pe-1", resultado: "recusado", motivo: "Equipa curta" }));
      erros.push(await result.current.decidirRh({ pedidoId: "pe-2", resultado: "aprovado" }));
      erros.push(await result.current.cancelar("pe-3", "Mudou de planos"));
      erros.push(await result.current.corrigirAprovado("pe-3", "Datas erradas"));
    });
    expect(erros).toEqual([null, null, null, null]);
    expect(rpcsChamadas("rpc_hr_ausencia_decidir_chefia")).toEqual([
      { _pedido_id: "pe-1", _resultado: "recusado", _motivo: "Equipa curta", _ajuste_data_inicio: null, _ajuste_data_fim: null },
    ]);
    expect(rpcsChamadas("rpc_hr_ausencia_decidir_rh")).toEqual([{ _pedido_id: "pe-2", _resultado: "aprovado", _motivo: null }]);
    expect(rpcsChamadas("rpc_hr_ausencia_cancelar")).toEqual([{ _pedido_id: "pe-3", _motivo: "Mudou de planos" }]);
    expect(rpcsChamadas("rpc_hr_ausencia_corrigir_aprovado")).toEqual([{ _pedido_id: "pe-3", _motivo: "Datas erradas" }]);
    expect(leituras("pessoas_ausencias_pedidos")).toBe(5);
  });

  it("quando a base recusa decidir ou cancelar, devolve o erro a mostrar e não relê", async () => {
    rhTeste.respostas["pessoas_ausencias_pedidos"] = pedidos;
    rhTeste.rpcs["rpc_hr_ausencia_decidir_rh"] = { data: null, error: RECUSA };
    rhTeste.rpcs["rpc_hr_ausencia_cancelar"] = { data: null, error: { code: "P0002", message: "pedido inexistente" } };
    const { result } = montar(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let a: string | null = null;
    let b: string | null = null;
    await act(async () => {
      a = await result.current.cancelar("nao-existe", "x");
      b = await result.current.decidirRh({ pedidoId: "nao-existe", resultado: "aprovado" });
    });
    expect(a).toEqual(expect.any(String));
    expect(b).toEqual(expect.any(String));
    expect(leituras("pessoas_ausencias_pedidos")).toBe(1);
  });

  it("o motivo só se pede à base a pedido (nunca ao carregar) e, se a base recusa, o erro sobe", async () => {
    rhTeste.respostas["pessoas_ausencias_pedidos"] = pedidos;
    rhTeste.rpcs["rpc_hr_ausencia_ver_motivo"] = { data: "Consulta de rotina", error: null };
    const { result } = montar(() => useAusenciasDaOrganizacao());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(rpcsChamadas("rpc_hr_ausencia_ver_motivo")).toEqual([]);
    expect(await result.current.verMotivo("pe-1")).toBe("Consulta de rotina");
    rhTeste.rpcs["rpc_hr_ausencia_ver_motivo"] = { data: null, error: RECUSA };
    await expect(result.current.verMotivo("pe-1")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("modelos e cláusulas (hooks reais sobre o Supabase simulado)", () => {
  it("lê os modelos da organização e criar, editar e desactivar escrevem na tabela com o conteúdo certo", async () => {
    rhTeste.respostas["pessoas_documentos_modelos"] = [{ id: "m1", nome: "Contrato", tipo: "contrato", activo: true }];
    const { result } = montar(() => useModelosDocumentosRH());
    await waitFor(() => expect(result.current.modelos).toHaveLength(1));
    await act(async () => {
      await result.current.criar({ nome: "Aditamento", tipo: "adenda", corpo_html: "<p>x</p>", variaveis: [] });
    });
    expect(escritasDe("pessoas_documentos_modelos", "insert")).toEqual([
      expect.objectContaining({ organization_id: ORG, nome: "Aditamento", tipo: "adenda", corpo_html: "<p>x</p>", variaveis: [] }),
    ]);
    await act(async () => {
      await result.current.editar({ id: "m1", nome: "Aditamento 2", tipo: "adenda", corpo_html: "<p>y</p>", variaveis: ["pessoa.nome_completo"] });
      await result.current.definirActivo("m1", false);
    });
    expect(escritasDe("pessoas_documentos_modelos", "update")).toEqual([
      expect.objectContaining({ nome: "Aditamento 2", corpo_html: "<p>y</p>", variaveis: ["pessoa.nome_completo"] }),
      expect.objectContaining({ activo: false }),
    ]);
    // Nunca se apaga: só se desactiva.
    expect(escritasDe("pessoas_documentos_modelos", "delete")).toEqual([]);
    await waitFor(() => expect(leituras("pessoas_documentos_modelos")).toBeGreaterThanOrEqual(4));
  });

  it("as cláusulas criam-se com a organização activa, editam-se e desactivam-se (nunca se apagam)", async () => {
    rhTeste.respostas["pessoas_documentos_clausulas"] = [{ id: "c1", nome: "Exclusividade", activo: true }];
    const { result } = montar(() => useClausulasDocumentosRH());
    await waitFor(() => expect(result.current.clausulas).toHaveLength(1));
    await act(async () => {
      await result.current.criar({ nome: "Confidencialidade", categoria: null, corpo_html: "<p>x</p>" });
      await result.current.editar({ id: "c1", nome: "Exclusividade parcial", categoria: "Geral", corpo_html: "<p>z</p>" });
      await result.current.definirActivo("c1", false);
    });
    expect(escritasDe("pessoas_documentos_clausulas", "insert")).toEqual([
      expect.objectContaining({ organization_id: ORG, nome: "Confidencialidade", categoria: null, corpo_html: "<p>x</p>" }),
    ]);
    expect(escritasDe("pessoas_documentos_clausulas", "update")).toEqual([
      expect.objectContaining({ nome: "Exclusividade parcial", categoria: "Geral", corpo_html: "<p>z</p>" }),
      expect.objectContaining({ activo: false }),
    ]);
    expect(escritasDe("pessoas_documentos_clausulas", "delete")).toEqual([]);
  });

  it("sem organização activa não há nada para ler nem para criar", async () => {
    rhTeste.empresa = null;
    const { result } = montar(() => useClausulasDocumentosRH());
    expect(result.current.clausulas).toEqual([]);
    await act(async () => {
      await expect(result.current.criar({ nome: "x", categoria: null, corpo_html: "" })).rejects.toThrow();
    });
    expect(rhTeste.escritas).toEqual([]);
  });
});

describe("processamento salarial (hooks reais sobre o Supabase simulado)", () => {
  it("os códigos criam-se com o modo manual por omissão, actualizam-se e desactivam-se, sempre dentro da organização", async () => {
    rhTeste.respostas["hr_codigos_processamento"] = [{ id: "c1", codigo: "HE", nome: "Hora extra", activo: true }];
    const { result } = montar(() => useCodigosProcessamento());
    await waitFor(() => expect(result.current.codigos).toHaveLength(1));
    await act(async () => {
      await result.current.criar({ codigo: "NOVO", nome: "Novo", descricao: null });
      await result.current.actualizar("c1", { nome: "Novo 2", descricao: "d", modo_calculo: "valor_fixo_mensal", percentagem: null, valor_fixo: 10, origem_automatica: null });
      await result.current.definirActivo("c1", false);
    });
    expect(escritasDe("hr_codigos_processamento", "insert")).toEqual([
      expect.objectContaining({ organization_id: ORG, codigo: "NOVO", modo_calculo: "manual", percentagem: null, valor_fixo: null, origem_automatica: null }),
    ]);
    expect(escritasDe("hr_codigos_processamento", "update")).toEqual([
      expect.objectContaining({ nome: "Novo 2", descricao: "d", modo_calculo: "valor_fixo_mensal", valor_fixo: 10 }),
      expect.objectContaining({ activo: false }),
    ]);
  });

  it("actualizar ou desactivar um código que não é desta organização (zero linhas) é um erro, nunca um sucesso", async () => {
    rhTeste.respostas["hr_codigos_processamento"] = [];
    const { result } = montar(() => useCodigosProcessamento());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await expect(result.current.definirActivo("de-outra-org", false)).rejects.toThrow(/Nenhum codigo/);
      await expect(
        result.current.actualizar("de-outra-org", { nome: "x", descricao: null, modo_calculo: "manual", percentagem: null, valor_fixo: null, origem_automatica: null }),
      ).rejects.toThrow(/Nenhum codigo/);
    });
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

  it("a regra do subsídio: sem linha mostra a omissão (não gravada); com linha mostra a gravada; gravar faz upsert por organização", async () => {
    const semLinha = montar(() => useRegrasSubsidioAlimentacao());
    await waitFor(() => expect(semLinha.result.current.isFetched).toBe(true));
    expect(semLinha.result.current.temRegraGravada).toBe(false);
    expect(semLinha.result.current.regra.minutosMinimosDia).toBe(1);

    rhTeste.respostas["hr_regras_subsidio_alimentacao"] = { id: "r1", organization_id: ORG, minutos_minimos_dia: 240 };
    const comLinha = montar(() => useRegrasSubsidioAlimentacao());
    await waitFor(() => expect(comLinha.result.current.temRegraGravada).toBe(true));
    expect(comLinha.result.current.regra.minutosMinimosDia).toBe(240);
    await act(async () => {
      await comLinha.result.current.gravar({ minutosMinimosDia: 300 });
    });
    expect(escritasDe("hr_regras_subsidio_alimentacao", "upsert")).toEqual([
      expect.objectContaining({ organization_id: ORG, minutos_minimos_dia: 300 }),
    ]);
  });

  it("o período do mês: sem linha é null, com linha é o da base; abrir manda a RPC com o mês e fechar usa o id do período", async () => {
    const vazio = montar(() => useProcessamentoPeriodo(2026, 10));
    await waitFor(() => expect(vazio.result.current.loading).toBe(false));
    expect(vazio.result.current.periodo).toBeNull();
    await act(async () => {
      expect(await vazio.result.current.abrir()).toBeNull();
    });
    expect(rpcsChamadas("rpc_hr_processamento_periodo_abrir")).toEqual([{ p_organization_id: ORG, p_ano: 2026, p_mes: 10 }]);

    rhTeste.respostas["hr_periodos_processamento"] = { id: "per-9", ano: 2026, mes: 9, estado: "aberto", fechado_em: null };
    const aberto = montar(() => useProcessamentoPeriodo(2026, 9));
    await waitFor(() => expect(aberto.result.current.periodo?.id).toBe("per-9"));
    await act(async () => {
      expect(await aberto.result.current.fechar()).toBeNull();
    });
    expect(rpcsChamadas("rpc_hr_processamento_periodo_fechar")).toEqual([{ p_periodo_id: "per-9" }]);
  });

  it("fechar sem período devolve erro e não chama a base; se a base recusa abrir, devolve o erro", async () => {
    const { result } = montar(() => useProcessamentoPeriodo(1999, 1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let erro: string | null = null;
    await act(async () => {
      erro = await result.current.fechar();
    });
    expect(erro).toEqual(expect.any(String));
    expect(rpcsChamadas("rpc_hr_processamento_periodo_fechar")).toEqual([]);

    rhTeste.rpcs["rpc_hr_processamento_periodo_abrir"] = { data: null, error: RECUSA };
    let erroAbrir: string | null = null;
    await act(async () => {
      erroAbrir = await result.current.abrir();
    });
    expect(erroAbrir).toEqual(expect.any(String));
  });

  it("lançamentos: lê os do período, cria e anula pelas RPCs e relê", async () => {
    rhTeste.respostas["hr_processamento_lancamentos"] = [{ id: "l1", periodo_id: "per-9" }, { id: "l2", periodo_id: "per-9" }];
    const { result } = montar(() => useProcessamentoLancamentos("per-9"));
    await waitFor(() => expect(result.current.lancamentos).toHaveLength(2));
    await act(async () => {
      await result.current.criar({ pessoaId: "p-ines", descricao: "Prémio", valor: 50, codigoProcessamentoId: null });
      await result.current.anular("l1", "Enganado");
    });
    expect(rpcsChamadas("rpc_hr_processamento_lancamento_criar")).toEqual([
      { p_periodo_id: "per-9", p_pessoa_id: "p-ines", p_descricao: "Prémio", p_valor: 50, p_codigo_processamento_id: null },
    ]);
    expect(rpcsChamadas("rpc_hr_processamento_lancamento_anular")).toEqual([{ p_lancamento_id: "l1", p_motivo: "Enganado" }]);
    expect(leituras("hr_processamento_lancamentos")).toBe(3);
  });

  it("sem período, os lançamentos ficam vazios e criar recusa sem chamar a base", async () => {
    const { result } = montar(() => useProcessamentoLancamentos(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lancamentos).toEqual([]);
    let erro: string | null = null;
    await act(async () => {
      erro = await result.current.criar({ pessoaId: "p-ines", descricao: "x", valor: 1, codigoProcessamentoId: null });
    });
    expect(erro).toEqual(expect.any(String));
    expect(rpcsChamadas("rpc_hr_processamento_lancamento_criar")).toEqual([]);
  });

  it("as retribuições vigentes do mês agrupam-se por pessoa, e sem organização não se lê nada", async () => {
    rhTeste.respostas["pessoas_retribuicoes"] = [
      { pessoa_id: "p1", valor_base: 1000, valido_de: "2026-01-01", valido_ate: "2026-10-15" },
      { pessoa_id: "p1", valor_base: 1200, valido_de: "2026-10-15", valido_ate: null },
      { pessoa_id: "p2", valor_base: 900, valido_de: "2026-01-01", valido_ate: null },
    ];
    const { result } = montar(() => useRetribuicoesVigentesDaOrganizacao(ORG, 2026, 10));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.porPessoa.size).toBe(2);
    expect(result.current.porPessoa.get("p1")).toHaveLength(2);

    const total = leituras("pessoas_retribuicoes");
    const nenhuma = montar(() => useRetribuicoesVigentesDaOrganizacao(undefined, 2026, 10));
    await waitFor(() => expect(nenhuma.result.current.loading).toBe(false));
    expect(nenhuma.result.current.porPessoa.size).toBe(0);
    expect(leituras("pessoas_retribuicoes")).toBe(total);
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

describe("admissão e fim de contrato (hooks reais sobre o Supabase simulado)", () => {
  it("a configuração lê-se pela RPC e normaliza a linha antiga; definir a posição manda a RPC (a validação é da base)", async () => {
    rhTeste.rpcs["rpc_hr_admissao_configuracao_ler"] = {
      data: [
        { codigo: "nif", origem: "pessoa", posicao: "convite", configuravel: true },
        { codigo: "salario", origem: "rh", posicao: "rh", configuravel: false },
        { codigo: "carta", origem: "pessoa", obrigatorio: false },
      ],
      error: null,
    };
    const { result } = montar(() => useConfiguracaoObrigatoriosAdmissao());
    await waitFor(() => expect(result.current.campos).toHaveLength(3));
    expect(rpcsChamadas("rpc_hr_admissao_configuracao_ler")).toEqual([{ p_organization_id: ORG }]);
    expect(result.current.campos.find((c) => c.codigo === "salario")).toMatchObject({ posicao: "rh", configuravel: false });
    expect(result.current.campos.find((c) => c.codigo === "carta")).toMatchObject({ posicao: "opcional", configuravel: true });
    await act(async () => {
      await result.current.definirPosicao("nif", "ficha");
    });
    expect(rpcsChamadas("rpc_hr_admissao_definir_posicao")).toEqual([{ p_organization_id: ORG, p_codigo: "nif", p_posicao: "ficha" }]);
  });

  it("se a base recusa a nova posição, o erro sobe; se recusa a leitura, mostra texto amigável e não o da base", async () => {
    rhTeste.rpcs["rpc_hr_admissao_definir_posicao"] = { data: null, error: RECUSA };
    const { result } = montar(() => useConfiguracaoObrigatoriosAdmissao());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await expect(result.current.definirPosicao("salario", "opcional")).rejects.toMatchObject({ code: "42501" });
    });

    rhTeste.rpcs["rpc_hr_admissao_configuracao_ler"] = { data: null, error: RECUSA };
    const recusada = montar(() => useConfiguracaoObrigatoriosAdmissao());
    await waitFor(() => expect(recusada.result.current.erro).not.toBeNull());
    expect(recusada.result.current.erro).not.toMatch(/permission denied/i);
    expect(recusada.result.current.campos).toEqual([]);
  });

  it("as regras de fim de contrato: sem linha vêm desligadas (não gravadas); com linha mostram-se; guardar manda a RPC", async () => {
    const semLinha = montar(() => useRegrasFimContrato());
    await waitFor(() => expect(semLinha.result.current.isLoading).toBe(false));
    expect(semLinha.result.current.temRegraGravada).toBe(false);
    expect(semLinha.result.current.regra.ativo).toBe(false);

    rhTeste.respostas["hr_regras_fim_contrato"] = { id: "r1", organization_id: ORG, ativo: true, dias_aviso: 30, renovacao_automatica: false, max_renovacoes: 0 };
    const { result } = montar(() => useRegrasFimContrato());
    await waitFor(() => expect(result.current.temRegraGravada).toBe(true));
    expect(result.current.regra.ativo).toBe(true);
    await act(async () => {
      await result.current.guardar({
        ativo: false, diasAviso: 45, renovacaoAutomatica: true, maxRenovacoes: 3, duracaoValor: 12, duracaoUnidade: "meses", aoAtingirLimite: "decisao_manual_rh",
      });
    });
    expect(rpcsChamadas("rpc_hr_regras_fim_contrato_guardar")).toEqual([
      {
        p_organization_id: ORG, p_ativo: false, p_dias_aviso: 45, p_renovacao_automatica: true, p_max_renovacoes: 3,
        p_duracao_valor: 12, p_duracao_unidade: "meses", p_ao_atingir_limite: "decisao_manual_rh",
      },
    ]);
  });

  it("se a RPC recusa guardar, o erro chega ao ecrã com o código (para ser traduzido)", async () => {
    rhTeste.rpcs["rpc_hr_regras_fim_contrato_guardar"] = { data: null, error: { code: "HRV05", message: "x" } };
    const { result } = montar(() => useRegrasFimContrato());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await expect(
        result.current.guardar({ ativo: true, diasAviso: 0, renovacaoAutomatica: false, maxRenovacoes: 0, duracaoValor: null, duracaoUnidade: null, aoAtingirLimite: "decisao_manual_rh" }),
      ).rejects.toMatchObject({ code: "HRV05" });
    });
  });

  it("chaveDeErroFimContrato só reconhece códigos conhecidos e não confunde propriedades herdadas", () => {
    expect(chaveDeErroFimContrato({ code: "HRV05" })).toBe("hr.fimContrato.erro.HRV05");
    expect(chaveDeErroFimContrato({ code: "XYZ" })).toBeNull();
    expect(chaveDeErroFimContrato({ code: "constructor" })).toBeNull();
    expect(chaveDeErroFimContrato(null)).toBeNull();
    expect(chaveDeErroFimContrato("texto")).toBeNull();
  });
});

describe("convite de admissão de demonstração (token «exemplo», em memória, sem equivalente real)", () => {
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

  it("os campos movidos para a ficha (na configuração de demonstração) deixam de ser pedidos no convite", () => {
    const convite = renderHook(() => useConviteAdmissaoPublico(TOKEN_CONVITE_EXEMPLO));
    const antes = convite.result.current.estado!.campos_obrigatorios!.length;
    expect(lerGestao().admissaoCampos.some((c) => c.codigo === "tamanho_cima" && c.posicao === "convite")).toBe(true);
    act(() => {
      definirGestao((g) => ({
        ...g,
        admissaoCampos: g.admissaoCampos.map((c) => (c.codigo === "tamanho_cima" ? { ...c, posicao: "ficha" as const } : c)),
      }));
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

  it("submeter com um link que não serve devolve o motivo real e liberta o botão", async () => {
    const { result } = renderHook(() => useConviteAdmissaoPublico("qualquer"));
    let resultado: Awaited<ReturnType<typeof result.current.submeter>> | null = null;
    await act(async () => {
      resultado = await result.current.submeter({}, "Beatriz Lopes");
    });
    expect(resultado).toEqual({ ok: false, corpoErro: { error: "transicao_invalida" }, avisos: [] });
    expect(result.current.submetendo).toBe(false);
  });

  it("gravar rascunho num link que não serve avisa em vez de parecer guardado", async () => {
    const { result } = renderHook(() => useConviteAdmissaoPublico("qualquer"));
    expect(result.current.erroRascunho).toBeNull();
    await act(async () => {
      await result.current.gravarRascunho({ nif: "1" });
    });
    expect(result.current.erroRascunho).toBe("convite_invalido");
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
