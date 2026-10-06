/**
 * Pre-verificacao local dos anexos do convite. O servidor e a verdade (confere
 * a assinatura real do ficheiro); isto so poupa um envio que ia ser recusado.
 * Os limites tem de ser IGUAIS aos da Edge Function e da base.
 */
import { describe, expect, it } from "vitest";
import { LIMITES as LIMITES_EDGE, TIPOS_ANEXO as TIPOS_ANEXO_EDGE } from "../../../../supabase/functions/convite-admissao/anexos";
import { migrationPorVersao } from "./migrationSql";
import {
  LIMITES_ANEXOS,
  TIPOS_ANEXO_CONVITE,
  chaveDeErroAnexo,
  contarPorTipo,
  formatarTamanho,
  verificarLimitesDeContagem,
  validarFicheiroLocal,
  type AnexoConvite,
} from "../conviteAnexos";

const MB = 1024 * 1024;
const ficheiro = (type: string, size: number) => ({ type, size });

describe("LIMITES_ANEXOS", () => {
  it("espelham os limites da base e da Edge Function", () => {
    expect(LIMITES_ANEXOS.maxActivos).toBe(4);
    expect(LIMITES_ANEXOS.porTipo).toEqual({
      cartao_cidadao: 2,
      comprovativo_iban: 1,
      fotografia: 1,
    });
    expect(LIMITES_ANEXOS.tamanhoMaximoBytes).toBe(10485760);
    expect(LIMITES_ANEXOS.fotografiaMaximaBytes).toBe(5242880);
  });
});

// O mesmo numero vive em quatro sitios (cliente, Edge, migration das RPCs,
// tabela). Estes testes leem os outros tres e comparam: se um sobe e os outros
// ficam, o ecra recusava (ou deixava passar) o que o servidor decide
// diferente. Excepcao deliberada a "nao testar SQL por texto": e paridade de
// constantes, nao comportamento.
describe("LIMITES_ANEXOS: paridade com a Edge Function e com as migrations", () => {
  it("sao iguais aos de supabase/functions/convite-admissao/anexos.ts", () => {
    expect(LIMITES_ANEXOS.maxActivos).toBe(LIMITES_EDGE.maxActivos);
    expect(LIMITES_ANEXOS.porTipo).toEqual(LIMITES_EDGE.porTipo);
    expect(LIMITES_ANEXOS.tamanhoMaximoBytes).toBe(LIMITES_EDGE.tamanhoMaxBytes);
    expect(LIMITES_ANEXOS.fotografiaMaximaBytes).toBe(LIMITES_EDGE.fotografiaMaxBytes);
  });

  it("os tipos do cliente sao os da Edge Function", () => {
    expect([...TIPOS_ANEXO_CONVITE]).toEqual([...TIPOS_ANEXO_EDGE]);
  });

  it("as RPCs de reservar e ligar usam os mesmos tamanhos e o mesmo maximo de activos", () => {
    const rpcs = migrationPorVersao("20261210060000");
    const bytes = [...rpcs.matchAll(/c_max_bytes\s+constant bigint\s*:=\s*(\d+);/g)].map((m) => Number(m[1]));
    const foto = [...rpcs.matchAll(/c_max_bytes_foto\s+constant bigint\s*:=\s*(\d+);/g)].map((m) => Number(m[1]));
    const activos = [...rpcs.matchAll(/c_max_activos\s+constant integer\s*:=\s*(\d+);/g)].map((m) => Number(m[1]));
    expect(bytes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(bytes)).toEqual(new Set([LIMITES_ANEXOS.tamanhoMaximoBytes]));
    expect(new Set(foto)).toEqual(new Set([LIMITES_ANEXOS.fotografiaMaximaBytes]));
    expect(new Set(activos)).toEqual(new Set([LIMITES_ANEXOS.maxActivos]));
  });

  it("as RPCs de reservar e ligar usam os mesmos limites por tipo", () => {
    const rpcs = migrationPorVersao("20261210060000");
    const blocos = [...rpcs.matchAll(/v_limite_tipo\s*:=\s*CASE[\s\S]*?END;/g)].map((m) => m[0]);
    expect(blocos.length).toBeGreaterThanOrEqual(2);
    for (const bloco of blocos) {
      for (const [tipo, limite] of Object.entries(LIMITES_ANEXOS.porTipo)) {
        expect(bloco).toMatch(new RegExp(`'${tipo}'\\s+THEN\\s+${limite}\\b`));
      }
    }
  });
});

describe("validarFicheiroLocal", () => {
  it("aceita pdf, png e jpeg ate 10 MB, inclusive", () => {
    expect(validarFicheiroLocal("cartao_cidadao", ficheiro("application/pdf", 10 * MB))).toBeNull();
    expect(validarFicheiroLocal("comprovativo_iban", ficheiro("image/png", 1))).toBeNull();
    expect(validarFicheiroLocal("cartao_cidadao", ficheiro("image/jpeg", 2 * MB))).toBeNull();
  });

  it("recusa 10 MB mais um byte", () => {
    expect(validarFicheiroLocal("cartao_cidadao", ficheiro("application/pdf", 10 * MB + 1))).toBe(
      "anexo_demasiado_grande",
    );
  });

  it("a fotografia aceita ate 5 MB, inclusive, e recusa 5 MB mais um byte", () => {
    expect(validarFicheiroLocal("fotografia", ficheiro("image/jpeg", 5 * MB))).toBeNull();
    expect(validarFicheiroLocal("fotografia", ficheiro("image/png", 5 * MB + 1))).toBe(
      "anexo_fotografia_demasiado_grande",
    );
  });

  it("a fotografia so aceita png ou jpeg (pdf recusado)", () => {
    expect(validarFicheiroLocal("fotografia", ficheiro("application/pdf", 1000))).toBe(
      "anexo_fotografia_formato",
    );
  });

  it.each(["image/gif", "image/webp", "image/heic", "text/plain", ""])(
    "recusa o formato %s",
    (mime) => {
      expect(validarFicheiroLocal("cartao_cidadao", ficheiro(mime, 1000))).toBe(
        "anexo_formato_invalido",
      );
    },
  );

  it("recusa ficheiros vazios e tamanhos negativos", () => {
    expect(validarFicheiroLocal("cartao_cidadao", ficheiro("application/pdf", 0))).toBe("anexo_vazio");
    expect(validarFicheiroLocal("cartao_cidadao", ficheiro("application/pdf", -5))).toBe("anexo_vazio");
  });

  it("recusa um tipo desconhecido", () => {
    expect(
      validarFicheiroLocal("passaporte" as never, ficheiro("application/pdf", 1000)),
    ).toBe("anexo_tipo_invalido");
  });
});

describe("verificarLimitesDeContagem", () => {
  it("deixa adicionar enquanto ha espaco", () => {
    expect(verificarLimitesDeContagem("cartao_cidadao", { cartao_cidadao: 1 })).toBeNull();
    expect(verificarLimitesDeContagem("fotografia", {})).toBeNull();
  });

  it("recusa com anexo_tipo_cheio quando o tipo esta cheio", () => {
    expect(verificarLimitesDeContagem("fotografia", { fotografia: 1 })).toBe("anexo_tipo_cheio");
    expect(verificarLimitesDeContagem("cartao_cidadao", { cartao_cidadao: 2 })).toBe(
      "anexo_tipo_cheio",
    );
  });

  it("recusa com anexo_maximo_ficheiros ao quinto ficheiro", () => {
    expect(
      verificarLimitesDeContagem("comprovativo_iban", { cartao_cidadao: 2, fotografia: 1, comprovativo_iban: 1 }),
    ).toBe("anexo_maximo_ficheiros");
    // 4 activos sem que o tipo pedido esteja cheio: tem de ser o limite total.
    expect(
      verificarLimitesDeContagem("cartao_cidadao", { cartao_cidadao: 1, comprovativo_iban: 1, fotografia: 1, outro: 1 } as never),
    ).toBe("anexo_maximo_ficheiros");
  });
});

describe("contarPorTipo", () => {
  it("conta so os tipos conhecidos", () => {
    const anexos: AnexoConvite[] = [
      { id: "a", tipo: "cartao_cidadao", nome_original: "a.pdf", tamanho_bytes: 1, mime_type: "application/pdf" },
      { id: "b", tipo: "cartao_cidadao", nome_original: "b.pdf", tamanho_bytes: 1, mime_type: "application/pdf" },
      { id: "c", tipo: "fotografia", nome_original: "c.png", tamanho_bytes: 1, mime_type: "image/png" },
    ];
    expect(contarPorTipo(anexos)).toEqual({ cartao_cidadao: 2, fotografia: 1 });
    expect(contarPorTipo([])).toEqual({});
  });
});

describe("formatarTamanho", () => {
  it("usa B, KB e MB", () => {
    expect(formatarTamanho(0, "en")).toBe("0 B");
    expect(formatarTamanho(512, "en")).toBe("512 B");
    expect(formatarTamanho(2048, "en")).toBe("2 KB");
    expect(formatarTamanho(Math.round(1.8 * MB), "en")).toBe("1.8 MB");
  });

  it("segue a lingua do ecra na virgula decimal", () => {
    expect(formatarTamanho(Math.round(1.8 * MB), "pt")).toBe("1,8 MB");
  });

  it("nao rebenta com valores invalidos", () => {
    expect(formatarTamanho(-1, "en")).toBe("0 B");
    expect(formatarTamanho(Number.NaN, "en")).toBe("0 B");
  });
});

describe("chaveDeErroAnexo", () => {
  it.each([
    ["anexo_formato_invalido", "hr.convite.erro.anexoFormato"],
    ["anexo_demasiado_grande", "hr.convite.erro.anexoFormato"],
    ["anexo_fotografia_formato", "hr.convite.erro.fotografiaFormato"],
    ["anexo_fotografia_demasiado_grande", "hr.convite.erro.fotografiaGrande"],
    ["anexo_maximo_ficheiros", "hr.convite.erro.anexosDemasiados"],
    ["anexo_tipo_cheio", "hr.convite.erro.anexoTipoCheio"],
    ["anexo_vazio", "hr.convite.erro.anexoVazio"],
    ["anexo_limite_convite", "hr.convite.erro.anexoLimiteConvite"],
    ["anexo_nao_encontrado", "hr.convite.erro.anexoNaoEncontrado"],
    ["anexo_nao_carregado", "hr.convite.erro.anexoNaoCarregado"],
    ["anexo_estado_invalido", "hr.convite.erro.anexoEstadoInvalido"],
    ["anexo_tipo_invalido", "hr.convite.erro.anexoFalhaEnvio"],
    ["anexo_falha_envio", "hr.convite.erro.anexoFalhaEnvio"],
  ])("%s -> %s", (codigo, chave) => {
    expect(chaveDeErroAnexo(codigo)).toBe(chave);
  });

  it("um codigo desconhecido ou vazio cai na falha de envio, nunca no codigo em bruto", () => {
    expect(chaveDeErroAnexo("qualquer_coisa")).toBe("hr.convite.erro.anexoFalhaEnvio");
    expect(chaveDeErroAnexo(null)).toBe("hr.convite.erro.anexoFalhaEnvio");
  });
});
