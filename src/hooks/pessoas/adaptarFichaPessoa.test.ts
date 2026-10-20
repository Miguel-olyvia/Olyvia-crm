import { describe, expect, it } from "vitest";
import { adaptarPessoa } from "./adaptarFichaPessoa";
import { agregadosDb, fichaDb, pessoaDb } from "./fichaFabrica";

const HOJE = "2026-10-19";
const adaptar = (sobre: Parameters<typeof fichaDb>[0] = {}) => adaptarPessoa(fichaDb(sobre), HOJE);

describe("adaptarPessoa: uma lead sem nada", () => {
  it("leva o que a base dá e deixa de fora o que não tem fonte", () => {
    const p = adaptar();
    expect(p).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111", nome: "Ana Lopes", comercial: "Rita Gomes", ultimoContactoDias: null,
      contacto: { telefone: "912345678", email: "ana@exemplo.pt" }, desde: "2026-09-01",
    });
    for (const campo of ["saude", "nif", "empresa", "origem", "viaEntrada", "canal", "campanha", "formulario", "perdida", "encerrada"]) {
      expect(p[campo as keyof typeof p], campo).toBeUndefined();
    }
    expect(p.resultadoContacto).toBeUndefined();
    expect(p.proximoContacto ?? null).toBeNull();
  });

  it("nome vazio ou nulo dá texto vazio e o comercial em falta esconde a linha (texto vazio)", () => {
    expect(adaptar({ pessoa: pessoaDb({ nome: null, responsavel_nome: null }) })).toMatchObject({ nome: "", comercial: "" });
    expect(adaptar({ pessoa: pessoaDb({ nome: "  Rui  " }) }).nome).toBe("Rui");
  });
});

describe("adaptarPessoa: origem, NIF e empresa do contrato", () => {
  const origem = { origin: "form", source: "google", campanha: "Cozinhas 2026", formulario: "Pedido de orçamento" };

  it("preenche a campanha e o formulário quando existem", () => {
    const p = adaptar({ pessoa: pessoaDb({ origem }) });
    expect(p).toMatchObject({ campanha: "Cozinhas 2026", formulario: "Pedido de orçamento" });
  });

  it("preenche o NIF e a empresa quando existem", () => {
    const p = adaptar({ pessoa: pessoaDb({ nif: "123456789", empresa: "Obras Lda" }) });
    expect(p.nif).toBe("123456789");
    expect(p.empresa).toEqual({ nome: "Obras Lda" });
  });

  it("campos nulos ou vazios ficam por preencher (a ficha esconde-os)", () => {
    const p = adaptar({ pessoa: pessoaDb({ origem: { origin: null, source: null, campanha: " ", formulario: null }, nif: "", empresa: null }) });
    for (const campo of ["campanha", "formulario", "nif", "empresa"]) expect(p[campo as keyof typeof p], campo).toBeUndefined();
  });

  it("a origem desconhecida (origin, source) não inventa o tipo de origem nem a via de entrada", () => {
    const p = adaptar({ pessoa: pessoaDb({ origem }) });
    expect(p.origem).toBeUndefined();
    expect(p.viaEntrada).toBeUndefined();
  });
});

describe("adaptarPessoa: contacto, morada e distrito", () => {
  it("contacto nulo ou vazio fica sem telefone nem email", () => {
    expect(adaptar({ pessoa: pessoaDb({ contacto: null }) }).contacto).toEqual({ telefone: null, email: null });
    expect(adaptar({ pessoa: pessoaDb({ contacto: { telefone: " ", email: "" } }) }).contacto).toEqual({ telefone: null, email: null });
  });

  it("sem nenhum campo de morada, não há morada (nem distrito)", () => {
    const p = adaptar({ pessoa: pessoaDb({ morada: { rua: null, codigo_postal: "", localidade: null, andar: null, distrito: null } }) });
    expect(p.morada).toBeUndefined();
    expect(p.distrito).toBeUndefined();
  });

  it("morada parcial: só a localidade, e o andar junta-se à rua", () => {
    expect(adaptar({ pessoa: pessoaDb({ morada: { rua: null, codigo_postal: null, localidade: "Sintra", andar: null } }) }).morada)
      .toEqual({ linha: "", cp: "", localidade: "Sintra" });
    expect(adaptar({ pessoa: pessoaDb({ morada: { rua: "Rua A 1", codigo_postal: "1000-001", localidade: "Lisboa", andar: "2.º Esq", distrito: "Lisboa" } }) }))
      .toMatchObject({ morada: { linha: "Rua A 1, 2.º Esq", cp: "1000-001", localidade: "Lisboa" }, distrito: "Lisboa" });
  });
});

describe("adaptarPessoa: qualificação, resultado e próximo contacto", () => {
  it("só MQL e SQL valem como qualificação (com qualquer combinação de maiúsculas e espaços)", () => {
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: "SQL" }) }).qualificacao).toBe("SQL");
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: "MQL" }) }).qualificacao).toBe("MQL");
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: "sql" }) }).qualificacao).toBe("SQL");
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: " Mql " }) }).qualificacao).toBe("MQL");
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: "quente" }) }).qualificacao).toBeUndefined();
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: "SQLX" }) }).qualificacao).toBeUndefined();
  });

  it("o resultado do último contacto só conta se for uma das 5 chaves", () => {
    expect(adaptar({ agregados: agregadosDb({ ultimo_resultado: "naoAtendeu" }) }).resultadoContacto).toBe("naoAtendeu");
    expect(adaptar({ agregados: agregadosDb({ ultimo_resultado: "talvez" }) }).resultadoContacto).toBeUndefined();
  });

  it("o próximo contacto vem em dia e hora de Lisboa; a meia-noite de Lisboa vale sem hora", () => {
    const com = adaptar({ agregados: agregadosDb({ proximo_contacto_em: "2026-10-21T09:00:00Z" }) });
    expect(com).toMatchObject({ proximoContacto: "2026-10-21", proximoHora: "10:00" });
    const sem = adaptar({ agregados: agregadosDb({ proximo_contacto_em: "2026-10-20T23:00:00Z" }) });
    expect(sem.proximoContacto).toBe("2026-10-21");
    expect(sem.proximoHora).toBeUndefined();
  });

  it("os dias desde o último contacto contam em Lisboa e a ausência é null (nunca)", () => {
    expect(adaptar({ agregados: agregadosDb({ ultimo_contacto_em: "2026-10-16T09:00:00Z" }) }).ultimoContactoDias).toBe(3);
    expect(adaptar({ agregados: agregadosDb({ ultimo_contacto_em: null }) }).ultimoContactoDias).toBeNull();
  });
});

describe("adaptarPessoa: abordagem encerrada", () => {
  const lead = (encerramento: Record<string, string | null>) => ({
    id: "l", estado: "closed", aberta: false,
    encerramento: { resultado: "semInteresse", motivo: null, motivo_outro: null, em: "2026-10-15T09:00:00Z", ...encerramento },
  });

  it("motivo da lista", () => {
    expect(adaptar({ lead: lead({ motivo: "preco" }) }).encerrada).toEqual({ resultado: "semInteresse", motivo: "preco", data: "2026-10-15" });
  });

  it("motivo «outro» leva o texto", () => {
    expect(adaptar({ lead: lead({ resultado: "obraInviavel", motivo: "outro", motivo_outro: "Obra no estrangeiro" }) }).encerrada)
      .toEqual({ resultado: "obraInviavel", motivo: "outro", motivoOutro: "Obra no estrangeiro", data: "2026-10-15" });
  });

  it("motivo nulo (encerrado pelo resultado da visita) vira «outro» com o texto da nota", () => {
    expect(adaptar({ lead: lead({ motivo: null, motivo_outro: "Resultado da visita" }) }).encerrada)
      .toEqual({ resultado: "semInteresse", motivo: "outro", motivoOutro: "Resultado da visita", data: "2026-10-15" });
    expect(adaptar({ lead: lead({ motivo: null }) }).encerrada).toMatchObject({ motivo: "outro", motivoOutro: undefined });
  });

  it("um motivo desconhecido também vira «outro», e um resultado desconhecido não encerra", () => {
    expect(adaptar({ lead: lead({ motivo: "xpto" }) }).encerrada?.motivo).toBe("outro");
    expect(adaptar({ lead: lead({ resultado: "perdida" }) }).encerrada).toBeUndefined();
  });

  it("lead aberta ou sem lead: nunca encerrada; leads legadas não se marcam como perdidas", () => {
    expect(adaptar({ lead: { id: "l", estado: "lost", aberta: false, encerramento: null } }).perdida).toBeUndefined();
    expect(adaptar({ lead: null }).encerrada).toBeUndefined();
  });
});

describe("adaptarPessoa: a abordagem encerrada com a lead mais recente morta", () => {
  const morta = { id: "morta", estado: "converted", aberta: false, encerramento: null };
  const lead = (id: string, fecho: string | null, criada: string) => ({ id, status: "new", created_at: criada, closure_result: fecho });

  it("a lead encerrada que está entre as abertas dá a pessoa como encerrada (e o «Reativar» aparece)", () => {
    const p = adaptar({ lead: morta, leads_abertas: [lead("l1", "semInteresse", "2026-09-01T10:00:00Z")] });
    // ALTERADO: antes esperava motivo «outro» e data de hoje; a base só dá o resultado (closure_result), por isso o resto não se inventa.
    expect(p.encerrada).toEqual({ resultado: "semInteresse" });
    expect(p.encerrada).not.toHaveProperty("motivo");
    expect(p.encerrada).not.toHaveProperty("data");
  });

  it("um resultado ilegível na base cai em «semInteresse», também sem motivo nem data", () => {
    const p = adaptar({ lead: morta, leads_abertas: [lead("l1", "xpto", "2026-09-01T10:00:00Z")] });
    expect(p.encerrada).toEqual({ resultado: "semInteresse" });
  });

  it("uma lead aberta e viva mais recente que a encerrada manda: a pessoa não está encerrada", () => {
    const p = adaptar({ lead: morta, leads_abertas: [lead("l1", "semInteresse", "2026-08-01T10:00:00Z"), lead("l2", null, "2026-09-01T10:00:00Z")] });
    expect(p.encerrada).toBeUndefined();
  });

  it("uma lead da ficha aberta e sem encerramento não deixa a pessoa encerrada por causa de uma aberta mais antiga", () => {
    const aberta = { id: "viva", estado: "new", aberta: true, encerramento: null };
    const p = adaptar({ lead: aberta, leads_abertas: [lead("antiga", "semInteresse", "2026-08-01T10:00:00Z")] });
    expect(p.encerrada).toBeUndefined();
  });

  it("o encerramento da própria lead da ficha continua a valer, com motivo e dia", () => {
    const encerrada = { id: "l1", estado: "new", aberta: true, encerramento: { resultado: "obraInviavel", motivo: "preco", motivo_outro: null, em: "2026-10-05T12:00:00Z" } };
    expect(adaptar({ lead: encerrada }).encerrada).toEqual({ resultado: "obraInviavel", motivo: "preco", data: "2026-10-05" });
  });

  it("sem lead e sem abertas não há encerramento", () => {
    expect(adaptar({ lead: null, leads_abertas: [] }).encerrada).toBeUndefined();
  });
});

describe("adaptarPessoa: a qualificação chega da função como respostas (objeto), não como MQL ou SQL", () => {
  const respostas = { orcamento: "5000", urgencia: "alta", sql: true };

  it("um objeto de respostas não rebenta a ficha e não é MQL nem SQL", () => {
    expect(() => adaptar({ pessoa: pessoaDb({ qualificacao: respostas }) })).not.toThrow();
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: respostas }) }).qualificacao).toBeUndefined();
  });

  it.each([[42], [true], [[]], [["SQL"]], [null]])("outro tipo (%j) também não rebenta", (valor) => {
    expect(() => adaptar({ pessoa: pessoaDb({ qualificacao: valor }) })).not.toThrow();
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: valor }) }).qualificacao).toBeUndefined();
  });

  it("lê a chave qualificacao_tipo quando vem (MQL ou SQL, sem distinguir maiúsculas), mesmo com respostas ao lado", () => {
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: respostas, qualificacao_tipo: "SQL" }) }).qualificacao).toBe("SQL");
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: respostas, qualificacao_tipo: " mql " }) }).qualificacao).toBe("MQL");
  });

  it("um qualificacao_tipo desconhecido ou que não é texto não conta", () => {
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: respostas, qualificacao_tipo: "quente" }) }).qualificacao).toBeUndefined();
    expect(adaptar({ pessoa: pessoaDb({ qualificacao: respostas, qualificacao_tipo: 3 as never }) }).qualificacao).toBeUndefined();
  });
});
