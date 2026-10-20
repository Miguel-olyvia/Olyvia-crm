// A regra de duplicados da «Nova lead» de Pessoas (pura): um teste por caso da tabela do desenho (casos 1 a 18).
// Email, telefone e NIF iguais aos de uma pessoa da organização BLOQUEIAM; só o nome igual não; só o grupo não bloqueia.
import { describe, expect, it } from "vitest";
import { decidirDuplicados } from "./regraDuplicadosPessoas";
import type { Escrito, LeadConhecida, OutraEmpresa, PessoaBloqueio, PessoaEncontrada } from "./tiposNovaLead";

const ESCRITO: Escrito = { nome: "Ana Lopes", email: "ana@novo.pt", telefone: "+351 912 000 111", nif: null };

const lead = (sobre: Partial<LeadConhecida> = {}): LeadConhecida => ({
  id: "l1", estado: "new", encerrada: false, motivoEncerramento: null, criadaEm: "2026-10-01T10:00:00Z", atribuidoA: "Rui", ...sobre,
});
const pessoa = (sobre: Partial<PessoaEncontrada> = {}): PessoaEncontrada => ({
  entityId: "p1", nome: "Ana Lopes", visivel: true, campos: ["email"], emailPrincipal: "ana@novo.pt", emails: ["ana@novo.pt"],
  telefonePrincipal: "911 222 333", telefones: ["911 222 333"], leads: [lead()], temCliente: false, clienteAtivo: false,
  criadaEm: "2026-09-01T10:00:00Z", ...sobre,
});
const grupoX: OutraEmpresa = { organizacaoId: "o2", nome: "Loja Norte", campos: ["email"] };
const bloqueio = (d: ReturnType<typeof decidirDuplicados>): { pessoas: PessoaBloqueio[]; semAcesso: boolean } => {
  if (d.tipo !== "bloquear") throw new Error("devia bloquear");
  return d;
};
const linha = (p: PessoaBloqueio, campo: string) => p.ladoALado.find((l) => l.campo === campo);

describe("sem coincidências ou só o que não bloqueia", () => {
  it("caso 13: nenhuma coincidência cria, sem aviso", () => {
    expect(decidirDuplicados(ESCRITO, { pessoas: [], grupo: [] })).toEqual({ tipo: "criar", grupo: [] });
  });

  it("caso 10: só o nome igual não chega aqui (a procura é por email, telefone e NIF) e cria", () => {
    expect(decidirDuplicados({ ...ESCRITO, email: null, telefone: null }, { pessoas: [], grupo: [] }).tipo).toBe("criar");
  });

  it("caso 11: só noutra empresa do grupo cria, com o aviso informativo (sem pessoa, sem botões)", () => {
    const d = decidirDuplicados(ESCRITO, { pessoas: [], grupo: [grupoX] });
    expect(d).toEqual({ tipo: "criar", grupo: [grupoX] });
  });
});

describe("bloqueio por campo forte, na mesma organização", () => {
  it("caso 1: email igual com telefone diferente bloqueia; Atualizar substitui o telefone", () => {
    const d = bloqueio(decidirDuplicados(ESCRITO, { pessoas: [pessoa()], grupo: [] }));
    expect(d.pessoas).toHaveLength(1);
    const p = d.pessoas[0];
    expect(p.entityId).toBe("p1");
    expect(p.podeAbrir).toBe(true);
    expect(p.atualizar).toEqual({
      leadId: "l1", reabrirLead: false, reabrirAbordagem: false, email: null,
      telefone: { antigo: "911 222 333", novo: "+351 912 000 111" },
    });
    expect(linha(p, "email")?.estado).toBe("igual");
    expect(linha(p, "telefone")).toMatchObject({ estado: "diferente", escrito: "+351 912 000 111", existente: "911 222 333" });
    expect(linha(p, "nome")?.estado).toBe("igual");
  });

  it("caso 2: telefone igual com email diferente bloqueia; Atualizar substitui o email", () => {
    const p = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa({ campos: ["telefone"], emailPrincipal: "outro@x.pt", emails: ["outro@x.pt"], telefonePrincipal: "912000111", telefones: ["912000111"] })],
      grupo: [],
    })).pessoas[0];
    expect(p.atualizar?.email).toEqual({ antigo: "outro@x.pt", novo: "ana@novo.pt" });
    expect(p.atualizar?.telefone).toBeNull();
    expect(linha(p, "telefone")?.estado).toBe("igual");
    expect(linha(p, "email")?.estado).toBe("diferente");
  });

  it("o telefone compara-se pelos últimos 9 dígitos (indicativos diferentes são o mesmo número)", () => {
    const p = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa({ campos: ["telefone"], telefonePrincipal: "912 000 111", telefones: ["912 000 111"] })],
      grupo: [],
    })).pessoas[0];
    expect(p.atualizar?.telefone).toBeNull();
    expect(linha(p, "telefone")?.estado).toBe("igual");
  });

  it("caso 3: só o NIF igual bloqueia; o NIF mostra-se «coincide» e não se substitui", () => {
    const escrito = { ...ESCRITO, nif: "123456789" };
    const p = bloqueio(decidirDuplicados(escrito, {
      pessoas: [pessoa({ campos: ["nif"] })],
      grupo: [],
    })).pessoas[0];
    expect(linha(p, "nif")?.estado).toBe("coincide");
    expect(p.atualizar).not.toBeNull();
    expect(p.podeAbrir).toBe(true);
  });

  it("sem NIF escrito a linha do NIF diz «não indicado»", () => {
    const p = bloqueio(decidirDuplicados(ESCRITO, { pessoas: [pessoa()], grupo: [] })).pessoas[0];
    expect(linha(p, "nif")?.estado).toBe("naoIndicado");
  });

  it("caso 4: só o telefone igual (sem email escrito) bloqueia, ao contrário de Leads; Atualizar só junta os campos", () => {
    const escrito = { ...ESCRITO, email: null };
    const p = bloqueio(decidirDuplicados(escrito, {
      pessoas: [pessoa({ campos: ["telefone"], telefonePrincipal: "912000111", telefones: ["912000111"] })],
      grupo: [],
    })).pessoas[0];
    expect(p.atualizar).toEqual({ leadId: "l1", reabrirLead: false, reabrirAbordagem: false, email: null, telefone: null });
    expect(linha(p, "email")?.estado).toBe("naoIndicado");
  });

  it("caso 5: o email escrito é o segundo email da pessoa: já é dela, nada se substitui nem acrescenta", () => {
    const p = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa({ emailPrincipal: "principal@x.pt", emails: ["principal@x.pt", "Ana@Novo.pt"], telefonePrincipal: "912000111", telefones: ["912000111"] })],
      grupo: [],
    })).pessoas[0];
    expect(p.atualizar?.email).toBeNull();
    expect(linha(p, "email")?.estado).toBe("igual");
  });

  it("uma pessoa sem email nem telefone: Atualizar põe o novo (antigo nulo)", () => {
    const p = bloqueio(decidirDuplicados({ ...ESCRITO, nif: "1" }, {
      pessoas: [pessoa({ campos: ["nif"], emailPrincipal: null, emails: [], telefonePrincipal: null, telefones: [] })],
      grupo: [],
    })).pessoas[0];
    expect(p.atualizar?.email).toEqual({ antigo: null, novo: "ana@novo.pt" });
    expect(p.atualizar?.telefone).toEqual({ antigo: null, novo: "+351 912 000 111" });
  });
});

describe("papel e estado da pessoa encontrada", () => {
  it("caso 6: cliente ativo diz «Já é cliente», abre mas não atualiza", () => {
    const p = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa({ temCliente: true, clienteAtivo: true })], grupo: [],
    })).pessoas[0];
    expect(p.jaECliente).toBe(true);
    expect(p.papel).toBe("cliente");
    expect(p.podeAbrir).toBe(true);
    expect(p.atualizar).toBeNull();
  });

  it("caso 7: só lead perdida ou rejeitada: Atualizar reabre (a lead passa a nova)", () => {
    for (const estado of ["lost", "rejected"]) {
      const p = bloqueio(decidirDuplicados(ESCRITO, {
        pessoas: [pessoa({ leads: [lead({ id: "lx", estado })] })], grupo: [],
      })).pessoas[0];
      expect(p.atualizar).toMatchObject({ leadId: "lx", reabrirLead: true, reabrirAbordagem: false });
      expect(p.papel).toBe("lead");
      expect(p.estado).toBe(estado);
    }
  });

  it("caso 8: lead aberta com a abordagem encerrada: Atualizar reabre a abordagem com essa lead e mostra o motivo", () => {
    const p = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa({ leads: [lead({ id: "le", encerrada: true, motivoEncerramento: "semInteresse" })] })], grupo: [],
    })).pessoas[0];
    expect(p.encerrada).toBe(true);
    expect(p.motivoEncerramento).toBe("semInteresse");
    expect(p.atualizar).toMatchObject({ leadId: "le", reabrirAbordagem: true, reabrirLead: false });
  });

  it("a lead de referência é a mais recente que não está convertida", () => {
    const p = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa({
        leads: [
          lead({ id: "velha", criadaEm: "2026-01-01T00:00:00Z" }),
          lead({ id: "convertida", estado: "converted", criadaEm: "2026-12-01T00:00:00Z" }),
          lead({ id: "nova", criadaEm: "2026-08-01T00:00:00Z" }),
        ],
      })], grupo: [],
    })).pessoas[0];
    expect(p.atualizar?.leadId).toBe("nova");
  });

  it("lead cancelada trata-se como as abertas: junta os campos e não muda o estado", () => {
    const p = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa({ leads: [lead({ id: "lc", estado: "cancelled" })] })], grupo: [],
    })).pessoas[0];
    expect(p.atualizar).toMatchObject({ leadId: "lc", reabrirLead: false, reabrirAbordagem: false });
  });

  it("caso 17: só lead convertida (cliente inativo ou apagado): abre, mas não atualiza", () => {
    const p = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa({ leads: [lead({ estado: "converted" })] })], grupo: [],
    })).pessoas[0];
    expect(p.atualizar).toBeNull();
    expect(p.podeAbrir).toBe(true);
  });

  it("uma pessoa sem lead nem cliente (a ficha de uma empresa) bloqueia, sem abrir nem atualizar", () => {
    const d = bloqueio(decidirDuplicados(ESCRITO, { pessoas: [pessoa({ leads: [] })], grupo: [] }));
    expect(d.pessoas[0]).toMatchObject({ podeAbrir: false, atualizar: null, papel: null });
  });
});

describe("várias pessoas e pessoas invisíveis", () => {
  it("caso 9: email de P1 e telefone de P2 mostra as duas, abre cada uma, sem Atualizar", () => {
    const d = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [
        pessoa({ entityId: "p1", nome: "Ana", campos: ["email"] }),
        pessoa({ entityId: "p2", nome: "Beatriz", campos: ["telefone"], emails: ["b@x.pt"], emailPrincipal: "b@x.pt" }),
      ],
      grupo: [],
    }));
    expect(d.pessoas.map((p) => p.entityId)).toEqual(["p1", "p2"]);
    expect(d.pessoas.map((p) => p.campos)).toEqual([["email"], ["telefone"]]);
    for (const p of d.pessoas) {
      expect(p.atualizar).toBeNull();
      expect(p.podeAbrir).toBe(true);
    }
  });

  it("caso 12: pessoa e grupo: bloqueia pela pessoa e o grupo vem só como informação", () => {
    const d = decidirDuplicados(ESCRITO, { pessoas: [pessoa()], grupo: [grupoX] });
    expect(d).toMatchObject({ tipo: "bloquear", grupo: [grupoX] });
    expect(bloqueio(d).pessoas).toHaveLength(1);
  });

  it("caso 18: pessoa que a RLS esconde: só «sem acesso» (Cancelar), sem nome, sem abrir nem atualizar", () => {
    const d = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa({ entityId: null, nome: null, visivel: false, leads: [], emails: [], telefones: [], emailPrincipal: null, telefonePrincipal: null })],
      grupo: [],
    }));
    expect(d.semAcesso).toBe(true);
    expect(d.pessoas).toEqual([]);
  });

  it("uma pessoa visível e outra escondida: mostra a visível, avisa da outra e não deixa atualizar", () => {
    const d = bloqueio(decidirDuplicados(ESCRITO, {
      pessoas: [pessoa(), pessoa({ entityId: null, nome: null, visivel: false, campos: ["telefone"] })],
      grupo: [],
    }));
    expect(d.semAcesso).toBe(true);
    expect(d.pessoas).toHaveLength(1);
    expect(d.pessoas[0].atualizar).toBeNull();
  });
});

describe("os botões que nunca existem", () => {
  it("o resultado não tem «criar mesmo assim» nem «partilhar»", () => {
    const d = decidirDuplicados(ESCRITO, { pessoas: [pessoa()], grupo: [grupoX] });
    const texto = JSON.stringify(d).toLowerCase();
    expect(texto).not.toContain("partilhar");
    expect(texto).not.toContain("criarmesmoassim");
  });
});
