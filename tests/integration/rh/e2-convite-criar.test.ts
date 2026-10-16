/**
 * Etapa E2 da admissao do RH: processo, eventos, convidar, prolongar, cancelar.
 * Integracao contra a DEV (uetjghdkwbywbftedtth), so a organizacao nike.
 *
 * Contrato (migration V2 e Edge convite-admissao/handler.ts):
 *  - criar {pessoa_id, organization_id, email}; prolongar {convite_id,
 *    organization_id, dias}; cancelar {convite_id, organization_id, motivo}.
 *  - A RPC _criar e so service_role: a conta recebe 42501 se a chamar.
 *  - authenticated nao le NADA de pessoas_convites_admissao: o estado le-se pela
 *    rpc_hr_convite_admissao_resumo (estado + estado_portal; cancelada/rejeitada
 *    sem hr.onboarding.restrito aparecem como 'terminado').
 *  - A Edge envia e-mail (send-email): usa-se example.invalid (RFC 2606, nunca
 *    entrega) e a nike nao tem SMTP ativo na dev.
 *
 * LIMITES DA EDGE (bucket rate_limit_attempts, janela de 60 min):
 *  - criar: 20 por utilizador E 5 por pessoa. Conta TODO o pedido que chega a
 *    esse ponto (depois de pedido valido, pessoa da org e permissao), mesmo que
 *    a RPC o recuse (processo_aberto, email_invalido). Nao conta pedido_invalido
 *    nem nao_encontrado.
 *  - cancelar/prolongar: 60 por utilizador, contados depois de validar o corpo.
 * Orcamento desta suite: 2 chamadas a criar por pessoa (3 pessoas, 6 no total).
 *
 * Fixtures: 3 pessoas ZZ da nike, uma por grupo; cada grupo cria o seu processo
 * em beforeAll e cancela-o em afterAll. Os eventos nao tem leitura direta (sem
 * grant): so se provam indiretamente. Os convites criados ficam permanentes
 * (FK dos eventos RESTRICT) mesmo depois de cancelados.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORG_NIKE, TEM_ENV, entrarNaDev } from "./helpers";

// Pessoas ZZ da nike. NAO usar ZZ Teste Fluxo1 B X (9a1c64e4...): esgotou o limite por pessoa.
const P_CRIAR = "03f58cc5-12ce-4e74-a732-897bb96309cc"; // ZZ Teste Fluxo1 A X
const P_PROLONGAR = "11815c40-80fb-4b82-8e6c-2434bc97d5a4"; // ZZ Teste Fluxo1 Anexos
const P_CANCELAR = "95370a10-df23-4036-8fa7-1e2931d9b47d"; // ZZ Teste Fluxo1 BIC
const EMAIL_TESTE = "zz-teste-e2@example.invalid";
const UUID_INEXISTENTE = "00000000-0000-4000-8000-000000000e02";
const OUTRA_ORG = "00000000-0000-4000-8000-0000000000a1";

interface RespostaEdge {
  status: number;
  body: Record<string, unknown>;
}

interface Resumo {
  existe: boolean;
  convite_id?: string;
  estado?: string;
  estado_portal?: string;
  valid_until?: string;
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

describe.skipIf(!TEM_ENV)("E2 admissao (integracao, dev/nike)", () => {
  let sb: SupabaseClient;
  let userId: string;

  async function edge(body: Record<string, unknown>): Promise<RespostaEdge> {
    const { data, error } = await sb.functions.invoke("convite-admissao", { body });
    if (!error) return { status: 200, body: (data ?? {}) as Record<string, unknown> };
    const ctx = (error as { context?: Response }).context;
    const corpo = ctx ? await ctx.clone().json().catch(() => ({})) : { error: error.message };
    return { status: ctx?.status ?? 0, body: corpo as Record<string, unknown> };
  }

  /** Falha com mensagem clara se a Edge respondeu 429 (limite horario). */
  function semLimite(r: RespostaEdge): RespostaEdge {
    if (r.status === 429) {
      const ate = new Date(Date.now() + 60 * 60_000);
      throw new Error(`limite horario atingido: esperar ate ${hhmm(ate)} (no maximo; 60 min sobre o ultimo pedido)`);
    }
    return r;
  }

  const criar = (pessoa: string, extra: Record<string, unknown> = {}) =>
    edge({ action: "criar", pessoa_id: pessoa, organization_id: ORG_NIKE, email: EMAIL_TESTE, ...extra }).then(semLimite);
  const prolongar = (conviteId: string, dias: unknown, org: string = ORG_NIKE) =>
    edge({ action: "prolongar", convite_id: conviteId, organization_id: org, dias }).then(semLimite);
  const cancelar = (conviteId: string, motivo: unknown, org: string = ORG_NIKE) =>
    edge({ action: "cancelar", convite_id: conviteId, organization_id: org, motivo }).then(semLimite);

  async function resumo(pessoa: string): Promise<Resumo> {
    const { data, error } = await sb.rpc("rpc_hr_convite_admissao_resumo", { p_pessoa_id: pessoa });
    if (error) throw new Error(`resumo falhou: ${error.message}`);
    return data as Resumo;
  }

  /** Criacao de um grupo em beforeAll: guarda o resultado; o teste que o usa explica a falha. */
  interface Processo {
    resposta: RespostaEdge | null;
    erro: string | null;
    id: string | null;
  }
  async function abrirProcesso(pessoa: string): Promise<Processo> {
    try {
      const resposta = await criar(pessoa);
      const id = typeof resposta.body.convite_id === "string" ? resposta.body.convite_id : null;
      return { resposta, erro: null, id };
    } catch (e) {
      return { resposta: null, erro: (e as Error).message, id: null };
    }
  }
  function exigirProcesso(p: Processo): string {
    if (p.erro) throw new Error(p.erro);
    if (!p.id) throw new Error(`sem processo: ${p.resposta?.status} ${JSON.stringify(p.resposta?.body)}`);
    return p.id;
  }
  async function limpar(...ids: Array<string | null>) {
    for (const id of ids) {
      if (id) await cancelar(id, "ZZ-TESTE- limpeza da fixture").catch(() => undefined);
    }
  }

  beforeAll(async () => {
    ({ sb, userId } = await entrarNaDev());
  });

  afterAll(async () => {
    await sb?.auth.signOut();
  });

  describe("permissoes e acesso (sem criar processos)", () => {
    it("a conta de teste tem permissao de convidar na nike", async () => {
      const { data, error } = await sb.rpc("has_anew_permission_in_org", {
        _auth_uid: userId,
        _permission_code: "hr.pessoas.convite.enviar",
        _organization_id: ORG_NIKE,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("a RPC _criar e so service_role: a conta recebe 42501", async () => {
      const { error } = await sb.rpc("rpc_hr_convite_admissao_criar", {
        p_pessoa_id: P_CRIAR,
        p_token_hash: "a".repeat(64),
        p_valid_until: new Date(Date.now() + 864e5).toISOString(),
        p_email: EMAIL_TESTE,
        p_actor: userId,
      });
      expect(error?.code).toBe("42501");
    });

    it("authenticated nao le a tabela dos convites: 42501", async () => {
      const { error } = await sb.from("pessoas_convites_admissao").select("id,estado").limit(1);
      expect(error?.code).toBe("42501");
    });
  });

  describe("criar: erros que nao contam para o limite nem criam processo", () => {
    it("sem organization_id: pedido_invalido (400)", async () => {
      const r = await edge({ action: "criar", pessoa_id: P_CRIAR, email: EMAIL_TESTE });
      expect(r.body.error).toBe("pedido_invalido");
      expect(r.status).toBe(400);
    });

    it("pessoa inexistente: nao_encontrado (404)", async () => {
      const r = await criar(UUID_INEXISTENTE);
      expect(r.body.error).toBe("nao_encontrado");
      expect(r.status).toBe(404);
    });

    it("organization_id que nao e a da pessoa: nao_encontrado (404)", async () => {
      const r = await criar(P_CRIAR, { organization_id: OUTRA_ORG });
      expect(r.body.error).toBe("nao_encontrado");
      expect(r.status).toBe(404);
    });
  });

  // Grupo 1: pessoa P_CRIAR, 2 chamadas a criar (sucesso + processo_aberto).
  describe("criar (Edge)", () => {
    let proc: Processo;
    beforeAll(async () => {
      proc = await abrirProcesso(P_CRIAR);
    });
    afterAll(async () => {
      await limpar(proc?.id);
    });

    it("na org ativa cria o processo: 200, convite_id, estado convidada e portal ativo", async () => {
      const id = exigirProcesso(proc);
      expect(proc.resposta?.status).toBe(200);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      const s = await resumo(P_CRIAR);
      expect(s.estado).toBe("convidada");
      expect(s.estado_portal).toBe("ativo");
    });

    it("com processo vivo: processo_aberto (409)", async () => {
      exigirProcesso(proc);
      const r = await criar(P_CRIAR);
      expect(r.body.error).toBe("processo_aberto");
      expect(r.status).toBe(409);
    });
  });

  // Grupo 2: pessoa P_PROLONGAR, 2 chamadas a criar (e-mail invalido + processo do grupo).
  describe("e-mail e prolongar (Edge)", () => {
    let proc: Processo;
    let respostaEmail: RespostaEdge | null = null;
    let erroEmail: string | null = null;
    beforeAll(async () => {
      try {
        respostaEmail = await criar(P_PROLONGAR, { email: "zz-teste-é@example.invalid" });
      } catch (e) {
        erroEmail = (e as Error).message;
      }
      proc = await abrirProcesso(P_PROLONGAR);
    });
    afterAll(async () => {
      await limpar(proc?.id, typeof respostaEmail?.body.convite_id === "string" ? respostaEmail.body.convite_id : null);
    });

    it("e-mail com caracteres fora da lista branca: email_invalido (HRA35)", () => {
      if (erroEmail) throw new Error(erroEmail);
      expect(respostaEmail?.body.error).toBe("email_invalido");
      expect(respostaEmail?.status).toBeGreaterThanOrEqual(400);
    });

    it("prolongar em convidada: alarga a validade e mantem o estado", async () => {
      const id = exigirProcesso(proc);
      const antes = await resumo(P_PROLONGAR);
      const r = await prolongar(id, 7);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.ok).toBe(true);
      const depois = await resumo(P_PROLONGAR);
      expect(depois.estado).toBe("convidada");
      expect(new Date(depois.valid_until as string).getTime()).toBeGreaterThan(
        new Date(antes.valid_until as string).getTime(),
      );
    });

    it.each([0, 91, 1.5, "7"])("prolongar com dias=%s: dias_invalidos (400)", async (dias) => {
      const id = exigirProcesso(proc);
      const r = await prolongar(id, dias);
      expect(r.body.error).toBe("dias_invalidos");
      expect(r.status).toBe(400);
    });

    it("prolongar alem do teto de now()+90 dias: prazo_excedido (409, HRA40)", async () => {
      const id = exigirProcesso(proc);
      const r = await prolongar(id, 90); // validade atual (>= agora) + 90 > agora + 90
      expect(r.body.error).toBe("prazo_excedido");
      expect(r.status).toBe(409);
    });

    it("prolongar com organization_id diferente: nao_encontrado (404)", async () => {
      const id = exigirProcesso(proc);
      const r = await prolongar(id, 7, OUTRA_ORG);
      expect(r.body.error).toBe("nao_encontrado");
      expect(r.status).toBe(404);
    });
  });

  // Grupo 3: pessoa P_CANCELAR, 2 chamadas a criar. Os testes que cancelam vao no fim.
  describe("cancelar (Edge)", () => {
    let proc: Processo;
    let segundo: string | null = null;
    beforeAll(async () => {
      proc = await abrirProcesso(P_CANCELAR);
    });
    afterAll(async () => {
      await limpar(segundo, proc?.id); // o primeiro ja esta cancelado: erro ignorado
    });

    it("cancelar sem motivo: pedido_invalido (400) e o processo continua vivo", async () => {
      const id = exigirProcesso(proc);
      for (const motivo of [undefined, "", "   "]) {
        const r = await cancelar(id, motivo);
        expect(r.body.error).toBe("pedido_invalido");
        expect(r.status).toBe(400);
      }
      expect((await resumo(P_CANCELAR)).estado).toBe("convidada");
    });

    it("cancelar com organization_id diferente: nao_encontrado (404)", async () => {
      const id = exigirProcesso(proc);
      const r = await cancelar(id, "ZZ-TESTE- motivo", OUTRA_ORG);
      expect(r.body.error).toBe("nao_encontrado");
      expect(r.status).toBe(404);
    });

    it("cancelar: a _resumo mostra o processo terminado e deixa de ser processo aberto", async () => {
      const id = exigirProcesso(proc);
      const r = await cancelar(id, "ZZ-TESTE- cancelamento de teste");
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.ok).toBe(true);
      const s = await resumo(P_CANCELAR);
      // Sem hr.onboarding.restrito a _resumo diz "terminado"; com ele (esta conta) o estado real.
      expect(["terminado", "cancelada"]).toContain(s.estado);
      expect(s.estado_portal).toBe("revogado");

      // Ja nao conta como processo aberto: convida-se de novo (2.a chamada a criar desta pessoa).
      const novo = await criar(P_CANCELAR);
      segundo = typeof novo.body.convite_id === "string" ? novo.body.convite_id : null;
      expect(novo.status, JSON.stringify(novo.body)).toBe(200);
      expect(segundo).not.toBe(id);
    });

    it("prolongar um processo cancelado: estado_invalido (409)", async () => {
      const id = exigirProcesso(proc); // o 1.o, cancelado no teste anterior
      const r = await prolongar(id, 7);
      expect(r.body.error).toBe("estado_invalido");
      expect(r.status).toBe(409);
    });
  });

  // Lacunas: so se provam com outras organizacoes, outro utilizador, volume
  // ou um papel com escrita (service_role / SQL) que esta conta nao tem.
  // Limpeza de fixtures: o 'cancelar' limpa; o que fica criado e permanente
  // (eventos RESTRICT) ate uma nova V0.
  it.todo("criar com pessoa de OUTRA organizacao da nao_encontrado (precisa de 2.a org na dev)");
  it.todo("criar numa org ativa com is_work_org=false: organizacao_nao_empregadora (a dev so tem a nike)");
  it.todo("criar numa filial que e work org e aceite (precisa de filial na dev)");
  it.todo("_criar/_cancelar/_prolongar recusam p_actor diferente de auth.uid() (precisa de segundo utilizador)");
  it.todo("limite_excedido (HRA41) as 60 chamadas/hora do mesmo actor (60 escritas na dev)");
  it.todo("cancelada/rejeitada com hr.onboarding.restrito mostra o estado real (precisa de conta com restrito)");
  it.todo("evento 'criado' com email_escolhido=true e email_igual_ficha (eventos sem leitura direta: grant nenhum)");
  it.todo("CHECK do rascunho recusa niss/iban/bic/saude (so a _rascunho, service_role, escreve o rascunho)");
  it.todo("UPDATE, DELETE e TRUNCATE nos eventos recusados (sem grant, so service_role/SQL os tenta)");
  it.todo("token_invalido (HRA34): so se prova chamando a _criar com service_role");
  it.todo("V0: os ids de convites de teste deixam de existir e os anexos ficam 'apagado'");
});
