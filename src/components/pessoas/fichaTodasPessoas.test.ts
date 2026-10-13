// A ficha vale para TODAS as pessoas de exemplo: a linha do cabeçalho, o estado dos 5 passos do percurso e as linhas
// de contacto saem dos mesmos componentes e funções partilhados, sem nada especial por pessoa.
import { describe, expect, it } from "vitest";
import { GRELHA } from "@/components/ficha-comum/LinhaContacto";
import { estadosPercurso } from "@/components/ficha-comum/estadosPercurso";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import { camposDeContacto } from "./ContactoFicha";
import { ETAPAS, indiceEtapa, passoDaPerdida } from "./etapaPessoa";
import { textoLinhaCabecalho } from "./formatoPessoas";
import { juntarPessoas } from "./juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";

const textos = pessoasPaginaTranslations.pt;
const t = (chave: string, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[chave] ?? chave);
const RESUMOS = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, "2026-10-13");

describe("a ficha de todas as pessoas de exemplo", () => {
  it("há as 17 pessoas", () => {
    expect(RESUMOS).toHaveLength(17);
  });

  it("a linha do cabeçalho nunca repete um segmento nem deixa um separador solto", () => {
    for (const r of RESUMOS) {
      const linha = textoLinhaCabecalho(t, r);
      const partes = linha.split(" · ");
      expect(new Set(partes).size, `${r.pessoa.nome}: ${linha}`).toBe(partes.length);
      expect(partes.every((p) => p.trim() !== ""), `${r.pessoa.nome}: ${linha}`).toBe(true);
      expect(partes[0]).toBe(t(`pessoasPagina.role.${r.papel}`));
      if (r.papel === "cliente") expect(partes[1]).not.toBe("Cliente");
    }
  });

  it("um cliente diz o papel uma só vez e uma lead leva a etapa", () => {
    const cliente = RESUMOS.find((r) => r.papel === "cliente");
    const lead = RESUMOS.find((r) => r.papel === "lead" && r.etapa === "nova");
    expect(cliente && textoLinhaCabecalho(t, cliente).split(" · ")[0]).toBe("Cliente");
    expect(cliente && textoLinhaCabecalho(t, cliente).match(/Cliente/g)).toHaveLength(1);
    expect(lead && textoLinhaCabecalho(t, lead).startsWith("Lead · Por contactar")).toBe(true);
  });

  it("sem localidade nem distrito a linha acaba na etapa, sem separador solto", () => {
    const r = RESUMOS[0];
    const sem = { ...r, pessoa: { ...r.pessoa, morada: undefined, distrito: undefined } };
    expect(textoLinhaCabecalho(t, sem as typeof r)).not.toMatch(/·\s*$/);
  });

  it("o percurso: cliente com 5 feitos; lead com feitos, atual e por fazer; perdida com feitos, perdido e fora de alcance", () => {
    for (const r of RESUMOS) {
      const total = ETAPAS.length;
      const perdida = r.pessoa.perdida ? passoDaPerdida(r) : null;
      const estados = estadosPercurso(total, indiceEtapa(r.etapa), perdida, r.papel === "cliente");
      const nome = r.pessoa.nome;
      if (r.papel === "cliente") {
        expect(estados, nome).toEqual(Array(total).fill("feito"));
      } else if (perdida !== null) {
        expect(estados.slice(0, perdida), nome).toEqual(Array(perdida).fill("feito"));
        expect(estados[perdida], nome).toBe("perdido");
        expect(estados.slice(perdida + 1), nome).toEqual(Array(total - perdida - 1).fill("foraAlcance"));
      } else {
        const atual = indiceEtapa(r.etapa);
        expect(estados.slice(0, atual), nome).toEqual(Array(atual).fill("feito"));
        expect(estados[atual], nome).toBe("atual");
        expect(estados.slice(atual + 1), nome).toEqual(Array(total - atual - 1).fill("porFazer"));
      }
    }
  });

  it("o contacto: só as linhas que existem, sem valores vazios, todas com a mesma altura mínima", () => {
    expect(GRELHA.ficha).toContain("min-h-11");
    for (const r of RESUMOS) {
      const { pessoa } = r;
      const campos = camposDeContacto(pessoa);
      const chaves = campos.map((c) => c.chave);
      expect(campos.every((c) => c.valor.trim() !== ""), pessoa.nome).toBe(true);
      expect(chaves.includes("telefone"), pessoa.nome).toBe(Boolean(pessoa.contacto.telefone));
      expect(chaves.includes("email"), pessoa.nome).toBe(Boolean(pessoa.contacto.email));
      expect(chaves.includes("morada"), pessoa.nome).toBe(Boolean(pessoa.morada));
      expect(chaves.includes("nif"), pessoa.nome).toBe(Boolean(pessoa.nif));
      expect(chaves.includes("empresa"), pessoa.nome).toBe(Boolean(pessoa.empresa));
      expect(new Set(chaves).size, pessoa.nome).toBe(chaves.length);
    }
  });
});
