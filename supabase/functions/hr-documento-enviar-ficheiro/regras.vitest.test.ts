import { describe, expect, it } from "vitest";
import { codigoDoErro, decisaoDoDono, erroProvaRollback, lerPedido, mimeConfirmado, respostaDoErroRpc } from "./regras";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PESSOA = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const FICH = "33333333-3333-4333-8333-333333333333";
const CAMINHO = `${ORG}/${PESSOA}/${DOC}/${FICH}.pdf`;

const base = {
  caminho: CAMINHO,
  organizationId: ORG,
  tipo: "declaracao",
  titulo: "  Declaracao de vinculo  ",
  exigeAssinatura: false,
};

describe("lerPedido", () => {
  it("le o caminho em organizacao/pessoa/documento e apara o titulo", () => {
    const r = lerPedido(base);
    expect(r).toEqual({
      ok: true,
      pedido: {
        organizationId: ORG, pessoaId: PESSOA, documentoId: DOC, caminho: CAMINHO, extensao: "pdf",
        tipo: "declaracao", titulo: "Declaracao de vinculo", exigeAssinatura: false, conviteId: null, vinculoId: null,
      },
    });
  });

  it("recusa um caminho fora da forma imposta pela quarentena", () => {
    for (const caminho of [
      `${ORG}/${PESSOA}/${DOC}/${FICH}.exe`,
      `${ORG}/${PESSOA}/${DOC}/x/${FICH}.pdf`,
      `${ORG.toUpperCase()}/${PESSOA}/${DOC}/${FICH}.pdf`,
      `${ORG}/${PESSOA}/${DOC}/${FICH}.pdf/../outro`,
      "",
    ]) {
      expect(lerPedido({ ...base, caminho })).toEqual({ ok: false, codigo: "pedido_invalido" });
    }
  });

  it("recusa quando a organizacao do caminho nao e a activeCompany enviada", () => {
    expect(lerPedido({ ...base, organizationId: PESSOA })).toEqual({ ok: false, codigo: "pedido_invalido" });
  });

  it("sem assinatura so aceita declaracao ou recibo", () => {
    expect(lerPedido({ ...base, tipo: "contrato" })).toEqual({ ok: false, codigo: "estado_invalido" });
    expect(lerPedido({ ...base, tipo: "recibo" }).ok).toBe(true);
    expect(lerPedido({ ...base, tipo: "contrato", exigeAssinatura: true }).ok).toBe(true);
  });

  it("recusa tipo, titulo, assinatura, convite e vinculo invalidos", () => {
    expect(lerPedido({ ...base, tipo: "ficha" }).ok).toBe(false);
    expect(lerPedido({ ...base, titulo: "   " }).ok).toBe(false);
    expect(lerPedido({ ...base, titulo: "x".repeat(201) }).ok).toBe(false);
    expect(lerPedido({ ...base, exigeAssinatura: "nao" }).ok).toBe(false);
    expect(lerPedido({ ...base, conviteId: "abc" }).ok).toBe(false);
    expect(lerPedido({ ...base, vinculoId: 42 }).ok).toBe(false);
    expect(lerPedido(null).ok).toBe(false);
  });

  it("recusa titulos com caracteres de controlo ou invisiveis", () => {
    for (const invisivel of ["\u0007", "\t", "\n", "\u007F", "\u0085", "​", "‏", " ", "‮", "⁦", "﻿"]) {
      expect(lerPedido({ ...base, titulo: `Declara${invisivel}cao` })).toEqual({ ok: false, codigo: "pedido_invalido" });
    }
    expect(lerPedido({ ...base, titulo: "Declaração — 2027" }).ok).toBe(true);
  });

  it("aceita convite e vinculo validos", () => {
    const r = lerPedido({ ...base, conviteId: FICH, vinculoId: DOC });
    expect(r.ok && r.pedido.conviteId === FICH && r.pedido.vinculoId === DOC).toBe(true);
  });
});

describe("mimeConfirmado", () => {
  it("so aceita quando o tipo real bate com a extensao", () => {
    expect(mimeConfirmado("pdf", "pdf")).toBe("application/pdf");
    expect(mimeConfirmado("png", "png")).toBe("image/png");
    expect(mimeConfirmado("jpeg", "jpg")).toBe("image/jpeg");
    expect(mimeConfirmado("jpeg", "jpeg")).toBe("image/jpeg");
    expect(mimeConfirmado("png", "pdf")).toBeNull();
    expect(mimeConfirmado("gif", "png")).toBeNull();
    expect(mimeConfirmado(null, "pdf")).toBeNull();
  });
});

describe("decisaoDoDono", () => {
  const UID = "44444444-4444-4444-8444-444444444444";
  it("objecto inexistente: em falta", () => {
    expect(decisaoDoDono(null, UID)).toBe("em_falta");
    expect(decisaoDoDono(undefined, UID)).toBe("em_falta");
  });
  it("so recusa um dono preenchido e diferente de quem chama", () => {
    expect(decisaoDoDono({ dono: PESSOA }, UID)).toBe("recusar");
    expect(decisaoDoDono({ dono: UID }, UID)).toBe("seguir");
  });
  it("dono vazio passa", () => {
    expect(decisaoDoDono({ dono: null }, UID)).toBe("seguir");
    expect(decisaoDoDono({ dono: "" }, UID)).toBe("seguir");
    expect(decisaoDoDono({}, UID)).toBe("seguir");
  });
});

describe("erroProvaRollback", () => {
  it("so os RAISE da propria RPC provam rollback", () => {
    for (const code of ["42501", "HRA10", "HRA31", "HRA38", "HR921"]) {
      expect(erroProvaRollback({ code, message: "x" })).toBe(true);
    }
  });

  it("rede, timeout, 5xx e erros sem codigo sao ambiguos", () => {
    expect(erroProvaRollback({ message: "TypeError: fetch failed" })).toBe(false);
    expect(erroProvaRollback({ code: "", message: "" })).toBe(false);
    expect(erroProvaRollback({ code: "57014" })).toBe(false); // statement timeout
    expect(erroProvaRollback({ code: "PGRST000" })).toBe(false);
    expect(erroProvaRollback({ code: "HRA62" })).toBe(false);
    expect(erroProvaRollback(new Error("boom"))).toBe(false);
    expect(erroProvaRollback(null)).toBe(false);
  });
});

describe("codigoDoErro", () => {
  it("le o code de um erro PostgREST e ignora o resto", () => {
    expect(codigoDoErro({ code: "HRA31", message: "nao_encontrado" })).toBe("HRA31");
    expect(codigoDoErro(new Error("x"))).toBeNull();
    expect(codigoDoErro("texto")).toBeNull();
  });
});

describe("respostaDoErroRpc", () => {
  it("traduz os SQLSTATE da RPC e esconde o resto", () => {
    expect(respostaDoErroRpc({ code: "42501" })).toEqual({ status: 403, codigo: "insufficient_privilege" });
    expect(respostaDoErroRpc({ code: "HRA10" })).toEqual({ status: 400, codigo: "pedido_invalido" });
    expect(respostaDoErroRpc({ code: "HRA31" })).toEqual({ status: 404, codigo: "nao_encontrado" });
    expect(respostaDoErroRpc({ code: "HRA38" })).toEqual({ status: 409, codigo: "estado_invalido" });
    expect(respostaDoErroRpc({ code: "23505", message: "duplicate key ..." })).toEqual({ status: 500, codigo: "erro_inesperado" });
    expect(respostaDoErroRpc(null)).toEqual({ status: 500, codigo: "erro_inesperado" });
  });
});
