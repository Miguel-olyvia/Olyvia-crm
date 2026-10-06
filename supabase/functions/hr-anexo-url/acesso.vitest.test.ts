/**
 * @vitest-environment node
 *
 * O fluxo de acesso a um anexo, com portos falsos. O que protege os documentos de
 * identificacao e a ORDEM das chamadas (auditoria antes do URL), por isso e isso
 * que se prova, juntamente com quem e autorizado e o que nunca sai.
 */
import { describe, expect, it } from "vitest";
import { tratarPedidoAnexoUrl, type AnexoRow, type PortosDeAcesso } from "./acesso.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PESSOA = "0a1b2c3d-1111-4222-8333-444455556666";
const OUTRA_PESSOA = "99999999-1111-4222-8333-444455556666";
const ANEXO = "9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff";
const CAMINHO = `${ORG}/${PESSOA}/admissao/${ANEXO}.pdf`;

function anexo(sobre: Partial<AnexoRow> = {}): AnexoRow {
  return {
    id: ANEXO,
    pessoa_id: PESSOA,
    organization_id: ORG,
    tipo: "cartao_cidadao",
    estado: "promovido",
    bucket: "hr-documentos",
    caminho: CAMINHO,
    mime_type: "application/pdf",
    ...sobre,
  };
}

interface Opcoes {
  anexo?: AnexoRow | null;
  erroLer?: boolean;
  /** Permissoes que o utilizador tem (por codigo). */
  permissoes?: string[];
  erroPermissao?: boolean;
  /** A pessoa a que o utilizador corresponde na organizacao. */
  pessoaDoUtilizador?: string | null;
  erroPessoa?: boolean;
  erroAuditoria?: boolean;
  erroUrl?: boolean;
  urlSemValor?: boolean;
}

function criar(opcoes: Opcoes = {}) {
  const ordem: string[] = [];
  const permissoesPedidas: Array<{ codigo: string; org: string }> = [];
  const auditorias: Array<{ pessoaId: string; organizationId: string; campo: string }> = [];
  const urls: Array<{ caminho: string; ttl: number }> = [];
  const erros: unknown[] = [];
  const tem = opcoes.permissoes ?? [];

  const portos: PortosDeAcesso = {
    lerAnexoPromovido: async () => {
      ordem.push("ler");
      if (opcoes.erroLer) return { anexo: null, error: { message: "boom" } };
      return { anexo: "anexo" in opcoes ? (opcoes.anexo ?? null) : anexo(), error: null };
    },
    temPermissao: async (codigo, org) => {
      ordem.push(`permissao:${codigo}`);
      permissoesPedidas.push({ codigo, org });
      if (opcoes.erroPermissao) return { data: null, error: { message: "boom" } };
      return { data: tem.includes(codigo), error: null };
    },
    pessoaDoUtilizador: async () => {
      ordem.push("pessoa");
      if (opcoes.erroPessoa) return { data: null, error: { message: "boom" } };
      return { data: opcoes.pessoaDoUtilizador ?? null, error: null };
    },
    registarAcesso: async (a) => {
      ordem.push("auditoria");
      auditorias.push(a);
      return { error: opcoes.erroAuditoria ? { message: "boom" } : null };
    },
    assinarUrl: async (caminho, ttl) => {
      ordem.push("url");
      urls.push({ caminho, ttl });
      if (opcoes.erroUrl) return { signedUrl: null, error: { message: "boom" } };
      return { signedUrl: opcoes.urlSemValor ? null : "https://storage/assinado?token=abc", error: null };
    },
  };
  const pedir = (body: unknown = { anexoId: ANEXO }, isServiceRole = false) =>
    tratarPedidoAnexoUrl({ isServiceRole, body, portos, registarErro: (e) => erros.push(e) });
  return { pedir, ordem, permissoesPedidas, auditorias, urls, erros };
}

describe("ordem: a auditoria antes do URL", () => {
  it("cartao de cidadao autorizado: permissao, depois auditoria, depois URL (60 s)", async () => {
    const c = criar({ permissoes: ["hr.pessoas.identificacao.reveal"] });
    const r = await c.pedir();

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      url: "https://storage/assinado?token=abc",
      expiraEmSegundos: 60,
      tipo: "cartao_cidadao",
      mime_type: "application/pdf",
    });
    expect(c.ordem).toEqual(["ler", "permissao:hr.pessoas.identificacao.reveal", "auditoria", "url"]);
    expect(c.auditorias).toEqual([{ pessoaId: PESSOA, organizationId: ORG, campo: "anexo_cartao_cidadao" }]);
    expect(c.urls).toEqual([{ caminho: CAMINHO, ttl: 60 }]);
  });

  it("comprovativo de IBAN: auditado com o seu campo", async () => {
    const c = criar({ anexo: anexo({ tipo: "comprovativo_iban" }), permissoes: ["hr.pessoas.bancarios.edit"] });
    const r = await c.pedir();
    expect(r.status).toBe(200);
    expect(c.auditorias[0].campo).toBe("anexo_comprovativo_iban");
    expect(c.ordem.indexOf("auditoria")).toBeLessThan(c.ordem.indexOf("url"));
  });

  it("a auditoria falha: erro_auditoria 500 e NENHUM URL e emitido", async () => {
    const c = criar({ permissoes: ["hr.pessoas.identificacao.reveal"], erroAuditoria: true });
    const r = await c.pedir();

    expect(r).toEqual({ status: 500, body: { error: "erro_auditoria" } });
    expect(c.urls).toHaveLength(0);
    expect(c.ordem).not.toContain("url");
    expect(c.erros).toHaveLength(1);
  });

  it("fotografia: sem auditoria, URL de 300 s", async () => {
    const c = criar({ anexo: anexo({ tipo: "fotografia", mime_type: "image/jpeg" }), permissoes: ["hr.pessoas.view"] });
    const r = await c.pedir();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ expiraEmSegundos: 300, tipo: "fotografia" });
    expect(c.auditorias).toHaveLength(0);
    expect(c.ordem).not.toContain("auditoria");
  });
});

describe("quem pode abrir", () => {
  it("sem permissao do tipo nem a propria: 403, sem auditoria e sem URL", async () => {
    const c = criar({ permissoes: [] });
    const r = await c.pedir();
    expect(r).toEqual({ status: 403, body: { error: "sem_permissao" } });
    expect(c.auditorias).toHaveLength(0);
    expect(c.urls).toHaveLength(0);
  });

  it("uma permissao de OUTRO tipo nao abre este (view nao abre o cartao)", async () => {
    const c = criar({ permissoes: ["hr.pessoas.view", "hr.pessoas.bancarios.edit"] });
    expect((await c.pedir()).status).toBe(403);
  });

  it("a propria pessoa abre o seu cartao (view.own e e a pessoa do anexo), com auditoria", async () => {
    const c = criar({ permissoes: ["hr.pessoas.view.own"], pessoaDoUtilizador: PESSOA });
    const r = await c.pedir();
    expect(r.status).toBe(200);
    expect(c.auditorias).toHaveLength(1);
    expect(c.ordem).toEqual(["ler", "permissao:hr.pessoas.identificacao.reveal", "permissao:hr.pessoas.view.own", "pessoa", "auditoria", "url"]);
  });

  it("view.own mas OUTRA pessoa: 403", async () => {
    const c = criar({ permissoes: ["hr.pessoas.view.own"], pessoaDoUtilizador: OUTRA_PESSOA });
    expect((await c.pedir()).status).toBe(403);
    expect(c.urls).toHaveLength(0);
  });

  it("ser a pessoa sem a permissao view.own nao basta (nem pergunta quem e)", async () => {
    const c = criar({ permissoes: [], pessoaDoUtilizador: PESSOA });
    expect((await c.pedir()).status).toBe(403);
    expect(c.ordem).not.toContain("pessoa");
  });

  it("quem tem a permissao do tipo nem chega a ver se e a propria pessoa", async () => {
    const c = criar({ permissoes: ["hr.pessoas.identificacao.reveal"] });
    await c.pedir();
    expect(c.ordem).not.toContain("pessoa");
    expect(c.permissoesPedidas.map((p) => p.codigo)).toEqual(["hr.pessoas.identificacao.reveal"]);
  });

  it("as permissoes sao sempre contra a organizacao da LINHA do anexo", async () => {
    const OUTRA_ORG = "11111111-2222-4333-8444-555555555555";
    const c = criar({ anexo: anexo({ organization_id: OUTRA_ORG }), permissoes: ["hr.pessoas.view.own"], pessoaDoUtilizador: PESSOA });
    await c.pedir();
    expect(c.permissoesPedidas.every((p) => p.org === OUTRA_ORG)).toBe(true);
    expect(c.auditorias[0].organizationId).toBe(OUTRA_ORG);
  });

  it("service_role e recusado (403) sem sequer ler o anexo", async () => {
    const c = criar({ permissoes: ["hr.pessoas.identificacao.reveal"] });
    const r = await c.pedir({ anexoId: ANEXO }, true);
    expect(r).toEqual({ status: 403, body: { error: "sem_permissao" } });
    expect(c.ordem).toEqual([]);
  });
});

describe("o anexo", () => {
  it.each([
    ["inexistente ou nao promovido", { anexo: null }],
    ["noutro bucket (quarentena)", { anexo: anexo({ bucket: "hr-documentos-quarantine" }) }],
    ["de um tipo desconhecido", { anexo: anexo({ tipo: "passaporte" }) }],
  ])("%s: 404 igual a um id inexistente, sem permissoes nem auditoria", async (_nome, opcoes) => {
    const c = criar({ ...opcoes, permissoes: ["hr.pessoas.identificacao.reveal"] });
    const r = await c.pedir();
    expect(r).toEqual({ status: 404, body: { error: "anexo_nao_encontrado" } });
    expect(c.ordem).toEqual(["ler"]);
  });

  it.each([
    [null],
    ["texto"],
    [{}],
    [{ anexoId: "nao-e-uuid" }],
    [{ anexoId: 42 }],
    [{ anexo_id: ANEXO }],
  ])("corpo invalido (%j): 400 sem tocar na base", async (body) => {
    const c = criar();
    const r = await c.pedir(body);
    expect(r).toEqual({ status: 400, body: { error: "pedido_invalido" } });
    expect(c.ordem).toEqual([]);
  });

  it("a resposta nunca traz o caminho, a organizacao nem a pessoa", async () => {
    const c = criar({ permissoes: ["hr.pessoas.identificacao.reveal"] });
    const texto = JSON.stringify((await c.pedir()).body);
    expect(texto).not.toContain(CAMINHO);
    expect(texto).not.toContain(ORG);
    expect(texto).not.toContain(PESSOA);
  });
});

describe("falhas da base e do Storage", () => {
  it("falha a ler o anexo: 500 erro_inesperado, registada", async () => {
    const c = criar({ erroLer: true });
    expect(await c.pedir()).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(c.erros).toHaveLength(1);
  });

  it("falha a verificar a permissao: falha FECHADA (500, sem auditoria nem URL)", async () => {
    const c = criar({ erroPermissao: true, permissoes: ["hr.pessoas.identificacao.reveal"] });
    expect(await c.pedir()).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(c.urls).toHaveLength(0);
    expect(c.auditorias).toHaveLength(0);
  });

  it("falha a descobrir a pessoa do utilizador: 500, sem URL", async () => {
    const c = criar({ permissoes: ["hr.pessoas.view.own"], erroPessoa: true });
    expect(await c.pedir()).toEqual({ status: 500, body: { error: "erro_inesperado" } });
    expect(c.urls).toHaveLength(0);
  });

  it.each([
    ["erro do Storage", { erroUrl: true }],
    ["URL em falta", { urlSemValor: true }],
  ])("%s: 500 erro_url (a auditoria ja foi feita, o que e o lado seguro)", async (_nome, opcoes) => {
    const c = criar({ permissoes: ["hr.pessoas.identificacao.reveal"], ...opcoes });
    expect(await c.pedir()).toEqual({ status: 500, body: { error: "erro_url" } });
    expect(c.auditorias).toHaveLength(1);
  });
});
