// A ficha real e o fecho da fase da visita: o passo «marcar visita» da chamada deixa de recusar (grava o contacto e marca a visita por
// `useAcoesVisita`, sem a nota da chamada na visita) e `alterarVisita` grava por neg_alterar_visita a partir da visita da ficha.
// Marcar uma visita NÃO conta como contacto: a visita não leva nota nem mexe no contacto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import type { DadosChamada } from "@/components/pessoas/acoesPessoa";
import { fichaDb, PESSOA_ID, seccaoDb, visitaDb } from "./fichaFabrica";
import { chamadas, erroDe, invalidadas, limparAcoes, montarAcoes as montar, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { captureMock, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import type { EntradaVisita } from "./visitaDb";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

beforeEach(prepararAcoes);
afterEach(limparAcoes);

const V = "pessoasPagina.real.visit.";

const ENTRADA: EntradaVisita = {
  boardId: "b1", data: "2026-10-27", hora: "10:00", duracao: "h1", recursos: ["r1"], tipo: "levantamento", titulo: "Levantamento · Ana Lopes", nota: "",
  morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" }, igualALead: false, quemVaiEstar: "",
};
const dados = (extra: Partial<Omit<DadosChamada, "hoje">> = {}): Omit<DadosChamada, "hoje"> => ({
  resultado: "atendeuInteressado", nota: "  Quer visita  ", passo: "marcarVisita", data: "2026-10-27", hora: "10:00", visita: ENTRADA, ...extra,
});

describe("registarChamada com o passo «marcar visita»", () => {
  it("regista o contacto (sem próxima ação) e depois marca a visita, por esta ordem, sem a nota da chamada na visita", async () => {
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true })).mockReturnValueOnce(respostaOk({ visita_id: "v-nova", mudou: true }));
    const { result, client } = montar();
    semear(client);
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados()); });
    expect(chamadas()).toEqual(["neg_registar_contacto", "neg_guardar_visita"]);
    expect(parametros(0)).toMatchObject({ p_entity_id: PESSOA_ID, p_resultado: "atendeuInteressado", p_nota: "Quer visita", p_proxima_acao_em: null, p_negocio_id: null });
    expect(parametros(1)).toMatchObject({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_board_id: "b1", p_recursos: ["r1"], p_notas: null, p_negocio_id: null,
      p_inicio: "2026-10-27T10:00:00.000Z", p_fim: "2026-10-27T11:00:00.000Z", p_lat: null, p_lng: null,
    });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("sem a agenda da visita (nada para marcar) recusa antes de chamar a base", async () => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ visita: undefined })); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("uma agenda sem recursos recusa ANTES de registar o contacto (não deixa a chamada a meio)", async () => {
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados({ visita: { ...ENTRADA, recursos: [] } })); }));
    expect(erro.chave).toBe(`${V}err.noResource`);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("se a visita falha depois do contacto: aviso parcial com a leitura da visita ao lado, e a ficha refaz-se", async () => {
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true })).mockReturnValueOnce(respostaErro("NG010"));
    const { result, client } = montar();
    semear(client);
    const erro = await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados()); }));
    expect(erro.chave).toBe("pessoasPagina.real.ficha.partialCallVisit");
    expect(erro.chaveExtra).toBe(`${V}err.marcar.ng010`);
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("repetir depois de a visita falhar reutiliza o p_id do contacto (não duplica) e volta a pedir a visita", async () => {
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true })).mockReturnValueOnce(respostaErro("NG010"));
    const { result } = montar();
    await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados()); }));
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: false })).mockReturnValueOnce(respostaOk({ visita_id: "v-nova", mudou: true }));
    await act(async () => { await result.current.registarChamada(PESSOA_ID, dados()); });
    expect(chamadas()).toEqual(["neg_registar_contacto", "neg_guardar_visita", "neg_registar_contacto", "neg_guardar_visita"]);
    expect(parametros(2).p_id).toBe(parametros(0).p_id);
  });

  it("repetir com OUTRA hora da visita (o caso normal depois de um NG010) reutiliza o p_id do contacto: o contacto não se duplica", async () => {
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true })).mockReturnValueOnce(respostaErro("NG010"));
    const { result } = montar();
    await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados()); }));
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: false })).mockReturnValueOnce(respostaOk({ visita_id: "v-nova", mudou: true }));
    const outra = dados({ data: "2026-10-28", hora: "15:30", visita: { ...ENTRADA, data: "2026-10-28", hora: "15:30" } });
    await act(async () => { await result.current.registarChamada(PESSOA_ID, outra); });
    expect(chamadas()).toEqual(["neg_registar_contacto", "neg_guardar_visita", "neg_registar_contacto", "neg_guardar_visita"]);
    expect(parametros(2).p_id).toBe(parametros(0).p_id);
    // A visita nova leva a hora nova.
    expect(parametros(3)).toMatchObject({ p_inicio: "2026-10-28T15:30:00.000Z" });
  });

  it("o passo «ligar numa data» continua a distinguir pedidos por data e hora (a próxima ação depende delas)", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    const { result } = montar();
    const ligar = (hora: string) => dados({ passo: "ligarData", data: "2026-10-27", hora, visita: undefined });
    await act(async () => { await result.current.registarChamada(PESSOA_ID, ligar("10:00")); });
    await act(async () => { await result.current.registarChamada(PESSOA_ID, ligar("11:00")); });
    expect(parametros(0).p_id).not.toBe(parametros(1).p_id);
  });

  it("se o contacto falha, a visita nem se tenta", async () => {
    rpcMock.mockReturnValueOnce(respostaErro("NG003"));
    const { result } = montar();
    const erro = await erroDe(act(async () => { await result.current.registarChamada(PESSOA_ID, dados()); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng003");
    expect(chamadas()).toEqual(["neg_registar_contacto"]);
  });
});

const FICHA_COM_VISITA = fichaDb({
  visitas: seccaoDb([
    visitaDb({
      id: "v-alt", inicio: "2026-10-25T09:00:00Z", fim: "2026-10-25T10:30:00Z", board_id: "b1", tipo: "medicao", notas: "Tocar à campainha",
      recursos: [{ id: "r1", nome: "Rita", user_id: "u1", ativo: true }, { id: "r2", nome: "Rui", user_id: "u2", ativo: true }],
    }),
    visitaDb({ id: "sem-quadro", board_id: null, recursos: [] }),
  ]),
});
const DESTINO = { igualALead: false, outra: { rua: "Rua B 2", codigoPostal: "", localidade: "", andar: "" }, notaAcesso: "Tocar à campainha" };

describe("alterarVisita (a ação da ficha, sobre a visita lida da base)", () => {
  it("reenvia o quadro, a duração, o tipo e a nota da visita com o novo dia, hora e morada; recursos iguais vão a NULL", async () => {
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true }));
    const { result, client } = montar({ ficha: FICHA_COM_VISITA });
    semear(client);
    await act(async () => { await result.current.alterarVisita("v-alt", { data: "2026-10-28", hora: "11:00", destino: DESTINO }); });
    expect(chamadas()).toEqual(["neg_alterar_visita"]);
    expect(parametros(0)).toMatchObject({
      p_visita_id: "v-alt", p_board_id: "b1", p_inicio: "2026-10-28T11:00:00.000Z", p_fim: "2026-10-28T12:30:00.000Z", p_visit_kind: "medicao",
      p_notas: "Tocar à campainha", p_local: "Rua B 2", p_recursos: null, p_titulo: null,
    });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("a nota que segue é a do destino (nota de acesso) e NÃO a da visita lida; o título vai NULL porque a base mantém o atual (neg_alterar_visita: título NULL mantém)", async () => {
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true }));
    const { result } = montar({ ficha: FICHA_COM_VISITA });
    await act(async () => {
      await result.current.alterarVisita("v-alt", { data: "2026-10-28", hora: "11:00", destino: { ...DESTINO, notaAcesso: "Portão azul" } });
    });
    expect(parametros(0)).toMatchObject({ p_notas: "Portão azul", p_titulo: null });
    // Sem nota de acesso, a nota limpa-se: é o que o utilizador escolheu no diálogo, não uma omissão.
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true }));
    await act(async () => {
      await result.current.alterarVisita("v-alt", { data: "2026-10-29", hora: "11:00", destino: { ...DESTINO, notaAcesso: "" } });
    });
    expect(parametros(1).p_notas).toBeNull();
  });

  it("uma visita que a ficha não tem recusa sem chamar a base", async () => {
    const { result } = montar({ ficha: FICHA_COM_VISITA });
    const erro = await erroDe(act(async () => { await result.current.alterarVisita("nao-existe", { data: "2026-10-28", hora: "11:00", destino: DESTINO }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("uma visita sem quadro nem recursos (não dá para reenviar tudo) recusa em vez de apagar nada", async () => {
    const { result } = montar({ ficha: FICHA_COM_VISITA });
    const erro = await erroDe(act(async () => { await result.current.alterarVisita("sem-quadro", { data: "2026-10-28", hora: "11:00", destino: DESTINO }); }));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.generico");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("NG010 chega com a leitura do diálogo de alterar", async () => {
    rpcMock.mockReturnValueOnce(respostaErro("NG010"));
    const { result } = montar({ ficha: FICHA_COM_VISITA });
    const erro = await erroDe(act(async () => { await result.current.alterarVisita("v-alt", { data: "2026-10-28", hora: "11:00", destino: DESTINO }); }));
    expect(erro.chave).toBe(`${V}err.alterar.ng010`);
  });
});
