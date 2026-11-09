// Os anexos reais das justificações: o contrato com a Edge hr-justificacao-anexo (url -> upload -> confirmar; remover; abrir), a
// leitura por RPC e o id do papel de uma falta. A Edge, o storage e a base estão simulados; nada toca em rede.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  invoke: vi.fn(),
  upload: vi.fn(),
  deBucket: vi.fn(),
  rpc: vi.fn(),
  consulta: vi.fn(),
  erros: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: m.invoke },
    storage: { from: (b: string) => { m.deBucket(b); return { uploadToSignedUrl: m.upload }; } },
  },
}));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: m.rpc, hrFrom: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: m.consulta }) }) }) }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: m.erros }));

import { abrirAnexo, enviarAnexo, enviarAnexos, listarAnexos, papelDaFalta, removerAnexo } from "../useAnexarJustificacao";

const ID2 = "33333333-3333-4333-8333-333333333333";
const RESERVA2 = { data: { ok: true, anexo_id: ID2, bucket: "hr-documentos-quarantine", caminho: "justificacoes/y.pdf", upload_token: "tok2" }, error: null };
/** Um erro HTTP com o estado e o texto de `_shared/auth.ts` (que não usa os códigos da Edge). */
const erroAuth = (texto: string, estado: number) => ({ data: null, error: { context: new Response(JSON.stringify({ error: texto }), { status: estado }) } });

const pdf = (nome = "atestado.pdf") => new File([new Uint8Array(20)], nome, { type: "application/pdf" });
const ID = "11111111-1111-4111-8111-111111111111";
const DIA = { justificacaoDiaId: "22222222-2222-4222-8222-222222222222" };
const RESERVA = { data: { ok: true, anexo_id: ID, bucket: "hr-documentos-quarantine", caminho: "justificacoes/x.pdf", upload_token: "tok" }, error: null };

/** Como o supabase-js: um erro HTTP traz o corpo em `error.context`, uma Response. */
const erroHttp = (codigo: string) => ({ data: null, error: { context: new Response(JSON.stringify({ error: codigo }), { status: 409 }) } });

beforeEach(() => {
  vi.clearAllMocks();
  m.upload.mockResolvedValue({ data: {}, error: null });
});

describe("enviarAnexo", () => {
  it("reserva, sobe para a quarentena com o token e confirma, por esta ordem", async () => {
    m.invoke.mockResolvedValueOnce(RESERVA).mockResolvedValueOnce({ data: { ok: true, anexo: { id: ID } }, error: null });
    const f = pdf();
    expect(await enviarAnexo(DIA, f)).toEqual({ ok: true, codigo: null, anexoId: ID, uploadFeito: true });
    expect(m.invoke).toHaveBeenNthCalledWith(1, "hr-justificacao-anexo", {
      body: { accao: "url", justificacao_dia_id: DIA.justificacaoDiaId, nome: "atestado.pdf", tamanho: 20, mime: "application/pdf" },
    });
    expect(m.deBucket).toHaveBeenCalledWith("hr-documentos-quarantine");
    expect(m.upload).toHaveBeenCalledWith("justificacoes/x.pdf", "tok", f);
    expect(m.invoke).toHaveBeenNthCalledWith(2, "hr-justificacao-anexo", { body: { accao: "confirmar", anexo_id: ID } });
    expect(m.erros).not.toHaveBeenCalled();
  });

  it("para o papel de uma falta manda falta_justificacao_id (e não o id da justificação do dia)", async () => {
    m.invoke.mockResolvedValueOnce(RESERVA).mockResolvedValueOnce({ data: { ok: true }, error: null });
    await enviarAnexo({ faltaJustificacaoId: "papel-1" }, pdf());
    const corpo = m.invoke.mock.calls[0][1].body;
    expect(corpo.falta_justificacao_id).toBe("papel-1");
    expect(corpo).not.toHaveProperty("justificacao_dia_id");
  });

  it("uma recusa de negócio da Edge devolve o código e não vai para o registo de erros", async () => {
    m.invoke.mockResolvedValueOnce(erroHttp("anexo_maximo_ficheiros"));
    expect(await enviarAnexo(DIA, pdf())).toEqual({ ok: false, codigo: "anexo_maximo_ficheiros", anexoId: null, uploadFeito: false });
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.erros).not.toHaveBeenCalled();
  });

  it("um erro no corpo de uma resposta 2xx também conta", async () => {
    m.invoke.mockResolvedValueOnce({ data: { error: "justificacao_decidida" }, error: null });
    expect((await enviarAnexo(DIA, pdf())).codigo).toBe("justificacao_decidida");
  });

  it("se o upload falha, devolve anexo_falha_envio e não confirma", async () => {
    m.invoke.mockResolvedValueOnce(RESERVA);
    m.upload.mockResolvedValueOnce({ data: null, error: new Error("rede") });
    expect(await enviarAnexo(DIA, pdf())).toEqual({ ok: false, codigo: "anexo_falha_envio", anexoId: ID, uploadFeito: false });
    expect(m.invoke).toHaveBeenCalledTimes(1);
  });

  it("se o upload lança, também devolve anexo_falha_envio (nunca lança)", async () => {
    m.invoke.mockResolvedValueOnce(RESERVA);
    m.upload.mockRejectedValueOnce(new Error("boom"));
    expect((await enviarAnexo(DIA, pdf())).codigo).toBe("anexo_falha_envio");
  });

  it("a confirmação recusada (conteúdo) devolve o código", async () => {
    m.invoke.mockResolvedValueOnce(RESERVA).mockResolvedValueOnce(erroHttp("anexo_conteudo_recusado"));
    expect((await enviarAnexo(DIA, pdf())).codigo).toBe("anexo_conteudo_recusado");
  });

  it("os 401 de autenticação da Edge (texto de _shared/auth.ts) dão sem_sessao, e o 403 do perfil dá sem_permissao, sem ir para o registo", async () => {
    m.invoke.mockResolvedValueOnce(erroAuth("Authorization header required", 401));
    expect((await enviarAnexo(DIA, pdf())).codigo).toBe("sem_sessao");
    m.invoke.mockResolvedValueOnce(erroAuth("Invalid or expired token", 401));
    expect((await enviarAnexo(DIA, pdf())).codigo).toBe("sem_sessao");
    m.invoke.mockResolvedValueOnce(erroAuth("User profile not found", 403));
    expect((await enviarAnexo(DIA, pdf())).codigo).toBe("sem_permissao");
    m.invoke.mockResolvedValueOnce(erroAuth("qualquer coisa", 401));
    expect((await enviarAnexo(DIA, pdf())).codigo).toBe("sem_sessao");
    expect(m.erros).not.toHaveBeenCalled();
  });

  it("a confirmação falhada devolve o anexoId e que o upload já correu; repetir só confirma (sem reservar nem subir de novo)", async () => {
    m.invoke.mockResolvedValueOnce(RESERVA).mockResolvedValueOnce(erroHttp("anexo_nao_carregado"));
    const primeira = await enviarAnexo(DIA, pdf());
    expect(primeira).toEqual({ ok: false, codigo: "anexo_nao_carregado", anexoId: ID, uploadFeito: true });
    m.invoke.mockClear();
    m.upload.mockClear();
    m.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(await enviarAnexo(DIA, pdf(), primeira)).toEqual({ ok: true, codigo: null, anexoId: ID, uploadFeito: true });
    expect(m.invoke).toHaveBeenCalledTimes(1);
    expect(m.invoke).toHaveBeenCalledWith("hr-justificacao-anexo", { body: { accao: "confirmar", anexo_id: ID } });
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("repetir uma confirmação que a Edge já descartou (conteúdo recusado) reserva de novo, sem remover nada", async () => {
    const anterior = { ok: false, codigo: "anexo_conteudo_recusado", anexoId: ID, uploadFeito: true };
    m.invoke.mockResolvedValueOnce(RESERVA2).mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect((await enviarAnexo(DIA, pdf(), anterior)).ok).toBe(true);
    const accoes = m.invoke.mock.calls.map((c) => c[1].body.accao);
    expect(accoes).toEqual(["url", "confirmar"]);
    expect(m.invoke.mock.calls[1][1].body.anexo_id).toBe(ID2);
  });

  it("se o upload falhou, repetir remove a reserva antiga ANTES de reservar de novo", async () => {
    const anterior = { ok: false, codigo: "anexo_falha_envio", anexoId: ID, uploadFeito: false };
    m.invoke
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
      .mockResolvedValueOnce(RESERVA2)
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    const r = await enviarAnexo(DIA, pdf(), anterior);
    expect(r).toEqual({ ok: true, codigo: null, anexoId: ID2, uploadFeito: true });
    expect(m.invoke.mock.calls.map((c) => c[1].body.accao)).toEqual(["remover", "url", "confirmar"]);
    expect(m.invoke.mock.calls[0][1].body.anexo_id).toBe(ID);
    expect(m.upload).toHaveBeenCalledWith("justificacoes/y.pdf", "tok2", expect.any(File));
  });

  it("se remover a reserva antiga falha, devolve esse erro, guarda o anexoId e NÃO reserva outra (não acumula reservas)", async () => {
    const anterior = { ok: false, codigo: "anexo_falha_envio", anexoId: ID, uploadFeito: false };
    m.invoke.mockResolvedValueOnce(erroHttp("sem_permissao"));
    const r = await enviarAnexo(DIA, pdf(), anterior);
    expect(r).toEqual({ ok: false, codigo: "sem_permissao", anexoId: ID, uploadFeito: false });
    expect(m.invoke).toHaveBeenCalledTimes(1);
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("se a reserva antiga já não existe (anexo_nao_encontrado), segue para reservar de novo", async () => {
    const anterior = { ok: false, codigo: "anexo_falha_envio", anexoId: ID, uploadFeito: false };
    m.invoke.mockResolvedValueOnce(erroHttp("anexo_nao_encontrado")).mockResolvedValueOnce(RESERVA2).mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect((await enviarAnexo(DIA, pdf(), anterior)).ok).toBe(true);
  });

  it("uma reserva com forma inesperada ou uma falha de rede dão erro_inesperado e vão para o registo, sem nomes", async () => {
    m.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect((await enviarAnexo(DIA, pdf("segredo.pdf"))).codigo).toBe("erro_inesperado");
    m.invoke.mockRejectedValueOnce(new Error("rede"));
    expect((await enviarAnexo(DIA, pdf("segredo.pdf"))).codigo).toBe("erro_inesperado");
    expect(m.erros).toHaveBeenCalledTimes(2);
    for (const [e] of m.erros.mock.calls) expect(String((e as Error).message)).not.toContain("segredo");
  });

  it("rate_limited devolve o código", async () => {
    m.invoke.mockResolvedValueOnce(erroHttp("rate_limited"));
    expect((await enviarAnexo(DIA, pdf())).codigo).toBe("rate_limited");
  });
});

describe("enviarAnexos", () => {
  it("envia um a um, avisa a cada um e devolve quais falharam", async () => {
    m.invoke
      .mockResolvedValueOnce(RESERVA).mockResolvedValueOnce({ data: { ok: true }, error: null })
      .mockResolvedValueOnce(erroHttp("anexo_formato_invalido"));
    const avisos: [string, boolean][] = [];
    const a = pdf("a.pdf");
    const b = pdf("b.pdf");
    const r = await enviarAnexos(DIA, [a, b], (x) => avisos.push([x.ficheiro.name, x.ok]));
    expect(r.map((x) => [x.ficheiro, x.ok, x.codigo])).toEqual([[a, true, null], [b, false, "anexo_formato_invalido"]]);
    expect(avisos).toEqual([["a.pdf", true], ["b.pdf", false]]);
  });
  it("entrega o anexoId de cada resultado e usa o resultado anterior (por posição) para repetir", async () => {
    const anterior = { ok: false, codigo: "anexo_nao_carregado", anexoId: ID, uploadFeito: true };
    m.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const r = await enviarAnexos(DIA, [pdf("a.pdf")], undefined, [anterior]);
    expect(r[0]).toMatchObject({ ok: true, anexoId: ID });
    expect(m.invoke).toHaveBeenCalledTimes(1);
  });
  it("sem ficheiros não chama a Edge", async () => {
    expect(await enviarAnexos(DIA, [])).toEqual([]);
    expect(m.invoke).not.toHaveBeenCalled();
  });
});

describe("removerAnexo", () => {
  it("manda remover com o id do anexo", async () => {
    m.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(await removerAnexo(ID)).toEqual({ ok: true, codigo: null });
    expect(m.invoke).toHaveBeenCalledWith("hr-justificacao-anexo", { body: { accao: "remover", anexo_id: ID } });
  });
  it("devolve o código quando a base recusa", async () => {
    m.invoke.mockResolvedValueOnce(erroHttp("justificacao_decidida"));
    expect((await removerAnexo(ID)).codigo).toBe("justificacao_decidida");
  });
});

describe("abrirAnexo", () => {
  it("devolve o URL e o tipo, e nunca o nome (dado de saúde que a Edge já não manda)", async () => {
    m.invoke.mockResolvedValueOnce({ data: { ok: true, url: "https://x/y", expiraEmSegundos: 60, mime_type: "application/pdf" }, error: null });
    expect(await abrirAnexo(ID)).toEqual({ ok: true, codigo: null, url: "https://x/y", mimeType: "application/pdf" });
  });
  it("mesmo que a resposta traga nome_original, o resultado não o repassa", async () => {
    m.invoke.mockResolvedValueOnce({ data: { ok: true, url: "https://x/y", mime_type: "application/pdf", nome_original: "baixa-cancro.pdf" }, error: null });
    const r = await abrirAnexo(ID);
    expect(r).not.toHaveProperty("nome");
    expect(JSON.stringify(r)).not.toContain("cancro");
  });
  it("sem URL na resposta é erro inesperado", async () => {
    m.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(await abrirAnexo(ID)).toEqual({ ok: false, codigo: "erro_inesperado", url: null, mimeType: null });
  });
  it("uma recusa traz o código e nenhum URL", async () => {
    m.invoke.mockResolvedValueOnce(erroHttp("sem_permissao"));
    expect(await abrirAnexo(ID)).toMatchObject({ ok: false, codigo: "sem_permissao", url: null });
  });
});

describe("listarAnexos", () => {
  it("pede à RPC exactamente um id: o da justificação do dia, ou o da falta", async () => {
    m.rpc.mockResolvedValue({ data: [], error: null });
    await listarAnexos(DIA);
    expect(m.rpc).toHaveBeenLastCalledWith("rpc_hr_justificacao_anexos_listar", { _justificacao_dia_id: DIA.justificacaoDiaId, _falta_id: null });
    await listarAnexos({ faltaId: "f-1" });
    expect(m.rpc).toHaveBeenLastCalledWith("rpc_hr_justificacao_anexos_listar", { _justificacao_dia_id: null, _falta_id: "f-1" });
  });
  it("devolve os anexos lidos, com o nome oculto quando a base o esconde", async () => {
    m.rpc.mockResolvedValue({ data: [{ id: ID, estado: "verificado", nome: null, tamanho_bytes: 2048, pode_abrir: false, pode_remover: false }], error: null });
    const r = await listarAnexos(DIA);
    expect(r.ok).toBe(true);
    expect(r.anexos[0]).toMatchObject({ id: ID, nome: null, tamanhoBytes: 2048, podeAbrir: false });
  });
  it("uma recusa ou uma falha dão lista vazia e semAcesso, sem lançar", async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002" } });
    expect(await listarAnexos(DIA)).toEqual({ ok: false, anexos: [], semAcesso: true });
    m.rpc.mockRejectedValueOnce(new Error("rede"));
    expect((await listarAnexos(DIA)).semAcesso).toBe(true);
  });
});

describe("papelDaFalta", () => {
  it("devolve o id do papel", async () => {
    m.consulta.mockResolvedValueOnce({ data: [{ id: "papel-1" }], error: null });
    expect(await papelDaFalta("falta-1")).toBe("papel-1");
  });
  it("sem papel, sem permissão ou com falha devolve nulo", async () => {
    m.consulta.mockResolvedValueOnce({ data: [], error: null });
    expect(await papelDaFalta("falta-1")).toBeNull();
    m.consulta.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(await papelDaFalta("falta-1")).toBeNull();
    m.consulta.mockRejectedValueOnce(new Error("rede"));
    expect(await papelDaFalta("falta-1")).toBeNull();
  });
});
