/**
 * As pecas puras do portal temporario da admissao (V3a): que vista se mostra, o aviso
 * ambar do prazo, a faixa de progresso, o e-mail mascarado, as mensagens de erro e onde
 * vive a sessao. Nada aqui chama a rede.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODIGOS_DE_ERRO_DO_PORTAL,
  PASSOS_PROGRESSO,
  comSensiveisGuardados,
  estadoPermiteEditar,
  formularioEditavel,
  mascararEmail,
  mensagemErroPortal,
  motivoDaVista,
  normalizarConvite,
  normalizarPortalLer,
  passoDoProgresso,
  prazoEmAviso,
  rascunhoParaFormulario,
  restoDoPrazo,
  rotuloDoRascunho,
  vistaDoConvite,
} from "../portalAdmissao";
import { RASCUNHO_CONVITE_VAZIO } from "../conviteAdmissaoPayload";
import { guardarSessao, lerSessao, limparSessao } from "../portalSessao";

const AGORA = new Date("2026-10-16T10:00:00Z");
const t = (chave: string, params?: Record<string, string | number>) =>
  `[${chave}${params ? ` ${JSON.stringify(params)}` : ""}]`;

const convite = (extra: Record<string, unknown> = {}) =>
  normalizarConvite({
    existe: true,
    estado: "convidada",
    estado_portal: "ativo",
    valid_until: "2026-10-30T10:00:00Z",
    primeiro_nome: "Joana",
    organizacao_nome: "Mudelar Teste",
    bloqueado: false,
    precisa_otp: true,
    ...extra,
  });

describe("normalizarConvite", () => {
  it("fica so com o minimo publico e tipos certos", () => {
    const c = normalizarConvite({
      existe: true,
      estado: "em_preenchimento",
      estado_portal: "ativo",
      valid_until: "2026-10-30T10:00:00Z",
      primeiro_nome: "Joana",
      organizacao_nome: "Org",
      bloqueado: false,
      precisa_otp: true,
      rascunho: { nif: "123456789" },
      niss: "12345678901",
    });
    expect(Object.keys(c).sort()).toEqual(
      ["bloqueado", "estado", "estado_portal", "existe", "organizacao_nome", "precisa_otp", "primeiro_nome", "valid_until"].sort(),
    );
  });

  it("uma resposta que nao e objecto da um convite que nao existe", () => {
    expect(normalizarConvite(null).existe).toBe(false);
    expect(normalizarConvite("x").existe).toBe(false);
  });

  it("precisa_otp so e verdadeiro quando vem verdadeiro (nunca por omissao)", () => {
    expect(normalizarConvite({ existe: true }).precisa_otp).toBe(false);
  });
});

describe("normalizarPortalLer", () => {
  it("aceita so as chaves documentadas e descarta o resto", () => {
    const l = normalizarPortalLer({
      estado: "devolvida",
      rascunho: { morada_linha1: "Rua A" },
      campos_obrigatorios: ["nif", 3, "genero"],
      campos_editaveis: ["genero"],
      documentos_editaveis: ["cartao_cidadao"],
      niss_ultimos4: "1234",
      iban_ultimos4: null,
      devolucao: { campos: { genero: "Falta indicar" }, documentos: ["cartao_cidadao"], observacao: "Veja o género" },
      anexos: [{ id: "a1", tipo: "cartao_cidadao", nome: "cc.pdf", estado: "ligado", caminho: "x/y" }],
      rejeicao_mensagem: null,
      email_destino: "intruso@exemplo.pt",
    });
    expect(l.campos_obrigatorios).toEqual(["nif", "genero"]);
    expect(l.devolucao?.campos).toEqual({ genero: "Falta indicar" });
    expect(l.anexos).toEqual([{ id: "a1", tipo: "cartao_cidadao", nome: "cc.pdf", estado: "ligado" }]);
    expect(JSON.stringify(l)).not.toContain("intruso");
  });

  it("sem nada da listas vazias e nulos, nunca excepcoes", () => {
    const l = normalizarPortalLer({});
    expect(l.rascunho).toBeNull();
    expect(l.campos_obrigatorios).toEqual([]);
    expect(l.devolucao).toBeNull();
    expect(l.niss_ultimos4).toBeNull();
  });
});

describe("rascunhoParaFormulario: o que a `ler` devolve passa para o formulario reutilizado", () => {
  it("sem rascunho da o formulario vazio, sem partilhar o objecto vazio de referencia", () => {
    const f = rascunhoParaFormulario(null);
    expect(f).toEqual(RASCUNHO_CONVITE_VAZIO);
    expect(f).not.toBe(RASCUNHO_CONVITE_VAZIO);
  });

  it("as chaves do ecra entram como texto (numeros tambem)", () => {
    const f = rascunhoParaFormulario({ genero: "feminino", dependentes: 2, linha1: "Rua A", tamanho_cima: "M" });
    expect(f.genero).toBe("feminino");
    expect(f.dependentes).toBe("2");
    expect(f.linha1).toBe("Rua A");
    expect(f.tamanho_cima).toBe("M");
  });

  it("as chaves do contrato (morada_*, conta_swift) caem nos campos do ecra", () => {
    const f = rascunhoParaFormulario({
      morada_linha1: "Rua das Flores 12",
      morada_linha2: "2.º Esq.",
      morada_codigo_postal: "4000-001",
      morada_localidade: "Porto",
      morada_distrito: "Porto",
      morada_pais: "PT",
      conta_swift: "BCOMPTPL",
    });
    expect(f.linha1).toBe("Rua das Flores 12");
    expect(f.linha2).toBe("2.º Esq.");
    expect(f.codigo_postal).toBe("4000-001");
    expect(f.localidade).toBe("Porto");
    expect(f.distrito).toBe("Porto");
    expect(f.pais).toBe("PT");
    expect(f.conta_bic).toBe("BCOMPTPL");
  });

  it("a chave do ecra ganha a do contrato quando as duas vem", () => {
    expect(rascunhoParaFormulario({ linha1: "Do ecra", morada_linha1: "Do contrato" }).linha1).toBe("Do ecra");
  });

  it("NISS, IBAN e numero da conta nunca entram no formulario, mesmo que venham", () => {
    const f = rascunhoParaFormulario({ niss: "12345678902", iban: "PT50000201231234567890154", conta_numero: "PT50000201231234567890154" });
    expect(f.niss).toBe("");
    expect(f.conta_numero).toBe("");
    expect(JSON.stringify(f)).not.toContain("12345678902");
  });

  it("a declaracao de veracidade nunca se restaura, e o que nao e texto, numero ou nulo fica de fora", () => {
    const f = rascunhoParaFormulario({ aceite: true, assinatura_nome: "Joana", genero: { x: 1 }, nacionalidade: null });
    expect(f.aceite).toBe(false);
    expect(f.assinatura_nome).toBe("Joana");
    expect(f.genero).toBe("");
    expect(f.nacionalidade).toBe("");
  });
});

describe("comSensiveisGuardados: NISS e IBAN guardados no cofre contam como preenchidos", () => {
  const dados = (extra: Record<string, unknown>) => normalizarPortalLer({ estado: "em_preenchimento", ...extra });

  it("com os 4 ultimos digitos, o campo conta como preenchido sem mostrar nada", () => {
    const r = comSensiveisGuardados(RASCUNHO_CONVITE_VAZIO, dados({ niss_ultimos4: "8902", iban_ultimos4: "0154" }));
    expect(r.niss.trim()).not.toBe("");
    expect(r.conta_numero.trim()).not.toBe("");
    expect(r.niss).not.toMatch(/\d/);
    expect(r.conta_numero).not.toMatch(/\d/);
  });

  it("sem nada guardado, devolve o que escreveu a pessoa, intacto", () => {
    const base = { ...RASCUNHO_CONVITE_VAZIO, niss: "123" };
    const r = comSensiveisGuardados(base, dados({}));
    expect(r).toEqual(base);
  });

  it("nunca altera o objecto recebido", () => {
    const base = { ...RASCUNHO_CONVITE_VAZIO };
    comSensiveisGuardados(base, dados({ niss_ultimos4: "8902" }));
    expect(base.niss).toBe("");
  });
});

describe("formularioEditavel: o que o estado permite editar", () => {
  const em = (estado: string, campos: string[], devolucao: unknown = null) =>
    normalizarPortalLer({ estado, campos_editaveis: campos, devolucao });

  it("em preenchimento, o campo esta na lista editavel (chave do ecra)", () => {
    const d = em("em_preenchimento", ["genero", "linha1"]);
    expect(formularioEditavel(d, "genero")).toBe(true);
    expect(formularioEditavel(d, "nif")).toBe(false);
  });

  it("a chave do contrato na lista abre o campo do ecra (morada_linha1 -> linha1, conta_swift -> conta_bic)", () => {
    const d = em("em_preenchimento", ["morada_linha1", "morada_codigo_postal", "conta_swift"]);
    expect(formularioEditavel(d, "linha1")).toBe(true);
    expect(formularioEditavel(d, "codigo_postal")).toBe(true);
    expect(formularioEditavel(d, "conta_bic")).toBe(true);
  });

  it("o IBAN do ecra e a chave `iban` da lista; o NISS e `niss`", () => {
    const d = em("em_preenchimento", ["iban", "niss"]);
    expect(formularioEditavel(d, "conta_numero")).toBe(true);
    expect(formularioEditavel(d, "niss")).toBe(true);
    expect(formularioEditavel(em("em_preenchimento", ["genero"]), "conta_numero")).toBe(false);
  });

  it("em devolvida so o que o RH devolveu (a lista da base) fica editavel", () => {
    const d = em("devolvida", ["genero"], { campos: { genero: "x" }, documentos: [], observacao: null });
    expect(formularioEditavel(d, "genero")).toBe(true);
    expect(formularioEditavel(d, "nacionalidade")).toBe(false);
  });

  it.each(["submetida", "aprovada", "rejeitada", null])("no estado %s nada se edita, mesmo com a lista cheia", (estado) => {
    const d = normalizarPortalLer({ estado, campos_editaveis: ["genero", "iban", "niss"] });
    expect(formularioEditavel(d, "genero")).toBe(false);
    expect(formularioEditavel(d, "niss")).toBe(false);
  });

  it("a assinatura e a declaracao pertencem a submissao: editam-se sempre que o estado deixa, mesmo fora de campos_editaveis", () => {
    const d = em("em_preenchimento", ["genero"]);
    expect(formularioEditavel(d, "assinatura_nome")).toBe(true);
    expect(formularioEditavel(d, "aceite")).toBe(true);
    expect(formularioEditavel(em("devolvida", ["genero"]), "assinatura_nome")).toBe(true);
  });

  it("a assinatura e a declaracao ficam inactivas nos estados que nao se editam", () => {
    const d = em("submetida", ["assinatura_nome", "genero"]);
    expect(formularioEditavel(d, "assinatura_nome")).toBe(false);
    expect(formularioEditavel(d, "aceite")).toBe(false);
  });
});

describe("motivoDaVista: as vistas sem acesso usam o cartao de link invalido que ja existia", () => {
  it.each([
    ["invalido", "inexistente"],
    ["revogado", "substituido"],
    ["encerrado", "usado"],
    ["expirado", "expirado"],
    ["bloqueado", "bloqueado"],
    ["demasiadas", "demasiadasTentativas"],
  ] as const)("%s -> %s", (vista, motivo) => {
    expect(motivoDaVista(vista)).toBe(motivo);
  });
});

describe("estadoPermiteEditar", () => {
  it.each(["convidada", "em_preenchimento", "devolvida"])("%s permite", (e) => {
    expect(estadoPermiteEditar(e)).toBe(true);
  });
  it.each(["submetida", "aprovada", "concluida", "rejeitada", "cancelada", "desconhecido", null])("%s nao permite", (e) => {
    expect(estadoPermiteEditar(e)).toBe(false);
  });
});

describe("vistaDoConvite", () => {
  it("com um convite activo e editavel: consulta", () => {
    expect(vistaDoConvite(null, convite())).toBe("consulta");
  });

  it.each([
    ["convite_invalido", "invalido"],
    ["convite_revogado", "revogado"],
    ["convite_expirado", "expirado"],
    ["convite_ja_usado", "encerrado"],
    ["convite_bloqueado", "bloqueado"],
    ["demasiadas_tentativas", "demasiadas"],
    ["erro_inesperado", "invalido"],
    ["qualquer_coisa", "invalido"],
  ])("o erro %s da a vista %s", (codigo, vista) => {
    expect(vistaDoConvite(codigo, null)).toBe(vista);
  });

  it("sem convite e sem erro: invalido", () => {
    expect(vistaDoConvite(null, null)).toBe("invalido");
    expect(vistaDoConvite(null, convite({ existe: false }))).toBe("invalido");
  });

  it.each([
    ["expirado", "expirado"],
    ["revogado", "revogado"],
    ["encerrado", "encerrado"],
  ])("estado_portal %s sem erro da a vista %s", (portal, vista) => {
    expect(vistaDoConvite(null, convite({ estado_portal: portal }))).toBe(vista);
  });

  it("bloqueado vence", () => {
    expect(vistaDoConvite(null, convite({ bloqueado: true }))).toBe("bloqueado");
  });

  it.each(["submetida", "aprovada", "a_aguardar_assinaturas", "assinaturas_concluidas", "a_aguardar_ativacao"])(
    "o estado %s mostra so o estado (analise)",
    (estado) => {
      expect(vistaDoConvite(null, convite({ estado, precisa_otp: false }))).toBe("analise");
    },
  );

  it.each(["concluida", "rejeitada", "cancelada"])("o estado fechado %s: encerrado", (estado) => {
    expect(vistaDoConvite(null, convite({ estado }))).toBe("encerrado");
  });
});

describe("prazo e aviso ambar (menos de 2 dias)", () => {
  it("14 dias: sem aviso", () => {
    expect(prazoEmAviso("2026-10-30T10:00:00Z", AGORA)).toBe(false);
  });
  it("1 dia e 23 h: aviso", () => {
    expect(prazoEmAviso("2026-10-18T09:00:00Z", AGORA)).toBe(true);
  });
  it("exactamente 2 dias: sem aviso", () => {
    expect(prazoEmAviso("2026-10-18T10:00:00Z", AGORA)).toBe(false);
  });
  it("ja passou: sem aviso (e outra vista)", () => {
    expect(prazoEmAviso("2026-10-15T10:00:00Z", AGORA)).toBe(false);
  });
  it("sem data ou data invalida: sem aviso", () => {
    expect(prazoEmAviso(null, AGORA)).toBe(false);
    expect(prazoEmAviso("isto nao e uma data", AGORA)).toBe(false);
  });

  it("o que resta, em dias, horas ou minutos", () => {
    expect(restoDoPrazo("2026-10-30T10:00:00Z", AGORA)).toEqual({ tipo: "dias", n: 14 });
    expect(restoDoPrazo("2026-10-17T10:00:00Z", AGORA)).toEqual({ tipo: "dias", n: 1 });
    expect(restoDoPrazo("2026-10-16T15:00:00Z", AGORA)).toEqual({ tipo: "horas", n: 5 });
    expect(restoDoPrazo("2026-10-16T10:20:00Z", AGORA)).toEqual({ tipo: "minutos", n: 20 });
    expect(restoDoPrazo("2026-10-16T09:00:00Z", AGORA)).toEqual({ tipo: "terminado", n: 0 });
    expect(restoDoPrazo(null, AGORA)).toEqual({ tipo: "terminado", n: 0 });
  });
});

describe("faixa de progresso", () => {
  it("tem 4 passos", () => {
    expect(PASSOS_PROGRESSO).toHaveLength(4);
  });
  it.each([
    ["convidada", 0],
    ["em_preenchimento", 1],
    ["devolvida", 1],
    ["submetida", 2],
    ["aprovada", 3],
    ["a_aguardar_assinaturas", 3],
    ["assinaturas_concluidas", 3],
    ["a_aguardar_ativacao", 3],
    ["concluida", 4],
  ])("%s esta no passo %i", (estado, passo) => {
    expect(passoDoProgresso(estado)).toBe(passo);
  });
  it("estado que nao conhece: -1", () => {
    expect(passoDoProgresso("rejeitada")).toBe(-1);
    expect(passoDoProgresso(null)).toBe(-1);
  });
});

describe("rotuloDoRascunho", () => {
  const tabela: Record<string, string> = {
    "hr.pendencias.campo.linha1": "Morada",
    "hr.pendencias.campo.genero": "Género",
    "hr.campos.linha2": "Morada (linha 2)",
  };
  const tt = (chave: string) => tabela[chave] ?? chave;

  it("a chave do contrato usa o texto do ecra", () => {
    expect(rotuloDoRascunho(tt, "morada_linha1")).toBe("Morada");
    expect(rotuloDoRascunho(tt, "morada_linha2")).toBe("Morada (linha 2)");
  });
  it("a chave com texto directo", () => {
    expect(rotuloDoRascunho(tt, "genero")).toBe("Género");
  });
  it("uma chave sem texto da null (nao se mostra solta)", () => {
    expect(rotuloDoRascunho(tt, "conta_formato")).toBeNull();
    expect(rotuloDoRascunho(tt, "tamanho_cima_detalhe")).toBeNull();
  });
});

describe("mascararEmail", () => {
  it("esconde quase tudo da parte local e mantem o dominio", () => {
    expect(mascararEmail("joana.pires@exemplo.pt")).toBe("j***@exemplo.pt");
  });
  it("uma parte local de uma letra tambem se esconde", () => {
    expect(mascararEmail("j@exemplo.pt")).toBe("*@exemplo.pt");
  });
  it("o que ja vem mascarado fica como esta", () => {
    expect(mascararEmail("j***@exemplo.pt")).toBe("j***@exemplo.pt");
  });
  it("lixo ou vazio: null", () => {
    expect(mascararEmail("")).toBeNull();
    expect(mascararEmail(null)).toBeNull();
    expect(mascararEmail("sem-arroba")).toBeNull();
    expect(mascararEmail(42)).toBeNull();
  });
});

describe("mensagemErroPortal", () => {
  it("todo o codigo da Edge tem texto e nunca o codigo em bruto", () => {
    for (const codigo of [...CODIGOS_DE_ERRO_DO_PORTAL, "codigo_que_nao_existe"]) {
      const texto = mensagemErroPortal(t, codigo);
      expect(texto, codigo).toMatch(/^\[(portal\.erro|hr\.convite)\./);
      expect(texto, codigo).not.toContain(codigo === "codigo_que_nao_existe" ? "que_nao" : `${codigo}]`);
    }
  });

  it("usa o catalogo de erros que ja existia (errosAdmissao), sem texto repetido do portal", () => {
    expect(mensagemErroPortal(t, "niss_invalido")).toContain("hr.convite.erro.nissInvalido");
    expect(mensagemErroPortal(t, "iban_invalido")).toContain("hr.convite.erro.ibanInvalido");
    expect(mensagemErroPortal(t, "estado_invalido")).toContain("hr.convite.erro.estadoInvalido");
    expect(mensagemErroPortal(t, "demasiadas_tentativas")).toContain("hr.convite.motivo.demasiadasTentativas");
    expect(mensagemErroPortal(t, "erro_inesperado")).toContain("hr.convite.erro.inesperado");
    expect(mensagemErroPortal(t, "codigo_que_nao_existe")).toContain("hr.convite.erro.inesperado");
  });

  it.each([
    ["otp_espera", "portal.erro.otpEspera"],
    ["otp_limite_diario", "portal.erro.otpLimiteDiario"],
    ["otp_expirado", "portal.erro.otpExpirado"],
    ["otp_bloqueado", "portal.erro.otpBloqueado"],
    ["campo_bloqueado", "portal.erro.campoBloqueado"],
    ["otp_indisponivel", "portal.erro.emailNaoEnviado"],
    ["email_nao_enviado", "portal.erro.emailNaoEnviado"],
    ["portal_em_atualizacao", "portal.erro.emAtualizacao"],
    ["pedido_invalido", "portal.erro.pedidoInvalido"],
  ])("%s -> %s", (codigo, chave) => {
    expect(mensagemErroPortal(t, codigo)).toContain(chave);
  });

  it("codigo errado diz quantas tentativas restam (uma e varias)", () => {
    expect(mensagemErroPortal(t, "otp_invalido", { restantes: 3 })).toContain('"n":3');
    expect(mensagemErroPortal(t, "otp_invalido", { restantes: 1 })).toContain("otpInvalidoUma");
    expect(mensagemErroPortal(t, "otp_invalido")).toContain("otpInvalidoSemContagem");
  });

  it.each(["sessao_expirada", "sessao_ausente"])("%s manda confirmar de novo o codigo", (c) => {
    expect(mensagemErroPortal(t, c)).toContain("portal.erro.sessaoExpirada");
  });
  it("sessao substituida tem a sua mensagem", () => {
    expect(mensagemErroPortal(t, "sessao_substituida")).toContain("portal.erro.sessaoSubstituida");
  });
});

describe("a sessao vive so em memoria (perde-se ao fechar ou recarregar o separador)", () => {
  afterEach(() => {
    limparSessao();
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("guarda, le e limpa", () => {
    expect(lerSessao()).toBeNull();
    guardarSessao("abc");
    expect(lerSessao()).toBe("abc");
    limparSessao();
    expect(lerSessao()).toBeNull();
  });

  it("nunca toca em localStorage nem em sessionStorage", () => {
    const escrita = vi.spyOn(Storage.prototype, "setItem");
    const leitura = vi.spyOn(Storage.prototype, "getItem");
    guardarSessao("abc");
    lerSessao();
    limparSessao();
    expect(escrita).not.toHaveBeenCalled();
    expect(leitura).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("o que ja estivesse em sessionStorage (de uma versao anterior) nunca e lido como sessao", () => {
    sessionStorage.setItem("portal-admissao-sessao", "S".repeat(43));
    expect(lerSessao()).toBeNull();
  });
});
