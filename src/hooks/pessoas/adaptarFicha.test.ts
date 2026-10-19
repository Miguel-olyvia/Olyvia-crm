import { describe, expect, it } from "vitest";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { adaptarFicha } from "./adaptarFicha";
import { adaptarResumo } from "./adaptarResumoPessoa";
import { agregadosDb, atividadeDb, contactoDb, fichaDb, negocioDb, pessoaDb, PESSOA_ID, seccaoDb } from "./fichaFabrica";
import type { ContratoDb } from "./fichaTipos";
import type { LinhaResumoDb } from "./listaPessoasTipos";

const HOJE = "2026-10-19";
const linha = (id: string, sobre: Partial<LinhaResumoDb>): LinhaResumoDb => ({
  entity_id: id, nome: "Ana", papel: "lead", lead_id: null, client_id: null, assigned_to: null, lead_status: null, closure_result: null,
  etapa: "nova", negocios_abertos: 0, negocios_ganhos: 0, negocios_perdidos: 0, fase_mais_avancada: null, pronto_a_ganhar: false,
  valor_em_jogo: null, ultimo_contacto_em: null, proxima_visita_em: null, ultima_visita_feita_em: null, ultimo_negocio_em: null,
  por_ligar_contactos: 0, por_ligar_visitas: 0, por_ligar_levantamentos: 0, chave_ordem: null, ha_mais: false, ...sobre,
});
const assinado: ContratoDb = { id: "k1", numero: "C-1", status: "signed", valor: 100, assinado_em: "2026-10-17T09:00:00Z", criado_em: "2026-10-16T09:00:00Z", tem_base: true };

describe("adaptarFicha: o que o ecrã recebe", () => {
  it("junta a pessoa, os registos, os negócios e a atividade num só resumo", () => {
    const { resumo, atividade, pessoas } = adaptarFicha(fichaDb({
      contactos: seccaoDb([contactoDb()]), atividade: seccaoDb([atividadeDb()]),
      negocios: { total: 1, itens: [negocioDb({ valor: 900 })] },
    }), HOJE);
    expect(resumo.pessoa.nome).toBe("Ana Lopes");
    expect(resumo.registos.contactos).toHaveLength(1);
    expect(resumo.negocios).toHaveLength(1);
    expect(resumo.emJogo).toBe(900);
    expect(atividade).toHaveLength(1);
    expect(pessoas.get(PESSOA_ID)).toBe(resumo.pessoa);
  });

  it("não muda a ficha de entrada", () => {
    const ficha = fichaDb({ negocios: { total: 1, itens: [negocioDb({ contratos: [assinado] })] }, contactos: seccaoDb([contactoDb()]) });
    const antes = JSON.stringify(ficha);
    adaptarFicha(ficha, HOJE);
    expect(JSON.stringify(ficha)).toBe(antes);
  });
});

describe("adaptarFicha: papel, etapa e abertos vêm da base", () => {
  it("um cliente sem nenhum negócio ganho continua cliente, com a etapa da base", () => {
    const { resumo } = adaptarFicha(fichaDb({ pessoa: pessoaDb({ papel: "cliente", etapa: "cliente", client_id: "c" }), lead: null }), HOJE);
    expect(resumo.papel).toBe("cliente");
    expect(resumo.etapa).toBe("cliente");
  });

  it("um negócio aberto com contrato assinado fica nos abertos e conta para o valor em jogo", () => {
    const { resumo } = adaptarFicha(fichaDb({
      pessoa: pessoaDb({ etapa: "qualificada" }),
      negocios: { total: 1, itens: [negocioDb({ valor: "1500.50", pronto_a_ganhar: true, contratos: [assinado] })] },
    }), HOJE);
    expect(resumo.abertos).toHaveLength(1);
    expect(resumo.abertos[0].id).toBe("n1");
    expect(resumo.emJogo).toBe(1500.5);
    expect(resumo.papel).toBe("lead");
    expect(resumo.etapa).toBe("qualificada");
  });

  it("um ganho e um perdido ficam nos históricos e fora dos abertos", () => {
    const { resumo } = adaptarFicha(fichaDb({
      negocios: { total: 2, itens: [negocioDb({ id: "g", estado: "ganho", ganho_em: "2026-09-10T09:00:00Z", valor: 10 }), negocioDb({ id: "p", estado: "perdido", perdido_em: "2026-08-10T09:00:00Z" })] },
    }), HOJE);
    expect(resumo.negocios).toHaveLength(2);
    expect(resumo.abertos).toEqual([]);
    expect(resumo.emJogo).toBe(0);
  });

  it("equivalência com a linha da Lista: mesma etapa, mesmo papel, mesmo valor e mesmos abertos", () => {
    const aberto = negocioDb({ valor: "1500.50", contratos: [assinado] });
    const { resumo } = adaptarFicha(fichaDb({
      pessoa: pessoaDb({ papel: "lead", etapa: "qualificada" }), negocios: { total: 1, itens: [aberto] },
      agregados: agregadosDb({ negocios: { abertos: 1, ganhos: 0, perdidos: 0 } }),
    }), HOJE);
    const daLista = adaptarResumo(linha(PESSOA_ID, { papel: "lead", etapa: "qualificada", negocios_abertos: 1, valor_em_jogo: "1500.50" }), HOJE);
    expect(resumo.etapa).toBe(daLista.etapa);
    expect(resumo.papel).toBe(daLista.papel);
    expect(resumo.emJogo).toBe(daLista.valorEmJogo);
    expect(resumo.abertos.length).toBe(daLista.abertos);
  });

  it("a etapa de uma pessoa encerrada vem da base e a encerrada passa para a pessoa", () => {
    const { resumo } = adaptarFicha(fichaDb({
      pessoa: pessoaDb({ etapa: "emContacto" }),
      lead: { id: "l", estado: "closed", aberta: false, encerramento: { resultado: "semInteresse", motivo: "preco", motivo_outro: null, em: "2026-10-15T09:00:00Z" } },
    }), HOJE);
    expect(resumo.etapa).toBe("emContacto");
    expect(resumo.pessoa.encerrada).toMatchObject({ resultado: "semInteresse", motivo: "preco" });
  });

  it("uma etapa desconhecida da base cai em «nova», sem rebentar", () => {
    expect(adaptarFicha(fichaDb({ pessoa: pessoaDb({ etapa: "xpto" }) }), HOJE).resumo.etapa).toBe("nova");
  });

  it("o negócio aberto traz o valorBase e o estadoReal para o resto do ecrã", () => {
    const { resumo } = adaptarFicha(fichaDb({ negocios: { total: 1, itens: [negocioDb({ valor: 700 })] } }), HOJE);
    const n = resumo.abertos[0] as NegocioMes;
    expect(n.valorBase).toBe(700);
    expect(n.estadoReal).toBe("aberto");
  });
});
