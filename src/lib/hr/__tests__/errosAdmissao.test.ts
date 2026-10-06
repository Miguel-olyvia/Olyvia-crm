import { describe, it, expect } from "vitest";
import {
  camposDeAdmissaoIncompleta,
  chaveDeErroAdmissao,
  CODIGOS_SEM_TEXTO_PROPRIO,
  codigoDeErroEdge,
  corpoDeErroEdge,
  mensagemErroAdmissao,
  motivoDoCodigo,
} from "../errosAdmissao";
import { CODIGOS_PUBLICOS } from "../../../../supabase/functions/convite-admissao/erros";
import { translations } from "@/translations/index";

/**
 * A amarra entre a Edge Function `convite-admissao` e o ecra: este e o UNICO
 * catalogo de erros do lado do cliente. Um codigo novo em `CODIGOS_PUBLICOS`
 * sem chave de traducao (nem excepcao explicita) faz isto falhar, em vez de
 * cair em silencio no texto generico.
 */
describe("contrato com CODIGOS_PUBLICOS da Edge Function convite-admissao", () => {
  const publicos: readonly string[] = CODIGOS_PUBLICOS;

  it.each(publicos.map((c) => [c]))("%s tem chave de traducao ou excepcao explicita", (codigo) => {
    const temChave = chaveDeErroAdmissao(codigo) !== null;
    const eExcepcao = CODIGOS_SEM_TEXTO_PROPRIO.includes(codigo);
    expect(temChave || eExcepcao).toBe(true);
    // Nao se pode estar nas duas listas: a excepcao some quando se escreve o texto.
    expect(temChave && eExcepcao).toBe(false);
  });

  it("as excepcoes sao codigos que a Edge Function emite (nada de excepcoes mortas)", () => {
    for (const codigo of CODIGOS_SEM_TEXTO_PROPRIO) expect(publicos).toContain(codigo);
  });

  it("todo o codigo com texto e um codigo que a Edge Function emite (nada de chaves mortas)", () => {
    const comTexto = [
      "assinatura_obrigatoria", "nif_ja_existe", "niss_ja_existe", "nif_invalido", "niss_invalido",
      "iban_invalido", "pais_invalido", "admissao_incompleta", "convite_invalido", "convite_ja_usado",
      "convite_revogado", "convite_expirado", "convite_bloqueado", "demasiadas_tentativas",
      "ficha_incompleta", "sem_sessao", "insufficient_privilege",
      "pessoa_nao_encontrada", "validade_invalida", "erro_inesperado",
    ];
    for (const codigo of comTexto) {
      expect(publicos).toContain(codigo);
      expect(chaveDeErroAdmissao(codigo)).not.toBeNull();
    }
    // Codigos que nenhuma migration nem a Edge Function emitem nao tem entrada.
    for (const morto of ["convite_substituido", "token_invalido", "anexo_formato_invalido", "anexos_demasiados", "fotografia_demasiado_grande"]) {
      expect(publicos).not.toContain(morto);
      expect(chaveDeErroAdmissao(morto)).toBeNull();
    }
  });

  it("cada chave de traducao usada existe em pt e en", () => {
    const tabela = translations as unknown as Record<string, Record<string, string>>;
    for (const codigo of publicos) {
      const entrada = chaveDeErroAdmissao(codigo);
      if (!entrada) continue;
      expect(tabela.pt?.[entrada.chave], `pt: ${entrada.chave}`).toBeTruthy();
      expect(tabela.en?.[entrada.chave], `en: ${entrada.chave}`).toBeTruthy();
    }
  });
});

/** Um `t` que devolve a chave com os parametros, para ver o que se pediu. */
const t = (chave: string, params?: Record<string, string | number>) =>
  params ? `${chave}|${JSON.stringify(params)}` : chave;

/** Um `t` que so conhece alguns rotulos de campo: o resto devolve a propria chave, como o `useTranslation`. */
const ROTULOS: Record<string, string> = {
  "hr.pendencias.campo.telefone_pessoal": "Telemovel",
  "hr.pendencias.campo.nif": "NIF",
  "hr.pendencias.campo.desconhecido": "Por identificar",
};
const tComRotulos = (chave: string, params?: Record<string, string | number>) =>
  params ? `${chave}|${JSON.stringify(params)}` : (ROTULOS[chave] ?? chave);

describe("chaveDeErroAdmissao", () => {
  const tabela: Array<[string, string]> = [
    ["assinatura_obrigatoria", "hr.convite.erro.assinatura"],
    ["nif_ja_existe", "hr.convite.erro.nifJaExiste"],
    ["niss_ja_existe", "hr.convite.erro.nissJaExiste"],
    ["nif_invalido", "hr.convite.erro.nifInvalido"],
    ["niss_invalido", "hr.convite.erro.nissInvalido"],
    ["iban_invalido", "hr.convite.erro.ibanInvalido"],
    ["pais_invalido", "hr.convite.erro.paisInvalido"],
    ["admissao_incompleta", "hr.convite.erro.faltaPreencher"],
    ["convite_invalido", "hr.convite.motivo.inexistente"],
    ["convite_ja_usado", "hr.convite.motivo.usado"],
    ["convite_revogado", "hr.convite.motivo.substituido"],
    ["convite_expirado", "hr.convite.motivo.expirado"],
    ["convite_bloqueado", "hr.convite.motivo.bloqueado"],
    ["demasiadas_tentativas", "hr.convite.motivo.demasiadasTentativas"],
    ["ficha_incompleta", "hr.acesso.erroFichaIncompleta"],
    ["sem_sessao", "friendlyError.sessionExpired"],
    ["insufficient_privilege", "friendlyError.forbidden"],
    ["pessoa_nao_encontrada", "hr.convite.erro.pessoaNaoEncontrada"],
    ["validade_invalida", "hr.convite.erro.validadeInvalida"],
    ["erro_inesperado", "hr.convite.erro.inesperado"],
  ];

  it.each(tabela)("%s -> %s", (codigo, chave) => {
    expect(chaveDeErroAdmissao(codigo)?.chave).toBe(chave);
  });

  it("pedido_invalido e desconhecidos nao tem texto proprio", () => {
    expect(chaveDeErroAdmissao("pedido_invalido")).toBeNull();
    expect(chaveDeErroAdmissao("qualquer_coisa")).toBeNull();
  });
});

describe("mensagemErroAdmissao", () => {
  it("um codigo desconhecido nunca devolve o proprio codigo", () => {
    expect(mensagemErroAdmissao(t, { error: "qualquer_coisa_estranha" })).toBe("hr.convite.erroSubmeter");
    expect(mensagemErroAdmissao(t, { error: "pedido_invalido" })).toBe("hr.convite.erroSubmeter");
    expect(mensagemErroAdmissao(t, {})).toBe("hr.convite.erroSubmeter");
  });

  it("erro_inesperado, pessoa_nao_encontrada e validade_invalida tem texto proprio", () => {
    expect(mensagemErroAdmissao(t, { error: "erro_inesperado" })).toBe("hr.convite.erro.inesperado");
    expect(mensagemErroAdmissao(t, { error: "pessoa_nao_encontrada" })).toBe("hr.convite.erro.pessoaNaoEncontrada");
    expect(mensagemErroAdmissao(t, { error: "validade_invalida" })).toBe("hr.convite.erro.validadeInvalida");
  });

  it("admissao_incompleta com campos[] junta os rotulos de cada campo", () => {
    const mensagem = mensagemErroAdmissao(tComRotulos, {
      error: "admissao_incompleta",
      campos: ["telefone_pessoal", "nif"],
    });
    expect(mensagem).toBe('hr.convite.erro.faltaPreencher|{"campos":"Telemovel, NIF"}');
  });

  it("admissao_incompleta com um campo desconhecido nunca mostra a chave crua", () => {
    const mensagem = mensagemErroAdmissao(tComRotulos, {
      error: "admissao_incompleta",
      campos: ["campo_inventado_no_servidor", "nif"],
    });
    expect(mensagem).toBe('hr.convite.erro.faltaPreencher|{"campos":"Por identificar, NIF"}');
    expect(mensagem).not.toContain("hr.pendencias.campo.campo_inventado_no_servidor");
  });

  it("admissao_incompleta no formato antigo da o mesmo resultado", () => {
    const antigo = mensagemErroAdmissao(tComRotulos, { error: "admissao_incompleta: telefone_pessoal, nif" });
    const novo = mensagemErroAdmissao(tComRotulos, { error: "admissao_incompleta", campos: ["telefone_pessoal", "nif"] });
    expect(antigo).toBe(novo);
  });

  it("admissao_incompleta sem campos nao inventa uma lista vazia", () => {
    expect(mensagemErroAdmissao(t, { error: "admissao_incompleta" })).toBe("hr.convite.erroSubmeter");
  });

  it("um motivo de convite devolve o texto do motivo", () => {
    expect(mensagemErroAdmissao(t, { error: "convite_expirado" })).toBe("hr.convite.motivo.expirado");
  });
});

describe("camposDeAdmissaoIncompleta", () => {
  it("usa campos[] quando existe, ignorando o que nao for texto", () => {
    expect(camposDeAdmissaoIncompleta({ error: "admissao_incompleta", campos: ["a", 1, "", "b"] })).toEqual([
      "a",
      "b",
    ]);
  });

  it("le o formato antigo e descarta lixo", () => {
    expect(camposDeAdmissaoIncompleta({ error: "admissao_incompleta: a, b, ../c" })).toEqual(["a", "b"]);
  });

  it("outro erro nao tem campos", () => {
    expect(camposDeAdmissaoIncompleta({ error: "nif_invalido" })).toEqual([]);
  });
});

describe("motivoDoCodigo", () => {
  it.each([
    ["convite_ja_usado", "usado"],
    ["convite_revogado", "substituido"],
    ["convite_expirado", "expirado"],
    ["convite_bloqueado", "bloqueado"],
    ["demasiadas_tentativas", "demasiadasTentativas"],
    ["convite_invalido", "inexistente"],
    ["desconhecido", "inexistente"],
    [null, "inexistente"],
  ] as const)("%s -> %s", (codigo, motivo) => {
    expect(motivoDoCodigo(codigo)).toBe(motivo);
  });
});

describe("codigoDeErroEdge / corpoDeErroEdge", () => {
  it("le o codigo de data.error", async () => {
    expect(await codigoDeErroEdge(null, { error: "convite_expirado" })).toBe("convite_expirado");
  });

  it("le o codigo do corpo da Response em error.context (HTTP 401)", async () => {
    const error = {
      name: "FunctionsHttpError",
      context: new Response(JSON.stringify({ error: "convite_expirado" }), { status: 401 }),
    };
    expect(await codigoDeErroEdge(error, null)).toBe("convite_expirado");
  });

  it("devolve o corpo inteiro, com campos[]", async () => {
    const error = {
      context: new Response(JSON.stringify({ error: "admissao_incompleta", campos: ["nif"] }), { status: 400 }),
    };
    expect(await corpoDeErroEdge(error, null)).toEqual({ error: "admissao_incompleta", campos: ["nif"] });
  });

  it("deixa a Response intacta para quem a quiser ler depois", async () => {
    const context = new Response(JSON.stringify({ error: "convite_expirado" }), { status: 401 });
    await codigoDeErroEdge({ context }, null);
    expect(context.bodyUsed).toBe(false);
  });

  it("sem nada legivel devolve null", async () => {
    expect(await codigoDeErroEdge(null, null)).toBeNull();
    expect(await codigoDeErroEdge(new Error("falhou"), null)).toBeNull();
    expect(await codigoDeErroEdge({ context: new Response("nao e json", { status: 500 }) }, null)).toBeNull();
  });
});
