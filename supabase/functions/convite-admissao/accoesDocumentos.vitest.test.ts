/**
 * Testes de `accoesDocumentos.ts` e `smsapi.ts`: tudo simulado. NUNCA se envia um SMS a serio
 * (o enviador e um falso) e nunca se toca na rede nem na base.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ACCOES_DOCUMENTOS,
  RPC_CONTEXTO_FICHEIRO,
  alvosDeCaminhos,
  avisarDocumentos,
  conteudoAvisoDocumentos,
  eAccaoDocumentos,
  hmacCodigoSms,
  pedidoFicheiroUrlRh,
  tectoDocumentosPorHora,
  textoSmsCodigo,
  tratarAccaoDocumentos,
  type AccaoDocumentos,
  type ClienteDocumentos,
  type DepsDocumentos,
  type PedidoSms,
  type ResultadoSms,
} from "./accoesDocumentos.ts";
import { mapearErroRpc, statusDoCodigo } from "./erros.ts";
import { criarEnviadorSms } from "./smsapi.ts";

const TOKEN_HASH = "a".repeat(64);
const SESSAO = "S".repeat(43);
const PEPPER = "p".repeat(40);
const ENVIO = "11111111-1111-4111-8111-111111111111";
const PEDIDO = "22222222-2222-4222-8222-222222222222";
const ANEXO = "33333333-3333-4333-8333-333333333333";
const ORG = "44444444-4444-4444-8444-444444444444";
const PESSOA = "55555555-5555-4555-8555-555555555555";
const TELEMOVEL = "+351912345678";

type Resposta = { data?: unknown; error?: unknown };

interface Armazem {
  objectos: Map<string, Uint8Array>;
  apagados: string[];
}

function montar(respostas: Record<string, Resposta | ((args: Record<string, unknown>) => Resposta)>, armazem?: Armazem) {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const store = armazem ?? { objectos: new Map(), apagados: [] };
  const bucket = (nome: string) => ({
    createSignedUploadUrl: vi.fn(async () => ({ data: { token: "tok-upload" }, error: null })),
    createSignedUrl: vi.fn(async (c: string, s: number) => ({ data: { signedUrl: `https://s/${nome}/${c}?t=${s}` }, error: null })),
    download: vi.fn(async (c: string) => {
      const b = store.objectos.get(`${nome}/${c}`);
      return b
        ? { data: { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }, error: null }
        : { data: null, error: { statusCode: "404" } };
    }),
    upload: vi.fn(async (c: string, corpo: Uint8Array) => {
      store.objectos.set(`${nome}/${c}`, corpo);
      return { data: {}, error: null };
    }),
    remove: vi.fn(async (cs: string[]) => {
      for (const c of cs) {
        store.apagados.push(`${nome}/${c}`);
        store.objectos.delete(`${nome}/${c}`);
      }
      return { data: {}, error: null };
    }),
  });
  const svc: ClienteDocumentos = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      chamadas.push({ fn, args });
      const r = respostas[fn];
      const res = typeof r === "function" ? r(args) : r;
      return { data: res?.data ?? null, error: res?.error ?? null };
    }),
    storage: { from: bucket },
  };
  return { svc, chamadas, store };
}

function deps(
  svc: ClienteDocumentos,
  payload: Record<string, unknown> = {},
  extra: Partial<DepsDocumentos> = {},
  cabecalhos: Record<string, string> = { "x-portal-sessao": SESSAO, "x-forwarded-for": "203.0.113.7", "user-agent": "UA-teste" },
): DepsDocumentos {
  return {
    svc,
    tokenHash: TOKEN_HASH,
    payload,
    req: new Request("https://exemplo.test/", { method: "POST", headers: cabecalhos }),
    otpPepper: PEPPER,
    enviarSms: async () => ({ enviado: true }),
    reportar: vi.fn(),
    registarErro: vi.fn(),
    ...extra,
  };
}

const correr = (accao: AccaoDocumentos, d: DepsDocumentos) => tratarAccaoDocumentos(accao, d);

describe("catalogo das accoes", () => {
  it("reconhece as 12 accoes e nenhuma outra, e cada uma tem tecto", () => {
    expect(ACCOES_DOCUMENTOS).toHaveLength(12);
    for (const a of ACCOES_DOCUMENTOS) {
      expect(eAccaoDocumentos(a)).toBe(true);
      expect(tectoDocumentosPorHora(a)).toBeGreaterThan(0);
    }
    for (const a of ["anexo_url", "ler", "estado", "doc_x", 3, null]) expect(eAccaoDocumentos(a)).toBe(false);
  });

  it("assinar, recusar e pedir codigo gastam-se devagar", () => {
    expect(tectoDocumentosPorHora("doc_assinar")).toBe(10);
    expect(tectoDocumentosPorHora("doc_codigo")).toBe(10);
    expect(tectoDocumentosPorHora("doc_ler")).toBe(120);
  });
});

describe("sessao", () => {
  it("sem sessao ou mal formada responde sessao_ausente sem chamar a base", async () => {
    const { svc, chamadas } = montar({});
    const r1 = await correr("doc_ler", deps(svc, {}, {}, {}));
    const r2 = await correr("doc_ler", deps(svc, { sessao: "curta" }, {}, {}));
    expect(r1).toEqual({ status: 401, body: { error: "sessao_ausente" } });
    expect(r2.body.error).toBe("sessao_ausente");
    expect(chamadas).toHaveLength(0);
  });

  it("manda a base o SHA-256 da sessao e nunca o segredo", async () => {
    const { svc, chamadas } = montar({ rpc_hr_portal_documentos_ler: { data: {} } });
    await correr("doc_ler", deps(svc));
    expect(chamadas[0].args.p_token_hash).toBe(TOKEN_HASH);
    expect(chamadas[0].args.p_sessao_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(chamadas)).not.toContain(SESSAO);
  });

  it("um erro da base sai como codigo do catalogo e nunca com a mensagem", async () => {
    const { svc } = montar({
      rpc_hr_portal_documentos_ler: { error: { code: "HRA63", message: "documentos_fechados", details: "linha com dados" } },
    });
    const r = await correr("doc_ler", deps(svc));
    expect(r).toEqual({ status: 409, body: { error: "documentos_fechados" } });
    expect(JSON.stringify(r)).not.toContain("linha com dados");
  });
});

describe("doc_ler", () => {
  it("so deixa sair as chaves permitidas, em todos os niveis", async () => {
    const { svc } = montar({
      rpc_hr_portal_documentos_ler: {
        data: {
          estado: "aprovada",
          documentos_ate: "2027-02-01T00:00:00Z",
          pendentes: 1,
          telemovel_mascarado: "+351*****678",
          organization_id: ORG,
          telemovel: TELEMOVEL,
          envios: [{ id: ENVIO, titulo: "Contrato", situacao: "por_assinar", caminho: "x/y.pdf", pessoa_id: PESSOA, sms_hmac: "zzz" }],
          pedidos_rh: [{ id: PEDIDO, tipo: "fotografia", estado: "por_enviar", criado_por: "u", ficheiros: [{ id: ANEXO, nome: "a.pdf", estado: "ligado", caminho: "c" }] }],
          pedidos_pessoa: [{ id: PEDIDO, estado: "pedido", envio_id: null, criado_por: "u" }],
        },
      },
    });
    const r = await correr("doc_ler", deps(svc));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      estado: "aprovada",
      documentos_ate: "2027-02-01T00:00:00Z",
      pendentes: 1,
      telemovel_mascarado: "+351*****678",
      envios: [{ id: ENVIO, titulo: "Contrato", situacao: "por_assinar" }],
      pedidos_rh: [{ id: PEDIDO, tipo: "fotografia", estado: "por_enviar", ficheiros: [{ id: ANEXO, nome: "a.pdf", estado: "ligado" }] }],
      pedidos_pessoa: [{ id: PEDIDO, estado: "pedido", envio_id: null }],
    });
    const texto = JSON.stringify(r.body);
    for (const proibido of [ORG, PESSOA, "x/y.pdf", "sms_hmac", TELEMOVEL]) expect(texto).not.toContain(proibido);
  });

  it("uma resposta que nao e objecto e erro_inesperado", async () => {
    const d = deps(montar({ rpc_hr_portal_documentos_ler: { data: "x" } }).svc);
    expect((await correr("doc_ler", d)).body).toEqual({ error: "erro_inesperado" });
    expect(d.registarErro).toHaveBeenCalledTimes(1);
  });
});

describe("doc_conteudo e doc_ficheiro_url", () => {
  it("recusa um id que nao e UUID antes da base", async () => {
    const { svc, chamadas } = montar({});
    expect((await correr("doc_conteudo", deps(svc, { envio_id: "1; drop" }))).body).toEqual({ error: "pedido_invalido" });
    expect((await correr("doc_ficheiro_url", deps(svc, {}))).body).toEqual({ error: "pedido_invalido" });
    expect(chamadas).toHaveLength(0);
  });

  it("devolve o html do contrato", async () => {
    const { svc, chamadas } = montar({ rpc_hr_portal_documento_conteudo: { data: "<p>Contrato</p>" } });
    const r = await correr("doc_conteudo", deps(svc, { envio_id: ENVIO }));
    expect(r.body).toEqual({ ok: true, html: "<p>Contrato</p>" });
    expect(chamadas[0].args.p_envio_id).toBe(ENVIO);
  });

  it("assina um URL de 60 s e o caminho nunca sai", async () => {
    const { svc } = montar({ rpc_hr_portal_documento_ficheiro: { data: { bucket: "hr-documentos", caminho: "org/pessoa/doc.pdf" } } });
    const r = await correr("doc_ficheiro_url", deps(svc, { envio_id: ENVIO }));
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(String(r.body.url)).toContain("t=60");
    expect(Object.keys(r.body).sort()).toEqual(["ok", "url"]);
  });

  it("recusa um bucket que nao e o de documentos", async () => {
    const { svc } = montar({ rpc_hr_portal_documento_ficheiro: { data: { bucket: "outro", caminho: "x" } } });
    expect((await correr("doc_ficheiro_url", deps(svc, { envio_id: ENVIO }))).body).toEqual({ error: "erro_inesperado" });
  });
});

describe("doc_codigo (SMS)", () => {
  const respostaBase = {
    rpc_hr_portal_documento_codigo_pedir: {
      data: { telemovel: TELEMOVEL, telemovel_mascarado: "+351*****678", expira_em: "2027-01-01T10:05:00Z", reenviar_em: "2027-01-01T10:01:00Z" },
    },
  };

  it("envia o SMS com o texto certo e guarda so o HMAC", async () => {
    const { svc, chamadas } = montar(respostaBase);
    const enviados: PedidoSms[] = [];
    const enviarSms = async (p: PedidoSms): Promise<ResultadoSms> => {
      enviados.push(p);
      return { enviado: true };
    };
    const r = await correr("doc_codigo", deps(svc, { envio_id: ENVIO }, { enviarSms }));

    expect(enviados).toHaveLength(1);
    expect(enviados[0].telefone).toBe(TELEMOVEL);
    const m = /^O seu código de verificação é: (\d{6})\. Válido por 5 minutos\.$/.exec(enviados[0].texto);
    expect(m).not.toBeNull();
    const codigo = m![1];

    // A base recebe o HMAC do codigo enviado, e o IP detectado.
    expect(chamadas[0].args.p_codigo_hmac).toBe(await hmacCodigoSms(PEPPER, ENVIO, codigo));
    expect(chamadas[0].args.p_ip).toBe("203.0.113.7");

    // O browser so ve o mascarado e as datas: nem o codigo, nem o numero completo.
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, telemovel_mascarado: "+351*****678", expira_em: "2027-01-01T10:05:00Z", reenviar_em: "2027-01-01T10:01:00Z" });
    expect(JSON.stringify(r.body)).not.toContain(codigo);
    expect(JSON.stringify(chamadas)).not.toContain(codigo);
    expect(JSON.stringify(r.body)).not.toContain("912345678");
  });

  it("falha FECHADO sem pepper valido ou sem enviador, sem chamar a base nem enviar", async () => {
    const { svc, chamadas } = montar(respostaBase);
    const enviarSms = vi.fn(async (): Promise<ResultadoSms> => ({ enviado: true }));
    const a = await correr("doc_codigo", deps(svc, { envio_id: ENVIO }, { otpPepper: "curto", enviarSms }));
    const b = await correr("doc_codigo", deps(svc, { envio_id: ENVIO }, { enviarSms: undefined }));
    expect(a).toEqual({ status: 503, body: { error: "otp_indisponivel" } });
    expect(b.body).toEqual({ error: "otp_indisponivel" });
    expect(enviarSms).not.toHaveBeenCalled();
    expect(chamadas).toHaveLength(0);
  });

  it("sem telemovel valido na ficha a base recusa e nao se envia nada", async () => {
    const { svc } = montar({ rpc_hr_portal_documento_codigo_pedir: { error: { code: "HRA64", message: "sem_telemovel" } } });
    const enviarSms = vi.fn(async (): Promise<ResultadoSms> => ({ enviado: true }));
    const r = await correr("doc_codigo", deps(svc, { envio_id: ENVIO }, { enviarSms }));
    expect(r).toEqual({ status: 422, body: { error: "sem_telemovel" } });
    expect(enviarSms).not.toHaveBeenCalled();
  });

  it("espera e limite da base passam como codigos (60 s e 3 em 10 min)", async () => {
    for (const [code, esperado] of [["HRA42", "otp_espera"], ["HRA41", "limite_excedido"], ["HRA45", "otp_bloqueado"]] as const) {
      const { svc } = montar({ rpc_hr_portal_documento_codigo_pedir: { error: { code } } });
      expect((await correr("doc_codigo", deps(svc, { envio_id: ENVIO }))).body).toEqual({ error: esperado });
    }
  });

  it("se o SMS falha responde sms_nao_enviado sem o numero nem o texto do erro", async () => {
    const { svc } = montar(respostaBase);
    const d = deps(svc, { envio_id: ENVIO }, { enviarSms: async () => ({ enviado: false, erroCodigo: "sms_falhou" }) });
    const r = await correr("doc_codigo", d);
    expect(r.status).toBe(502);
    expect(r.body.error).toBe("sms_nao_enviado");
    expect(r.body.reenviar_em).toBe("2027-01-01T10:01:00Z");
    expect(JSON.stringify(r.body)).not.toContain("912345678");
    const reg = (d.registarErro as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error;
    expect(reg.message).toBe("convite-admissao doc_codigo: sms sms_falhou");
  });

  it("um telemovel mal formado da base e resposta invalida (nunca vai ao enviador)", async () => {
    const { svc } = montar({ rpc_hr_portal_documento_codigo_pedir: { data: { telemovel: "912345678", telemovel_mascarado: "x", expira_em: "y" } } });
    const enviarSms = vi.fn(async (): Promise<ResultadoSms> => ({ enviado: true }));
    const r = await correr("doc_codigo", deps(svc, { envio_id: ENVIO }, { enviarSms }));
    expect(r.body).toEqual({ error: "erro_inesperado" });
    expect(enviarSms).not.toHaveBeenCalled();
  });
});

describe("hmac e texto do SMS", () => {
  it("o texto e exactamente o do CRM e recusa codigos que nao sejam 6 digitos", () => {
    expect(textoSmsCodigo("012345")).toBe("O seu código de verificação é: 012345. Válido por 5 minutos.");
    expect(() => textoSmsCodigo("12345")).toThrow();
  });

  it("o HMAC e hex de 64, determinista, e muda com o envio, o codigo e o pepper", async () => {
    const a = await hmacCodigoSms(PEPPER, ENVIO, "123456");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hmacCodigoSms(PEPPER, ENVIO, "123456")).toBe(a);
    expect(await hmacCodigoSms(PEPPER, PEDIDO, "123456")).not.toBe(a);
    expect(await hmacCodigoSms(PEPPER, ENVIO, "123457")).not.toBe(a);
    expect(await hmacCodigoSms("q".repeat(40), ENVIO, "123456")).not.toBe(a);
  });

  it("falha fechado sem pepper e com entradas invalidas, sem expor o valor", async () => {
    await expect(hmacCodigoSms("curto", ENVIO, "123456")).rejects.toThrow("otp_pepper_invalido");
    await expect(hmacCodigoSms(PEPPER, ENVIO, "12a456")).rejects.toThrow("otp_pedido_invalido");
    await expect(hmacCodigoSms(PEPPER, "nao-uuid", "123456")).rejects.toThrow("otp_pedido_invalido");
  });
});

describe("doc_assinar", () => {
  const dados = { envio_id: ENVIO, codigo: "123456", aceite: true, nome: "Maria Silva" };

  it("calcula o mesmo HMAC e passa aceite, IP e user agent", async () => {
    const { svc, chamadas } = montar({ rpc_hr_portal_documento_assinar: { data: { ok: true, assinado_em: "2027-01-01T10:00:00Z", referencia: "SMS-ABC123" } } });
    const r = await correr("doc_assinar", deps(svc, dados));
    expect(r).toEqual({ status: 200, body: { ok: true, assinado_em: "2027-01-01T10:00:00Z", referencia: "SMS-ABC123" } });
    expect(chamadas[0].args).toMatchObject({
      p_envio_id: ENVIO,
      p_codigo_hmac: await hmacCodigoSms(PEPPER, ENVIO, "123456"),
      p_aceite: true,
      p_nome: "Maria Silva",
      p_ip: "203.0.113.7",
      p_user_agent: "UA-teste",
    });
    expect(JSON.stringify(chamadas)).not.toContain("123456");
  });

  it("sem aceite nao chega a base (nao gasta tentativas)", async () => {
    const { svc, chamadas } = montar({});
    expect(await correr("doc_assinar", deps(svc, { ...dados, aceite: false }))).toEqual({ status: 400, body: { error: "aceite_obrigatorio" } });
    expect((await correr("doc_assinar", deps(svc, { ...dados, aceite: "sim" }))).body).toEqual({ error: "pedido_invalido" });
    expect(chamadas).toHaveLength(0);
  });

  it("um codigo mal formado nem chega a base", async () => {
    const { svc, chamadas } = montar({});
    for (const codigo of ["12345", "1234567", "abcdef", 123456, undefined]) {
      expect((await correr("doc_assinar", deps(svc, { ...dados, codigo }))).body).toEqual({ error: "pedido_invalido" });
    }
    expect(chamadas).toHaveLength(0);
  });

  it("traduz os erros em jsonb do codigo, com as tentativas que restam", async () => {
    const casos = [
      [{ erro: "otp_invalido", restantes: 3 }, 401, { error: "otp_invalido", restantes: 3 }],
      [{ erro: "otp_expirado" }, 410, { error: "otp_expirado" }],
      [{ erro: "otp_bloqueado", restantes: 0 }, 429, { error: "otp_bloqueado", restantes: 0 }],
    ] as const;
    for (const [data, status, corpo] of casos) {
      const { svc } = montar({ rpc_hr_portal_documento_assinar: { data } });
      expect(await correr("doc_assinar", deps(svc, dados))).toEqual({ status, body: corpo });
    }
  });

  it("conteudo_alterado em jsonb sai como 409, com restantes 0, e nao como resposta invalida", async () => {
    const { svc } = montar({ rpc_hr_portal_documento_assinar: { data: { erro: "conteudo_alterado", restantes: 0 } } });
    const d = deps(svc, dados);
    expect(await correr("doc_assinar", d)).toEqual({ status: 409, body: { error: "conteudo_alterado", restantes: 0 } });
    expect(d.registarErro).not.toHaveBeenCalled();
  });

  it("um erro fora do catalogo em jsonb e resposta invalida", async () => {
    const { svc } = montar({ rpc_hr_portal_documento_assinar: { data: { erro: "qualquer_coisa" } } });
    expect((await correr("doc_assinar", deps(svc, dados))).body).toEqual({ error: "erro_inesperado" });
  });

  it("estado invalido (ja assinado) passa como codigo", async () => {
    const { svc } = montar({ rpc_hr_portal_documento_assinar: { error: { code: "HRA38", message: "estado_invalido" } } });
    expect(await correr("doc_assinar", deps(svc, dados))).toEqual({ status: 409, body: { error: "estado_invalido" } });
  });
});

describe("doc_recusar", () => {
  it("exige motivo de 3 a 2000 caracteres", async () => {
    const { svc, chamadas } = montar({ rpc_hr_portal_documento_recusar: {} });
    expect((await correr("doc_recusar", deps(svc, { envio_id: ENVIO, motivo: " ab " }))).body).toEqual({ error: "motivo_invalido" });
    expect((await correr("doc_recusar", deps(svc, { envio_id: ENVIO, motivo: "x".repeat(2001) }))).body).toEqual({ error: "motivo_invalido" });
    expect(chamadas).toHaveLength(0);
    expect(await correr("doc_recusar", deps(svc, { envio_id: ENVIO, motivo: "  Clausula 5 errada " }))).toEqual({ status: 200, body: { ok: true } });
    expect(chamadas[0].args.p_motivo).toBe("Clausula 5 errada");
  });
});

describe("pedidos: pedir ao RH, cancelar, enviar", () => {
  it("doc_pedir_rh valida o tipo, o titulo de `outro` e a urgencia", async () => {
    const { svc, chamadas } = montar({ rpc_hr_portal_pedido_ao_rh: { data: PEDIDO } });
    expect((await correr("doc_pedir_rh", deps(svc, { tipo: "cartao_cidadao" }))).body).toEqual({ error: "pedido_invalido" });
    expect((await correr("doc_pedir_rh", deps(svc, { tipo: "outro" }))).body).toEqual({ error: "pedido_invalido" });
    expect((await correr("doc_pedir_rh", deps(svc, { tipo: "copia_contrato", urgencia: "ja" }))).body).toEqual({ error: "pedido_invalido" });
    expect(chamadas).toHaveLength(0);

    const r = await correr("doc_pedir_rh", deps(svc, { tipo: "declaracao_vinculo", nota: " para o banco ", urgencia: "urgente" }));
    expect(r).toEqual({ status: 200, body: { ok: true, pedido_id: PEDIDO } });
    expect(chamadas[0].args).toMatchObject({ p_tipo: "declaracao_vinculo", p_titulo: null, p_nota: "para o banco", p_urgencia: "urgente" });
  });

  it("o teto de 10 SMS em 24 h (HRA43) sai como otp_limite_diario", async () => {
    const { svc } = montar({ rpc_hr_portal_documento_codigo_pedir: { error: { code: "HRA43" } } });
    expect(await correr("doc_codigo", deps(svc, { envio_id: ENVIO }))).toEqual({ status: 429, body: { error: "otp_limite_diario" } });
  });

  it("o limite de 10 pedidos abertos sai como limite_excedido", async () => {
    const { svc } = montar({ rpc_hr_portal_pedido_ao_rh: { error: { code: "HRA41" } } });
    expect(await correr("doc_pedir_rh", deps(svc, { tipo: "copia_contrato" }))).toEqual({ status: 429, body: { error: "limite_excedido" } });
  });

  it("doc_pedido_enviar sem ficheiros sai como sem_ficheiro", async () => {
    const { svc } = montar({ rpc_hr_portal_pedido_enviar: { error: { code: "HRA62" } } });
    expect(await correr("doc_pedido_enviar", deps(svc, { pedido_id: PEDIDO }))).toEqual({ status: 409, body: { error: "sem_ficheiro" } });
  });

  it("doc_pedido_cancelar e doc_pedido_enviar chamam a RPC certa", async () => {
    const { svc, chamadas } = montar({ rpc_hr_portal_pedido_cancelar_meu: {}, rpc_hr_portal_pedido_enviar: {} });
    expect((await correr("doc_pedido_cancelar", deps(svc, { pedido_id: PEDIDO }))).body).toEqual({ ok: true });
    expect((await correr("doc_pedido_enviar", deps(svc, { pedido_id: PEDIDO }))).body).toEqual({ ok: true });
    expect(chamadas.map((c) => c.fn)).toEqual(["rpc_hr_portal_pedido_cancelar_meu", "rpc_hr_portal_pedido_enviar"]);
    expect((await correr("doc_pedido_cancelar", deps(svc, { pedido_id: "x" }))).body).toEqual({ error: "pedido_invalido" });
  });
});

describe("ficheiros de resposta (ciclo de quarentena)", () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x31, 0x20, 0x30]);
  const QUARENTENA = `admissao/pedidos/${PEDIDO}/${ANEXO}.pdf`;

  it("doc_pedido_url reserva e devolve o token de upload", async () => {
    const { svc, chamadas } = montar({ rpc_hr_portal_pedido_ficheiro_reservar: { data: { anexo_id: ANEXO, caminho_quarentena: QUARENTENA } } });
    const r = await correr("doc_pedido_url", deps(svc, { pedido_id: PEDIDO, nome: "../../cc.PDF", mime: "application/pdf", tamanho: 1000 }));
    expect(r).toEqual({ status: 200, body: { ok: true, anexo_id: ANEXO, upload_token: "tok-upload", caminho_quarentena: QUARENTENA } });
    expect(chamadas[0].args).toMatchObject({ p_pedido_id: PEDIDO, p_nome: "cc.PDF", p_mime: "application/pdf", p_tamanho: 1000, p_ip: "203.0.113.7" });
  });

  it("doc_pedido_url recusa formato, vazio e tamanho antes da base", async () => {
    const { svc, chamadas } = montar({});
    const base = { pedido_id: PEDIDO, nome: "a.pdf", mime: "application/pdf", tamanho: 10 };
    expect((await correr("doc_pedido_url", deps(svc, { ...base, mime: "image/gif" }))).body).toEqual({ error: "anexo_formato_invalido" });
    expect((await correr("doc_pedido_url", deps(svc, { ...base, tamanho: 0 }))).body).toEqual({ error: "anexo_vazio" });
    expect((await correr("doc_pedido_url", deps(svc, { ...base, tamanho: 10485761 }))).body).toEqual({ error: "anexo_demasiado_grande" });
    expect((await correr("doc_pedido_url", deps(svc, { ...base, tamanho: "10" }))).body).toEqual({ error: "pedido_invalido" });
    expect(chamadas).toHaveLength(0);
  });

  it("doc_pedido_url liberta a reserva se nao conseguir o URL de upload", async () => {
    const { svc, chamadas } = montar({
      rpc_hr_portal_pedido_ficheiro_reservar: { data: { anexo_id: ANEXO, caminho_quarentena: QUARENTENA } },
      rpc_hr_portal_pedido_ficheiro_remover: { data: { caminhos: [] } },
    });
    const original = svc.storage.from;
    svc.storage.from = (b) => ({ ...original(b), createSignedUploadUrl: async () => ({ data: null, error: { x: 1 } }) });
    const r = await correr("doc_pedido_url", deps(svc, { pedido_id: PEDIDO, nome: "a.pdf", mime: "application/pdf", tamanho: 10 }));
    expect(r.body).toEqual({ error: "anexo_falha_envio" });
    expect(chamadas.map((c) => c.fn)).toEqual(["rpc_hr_portal_pedido_ficheiro_reservar", "rpc_hr_portal_pedido_ficheiro_remover"]);
  });

  it("doc_pedido_confirmar le o ficheiro real, copia para o final e so entao liga", async () => {
    const armazem: Armazem = { objectos: new Map([[`hr-documentos-quarantine/${QUARENTENA}`, PDF]]), apagados: [] };
    const { svc, chamadas, store } = montar({
      [RPC_CONTEXTO_FICHEIRO]: { data: { caminho_quarentena: QUARENTENA, organization_id: ORG, pessoa_id: PESSOA, tipo: "outro" } },
      rpc_hr_portal_pedido_ficheiro_ligar: { data: { id: ANEXO, nome: "cc.pdf", estado: "ligado" } },
    }, armazem);
    const r = await correr("doc_pedido_confirmar", deps(svc, { anexo_id: ANEXO }));

    const finalEsperado = `${ORG}/${PESSOA}/admissao/${ANEXO}.pdf`;
    expect(r).toEqual({ status: 200, body: { ok: true, ficheiro: { id: ANEXO, nome: "cc.pdf", estado: "ligado" } } });
    expect(store.objectos.has(`hr-documentos/${finalEsperado}`)).toBe(true);
    expect(store.apagados).toContain(`hr-documentos-quarantine/${QUARENTENA}`);
    const ligar = chamadas.find((c) => c.fn === "rpc_hr_portal_pedido_ficheiro_ligar")!;
    expect(ligar.args).toMatchObject({ p_anexo_id: ANEXO, p_caminho_final: finalEsperado, p_tamanho: PDF.length, p_mime: "application/pdf" });
    expect(ligar.args.p_sha256).toMatch(/^[0-9a-f]{64}$/);
    // Nem org, nem pessoa, nem caminhos na resposta.
    expect(JSON.stringify(r.body)).not.toContain(ORG);
    expect(JSON.stringify(r.body)).not.toContain(PESSOA);
  });

  it("doc_pedido_confirmar recusa um ficheiro cujo conteudo real nao e pdf, png nem jpeg", async () => {
    const armazem: Armazem = { objectos: new Map([[`hr-documentos-quarantine/${QUARENTENA}`, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]]), apagados: [] };
    const { svc, chamadas, store } = montar({
      [RPC_CONTEXTO_FICHEIRO]: { data: { caminho_quarentena: QUARENTENA, organization_id: ORG, pessoa_id: PESSOA, tipo: "outro" } },
      rpc_hr_portal_pedido_ficheiro_remover: { data: { caminhos: [{ bucket: "hr-documentos-quarantine", caminho: QUARENTENA }] } },
    }, armazem);
    const r = await correr("doc_pedido_confirmar", deps(svc, { anexo_id: ANEXO }));
    expect(r).toEqual({ status: 422, body: { error: "anexo_formato_invalido" } });
    expect(chamadas.some((c) => c.fn === "rpc_hr_portal_pedido_ficheiro_ligar")).toBe(false);
    expect(store.objectos.size).toBe(0);
  });

  it("doc_pedido_confirmar sem nada na quarentena responde anexo_nao_carregado", async () => {
    const { svc } = montar({ [RPC_CONTEXTO_FICHEIRO]: { data: { caminho_quarentena: QUARENTENA, organization_id: ORG, pessoa_id: PESSOA, tipo: "outro" } } });
    expect(await correr("doc_pedido_confirmar", deps(svc, { anexo_id: ANEXO }))).toEqual({ status: 409, body: { error: "anexo_nao_carregado" } });
  });

  it("se a base recusa a ligacao, desfaz a copia (so depois do descarte confirmado)", async () => {
    const armazem: Armazem = { objectos: new Map([[`hr-documentos-quarantine/${QUARENTENA}`, PDF]]), apagados: [] };
    const final = `${ORG}/${PESSOA}/admissao/${ANEXO}.pdf`;
    const { svc, store } = montar({
      [RPC_CONTEXTO_FICHEIRO]: { data: { caminho_quarentena: QUARENTENA, organization_id: ORG, pessoa_id: PESSOA, tipo: "outro" } },
      rpc_hr_portal_pedido_ficheiro_ligar: { error: { code: "HRA38", message: "estado_invalido" } },
      rpc_hr_portal_pedido_ficheiro_remover: { data: { caminhos: [{ bucket: "hr-documentos", caminho: final }, { bucket: "hr-documentos-quarantine", caminho: QUARENTENA }] } },
    }, armazem);
    const r = await correr("doc_pedido_confirmar", deps(svc, { anexo_id: ANEXO }));
    expect(r).toEqual({ status: 409, body: { error: "estado_invalido" } });
    expect(store.objectos.has(`hr-documentos/${final}`)).toBe(false);
  });

  it("se o descarte falha, o objecto final NAO se apaga (pode sustentar uma linha ligada)", async () => {
    const armazem: Armazem = { objectos: new Map([[`hr-documentos-quarantine/${QUARENTENA}`, PDF]]), apagados: [] };
    const final = `${ORG}/${PESSOA}/admissao/${ANEXO}.pdf`;
    const { svc, store } = montar({
      [RPC_CONTEXTO_FICHEIRO]: { data: { caminho_quarentena: QUARENTENA, organization_id: ORG, pessoa_id: PESSOA, tipo: "outro" } },
      rpc_hr_portal_pedido_ficheiro_ligar: { error: { code: "XX000" } },
      rpc_hr_portal_pedido_ficheiro_remover: { error: { code: "XX000" } },
    }, armazem);
    await correr("doc_pedido_confirmar", deps(svc, { anexo_id: ANEXO }));
    expect(store.objectos.has(`hr-documentos/${final}`)).toBe(true);
  });

  it("falha fechado se a RPC de contexto nao existir ou vier com forma invalida", async () => {
    const a = montar({ [RPC_CONTEXTO_FICHEIRO]: { error: { code: "42883" } } });
    const b = montar({ [RPC_CONTEXTO_FICHEIRO]: { data: { caminho_quarentena: QUARENTENA, organization_id: "x", pessoa_id: PESSOA } } });
    expect((await correr("doc_pedido_confirmar", deps(a.svc, { anexo_id: ANEXO }))).body).toEqual({ error: "erro_inesperado" });
    expect((await correr("doc_pedido_confirmar", deps(b.svc, { anexo_id: ANEXO }))).body).toEqual({ error: "erro_inesperado" });
  });

  it("doc_pedido_remover apaga so os objectos que a base indicou", async () => {
    const armazem: Armazem = { objectos: new Map([["hr-documentos/a/b/admissao/x.pdf", PDF], ["hr-documentos/intocado.pdf", PDF]]), apagados: [] };
    const { svc, store } = montar({
      rpc_hr_portal_pedido_ficheiro_remover: { data: { caminhos: [{ bucket: "hr-documentos", caminho: "a/b/admissao/x.pdf" }, { bucket: "outro", caminho: "z" }] } },
    }, armazem);
    expect(await correr("doc_pedido_remover", deps(svc, { anexo_id: ANEXO }))).toEqual({ status: 200, body: { ok: true } });
    expect(store.objectos.has("hr-documentos/a/b/admissao/x.pdf")).toBe(false);
    expect(store.objectos.has("hr-documentos/intocado.pdf")).toBe(true);
    expect(store.apagados).toEqual(["hr-documentos/a/b/admissao/x.pdf"]);
  });

  it("alvosDeCaminhos ignora buckets desconhecidos, vazios e repetidos", () => {
    expect(alvosDeCaminhos({ caminhos: [
      { bucket: "hr-documentos", caminho: "a" }, { bucket: "hr-documentos", caminho: "a" },
      { bucket: "x", caminho: "b" }, { bucket: "hr-documentos", caminho: "" }, "lixo",
    ] })).toEqual([{ bucket: "hr-documentos", caminho: "a" }]);
    expect(alvosDeCaminhos(null)).toEqual([]);
  });
});

describe("excepcoes", () => {
  it("uma excepcao do cliente sai como erro_inesperado, reportada sem texto", async () => {
    const svc: ClienteDocumentos = { rpc: () => { throw new Error("detalhe secreto da base"); }, storage: montar({}).svc.storage };
    const d = deps(svc);
    const r = await correr("doc_ler", d);
    expect(r).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(JSON.stringify(r)).not.toContain("secreto");
  });
});

describe("documentos_avisar", () => {
  const TOKEN = "t".repeat(43);
  const ACTOR = "66666666-6666-4666-8666-666666666666";
  const base = (svcRespostas: Record<string, Resposta>, correio = vi.fn(async () => ({ enviado: true as const }))) => {
    const { svc, chamadas } = montar(svcRespostas);
    return {
      correio,
      chamadas,
      args: {
        svc,
        enviarCorreio: correio,
        conviteId: ENVIO,
        organizationId: ORG,
        actor: ACTOR,
        baseUrl: "https://app.exemplo.test",
        reportar: vi.fn(),
        registarErro: vi.fn(),
      },
    };
  };
  const reenviarOk = { data: { token: TOKEN, email_destino: "maria@exemplo.pt", organization_id: ORG, valid_until: "2027-02-01T00:00:00Z" } };

  it("sem a permissao de emitir responde nao_encontrado e nao envia nada", async () => {
    const t = base({ has_anew_permission_in_org: { data: false } });
    expect(await avisarDocumentos(t.args)).toEqual({ status: 404, body: { error: "nao_encontrado" } });
    expect(t.chamadas.map((c) => c.fn)).toEqual(["has_anew_permission_in_org"]);
    expect(t.chamadas[0].args).toMatchObject({ _permission_code: "hr.pessoas.documentos.emitir", _organization_id: ORG, _auth_uid: ACTOR });
    expect(t.correio).not.toHaveBeenCalled();
  });

  it("envia o aviso so com o link, sem titulo nem conteudo de documentos", async () => {
    const t = base({ has_anew_permission_in_org: { data: true }, rpc_hr_portal_documentos_link: reenviarOk });
    const r = await avisarDocumentos(t.args);
    expect(r).toEqual({ status: 200, body: { ok: true, email_enviado: true } });
    const pedido = t.correio.mock.calls[0][0] as { para: string; assunto: string; texto: string; organizationId: string };
    expect(pedido.para).toBe("maria@exemplo.pt");
    expect(pedido.organizationId).toBe(ORG);
    expect(pedido.texto).toContain(TOKEN);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it("link indisponivel e e-mail que falha saem como codigos", async () => {
    const a = base({ has_anew_permission_in_org: { data: true }, rpc_hr_portal_documentos_link: { error: { code: "HRA56" } } });
    expect(await avisarDocumentos(a.args)).toEqual({ status: 409, body: { error: "link_indisponivel" } });
    const b = base(
      { has_anew_permission_in_org: { data: true }, rpc_hr_portal_documentos_link: reenviarOk },
      vi.fn(async () => ({ enviado: false as const, erroCodigo: "smtp_falhou" as const })) as never,
    );
    expect(await avisarDocumentos(b.args)).toEqual({ status: 502, body: { error: "email_nao_enviado" } });
  });

  it("o conteudo do e-mail so tem o link", () => {
    const c = conteudoAvisoDocumentos("https://x.test/l");
    expect(c.html).toContain("https://x.test/l");
    expect(c.texto).toContain("https://x.test/l");
  });
});

describe("pedido_ficheiro_url (RH)", () => {
  const ACTOR = "66666666-6666-4666-8666-666666666666";
  const args = (svc: ClienteDocumentos) => ({ svc, anexoId: ANEXO, organizationId: ORG, actor: ACTOR, reportar: vi.fn(), registarErro: vi.fn() });

  it("chama a RPC com o actor e devolve so o URL de 60 s", async () => {
    const { svc, chamadas } = montar({ rpc_hr_portal_pedido_ficheiro_url_rh: { data: { bucket: "hr-documentos", caminho: "org/pessoa/admissao/a.pdf", mime: "application/pdf" } } });
    const r = await pedidoFicheiroUrlRh(args(svc));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(["ok", "url"]);
    expect(String(r.body.url)).toContain("t=60");
    expect(chamadas[0].args).toEqual({ p_anexo_id: ANEXO, p_organization_id: ORG, p_actor: ACTOR });
    expect(JSON.stringify(r.body)).not.toContain("application/pdf");
  });

  it("sem permissao ou inexistente da o mesmo erro (nao_encontrado)", async () => {
    for (const code of ["42501", "HRA31"]) {
      const { svc } = montar({ rpc_hr_portal_pedido_ficheiro_url_rh: { error: { code } } });
      expect(await pedidoFicheiroUrlRh(args(svc))).toEqual({ status: 404, body: { error: "nao_encontrado" } });
    }
  });

  it("um bucket inesperado e resposta invalida", async () => {
    const { svc } = montar({ rpc_hr_portal_pedido_ficheiro_url_rh: { data: { bucket: "outro", caminho: "x" } } });
    expect((await pedidoFicheiroUrlRh(args(svc))).body).toEqual({ error: "erro_inesperado" });
  });
});

describe("enviador SMSAPI (com fetch falso)", () => {
  const fetchOk = (corpo: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => corpo }));

  it("POST a sms.do com Bearer, numero sem + e o texto; nunca devolve o token", async () => {
    const f = fetchOk({ count: 1 });
    const enviar = criarEnviadorSms({ token: "tok-secreto", fetch: f as never });
    const r = await enviar({ telefone: TELEMOVEL, texto: textoSmsCodigo("123456") });
    expect(r).toEqual({ enviado: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.smsapi.com/sms.do");
    expect(init.headers.Authorization).toBe("Bearer tok-secreto");
    const corpo = new URLSearchParams(init.body);
    expect(corpo.get("to")).toBe("351912345678");
    expect(corpo.get("message")).toBe("O seu código de verificação é: 123456. Válido por 5 minutos.");
    expect(JSON.stringify(r)).not.toContain("tok-secreto");
  });

  it("sem token, numero invalido, erro da SMSAPI ou excepcao: falha so com codigo, sem rede quando nao ha token", async () => {
    const f = fetchOk({});
    expect(await criarEnviadorSms({ token: "", fetch: f as never })({ telefone: TELEMOVEL, texto: "x" })).toEqual({ enviado: false, erroCodigo: "sms_nao_configurado" });
    expect(await criarEnviadorSms({ token: undefined, fetch: f as never })({ telefone: TELEMOVEL, texto: "x" })).toEqual({ enviado: false, erroCodigo: "sms_nao_configurado" });
    expect(f).not.toHaveBeenCalled();
    expect(await criarEnviadorSms({ token: "t", fetch: f as never })({ telefone: "912345678", texto: "x" })).toEqual({ enviado: false, erroCodigo: "pedido_invalido" });
    expect(await criarEnviadorSms({ token: "t", fetch: fetchOk({ error: 13, message: "bad number" }) as never })({ telefone: TELEMOVEL, texto: "x" })).toEqual({ enviado: false, erroCodigo: "sms_falhou" });
    expect(await criarEnviadorSms({ token: "t", fetch: fetchOk({}, false) as never })({ telefone: TELEMOVEL, texto: "x" })).toEqual({ enviado: false, erroCodigo: "sms_falhou" });
    const rebenta = vi.fn(async () => { throw new Error("rede com numero 351912345678"); });
    const r = await criarEnviadorSms({ token: "t", fetch: rebenta as never })({ telefone: TELEMOVEL, texto: "x" });
    expect(r).toEqual({ enviado: false, erroCodigo: "sms_falhou" });
  });
});

describe("catalogo de erros (erros.ts)", () => {
  it("HRA61 a HRA64 mapeiam para os codigos e estados do contrato", () => {
    const casos = [["HRA61", "aceite_obrigatorio", 400], ["HRA62", "sem_ficheiro", 409], ["HRA63", "documentos_fechados", 409], ["HRA64", "sem_telemovel", 422]] as const;
    for (const [sqlstate, codigo, status] of casos) {
      expect(mapearErroRpc({ code: sqlstate }).codigo).toBe(codigo);
      expect(mapearErroRpc({ message: codigo }).codigo).toBe(codigo);
      expect(statusDoCodigo(codigo)).toBe(status);
    }
    expect(statusDoCodigo("sms_nao_enviado")).toBe(502);
  });
});
