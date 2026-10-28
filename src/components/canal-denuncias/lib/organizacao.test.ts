// O canal é da ORGANIZAÇÃO ativa: os seletores por organização e por pessoa, a pessoa ligada à denúncia, o rascunho que não
// se mistura entre a página pública e a app, e a ausência de qualquer ligação a filial ou centro. Tudo em memória.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ORGANIZACAO_EXEMPLO_ID, ORGANIZACAO_EXEMPLO_NOME } from "@/components/rh-exemplo/dados/constantes";
import { criarEstadoInicial } from "@/components/rh-exemplo/dados/exemplo";
import { denunciasDeExemplo } from "../dados/exemplo";
import { denunciasDaOrganizacao, lerDenuncias, repor, submeter } from "../dados/loja";
import { ORG_ATIVA, ORGANIZACOES_EXEMPLO, OUTRA_ORG, PESSOA_EXEMPLO_ID, organizacaoPublica } from "../dados/organizacoes";
import { guardarRascunho, lerRascunho, limparRascunho } from "../dados/rascunho";
import { FORMULARIO_VAZIO, type DadosFormulario } from "./formulario";
import { contarPorOrigem, denunciasDaPessoa, filtrarPorOrganizacao, porConfirmar } from "./organizacao";
import { aplicarAlteracao, chaveRascunho } from "./pessoaLigada";

const pessoa = { id: PESSOA_EXEMPLO_ID, nome: "Sofia Rebelo", email: "sofia.rebelo@olyvia-exemplo.pt" };
const preenchido: DadosFormulario = {
  ...FORMULARIO_VAZIO, anonima: true, tipo: "fraude", descricao: "x".repeat(40), quando: "Ontem", boaFe: true,
};

beforeEach(() => repor());

describe("a organização ativa do canal é a do RH de exemplo", () => {
  it("o identificador, o nome e a pessoa de exemplo coincidem com os do RH de exemplo", () => {
    expect(ORG_ATIVA).toEqual({ id: ORGANIZACAO_EXEMPLO_ID, nome: ORGANIZACAO_EXEMPLO_NOME });
    expect(PESSOA_EXEMPLO_ID).toBe(criarEstadoInicial().minhaPessoaId);
  });
});

describe("seletores por organização e por pessoa", () => {
  const todas = denunciasDeExemplo();

  it("só as denúncias da organização dada: as 2 de outra organização ficam de fora, e vice-versa", () => {
    const ativas = filtrarPorOrganizacao(todas, ORG_ATIVA.id);
    const outras = filtrarPorOrganizacao(todas, OUTRA_ORG.id);
    expect(ativas).toHaveLength(12);
    expect(outras).toHaveLength(2);
    expect(ativas.every((d) => d.organizationId === ORG_ATIVA.id)).toBe(true);
    expect(outras.map((d) => d.codigo).sort()).toEqual(["DEN-2026-0007", "DEN-2026-0008"]);
    expect(filtrarPorOrganizacao(todas, "org-que-nao-existe")).toEqual([]);
  });

  it("o seletor da loja lê a loja, e uma denúncia nova entra só na organização dela", () => {
    expect(denunciasDaOrganizacao(ORG_ATIVA.id)).toHaveLength(12);
    submeter(preenchido, { organizationId: OUTRA_ORG.id });
    expect(denunciasDaOrganizacao(OUTRA_ORG.id)).toHaveLength(3);
    expect(denunciasDaOrganizacao(ORG_ATIVA.id)).toHaveLength(12);
    expect(lerDenuncias()).toHaveLength(15);
  });

  it("as da pessoa são só as identificadas, só da organização dada", () => {
    const dela = denunciasDaPessoa(todas, ORG_ATIVA.id, PESSOA_EXEMPLO_ID);
    expect(dela.map((d) => d.codigo).sort()).toEqual(["DEN-2026-0030", "DEN-2026-0031"]);
    expect(dela.map((d) => d.estado).sort()).toEqual(["concluida", "em_analise"]);
    expect(dela.every((d) => !d.anonima && d.identidade?.nome === "Sofia Rebelo")).toBe(true);
    expect(denunciasDaPessoa(todas, OUTRA_ORG.id, PESSOA_EXEMPLO_ID).map((d) => d.codigo)).toEqual(["DEN-2026-0007"]);
    expect(denunciasDaPessoa(todas, ORG_ATIVA.id, "p-outra")).toEqual([]);
  });

  it("uma anónima nunca fica ligada à pessoa, mesmo que o formulário venha com a pessoa", () => {
    submeter({ ...preenchido, anonima: true, nome: "Sofia Rebelo" }, { organizationId: ORG_ATIVA.id, pessoaId: PESSOA_EXEMPLO_ID });
    submeter({ ...preenchido, anonima: false, nome: "Sofia Rebelo" }, { organizationId: ORG_ATIVA.id, pessoaId: PESSOA_EXEMPLO_ID });
    const dela = denunciasDaPessoa(lerDenuncias(), ORG_ATIVA.id, PESSOA_EXEMPLO_ID);
    expect(dela).toHaveLength(3);
    const anonimas = lerDenuncias().filter((d) => d.anonima);
    expect(anonimas.every((d) => d.pessoaId === null && d.identidade === null)).toBe(true);
  });

  it("as contagens por origem e as «por confirmar» batem com a lista", () => {
    const ativas = filtrarPorOrganizacao(todas, ORG_ATIVA.id);
    expect(contarPorOrigem(ativas)).toEqual({ todas: 12, anonimas: 5, identificadas: 7 });
    expect(porConfirmar(ativas)).toBe(2);
    expect(porConfirmar(filtrarPorOrganizacao(todas, OUTRA_ORG.id))).toBe(1);
    expect(contarPorOrigem([])).toEqual({ todas: 0, anonimas: 0, identificadas: 0 });
  });
});

describe("a organização da página pública", () => {
  it("vem do parâmetro ?org= e, sem ele ou com um desconhecido, é a organização de exemplo", () => {
    expect(organizacaoPublica(null)).toBe(ORG_ATIVA);
    expect(organizacaoPublica("nao-existe")).toBe(ORG_ATIVA);
    expect(organizacaoPublica(OUTRA_ORG.id)).toBe(OUTRA_ORG);
    expect(ORGANIZACOES_EXEMPLO.map((o) => o.id)).toEqual([ORG_ATIVA.id, OUTRA_ORG.id]);
  });
});

describe("a pessoa ligada ao formulário dentro da app", () => {
  it("identificada preenche o nome e o email da pessoa; voltar a anónima limpa tudo", () => {
    const identificada = aplicarAlteracao(FORMULARIO_VAZIO, { anonima: false }, pessoa);
    expect(identificada).toMatchObject({ anonima: false, nome: "Sofia Rebelo", email: "sofia.rebelo@olyvia-exemplo.pt" });
    const anonima = aplicarAlteracao({ ...identificada, telefone: "910", podemContactar: true }, { anonima: true }, pessoa);
    expect(anonima).toMatchObject({ anonima: true, nome: "", email: "", telefone: "", podemContactar: false });
  });

  it("não mexe na pessoa se o modo não mudou, e sem pessoa (página pública) nunca preenche nada", () => {
    const editado = aplicarAlteracao({ ...FORMULARIO_VAZIO, anonima: false, nome: "Outro nome" }, { anonima: false, email: "a@b.pt" }, pessoa);
    expect(editado).toMatchObject({ nome: "Outro nome", email: "a@b.pt" });
    expect(aplicarAlteracao(FORMULARIO_VAZIO, { anonima: false })).toMatchObject({ anonima: false, nome: "", email: "" });
    expect(aplicarAlteracao(FORMULARIO_VAZIO, { descricao: "texto" }, pessoa)).toMatchObject({ nome: "", descricao: "texto" });
  });

  it("o rascunho de dentro da app nunca aparece no formulário público (e vice-versa)", () => {
    const daApp = chaveRascunho(ORG_ATIVA.id, pessoa);
    guardarRascunho({ dados: { ...FORMULARIO_VAZIO, anonima: false, nome: "Sofia Rebelo", descricao: "Um texto a meio" }, passo: 1, chave: daApp });
    expect(lerRascunho(daApp)?.dados.descricao).toBe("Um texto a meio");
    expect(lerRascunho(chaveRascunho(ORG_ATIVA.id))).toBeNull();
    expect(lerRascunho()).toBeNull();
    limparRascunho();
    guardarRascunho({ dados: FORMULARIO_VAZIO, passo: 0, chave: chaveRascunho(ORG_ATIVA.id) });
    expect(lerRascunho(daApp)).toBeNull();
  });
});

describe("o rascunho nunca guarda quem é a pessoa (desenho do canal, 6.3: alterado de propósito a 28/10)", () => {
  it("guardar remove o modo (anónima ou identificada) e a identidade, e mantém o resto do que foi escrito", () => {
    guardarRascunho({
      dados: { ...FORMULARIO_VAZIO, anonima: false, nome: "Sofia Rebelo", email: "sofia@exemplo.pt", telefone: "910000000", podemContactar: true, soResponsavel: false, descricao: "Texto" },
      passo: 2,
    });
    expect(lerRascunho()?.dados).toMatchObject({
      anonima: null, nome: "", email: "", telefone: "", podemContactar: false, soResponsavel: true, descricao: "Texto",
    });
    expect(lerRascunho()?.passo).toBe(2);
    limparRascunho();
  });
});

describe("nenhuma ligação a filial ou centro de trabalho", () => {
  const SRC = join(process.cwd(), "src");
  const ficheiros = (pasta: string): string[] =>
    readdirSync(pasta).flatMap((n) => {
      const c = join(pasta, n);
      return statSync(c).isDirectory() ? ficheiros(c) : /\.tsx?$/.test(c) && !/\.test\.tsx?$/.test(c) ? [c] : [];
    });
  const semComentarios = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const codigo = ["components/canal-denuncias", "pages/canal-denuncias"].flatMap((p) => ficheiros(join(SRC, p)));

  it("o modelo e o código do canal não têm filial, centro nem local da estrutura de RH", () => {
    expect(codigo.length).toBeGreaterThan(40);
    const culpados = codigo.filter((f) => /\b(filial|filiais|centro de trabalho|centros de trabalho|filialId|localId|centroId)\b/i.test(semComentarios(readFileSync(f, "utf8"))));
    expect(culpados).toEqual([]);
  });

  it("nenhuma denúncia de exemplo tem campos de filial, centro ou local", () => {
    const chaves = new Set(denunciasDeExemplo().flatMap((d) => Object.keys(d)));
    expect([...chaves].filter((k) => /filial|centro|local/i.test(k))).toEqual([]);
    expect(chaves.has("organizationId")).toBe(true);
  });
});
