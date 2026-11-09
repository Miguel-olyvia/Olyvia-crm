/**
 * O motivo de anular, ocultar e repor um documento de RH: as mesmas regras que `hr_documento_motivo` (20270111800000) aplica
 * na base (3 a 2000 caracteres uteis, sem controlo nem invisiveis), os erros das RPCs traduzidos e o deadlock repetido uma vez.
 */
import { describe, expect, it, vi } from "vitest";
import {
  MOTIVO_DOCUMENTO_MAXIMO,
  MOTIVO_DOCUMENTO_MINIMO,
  chaveErroDocumento,
  comRepeticaoPorDeadlock,
  ehDeadlock,
  motivoParaEnvio,
  razaoMotivoInvalido,
} from "@/lib/hr/documentoMotivo";

describe("razaoMotivoInvalido", () => {
  it("aceita de 3 a 2000 caracteres uteis", () => {
    expect(razaoMotivoInvalido("abc")).toBeNull();
    expect(razaoMotivoInvalido("a".repeat(MOTIVO_DOCUMENTO_MAXIMO))).toBeNull();
    expect(MOTIVO_DOCUMENTO_MINIMO).toBe(3);
  });
  it.each([["", "curto"], ["ab", "curto"], ["   ab  ", "curto"], ["\n\nab\n", "curto"]])("%j e curto", (texto, razao) => {
    expect(razaoMotivoInvalido(texto)).toBe(razao);
  });
  it("2001 caracteres e longo", () => {
    expect(razaoMotivoInvalido("a".repeat(MOTIVO_DOCUMENTO_MAXIMO + 1))).toBe("longo");
  });
  it("recusa controlo e invisiveis, mas aceita a mudanca de linha", () => {
    expect(razaoMotivoInvalido("erro\u0007 ao emitir")).toBe("caracteres");
    expect(razaoMotivoInvalido("erro\u200b ao emitir")).toBe("caracteres");
    expect(razaoMotivoInvalido("erro\ufeff ao emitir")).toBe("caracteres");
    expect(razaoMotivoInvalido("erro\nao emitir")).toBeNull();
  });
  it("conta emojis e acentos como um caracter cada", () => {
    expect(razaoMotivoInvalido("çãé")).toBeNull();
    expect(razaoMotivoInvalido("\u{1F600}\u{1F600}")).toBe("curto");
  });
  it("tolera null e undefined como vazio", () => {
    expect(razaoMotivoInvalido(null as unknown as string)).toBe("curto");
    expect(razaoMotivoInvalido(undefined as unknown as string)).toBe("curto");
  });
});

describe("motivoParaEnvio", () => {
  it("tira espacos e mudancas de linha das pontas e normaliza CRLF", () => {
    expect(motivoParaEnvio("  erro\r\nde emissao \n")).toBe("erro\nde emissao");
  });
});

describe("chaveErroDocumento", () => {
  it.each([
    [{ code: "HRA31", message: "nao_encontrado" }, "hr.documentos.erro.naoEncontrado"],
    [{ code: "HRA37", message: "motivo_invalido" }, "hr.documentos.erro.motivoInvalido"],
    [{ code: "HRA38", message: "estado_invalido" }, "hr.documentos.erro.estadoInvalido"],
    [{ code: "HRA62", message: "sem_ficheiro" }, "hr.documentos.erro.semFicheiro"],
    [{ code: "42501", message: "insufficient_privilege" }, "hr.documentos.erro.semPermissao"],
    [{ message: "sem_ficheiro" }, "hr.documentos.erro.semFicheiro"],
  ])("%j", (erro, chave) => {
    expect(chaveErroDocumento(erro)).toBe(chave);
  });
  it("devolve null para o que nao conhece (rede, defeito, vazio)", () => {
    expect(chaveErroDocumento({ code: "57014", message: "timeout" })).toBeNull();
    expect(chaveErroDocumento(null)).toBeNull();
    expect(chaveErroDocumento("x")).toBeNull();
  });
});

describe("deadlock repetido uma vez", () => {
  it("reconhece o 40P01", () => {
    expect(ehDeadlock({ code: "40P01" })).toBe(true);
    expect(ehDeadlock({ code: "HRA38" })).toBe(false);
    expect(ehDeadlock(null)).toBe(false);
  });
  it("repete uma vez e devolve o resultado da segunda", async () => {
    const chamar = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "40P01" } })
      .mockResolvedValueOnce({ data: { estado: "anulado" }, error: null });
    const r = await comRepeticaoPorDeadlock(chamar);
    expect(chamar).toHaveBeenCalledTimes(2);
    expect(r.error).toBeNull();
  });
  it("nao repete mais de uma vez", async () => {
    const chamar = vi.fn().mockResolvedValue({ data: null, error: { code: "40P01" } });
    const r = await comRepeticaoPorDeadlock(chamar);
    expect(chamar).toHaveBeenCalledTimes(2);
    expect(r.error).toEqual({ code: "40P01" });
  });
  it("nao repete outros erros nem o sucesso", async () => {
    const outro = vi.fn().mockResolvedValue({ data: null, error: { code: "HRA38" } });
    await comRepeticaoPorDeadlock(outro);
    expect(outro).toHaveBeenCalledTimes(1);
    const ok = vi.fn().mockResolvedValue({ data: 1, error: null });
    await comRepeticaoPorDeadlock(ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
