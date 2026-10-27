// O registo em texto dos passos de documento do negócio (orçamento, proposta, contrato): estes passos não têm ecrã de passo (fazem-se em diálogos por
// cima do guia), por isso, numa fase feita, é a única leitura. Com os textos reais em português. Substitui os testes do resumo em lista, que saiu.
import { describe, expect, it } from "vitest";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import { dadosDoGuia, detalhesDoGuia } from "./guiaDados";
import { negocioBase, pessoaBase } from "./fabricaTestes";

const textos = pessoasPaginaTranslations.pt as Record<string, string>;
const t = (chave: string, params?: Record<string, string | number>): string =>
  Object.entries(params ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), textos[chave] ?? chave);

const VAZIOS = { contactos: [], visitas: [], levantamentos: [] };

describe("detalhesDoGuia: documentos do negócio, em texto", () => {
  it("o orçamento diz quantos há e o valor do escolhido", () => {
    const n = negocioBase("n", { orcamentos: [{ id: "o1", valor: 1500, escolhido: true }, { id: "o2", valor: 900, escolhido: false }] });
    const d = detalhesDoGuia(t, pessoaBase(), VAZIOS, n);
    expect(d.orcamento).toMatch(/^Orçamentos: 2 · Valor do orçamento escolhido: 1\s?500,00\s€$/);
  });

  it("sem orçamento escolhido só diz quantos há; sem orçamentos não há registo", () => {
    const sem = detalhesDoGuia(t, pessoaBase(), VAZIOS, negocioBase("n", { orcamentos: [{ id: "o1", valor: 900, escolhido: false }] }));
    expect(sem.orcamento).toBe("Orçamentos: 1");
    expect(detalhesDoGuia(t, pessoaBase(), VAZIOS, negocioBase("n")).orcamento).toBeUndefined();
  });

  it("proposta e contrato dizem o estado; a resposta e a assinatura só quando aconteceram", () => {
    const pendente = detalhesDoGuia(t, pessoaBase(), VAZIOS, negocioBase("n", { proposta: { estado: "enviada" }, contrato: { estado: "pendente" } }));
    expect(pendente.propostaEnviada).toBe("Estado da proposta: Enviada");
    expect(pendente.contratoCriado).toBe("Estado do contrato: Por assinar");
    expect(pendente.respostaCliente).toBeUndefined();
    expect(pendente.contratoAssinado).toBeUndefined();
    const feito = detalhesDoGuia(t, pessoaBase(), VAZIOS, negocioBase("n", { proposta: { estado: "aceite" }, contrato: { estado: "assinado" } }));
    expect(feito.respostaCliente).toBe("Aceite");
    expect(feito.contratoAssinado).toBe("Assinado");
  });

  it("sem negócio não há registo de documentos", () => {
    const d = detalhesDoGuia(t, pessoaBase(), VAZIOS);
    for (const id of ["orcamento", "propostaCriada", "propostaEnviada", "respostaCliente", "contratoCriado", "contratoAssinado"]) expect(d[id]).toBeUndefined();
  });
});

describe("dadosDoGuia: já não leva resumos em lista", () => {
  it("com o tradutor leva só os detalhes em texto", () => {
    const dados = dadosDoGuia(pessoaBase("a", { nome: "Rui" }), VAZIOS, t, negocioBase("n", { proposta: { estado: "enviada" } }));
    expect(dados.detalhes?.quemPede).toBe("Rui");
    expect(dados.detalhes?.propostaCriada).toBe("Estado da proposta: Enviada");
    expect("resumos" in dados).toBe(false);
  });
});
