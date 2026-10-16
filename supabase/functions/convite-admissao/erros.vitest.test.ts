/**
 * @vitest-environment node
 *
 * O mapa de erros da Edge Function do convite: da excepcao da base ao codigo
 * que sai para o browser. O sufixo `.vitest.` e o que faz o vitest apanha-lo.
 */
import { describe, expect, it } from "vitest";
import {
  CODIGOS_PUBLICOS,
  CODIGOS_RECUSA_SUBMISSAO,
  CODIGOS_V2,
  eCodigoV2,
  mapearErroRpc,
  statusDoCodigo,
} from "./erros.ts";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

describe("mapearErroRpc", () => {
  it("mapeia cada codigo da base pela mensagem", () => {
    for (const codigo of CODIGOS_PUBLICOS) {
      expect(mapearErroRpc({ message: codigo }).codigo).toBe(codigo);
    }
  });

  it("mapeia pelo SQLSTATE quando a mensagem nao e reconhecida", () => {
    expect(mapearErroRpc({ message: "outra coisa", code: "HRA04" }).codigo).toBe("convite_expirado");
    expect(mapearErroRpc({ message: "permission denied", code: "42501" }).codigo).toBe("insufficient_privilege");
    expect(mapearErroRpc({ message: "x", code: "HRA30" }).codigo).toBe("pessoa_nao_encontrada");
  });

  it("o BIC malformado mapeia pela mensagem e pelo SQLSTATE HRA18", () => {
    expect(mapearErroRpc({ message: "bic_invalido" })).toEqual({ codigo: "bic_invalido" });
    expect(mapearErroRpc({ message: "outra coisa", code: "HRA18" }).codigo).toBe("bic_invalido");
  });

  it("bic_invalido e codigo publico e codigo de recusa registado para o RH", () => {
    expect(CODIGOS_PUBLICOS).toContain("bic_invalido");
    expect(CODIGOS_RECUSA_SUBMISSAO).toContain("bic_invalido");
    expect(statusDoCodigo("bic_invalido")).toBe(400);
  });

  it("admissao_incompleta le os campos do DETAIL e descarta lixo", () => {
    const r = mapearErroRpc({ message: "admissao_incompleta", details: "niss,iban, nif ,Bad-Code,;drop,,data_nascimento" });
    expect(r).toEqual({ codigo: "admissao_incompleta", campos: ["niss", "iban", "nif", "data_nascimento"] });
  });

  it("aceita o formato legado 'admissao_incompleta: a, b'", () => {
    const r = mapearErroRpc({ message: "admissao_incompleta: niss, iban" });
    expect(r).toEqual({ codigo: "admissao_incompleta", campos: ["niss", "iban"] });
  });

  it("*_ja_existe recolhe so uuids validos", () => {
    const r = mapearErroRpc({ message: "nif_ja_existe", details: `${U1}, lixo,${U2},123` });
    expect(r).toEqual({ codigo: "nif_ja_existe", conflitos: [U1, U2] });
    expect(mapearErroRpc({ message: "niss_ja_existe", details: "nada" }).conflitos).toEqual([]);
  });

  it("os outros codigos nao trazem campos nem conflitos", () => {
    const r = mapearErroRpc({ message: "nif_invalido", details: `${U1}` });
    expect(r).toEqual({ codigo: "nif_invalido" });
  });

  it("desconhecido ou vazio -> erro_inesperado", () => {
    expect(mapearErroRpc({ message: "relation \"x\" does not exist", code: "42P01" }).codigo).toBe("erro_inesperado");
    expect(mapearErroRpc(null).codigo).toBe("erro_inesperado");
    expect(mapearErroRpc({}).codigo).toBe("erro_inesperado");
  });
});

describe("codigos de anexo", () => {
  const ANEXOS = [
    "anexo_tipo_invalido",
    "anexo_formato_invalido",
    "anexo_fotografia_formato",
    "anexo_demasiado_grande",
    "anexo_fotografia_demasiado_grande",
    "anexo_vazio",
    "anexo_maximo_ficheiros",
    "anexo_tipo_cheio",
    "anexo_limite_convite",
    "anexo_nao_encontrado",
    "anexo_nao_carregado",
    "anexo_estado_invalido",
    "anexo_falha_envio",
  ];

  it("todos sao codigos publicos", () => {
    for (const c of ANEXOS) expect(CODIGOS_PUBLICOS).toContain(c);
  });

  it("nenhum conta como recusa de submissao (nao gastam tentativas do convite)", () => {
    for (const c of ANEXOS) expect(CODIGOS_RECUSA_SUBMISSAO).not.toContain(c);
  });

  it("cada codigo tem o seu estado HTTP", () => {
    expect(statusDoCodigo("anexo_demasiado_grande")).toBe(413);
    expect(statusDoCodigo("anexo_fotografia_demasiado_grande")).toBe(413);
    expect(statusDoCodigo("anexo_nao_encontrado")).toBe(404);
    expect(statusDoCodigo("anexo_nao_carregado")).toBe(409);
    expect(statusDoCodigo("anexo_estado_invalido")).toBe(409);
    for (const c of ["anexo_formato_invalido", "anexo_fotografia_formato", "anexo_vazio", "anexo_tipo_invalido"]) {
      expect(statusDoCodigo(c)).toBe(422);
    }
    for (const c of ["anexo_maximo_ficheiros", "anexo_tipo_cheio", "anexo_limite_convite"]) {
      expect(statusDoCodigo(c)).toBe(409);
    }
    expect(statusDoCodigo("anexo_falha_envio")).toBe(400);
  });

  it("mapearErroRpc reconhece o codigo de anexo pela mensagem", () => {
    expect(mapearErroRpc({ message: "anexo_tipo_cheio" })).toEqual({ codigo: "anexo_tipo_cheio" });
  });
});

describe("statusDoCodigo", () => {
  it("devolve o estado HTTP por classe de codigo", () => {
    for (const c of ["convite_invalido", "convite_ja_usado", "convite_revogado", "convite_expirado", "convite_bloqueado"]) {
      expect(statusDoCodigo(c)).toBe(401);
    }
    expect(statusDoCodigo("nif_ja_existe")).toBe(409);
    expect(statusDoCodigo("niss_ja_existe")).toBe(409);
    expect(statusDoCodigo("demasiadas_tentativas")).toBe(429);
    expect(statusDoCodigo("insufficient_privilege")).toBe(403);
    expect(statusDoCodigo("erro_inesperado")).toBe(500);
    for (const c of ["nif_invalido", "admissao_incompleta", "pedido_invalido", "assinatura_obrigatoria", "validade_invalida"]) {
      expect(statusDoCodigo(c)).toBe(400);
    }
  });
});

describe("codigos da V2 (HRA31 a HRA39)", () => {
  const POR_SQLSTATE: Array<[string, string, number]> = [
    ["HRA31", "nao_encontrado", 404],
    ["HRA32", "processo_aberto", 409],
    ["HRA33", "organizacao_nao_empregadora", 403],
    ["HRA34", "token_invalido", 500],
    ["HRA35", "email_invalido", 400],
    ["HRA36", "token_repetido", 500],
    ["HRA37", "motivo_invalido", 400],
    ["HRA38", "estado_invalido", 409],
    ["HRA39", "dias_invalidos", 400],
    ["HRA40", "prazo_excedido", 409],
    ["HRA41", "limite_excedido", 429],
  ];

  it("mapeia cada um pela mensagem e pelo SQLSTATE, com o seu estado HTTP", () => {
    for (const [sqlstate, codigo, status] of POR_SQLSTATE) {
      expect(mapearErroRpc({ message: codigo }).codigo).toBe(codigo);
      expect(mapearErroRpc({ message: "texto qualquer", code: sqlstate }).codigo).toBe(codigo);
      expect(statusDoCodigo(codigo)).toBe(status);
      expect(eCodigoV2(codigo)).toBe(true);
      expect(CODIGOS_V2).toContain(codigo);
    }
  });

  it("nunca devolve campos nem conflitos, mesmo com DETAIL", () => {
    const r = mapearErroRpc({ message: "nao_encontrado", details: "Key (token_hash)=(abc) 11111111-1111-1111-1111-111111111111" });
    expect(r).toEqual({ codigo: "nao_encontrado" });
  });

  it("rascunho_chave_invalida e codigo da V2 com 400", () => {
    expect(eCodigoV2("rascunho_chave_invalida")).toBe(true);
    expect(statusDoCodigo("rascunho_chave_invalida")).toBe(400);
    expect(eCodigoV2("rascunho_valor_invalido")).toBe(true);
    expect(statusDoCodigo("rascunho_valor_invalido")).toBe(400);
  });

  it("nao entram em CODIGOS_PUBLICOS (o catalogo do browser compara-se com essa lista)", () => {
    for (const c of CODIGOS_V2) expect(CODIGOS_PUBLICOS as readonly string[]).not.toContain(c);
  });
});

describe("codigos da V3a (HRA42 a HRA47, HRA51 a HRA53, HRA56)", () => {
  const V3A: Array<[string, string, number]> = [
    ["HRA42", "otp_espera", 429],
    ["HRA43", "otp_limite_diario", 429],
    ["HRA44", "otp_expirado", 410],
    ["HRA45", "otp_bloqueado", 429],
    ["HRA46", "otp_invalido", 401],
    ["HRA47", "campo_bloqueado", 409],
    ["HRA51", "sessao_ausente", 401],
    ["HRA52", "sessao_expirada", 401],
    ["HRA53", "sessao_substituida", 401],
    ["HRA56", "link_indisponivel", 409],
  ];

  it("mapeia cada um pela mensagem e pelo SQLSTATE, com o seu estado HTTP", () => {
    for (const [sqlstate, codigo, status] of V3A) {
      expect(mapearErroRpc({ message: codigo }).codigo).toBe(codigo);
      expect(mapearErroRpc({ message: "texto qualquer", code: sqlstate }).codigo).toBe(codigo);
      expect(statusDoCodigo(codigo)).toBe(status);
      expect(eCodigoV2(codigo)).toBe(true);
      expect(CODIGOS_V2).toContain(codigo);
    }
  });

  it("os limites de OTP respondem 429, o mesmo que os limites de pedidos", () => {
    for (const c of ["otp_espera", "otp_limite_diario", "otp_bloqueado"]) expect(statusDoCodigo(c)).toBe(429);
  });

  it("os codigos so da Edge (sem SQLSTATE) tambem estao no catalogo, com o seu estado", () => {
    expect(statusDoCodigo("otp_indisponivel")).toBe(503);
    expect(statusDoCodigo("email_nao_enviado")).toBe(502);
    for (const c of ["otp_indisponivel", "email_nao_enviado"]) expect(eCodigoV2(c)).toBe(true);
  });

  it("nunca traz campos, conflitos nem o DETAIL", () => {
    const r = mapearErroRpc({ message: "sessao_expirada", details: "Key (sessao_hash)=(abc) 11111111-1111-1111-1111-111111111111" });
    expect(r).toEqual({ codigo: "sessao_expirada" });
  });

  it("nao entram em CODIGOS_PUBLICOS (o catalogo do browser compara-se com essa lista)", () => {
    for (const [, c] of V3A) expect(CODIGOS_PUBLICOS as readonly string[]).not.toContain(c);
  });
});
