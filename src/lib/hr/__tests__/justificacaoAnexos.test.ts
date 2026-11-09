// Os anexos das justificações, a parte pura: validar o ficheiro antes de gastar uma reserva, traduzir cada código da Edge
// hr-justificacao-anexo e ler com segurança o que a RPC de listar devolve.
import { describe, expect, it } from "vitest";
import { rhExemploJustificacoesTranslations as traducoes } from "@/translations/rhExemploJustificacoes";
import {
  CODIGOS_DE_ERRO_ANEXO,
  MAX_ANEXOS_JUSTIFICACAO_REAIS,
  TAMANHO_MAX_ANEXO_BYTES,
  chaveDoErroDeAnexo,
  codigoCanonicoDeAnexo,
  escolherAnexos,
  lerAnexosListados,
  rotuloDoAnexo,
  validarFicheiroDeAnexo,
} from "../justificacaoAnexos";

const ficheiro = (nome: string, tipo = "application/pdf", bytes = 10): File =>
  new File([new Uint8Array(bytes)], nome, { type: tipo });

describe("validarFicheiroDeAnexo", () => {
  it("aceita pdf, jpeg e png", () => {
    for (const tipo of ["application/pdf", "image/jpeg", "image/png"]) expect(validarFicheiroDeAnexo(ficheiro("a", tipo))).toBeNull();
  });
  it("recusa outros formatos (incluindo heic e tipo vazio)", () => {
    expect(validarFicheiroDeAnexo(ficheiro("a.heic", "image/heic"))).toBe("anexo_formato_invalido");
    expect(validarFicheiroDeAnexo(ficheiro("a.exe", ""))).toBe("anexo_formato_invalido");
  });
  it("recusa um ficheiro vazio e um acima de 10 MB, mas aceita exactamente 10 MB", () => {
    expect(validarFicheiroDeAnexo({ type: "application/pdf", size: 0 })).toBe("anexo_vazio");
    expect(validarFicheiroDeAnexo({ type: "application/pdf", size: TAMANHO_MAX_ANEXO_BYTES + 1 })).toBe("anexo_demasiado_grande");
    expect(validarFicheiroDeAnexo({ type: "application/pdf", size: TAMANHO_MAX_ANEXO_BYTES })).toBeNull();
  });
});

describe("escolherAnexos", () => {
  it("junta os válidos até ao máximo de 4 e diz que houve a mais", () => {
    const r = escolherAnexos(2, ["a", "b", "c"].map((n) => ficheiro(n)));
    expect(r.aceites.map((f) => f.name)).toEqual(["a", "b"]);
    expect(r.erro).toBe("anexo_maximo_ficheiros");
  });
  it("deixa de fora os inválidos e devolve o primeiro motivo", () => {
    const r = escolherAnexos(0, [ficheiro("a.heic", "image/heic"), ficheiro("b.pdf")]);
    expect(r.aceites.map((f) => f.name)).toEqual(["b.pdf"]);
    expect(r.erro).toBe("anexo_formato_invalido");
  });
  it("sem nada a dizer devolve erro nulo; lista vazia também", () => {
    expect(escolherAnexos(0, [ficheiro("a.pdf")]).erro).toBeNull();
    expect(escolherAnexos(0, [])).toEqual({ aceites: [], erro: null });
    expect(MAX_ANEXOS_JUSTIFICACAO_REAIS).toBe(4);
  });
});

describe("chaveDoErroDeAnexo", () => {
  it("todos os códigos da Edge têm texto nas duas línguas, e nenhum vazio", () => {
    for (const codigo of CODIGOS_DE_ERRO_ANEXO) {
      const chave = chaveDoErroDeAnexo(codigo);
      for (const lingua of ["pt", "en"] as const) expect(traducoes[lingua][chave]?.trim(), `${lingua} ${codigo}`).toBeTruthy();
    }
  });
  it("um código desconhecido ou nulo cai no erro inesperado", () => {
    expect(chaveDoErroDeAnexo("coisa_nova")).toBe(chaveDoErroDeAnexo("erro_inesperado"));
    expect(chaveDoErroDeAnexo(null)).toBe(chaveDoErroDeAnexo("erro_inesperado"));
  });
  it("cobre os códigos acordados do contrato", () => {
    for (const c of ["pedido_invalido", "sem_sessao", "sem_permissao", "justificacao_nao_encontrada", "anexo_nao_encontrado", "justificacao_decidida",
      "anexo_estado_invalido", "anexo_maximo_ficheiros", "anexo_limite_reservas", "anexo_nao_carregado", "anexo_formato_invalido", "anexo_vazio",
      "anexo_demasiado_grande", "anexo_conteudo_recusado", "rate_limited", "anexo_falha_envio", "erro_url", "erro_inesperado"]) {
      expect(CODIGOS_DE_ERRO_ANEXO).toContain(c);
    }
  });
  it("as mensagens em pt são formais (sem «Podes», «Tenta», «tens» nem «Escolhe»)", () => {
    for (const codigo of CODIGOS_DE_ERRO_ANEXO) expect(traducoes.pt[chaveDoErroDeAnexo(codigo)]).not.toMatch(/\b(Podes|Tenta|tens|Escolhe)\b/);
  });
  it("os 401 de autenticação da Edge (textos de _shared/auth.ts) contam como sem_sessao, venham com ou sem o estado HTTP", () => {
    const semSessao = chaveDoErroDeAnexo("sem_sessao");
    expect(chaveDoErroDeAnexo("Authorization header required")).toBe(semSessao);
    expect(chaveDoErroDeAnexo("Invalid or expired token")).toBe(semSessao);
    expect(chaveDoErroDeAnexo("Invalid or expired token", 401)).toBe(semSessao);
    expect(chaveDoErroDeAnexo(null, 401)).toBe(semSessao);
    expect(chaveDoErroDeAnexo("texto que não conhecemos", 401)).toBe(semSessao);
  });
  it("«User profile not found» (403) conta como sem_permissao", () => {
    expect(chaveDoErroDeAnexo("User profile not found", 403)).toBe(chaveDoErroDeAnexo("sem_permissao"));
    expect(chaveDoErroDeAnexo("User profile not found")).toBe(chaveDoErroDeAnexo("sem_permissao"));
  });
  it("um código conhecido vence o estado HTTP; sem estado nem código, o erro inesperado", () => {
    expect(chaveDoErroDeAnexo("rate_limited", 429)).toBe(chaveDoErroDeAnexo("rate_limited"));
    expect(chaveDoErroDeAnexo("anexo_vazio", 401)).toBe(chaveDoErroDeAnexo("anexo_vazio"));
    expect(chaveDoErroDeAnexo(null, 500)).toBe(chaveDoErroDeAnexo("erro_inesperado"));
  });
  it("codigoCanonicoDeAnexo devolve o código estável (nunca o texto da autenticação)", () => {
    expect(codigoCanonicoDeAnexo("Authorization header required", 401)).toBe("sem_sessao");
    expect(codigoCanonicoDeAnexo("User profile not found", 403)).toBe("sem_permissao");
    expect(codigoCanonicoDeAnexo("anexo_vazio", 409)).toBe("anexo_vazio");
    expect(codigoCanonicoDeAnexo("coisa", 500)).toBe("coisa");
    expect(codigoCanonicoDeAnexo(null, undefined)).toBeNull();
  });
});

describe("lerAnexosListados", () => {
  const linha = { id: "a1", estado: "verificado", nome: "atestado.pdf", mime_type: "application/pdf", tamanho_bytes: 2048, criado_em: "2026-11-01T10:00:00Z",
    carregado_por_nome: "Ana", pode_abrir: true, pode_remover: false, origem: "dia" };
  it("lê as linhas e converte o tamanho (a base pode mandar texto)", () => {
    expect(lerAnexosListados([linha, { ...linha, id: "a2", tamanho_bytes: "4096" }]).map((a) => [a.id, a.tamanhoBytes])).toEqual([["a1", 2048], ["a2", 4096]]);
  });
  it("o nome oculto fica nulo", () => {
    expect(lerAnexosListados([{ ...linha, nome: null, pode_abrir: false }])[0]).toMatchObject({ nome: null, podeAbrir: false });
  });
  it("devolve lista vazia para null, não-lista e linhas sem id; só conta os verificados", () => {
    expect(lerAnexosListados(null)).toEqual([]);
    expect(lerAnexosListados({})).toEqual([]);
    expect(lerAnexosListados([{ nome: "x" }, null, 3])).toEqual([]);
    expect(lerAnexosListados([linha, { ...linha, id: "a3", estado: "quarentena" }]).map((a) => a.id)).toEqual(["a1"]);
  });
});

describe("rotuloDoAnexo", () => {
  it("usa o nome quando o há; senão «Anexo» com o tamanho", () => {
    expect(rotuloDoAnexo({ nome: "a.pdf", tamanhoBytes: 10 }, "Anexo")).toBe("a.pdf");
    expect(rotuloDoAnexo({ nome: null, tamanhoBytes: 2048 }, "Anexo")).toBe("Anexo · 2 kB");
    expect(rotuloDoAnexo({ nome: null, tamanhoBytes: 3 * 1024 * 1024 }, "Anexo")).toBe("Anexo · 3,0 MB");
    expect(rotuloDoAnexo({ nome: null, tamanhoBytes: 0 }, "Anexo")).toBe("Anexo");
  });
});
