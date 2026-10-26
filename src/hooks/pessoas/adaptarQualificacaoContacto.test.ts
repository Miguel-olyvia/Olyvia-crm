// A ficha com a migration 20261231100000: contacto preferido, hora, língua e tipo de cliente da pessoa; pedido do cliente, versão do questionário e
// qualificação por negócio; origem da morada do levantamento. Tudo opcional: uma ficha anterior à migration lê-se como antes.
import { describe, expect, it } from "vitest";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { adaptarPessoa } from "./adaptarFichaPessoa";
import { adaptarNegocios } from "./adaptarNegociosFicha";
import { adaptarRegistos } from "./adaptarRegistos";
import { fichaDb, levantamentoDb, negocioDb, pessoaDb, seccaoDb } from "./fichaFabrica";
import { levantamentoLivreDaFicha } from "./livreDaFicha";

const HOJE = "2026-10-19";

describe("adaptarPessoa: preferências de contacto e tipo de cliente", () => {
  it("lê contacto, hora, língua e o tipo de cliente", () => {
    const p = adaptarPessoa(fichaDb({ pessoa: pessoaDb({ preferred_contact: "whatsapp", preferred_time: "fim_do_dia", locale: "fr", tipo_cliente: "condominio", organization_kind: "condominio" }) }), HOJE);
    expect(p).toMatchObject({ contactoPreferido: "whatsapp", horaPreferida: "fim_do_dia", lingua: "fr", tipoCliente: "condominio" });
  });

  it("uma língua fora da lista (es) mantém-se: o seletor tem de a poder mostrar", () => {
    expect(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ locale: "es" }) }), HOJE).lingua).toBe("es");
  });

  it("contacto e hora desconhecidos ficam por preencher; sem os campos (ficha antiga) nada se inventa", () => {
    const estranho = adaptarPessoa(fichaDb({ pessoa: pessoaDb({ preferred_contact: "pombo", preferred_time: "noite" }) }), HOJE);
    expect(estranho.contactoPreferido).toBeUndefined();
    expect(estranho.horaPreferida).toBeUndefined();
    const antiga = adaptarPessoa(fichaDb(), HOJE);
    for (const c of ["contactoPreferido", "horaPreferida", "lingua", "tipoCliente"]) expect(antiga[c as keyof typeof antiga], c).toBeUndefined();
  });

  it("tipo_cliente desconhecido não conta; deduz-se de organization_kind e tipo quando falta", () => {
    expect(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ tipo_cliente: "x" }) }), HOJE).tipoCliente).toBeUndefined();
    expect(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ tipo: "organization", organization_kind: "condominio" }) }), HOJE).tipoCliente).toBe("condominio");
    expect(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ tipo: "organization" }) }), HOJE).tipoCliente).toBe("empresa");
    expect(adaptarPessoa(fichaDb({ pessoa: pessoaDb({ tipo: "person" }) }), HOJE).tipoCliente).toBe("particular");
  });

  it("as respostas da qualificação do negócio mais recente vêm com o snapshot", () => {
    const p = adaptarPessoa(fichaDb({
      pessoa: pessoaDb({ qualificacao_respostas: [{ seccao: "qualificacao", pergunta: "imovel", resposta: "moradia", tipo: "escolha_unica", escolhas: ["moradia"] }] }),
    }), HOJE);
    expect(p.qualificacaoGravada).toHaveLength(1);
    expect(p.qualificacaoGravada?.[0]).toMatchObject({ pergunta: "imovel", tipo: "escolha_unica", escolhas: ["moradia"] });
  });
});

describe("adaptarNegocios: pedido do cliente e qualificação por negócio", () => {
  const adaptar = (n: Parameters<typeof negocioDb>[0]) =>
    adaptarNegocios(fichaDb({ negocios: { total: 1, itens: [negocioDb(n)] } }), HOJE)[0] as NegocioMes;

  it("traz o pedido, a versão e as respostas gravadas", () => {
    const n = adaptar({
      pedido_cliente: "  Remodelar a cozinha ", versao_questionario: 7,
      qualificacao: [{ seccao: "qualificacao", pergunta: "orcCliente", resposta: "12.5", tipo: "numero", valor_numero: 12.5 }],
    });
    expect(n.pedidoCliente).toBe("Remodelar a cozinha");
    expect(n.versaoQuestionario).toBe(7);
    expect(n.qualificacaoGravada?.[0]).toMatchObject({ pergunta: "orcCliente", tipo: "numero", valorNumero: 12.5 });
  });

  it("sem os campos (ficha antiga) ou vazios, ficam por preencher", () => {
    const n = adaptar({ pedido_cliente: "   ", versao_questionario: null, qualificacao: null });
    expect(n.pedidoCliente).toBeUndefined();
    expect(n.versaoQuestionario).toBeUndefined();
    expect(n.qualificacaoGravada).toBeUndefined();
    expect(adaptar({}).pedidoCliente).toBeUndefined();
  });

  it("cada negócio traz a sua qualificação (não se misturam)", () => {
    const itens = [
      negocioDb({ id: "a", qualificacao: [{ seccao: "qualificacao", pergunta: "p1", resposta: "x" }] }),
      negocioDb({ id: "b", qualificacao: [] }),
    ];
    const [a, b] = adaptarNegocios(fichaDb({ negocios: { total: 2, itens } }), HOJE) as NegocioMes[];
    expect(a.qualificacaoGravada).toHaveLength(1);
    expect(b.qualificacaoGravada).toBeUndefined();
  });
});

describe("adaptarRegistos: origem da morada do levantamento", () => {
  const registos = (origem: unknown) => adaptarRegistos(fichaDb({
    levantamentos: seccaoDb([levantamentoDb({ morada: { rua: "R", codigo_postal: "1000-001", localidade: "L", andar: null, origem: origem as never } })]),
  })).levantamentos[0];

  it("entidade, manual e localizacao lêem-se; o resto ou a falta dão null", () => {
    expect(registos("entidade").moradaOrigem).toBe("entidade");
    expect(registos("manual").moradaOrigem).toBe("manual");
    expect(registos("localizacao").moradaOrigem).toBe("localizacao");
    expect(registos("outra").moradaOrigem).toBeNull();
    expect(registos(undefined).moradaOrigem).toBeNull();
  });

  it("o levantamento livre leva a origem", () => {
    const livre = levantamentoLivreDaFicha(fichaDb({
      levantamentos: seccaoDb([levantamentoDb({ morada: { rua: "R", codigo_postal: null, localidade: null, andar: null, origem: "localizacao" } })]),
    }));
    expect(livre?.moradaOrigem).toBe("localizacao");
  });
});
