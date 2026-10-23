import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TIPOS_PERGUNTA } from "@/hooks/pessoas/workflow/questionario";
import { CODIGOS_PROBLEMA } from "@/hooks/pessoas/workflow/questionarioEdicao";
import { pessoasErrosTranslations } from "./pessoasErros";
import { pessoasPaginaTranslations } from "./pessoasPagina";
import { pessoasWorkflowLevantamentoTranslations } from "./pessoasWorkflowLevantamento";

const { en, pt } = pessoasWorkflowLevantamentoTranslations;
const W = "pessoasPagina.real.workflow.";
const marcas = (texto: string): string[] => (texto.match(/\{\{?\w+\}?\}/g) ?? []).sort();

describe("traduções do separador «Levantamento» do Workflow de Pessoas", () => {
  it("pt e en têm exatamente as mesmas chaves, com os mesmos marcadores", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const chave of Object.keys(pt)) expect(marcas(en[chave]), chave).toEqual(marcas(pt[chave]));
  });

  it("todas têm o prefixo do Workflow, nenhuma está vazia, e nenhuma tem emoji", () => {
    expect(Object.keys(pt).length).toBeGreaterThan(60);
    for (const [chave, texto] of [...Object.entries(pt), ...Object.entries(en)]) {
      expect(chave.startsWith(W), chave).toBe(true);
      expect(texto.trim(), chave).not.toBe("");
      expect(texto, chave).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("a página junta estes textos nas duas línguas", () => {
    for (const chave of Object.keys(pt)) expect(pessoasPaginaTranslations.pt[chave]).toBe(pt[chave]);
    for (const chave of Object.keys(en)) expect(pessoasPaginaTranslations.en[chave]).toBe(en[chave]);
  });

  it("o separador chama-se «Levantamento» (D10)", () => {
    expect(pt[`${W}tabs.survey`]).toBe("Levantamento");
    expect(en[`${W}tabs.survey`]).toBeTruthy();
  });

  it("cada tipo de pergunta e cada problema de validação tem texto nas duas línguas", () => {
    for (const tipo of TIPOS_PERGUNTA) for (const l of [pt, en]) expect(l[`${W}lev.type.${tipo}`], tipo).toBeTruthy();
    for (const codigo of CODIGOS_PROBLEMA) for (const l of [pt, en]) expect(l[`${W}lev.problem.${codigo}`], codigo).toBeTruthy();
  });

  it("os erros do levantamento estão traduzidos; os que recusam a gravação dizem que nada foi guardado", () => {
    for (const l of [pt, en]) {
      for (const chave of ["ng008", "ng009", "ng009Tipo", "ng009Desaparecido", "ng021", "permission", "title"]) expect(l[`${W}lev.error.${chave}`], chave).toBeTruthy();
      for (const chave of ["problems.count", "conflict.gone.title", "conflict.gone.section", "conflict.gone.question", "conflict.gone.option"]) {
        expect(l[`${W}lev.${chave}`], chave).toBeTruthy();
      }
    }
    for (const chave of ["ng008", "ng009", "ng009Tipo", "ng009Desaparecido", "permission"]) {
      expect(pt[`${W}lev.error.${chave}`], chave).toMatch(/Nada foi guardado/);
      expect(en[`${W}lev.error.${chave}`], chave).toMatch(/Nothing was saved/);
    }
    expect(pt[`${W}lev.error.ng009Tipo`]).toMatch(/crie uma pergunta nova/i);
  });

  it("NG021 tem mensagem de código nas duas línguas de Pessoas (pt e en), sem emoji", () => {
    const chave = "pessoasPagina.erroNeg.ng021";
    expect(pessoasErrosTranslations.pt[chave]).toBeTruthy();
    expect(pessoasErrosTranslations.en[chave]).toBeTruthy();
    expect(pessoasErrosTranslations.pt[chave]).not.toBe(pessoasErrosTranslations.en[chave]);
    expect(pessoasErrosTranslations.pt[chave]).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("todas as chaves lev.* escritas por extenso no código existem em pt e en", () => {
    const raiz = join(process.cwd(), "src");
    const ficheiros = [
      ...readdirSync(join(raiz, "components/pessoas-workflow")).filter((f) => /^Levantamento.*\.tsx$/.test(f) && !/\.test\./.test(f)).map((f) => join(raiz, "components/pessoas-workflow", f)),
      join(raiz, "components/pessoas-workflow/WorkflowPessoasDialogo.tsx"),
      join(raiz, "hooks/pessoas/workflow/errosQuestionario.ts"),
    ];
    const usadas = new Set<string>();
    for (const f of ficheiros) {
      for (const m of readFileSync(f, "utf8").matchAll(/[`"'](?:\$\{[WE]\}|pessoasPagina\.real\.workflow\.)(lev\.[A-Za-z0-9.]+)[`"']/g)) usadas.add(m[1]);
    }
    expect(usadas.size).toBeGreaterThan(20);
    for (const chave of usadas) {
      expect(pt[`${W}${chave}`], chave).toBeTruthy();
      expect(en[`${W}${chave}`], chave).toBeTruthy();
    }
  });
});
