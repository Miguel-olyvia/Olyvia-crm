/**
 * Os textos novos do pipeline de admissoes e da revisao (P4 da V3a): TODAS as chaves que o codigo usa existem em
 * portugues e em ingles, nao vazias e diferentes da propria chave; os textos com parametros mantem-nos; o portugues
 * leva acentos; e o codigo nao depende do prototipo nem guarda dados sensiveis em sitios onde nao deve.
 *
 * A lista de chaves sai do codigo-fonte (nao de uma lista escrita a mao): quem esquecesse uma chave veria
 * «rhAdm.pipeline.vazio» no ecra. As chaves dinamicas (`rhAdm.grupo.${id}`, os passos da faixa, as acoes do historico)
 * expandem-se pelos dominios reais exportados pelo proprio codigo. es, fr e de caem para o ingles (`useTranslation`).
 */
import { describe, expect, it } from "vitest";
import { translations } from "@/translations/index";
import { GRUPOS_PIPELINE, PASSOS_FAIXA } from "@/lib/hr/admissaoPipeline";
import { ACOES_EVENTO, ATORES_EVENTO } from "@/lib/hr/admissaoRevisao";

const FONTES = import.meta.glob(
  [
    "../admissao/*.{ts,tsx}",
    "../PessoaConviteAdmissaoEstado.tsx",
    "../../../hooks/useAdmissoesPipeline.ts",
    "../../../hooks/useRevisaoAdmissao.ts",
    "../../../hooks/useAcoesConviteAdmissao.ts",
    "../../../lib/hr/admissaoPipeline.ts",
    "../../../lib/hr/admissaoRevisao.ts",
    "../../../lib/hr/errosAdmissao.ts",
    "../../../pages/Pessoas.tsx",
    "!../**/*.test.*",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const tabela = translations as unknown as Record<string, Record<string, string>>;

const COMENTARIOS = /\/\*[\s\S]*?\*\/|(^|[^:"'`])\/\/[^\n]*/g;
const PADRAO = /["'`]((?:rhAdm|hr\.convite)\.[A-Za-z0-9_.]*[A-Za-z0-9_])["'`]/g;

function chavesDe(codigo: string): string[] {
  return [...codigo.replace(COMENTARIOS, "$1").matchAll(PADRAO)].map((m) => m[1]);
}

/** Um prefixo de chaves dinamicas: nao existe sozinho, existem `<prefixo>.<valor>`. */
const ePrefixo = (chave: string): boolean =>
  !tabela.en[chave] && Object.keys(tabela.en).some((k) => k.startsWith(`${chave}.`));

const comPrefixo = (prefixo: string, valores: readonly string[]): string[] => valores.map((v) => `${prefixo}.${v}`);

const DINAMICAS: string[] = [
  ...comPrefixo("rhAdm.grupo", GRUPOS_PIPELINE.map((g) => g.id)),
  ...comPrefixo("rhAdm.faixa", PASSOS_FAIXA),
  ...comPrefixo("rhAdm.faixa", ["feito", "atual", "falta", "rejeitado"]),
  ...comPrefixo("rhAdm.historico.acao", [...ACOES_EVENTO, "desconhecida"]),
  ...comPrefixo("rhAdm.historico.ator", ATORES_EVENTO),
];

const LITERAIS = [...new Set(Object.values(FONTES).flatMap(chavesDe))].filter((c) => !ePrefixo(c));
const TODAS = [...new Set([...LITERAIS, ...DINAMICAS])].sort();
/** So as chaves que esta etapa cria: as outras ja tem os seus testes. */
const NOVAS = TODAS.filter((c) => c.startsWith("rhAdm.") || c.startsWith("hr.convite.reenviar.") || ["hr.convite.erro.linkIndisponivel", "hr.convite.erro.emailNaoEnviado"].includes(c));

describe("traducoes do pipeline de admissoes e da revisao (pt e en)", () => {
  it("le as fontes e apanha as chaves novas (a pesquisa nao esta vazia)", () => {
    expect(Object.keys(FONTES).length).toBeGreaterThanOrEqual(10);
    expect(LITERAIS).toEqual(
      expect.arrayContaining([
        "rhAdm.tab",
        "rhAdm.pipeline.vazio",
        "rhAdm.revisao.titulo",
        "rhAdm.acao.proximaFase",
        "hr.convite.reenviar.botao",
        "hr.convite.erro.linkIndisponivel",
      ]),
    );
    expect(LITERAIS.length).toBeGreaterThan(40);
  });

  it("as chaves dinamicas cobrem os 30 eventos do historico da base", () => {
    expect(ACOES_EVENTO).toHaveLength(30);
    expect(new Set(ACOES_EVENTO).size).toBe(30);
  });

  it.each(["pt", "en"])("%s tem todas as chaves, nenhuma vazia nem igual a chave", (lingua) => {
    const emFalta = TODAS.filter((c) => !tabela[lingua][c] || tabela[lingua][c] === c);
    expect(emFalta, `${lingua}: por traduzir`).toEqual([]);
  });

  it("o ingles nao e o portugues copiado (salvo siglas)", () => {
    const iguais = NOVAS.filter((c) => tabela.pt[c] && tabela.pt[c] === tabela.en[c] && !/^(NISS|IBAN)$/.test(tabela.pt[c]));
    expect(iguais).toEqual([]);
  });

  it.each(["pt", "en"])("%s: os textos com parametros mantem-nos", (lingua) => {
    const esperados: Record<string, string[]> = {
      "rhAdm.pipeline.resumo": ["n"],
      "rhAdm.cartao.abrirFicha": ["nome"],
      "rhAdm.cartao.reverRotulo": ["nome"],
      "rhAdm.cartao.submetidoEm": ["data"],
      "rhAdm.cartao.devolvidaEm": ["data"],
      "rhAdm.revisao.titulo": ["nome"],
      "rhAdm.revisao.naFicha": ["valor"],
      "rhAdm.revisao.revelarRotulo": ["campo"],
      "rhAdm.revisao.ocultarRotulo": ["campo"],
      "rhAdm.revisao.revelado": ["campo"],
      "hr.convite.reenviar.sucesso": ["email"],
    };
    for (const [chave, parametros] of Object.entries(esperados)) {
      for (const p of parametros) expect(tabela[lingua][chave], `${lingua}/${chave}`).toContain(`{{${p}}}`);
    }
  });

  it("os textos centrais dizem o que prometem (pt e en)", () => {
    expect(tabela.pt["rhAdm.tab"]).toBe("Pipeline de admissões");
    expect(tabela.en["rhAdm.tab"]).toBe("Admissions pipeline");
    expect(tabela.pt["rhAdm.acao.proximaFase"]).toBe("Disponível na próxima fase.");
    expect(tabela.en["rhAdm.acao.proximaFase"]).toMatch(/next phase/i);
    expect(tabela.pt["hr.convite.reenviar.botao"]).toBe("Reenviar convite");
    expect(tabela.en["hr.convite.reenviar.botao"]).toBe("Resend invitation");
  });
});

describe("o portugues leva acentos", () => {
  const NOVAS_PT = NOVAS.filter((c) => tabela.pt[c]);
  /** Palavras que em portugues correto levam acento ou cedilha (a forma sem ele e quase sempre erro de escrita). */
  const SEM_ACENTO =
    /\b(admissao|admissoes|nao|ja|pagina|acao|acoes|proxima|proximo|numero|historico|funcao|permissao|sensivel|sensiveis|confirmacao|codigo|comentarios|comentario|disponivel|apos|ate|obrigatorio|organizacao|submissao|devolucao|informacao|situacao|ultima|ultimo|genero|portugues|beneficio)\b/gi;

  it("nenhum texto novo usa uma forma sem acento onde ele e obrigatorio", () => {
    const culpados = NOVAS_PT.flatMap((chave) =>
      [...tabela.pt[chave].matchAll(SEM_ACENTO)]
        .map((m) => `${chave}: «${m[0].toLowerCase()}»`),
    );
    expect(culpados).toEqual([]);
  });

  it("os textos que tem de ter acento tem-no", () => {
    expect(tabela.pt["rhAdm.revisao.sensiveis"]).toContain("í");
    expect(tabela.pt["rhAdm.acao.proximaFase"]).toContain("í");
    expect(tabela.pt["rhAdm.faixa.aprovacao"]).toContain("ç");
    expect(tabela.pt["rhAdm.faixa.aprovacao"]).toContain("ã");
  });
});

describe("o codigo do pipeline e da revisao", () => {
  const juntar = (filtro: (ficheiro: string) => boolean) =>
    Object.entries(FONTES).filter(([f]) => filtro(f)).map(([, c]) => c).join("\n");
  const SEM_COMENTARIOS = (codigo: string) => codigo.replace(COMENTARIOS, "$1");

  it.each(["rh-exemplo", "rhExemplo", "SeloExemplo", "agoraExemplo", "dados/loja", "hojeExemplo"])(
    "nenhum ficheiro menciona «%s»",
    (termo) => {
      const culpados = Object.entries(FONTES).filter(([, c]) => c.includes(termo)).map(([f]) => f);
      expect(culpados).toEqual([]);
    },
  );

  it("a revisao nao usa armazenamento do browser, consola nem toast (o NISS e o IBAN nao podem sair por la)", () => {
    const codigo = SEM_COMENTARIOS(juntar((f) => /Revisao|revisao|CampoSensivel/.test(f)));
    expect(codigo.length).toBeGreaterThan(500);
    for (const proibido of ["localStorage", "sessionStorage", "console.", "toast", "document.cookie", "history.pushState"]) {
      expect(codigo, proibido).not.toContain(proibido);
    }
  });

  it("nenhum ficheiro do pipeline le `error.details` nem poe a mensagem crua da base no ecra", () => {
    const codigo = SEM_COMENTARIOS(
      juntar((f) => /admissao\/|useAdmissoesPipeline|useRevisaoAdmissao|admissaoPipeline|admissaoRevisao/.test(f)),
    );
    expect(codigo).not.toMatch(/\.details/);
    expect(codigo).not.toMatch(/error\.message|erro\.message/);
  });

  it("nenhum ficheiro lista os valores do NISS ou do IBAN por chave de rascunho (so `{preenchido}`)", () => {
    const codigo = SEM_COMENTARIOS(juntar((f) => /useRevisaoAdmissao|admissaoRevisao/.test(f)));
    expect(codigo).not.toMatch(/niss_valor|iban_valor|\.valor\b.*niss/i);
  });
});
