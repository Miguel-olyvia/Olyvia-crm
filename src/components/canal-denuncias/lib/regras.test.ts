// As regras puras do canal de denúncias: código e PIN, prazos, transições de estado, conflito de interesses,
// anonimização e o registo de «Ver identidade».
import { describe, expect, it } from "vitest";
import { denunciasDeExemplo, RESPONSAVEIS } from "../dados/exemplo";
import { ORG_ATIVA, OUTRA_ORG, PESSOA_EXEMPLO_ID } from "../dados/organizacoes";
import {
  adicionarNota, arquivar, atribuirResponsavel, concluir, confirmarRececao, declararConflito, pedirInformacao,
  reabrir, responderDenunciante, type ContextoAcao,
} from "./acoes";
import { estadoDaIdentidade, identidadeAGuardar, identidadeVisivel, registarVerIdentidade } from "./anonimizacao";
import { acederComCodigo, formatarCodigo, gerarPin, proximoCodigo } from "./codigos";
import { motivoDeBloqueio, podeSerResponsavel } from "./conflito";
import { diasEntre, HOJE_EXEMPLO, somarDias, somarMeses } from "./datas";
import { TRANSICOES, podeTransitar } from "./estados";
import { filtrarDenuncias, SEM_FILTROS, totaisDaGestao } from "./filtros";
import { formatoTamanho } from "./formato";
import { filtrarPorOrganizacao } from "./organizacao";
import { construirDenuncia, FORMULARIO_VAZIO, MIN_DESCRICAO, passoValido, validarPasso, type DadosFormulario } from "./formulario";
import { prazoAtual, prazoConfirmacao, prazoResposta } from "./prazos";
import { ESTADOS, type Denuncia } from "./tipos";

let seq = 0;
const ctx: ContextoAcao = { quem: "Helena Matos", em: "2026-10-15T10:00", hoje: HOJE_EXEMPLO, novoId: () => `t${++seq}` };
const exemplo = (codigo: string): Denuncia => {
  const d = denunciasDeExemplo().find((x) => x.codigo === codigo);
  if (!d) throw new Error(`sem ${codigo}`);
  return d;
};
const NOVA = "DEN-2026-0041";
const ANONIMA_EM_ANALISE = "DEN-2026-0039";
const IDENTIFICADA_ASSEDIO = "DEN-2026-0037";

describe("código de acompanhamento e PIN", () => {
  it("formata o código com o ano e quatro dígitos", () => {
    expect(formatarCodigo(2026, 42)).toBe("DEN-2026-0042");
  });

  it("o próximo código é o maior do ano mais um, e ignora outros anos e lixo", () => {
    expect(proximoCodigo(["DEN-2026-0041", "DEN-2026-0007", "DEN-2025-0099", "xpto"], 2026)).toBe("DEN-2026-0042");
    expect(proximoCodigo([], 2026)).toBe("DEN-2026-0001");
  });

  it("o PIN tem sempre seis dígitos e é determinístico com um gerador fixo", () => {
    expect(gerarPin(() => 0.5)).toBe("500000");
    expect(gerarPin(() => 0)).toBe("000000");
    expect(gerarPin(() => 0.9999999)).toBe("999999");
    expect(gerarPin(() => 1)).toBe("999999");
    expect(gerarPin()).toMatch(/^\d{6}$/);
  });

  it("o acesso exige o par certo e tolera maiúsculas e espaços", () => {
    const lista = denunciasDeExemplo();
    const d = lista[0];
    expect(acederComCodigo(lista, ` ${d.codigo.toLowerCase()} `, ` ${d.pin.slice(0, 3)} ${d.pin.slice(3)}`)?.id).toBe(d.id);
    expect(acederComCodigo(lista, d.codigo, "000000")).toBeNull();
    expect(acederComCodigo(lista, "DEN-2026-9999", d.pin)).toBeNull();
    expect(acederComCodigo(lista, "", "")).toBeNull();
  });
});

describe("prazos", () => {
  it("somar dias e meses, com o fim de mês a ajustar-se", () => {
    expect(somarDias("2026-10-11", 7)).toBe("2026-10-18");
    expect(somarMeses("2026-10-15", 3)).toBe("2027-01-15");
    expect(somarMeses("2026-11-30", 3)).toBe("2027-02-28");
    expect(somarMeses("2026-05-31", 1)).toBe("2026-06-30");
    expect(diasEntre("2026-10-15", "2026-10-18")).toBe(3);
    expect(diasEntre("2026-10-15", "2026-10-10")).toBe(-5);
  });

  it("confirmar em 7 dias e responder em 3 meses", () => {
    expect(prazoConfirmacao("2026-10-11")).toBe("2026-10-18");
    expect(prazoResposta("2026-07-20")).toBe("2026-10-20");
  });

  it("a nova sem confirmar tem o prazo de confirmar a vencer", () => {
    const p = prazoAtual(exemplo(NOVA), HOJE_EXEMPLO);
    expect(p).toMatchObject({ tipo: "confirmar", data: "2026-10-18", dias: 3, situacao: "a_vencer" });
  });

  it("em análise: responder em 3 meses; a vencer perto do fim e atrasado depois dele", () => {
    expect(prazoAtual(exemplo("DEN-2026-0035"), HOJE_EXEMPLO)).toMatchObject({ tipo: "responder", data: "2026-10-20", situacao: "a_vencer" });
    expect(prazoAtual(exemplo("DEN-2026-0034"), HOJE_EXEMPLO)).toMatchObject({ tipo: "responder", situacao: "atrasado" });
    expect(prazoAtual(exemplo(ANONIMA_EM_ANALISE), HOJE_EXEMPLO).situacao).toBe("ok");
  });

  it("no último dia ainda não está atrasado; no dia seguinte está", () => {
    const d = { estado: "em_analise" as const, recebidaEm: "2026-07-15", confirmadaEm: "2026-07-16" };
    expect(prazoAtual(d, "2026-10-15")).toMatchObject({ dias: 0, situacao: "a_vencer" });
    expect(prazoAtual(d, "2026-10-16")).toMatchObject({ dias: -1, situacao: "atrasado" });
  });

  it("denúncias fechadas não têm prazo em curso", () => {
    expect(prazoAtual(exemplo("DEN-2026-0033"), HOJE_EXEMPLO).tipo).toBe("nenhum");
    expect(prazoAtual(exemplo("DEN-2026-0032"), HOJE_EXEMPLO).tipo).toBe("nenhum");
  });
});

describe("transições de estado", () => {
  it("as válidas passam e todas as outras são recusadas", () => {
    const validas = Object.entries(TRANSICOES).flatMap(([de, paras]) => paras.map((p) => `${de}>${p}`));
    expect(validas).toHaveLength(10);
    for (const de of ESTADOS) {
      for (const para of ESTADOS) {
        expect(podeTransitar(de, para)).toBe(validas.includes(`${de}>${para}`));
      }
    }
  });

  it("uma denúncia nova não se conclui nem pede informação sem confirmar a receção", () => {
    const nova = exemplo(NOVA);
    expect(concluir(nova, { resultado: "procedente", medidas: "", fundamentacao: "x" }, ctx)).toEqual({ ok: false, erro: "transicao_invalida" });
    expect(pedirInformacao(nova, "Podes explicar?", ctx)).toEqual({ ok: false, erro: "transicao_invalida" });
  });

  it("confirmar a receção passa a em análise, regista a data e muda o prazo", () => {
    const r = confirmarRececao(exemplo(NOVA), ctx);
    if (!r.ok) throw new Error("devia passar");
    expect(r.denuncia).toMatchObject({ estado: "em_analise", confirmadaEm: HOJE_EXEMPLO });
    expect(prazoAtual(r.denuncia, HOJE_EXEMPLO)).toMatchObject({ tipo: "responder", data: "2027-01-11" });
    expect(r.denuncia.historico.at(-1)?.acao).toBe("rececao_confirmada");
    expect(confirmarRececao(r.denuncia, ctx)).toEqual({ ok: false, erro: "transicao_invalida" });
  });

  it("pedir informação passa a «mais informação» e a resposta do denunciante retoma a análise", () => {
    const pedido = pedirInformacao(exemplo(ANONIMA_EM_ANALISE), "Quando foi?", ctx);
    if (!pedido.ok) throw new Error("devia passar");
    expect(pedido.denuncia.estado).toBe("mais_info");
    const resposta = responderDenunciante(pedido.denuncia, "Em Março.", [], ctx);
    if (!resposta.ok) throw new Error("devia passar");
    expect(resposta.denuncia.estado).toBe("em_analise");
    expect(resposta.denuncia.mensagens.at(-1)?.autor).toBe("denunciante");
    expect(resposta.denuncia.historico.at(-1)?.quem).toBe("@denunciante");
  });

  it("concluir exige resultado e fundamentação; arquivar exige motivo de 3 ou mais caracteres", () => {
    const d = exemplo(ANONIMA_EM_ANALISE);
    expect(concluir(d, { resultado: "", medidas: "", fundamentacao: "x" }, ctx)).toEqual({ ok: false, erro: "resultado_em_falta" });
    expect(concluir(d, { resultado: "procedente", medidas: "", fundamentacao: "  " }, ctx)).toEqual({ ok: false, erro: "fundamentacao_em_falta" });
    expect(arquivar(d, "ab", ctx)).toEqual({ ok: false, erro: "motivo_curto" });
    expect(arquivar(d, "   a  ", ctx)).toEqual({ ok: false, erro: "motivo_curto" });
    const ok = arquivar(d, "abc", ctx);
    expect(ok.ok && ok.denuncia.estado).toBe("arquivada");
  });

  it("reabrir só vale em denúncias fechadas e limpa a decisão", () => {
    expect(reabrir(exemplo(ANONIMA_EM_ANALISE), ctx)).toEqual({ ok: false, erro: "transicao_invalida" });
    for (const codigo of ["DEN-2026-0033", "DEN-2026-0032"]) {
      const r = reabrir(exemplo(codigo), ctx);
      if (!r.ok) throw new Error("devia passar");
      expect(r.denuncia).toMatchObject({ estado: "em_analise", decisao: null, motivoArquivo: null });
    }
  });

  it("uma denúncia fechada já não aceita mensagens do denunciante nem notas vazias", () => {
    expect(responderDenunciante(exemplo("DEN-2026-0033"), "Olá", [], ctx)).toEqual({ ok: false, erro: "fechada" });
    expect(responderDenunciante(exemplo(NOVA), "   ", [], ctx)).toEqual({ ok: false, erro: "texto_vazio" });
    expect(adicionarNota(exemplo(NOVA), " ", ctx)).toEqual({ ok: false, erro: "texto_vazio" });
  });
});

describe("conflito de interesses", () => {
  const carla = RESPONSAVEIS.find((r) => r.id === "r3")!;
  const paulo = RESPONSAVEIS.find((r) => r.id === "r4")!;
  const helena = RESPONSAVEIS.find((r) => r.id === "r1")!;

  it("quem é visado ou declarou conflito não pode ser o responsável", () => {
    const d = exemplo(IDENTIFICADA_ASSEDIO);
    expect(motivoDeBloqueio(d, "r3")).toBe("denunciado");
    expect(podeSerResponsavel(d, "r3")).toBe(false);
    expect(atribuirResponsavel(d, carla, ctx)).toEqual({ ok: false, erro: "denunciado" });
    expect(motivoDeBloqueio(exemplo("DEN-2026-0036"), "r4")).toBe("conflito");
    expect(atribuirResponsavel(exemplo("DEN-2026-0036"), paulo, ctx)).toEqual({ ok: false, erro: "conflito" });
  });

  it("atribuir a quem pode regista no histórico e é idempotente", () => {
    const r = atribuirResponsavel(exemplo(NOVA), helena, ctx);
    if (!r.ok) throw new Error("devia passar");
    expect(r.denuncia.responsavelId).toBe("r1");
    expect(r.denuncia.historico.at(-1)).toMatchObject({ acao: "responsavel_atribuido", detalhe: "Helena Matos" });
    const outra = atribuirResponsavel(r.denuncia, helena, ctx);
    expect(outra.ok && outra.denuncia).toBe(r.denuncia);
  });

  it("declarar conflito tira o caso a quem o tinha e passa a bloqueá-lo", () => {
    const d = exemplo(IDENTIFICADA_ASSEDIO);
    const r = declararConflito(d, helena, ctx);
    if (!r.ok) throw new Error("devia passar");
    expect(r.denuncia.responsavelId).toBeNull();
    expect(podeSerResponsavel(r.denuncia, "r1")).toBe(false);
    expect(declararConflito(r.denuncia, helena, ctx)).toEqual({ ok: true, denuncia: r.denuncia });
  });
});

describe("anonimização e «Ver identidade»", () => {
  it("numa denúncia anónima a identidade nunca é guardada, mesmo com campos preenchidos", () => {
    expect(identidadeAGuardar(true, { nome: "Ana", email: "ana@exemplo.pt", telefone: "910000000" })).toBeNull();
    expect(identidadeAGuardar(false, { nome: " Ana ", email: "ana@exemplo.pt" })).toMatchObject({ nome: "Ana", podemContactar: false, soResponsavel: true });
  });

  it("as denúncias anónimas de exemplo não têm identidade, nem a identidade se mostra com «revelada»", () => {
    const anonimas = denunciasDeExemplo().filter((d) => d.anonima);
    expect(anonimas.length).toBeGreaterThan(3);
    for (const d of anonimas) {
      expect(d.identidade).toBeNull();
      expect(identidadeVisivel(d, true)).toBeNull();
      expect(estadoDaIdentidade(d, true)).toBe("desconhecida");
    }
  });

  it("a identificada fica protegida até ser pedida", () => {
    const d = exemplo(IDENTIFICADA_ASSEDIO);
    expect(estadoDaIdentidade(d, false)).toBe("protegida");
    expect(identidadeVisivel(d, false)).toBeNull();
    expect(identidadeVisivel(d, true)?.nome).toBe("Inês Cardoso");
  });

  it("ver a identidade regista quem e quando; numa anónima não regista nada", () => {
    const d = exemplo(IDENTIFICADA_ASSEDIO);
    const visto = registarVerIdentidade(d, "Helena Matos", "2026-10-15T10:05", "e1");
    expect(visto.historico).toHaveLength(d.historico.length + 1);
    expect(visto.historico.at(-1)).toEqual({ id: "e1", em: "2026-10-15T10:05", quem: "Helena Matos", acao: "identidade_vista" });
    expect(d.historico).toHaveLength(visto.historico.length - 1);
    const anonima = exemplo(ANONIMA_EM_ANALISE);
    expect(registarVerIdentidade(anonima, "Helena Matos", "2026-10-15T10:05", "e2")).toBe(anonima);
  });
});

describe("formulário", () => {
  const preenchido: DadosFormulario = {
    ...FORMULARIO_VAZIO, anonima: true, tipo: "fraude", descricao: "x".repeat(MIN_DESCRICAO), quando: "Ontem", onde: "Loja", boaFe: true,
  };

  it("o passo 0 pede a escolha; identificada com «podem contactar» pede email ou telefone", () => {
    expect(validarPasso(FORMULARIO_VAZIO, 0).anonima).toBeDefined();
    expect(passoValido({ ...FORMULARIO_VAZIO, anonima: true }, 0)).toBe(true);
    expect(validarPasso({ ...FORMULARIO_VAZIO, anonima: false, podemContactar: true }, 0).contacto).toBeDefined();
    expect(passoValido({ ...FORMULARIO_VAZIO, anonima: false, podemContactar: true, telefone: "910" }, 0)).toBe(true);
    expect(validarPasso({ ...FORMULARIO_VAZIO, anonima: false, email: "isto-nao" }, 0).email).toBeDefined();
  });

  it("o passo 1 exige tipo, descrição com o mínimo e quando; «onde» é texto livre e opcional", () => {
    expect(Object.keys(validarPasso(FORMULARIO_VAZIO, 1)).sort()).toEqual(["descricao", "quando", "tipo"]);
    expect(passoValido({ ...preenchido, onde: "" }, 1)).toBe(true);
    expect(validarPasso({ ...preenchido, descricao: "x".repeat(MIN_DESCRICAO - 1) }, 1).descricao).toBe("cd.erro.descricaoCurta");
    expect(validarPasso({ ...preenchido, descricao: "x".repeat(4001) }, 1).descricao).toBe("cd.erro.descricaoLonga");
    expect(passoValido(preenchido, 1)).toBe(true);
  });

  it("o último passo exige a boa-fé; os de «quem» e «provas» são livres", () => {
    expect(validarPasso({ ...preenchido, boaFe: false }, 4).boaFe).toBeDefined();
    expect(passoValido(preenchido, 4)).toBe(true);
    expect(passoValido(FORMULARIO_VAZIO, 2)).toBe(true);
    expect(passoValido(FORMULARIO_VAZIO, 3)).toBe(true);
  });

  it("construir a denúncia anónima não leva identidade; sem escolha trata como anónima", () => {
    const dados = { id: "d1", codigo: "DEN-2026-0042", pin: "123456", hoje: HOJE_EXEMPLO, em: "2026-10-15T09:30", idEvento: "e", organizationId: ORG_ATIVA.id };
    const anonima = construirDenuncia({ ...preenchido, nome: "Ana", email: "ana@exemplo.pt" }, dados);
    expect(anonima).toMatchObject({ anonima: true, identidade: null, estado: "recebida", confirmadaEm: null });
    expect(construirDenuncia({ ...preenchido, anonima: null, nome: "Ana" }, dados).identidade).toBeNull();
    const identificada = construirDenuncia({ ...preenchido, anonima: false, nome: "Ana" }, dados);
    expect(identificada.identidade?.nome).toBe("Ana");
  });

  it("a denúncia fica da organização dada, e só a identificada fica ligada à pessoa", () => {
    const dados = { id: "d1", codigo: "DEN-2026-0042", pin: "123456", hoje: HOJE_EXEMPLO, em: "2026-10-15T09:30", idEvento: "e", organizationId: OUTRA_ORG.id, pessoaId: PESSOA_EXEMPLO_ID };
    expect(construirDenuncia({ ...preenchido, anonima: false, nome: "Ana" }, dados)).toMatchObject({ organizationId: OUTRA_ORG.id, pessoaId: PESSOA_EXEMPLO_ID });
    expect(construirDenuncia({ ...preenchido, anonima: true }, dados)).toMatchObject({ organizationId: OUTRA_ORG.id, pessoaId: null });
    expect(construirDenuncia({ ...preenchido, anonima: null }, dados).pessoaId).toBeNull();
    expect(construirDenuncia({ ...preenchido, anonima: false }, { ...dados, pessoaId: undefined }).pessoaId).toBeNull();
  });
});

describe("dados de exemplo, filtros e totais", () => {
  const todas = denunciasDeExemplo();
  const lista = filtrarPorOrganizacao(todas, ORG_ATIVA.id);

  it("há 12 denúncias na organização ativa e 2 noutra, com códigos e identificadores únicos e PIN de 6 dígitos", () => {
    expect(todas).toHaveLength(14);
    expect(lista).toHaveLength(12);
    expect(filtrarPorOrganizacao(todas, OUTRA_ORG.id)).toHaveLength(2);
    expect(new Set(todas.map((d) => d.codigo)).size).toBe(14);
    expect(new Set(todas.map((d) => d.id)).size).toBe(14);
    expect(todas.every((d) => /^\d{6}$/.test(d.pin))).toBe(true);
    expect(proximoCodigo(lista.map((d) => d.codigo), 2026)).toBe("DEN-2026-0042");
  });

  it("os totais batem com os estados e os prazos de hoje", () => {
    expect(totaisDaGestao(lista, HOJE_EXEMPLO)).toEqual({ novas: 2, emAnalise: 7, aVencer: 3, concluidas: 2 });
  });

  it("filtra por origem, estado, responsável, prazo e texto (sem olhar à identidade)", () => {
    const f = (parcial: Partial<typeof SEM_FILTROS>) => filtrarDenuncias(lista, { ...SEM_FILTROS, ...parcial }, HOJE_EXEMPLO);
    expect(f({}).length).toBe(12);
    expect(f({ origem: "identificada" }).every((d) => !d.anonima)).toBe(true);
    expect(f({ origem: "anonima" }).every((d) => d.anonima)).toBe(true);
    expect(f({ estado: "arquivada" })).toHaveLength(1);
    expect(f({ responsavel: "sem" }).every((d) => d.responsavelId === null)).toBe(true);
    expect(f({ soPrazo: true })).toHaveLength(3);
    expect(f({ texto: "EXTINTORES" })).toHaveLength(1);
    expect(f({ texto: "Inês Cardoso" })).toHaveLength(0);
  });

  it("a lista põe primeiro o que está atrasado e deixa os fechados no fim", () => {
    const ordem = filtrarDenuncias(lista, SEM_FILTROS, HOJE_EXEMPLO);
    expect(ordem[0].codigo).toBe("DEN-2026-0034");
    expect(ordem.slice(-3).map((d) => d.estado).sort()).toEqual(["arquivada", "concluida", "concluida"]);
  });
});

describe("tamanho dos ficheiros", () => {
  it("formata bytes, KB e MB", () => {
    expect(formatoTamanho(0)).toBe("0 B");
    expect(formatoTamanho(2048)).toBe("2.0 KB");
    expect(formatoTamanho(214_000)).toBe("209 KB");
    expect(formatoTamanho(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
