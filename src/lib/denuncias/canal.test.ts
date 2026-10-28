// A passagem das respostas da base para o que os ecrãs do canal usam, e os códigos de erro. Funções puras, sem rede.
import { describe, expect, it } from "vitest";
import {
  FormaInvalida, comoLista, contagemDe, denunciaDeAberta, denunciaDeLista, denunciaDeVista, deveReportar, erroDeRpc, erroParaRegisto,
  identidadeDeDb, responsavelDeDb, type DenunciaAbertaDb, type DenunciaListaDb, type VistaDenuncianteDb,
} from "./canal";

const ORG = "org-1";

const linha = (extra: Partial<DenunciaListaDb> = {}): DenunciaListaDb => ({
  id: "d1", codigo: "DEN-2026-0001", tipo: "fraude", resumo: "Despesas duplicadas", estado: "recebida", gravidade: "media",
  anonima: true, responsavel_id: null, recebida_em: "2026-10-15T09:30:00Z", confirmada_em: null, ...extra,
});

const aberta = (extra: Partial<DenunciaAbertaDb> = {}): DenunciaAbertaDb => ({
  ...linha(), descricao: "Há despesas lançadas duas vezes.", quando: "Em Setembro", ainda_acontece: "sim", onde: null, envolvidos: null,
  testemunhas: "nao_sei", ja_reportado: null, avaliacao_inicial: null, resultado: null, medidas: null, fundamentacao: null, decidida_em: null,
  motivo_arquivo: null, mensagens: [], notas: [], eventos: [], anexos: [], impedidos: [], ...extra,
});

describe("erros da base", () => {
  it.each([
    ["HRD01", "transicao_invalida"], ["HRD02", "denunciado"], ["HRD03", "conflito"], ["HRD04", "texto_vazio"], ["HRD05", "motivo_curto"],
    ["HRD06", "resultado_em_falta"], ["HRD07", "fundamentacao_em_falta"], ["HRD08", "fechada"], ["HRD09", "nao_encontrada"],
    ["HRD10", "confirmar_primeiro"], ["HRD11", "anonima"], ["HRD12", "motivo_identidade"], ["HRD13", "limite_anexos"],
    ["HRD14", "nao_e_responsavel"], ["HRD15", "impedimento_invalido"], ["HRD16", "so_responsavel"], ["HRD17", "sem_permissao"],
    ["HRD18", "slug_em_uso"], ["HRD19", "canal_inativo"], ["HRD20", "anonima_imutavel"], ["42501", "sem_permissao"],
  ])("%s vira «%s»", (code, esperado) => {
    expect(erroDeRpc({ code })).toBe(esperado);
  });

  it("o que não se conhece (rede, RPC por aplicar, nulo) é «indisponivel»", () => {
    for (const e of [{ code: "PGRST202" }, { code: "42883" }, { message: "Failed to fetch" }, null, undefined, "texto", 42]) {
      expect(erroDeRpc(e)).toBe("indisponivel");
    }
  });

  it("uma regra do canal ou uma recusa por permissão são respostas corretas; o resto é defeito a reportar", () => {
    expect(deveReportar({ code: "HRD01" })).toBe(false);
    expect(deveReportar({ code: "42501" })).toBe(false);
    expect(deveReportar({ code: "PGRST202" })).toBe(true);
    expect(deveReportar({ message: "timeout" })).toBe(true);
    expect(deveReportar(null)).toBe(true);
  });

  it("o que vai para o registo de erros é só a operação e o código, nunca a mensagem nem os detalhes", () => {
    const e = erroParaRegisto("abrir", { code: "XX000", message: "Inês Cardoso denunciou X", details: "descrição do caso", hint: "pin 123456" });
    expect(e.message).toBe("denuncias:abrir:XX000");
    expect(erroParaRegisto("abrir", new Error("segredo")).message).toBe("denuncias:abrir:sem_codigo");
  });
});

describe("a lista da gestão", () => {
  it("passa uma linha para a denúncia sem descrição nem identidade, com a data local da receção", () => {
    const d = denunciaDeLista(linha({ responsavel_id: "u1", confirmada_em: "2026-10-16T08:00:00Z" }), ORG);
    expect(d).toMatchObject({
      id: "d1", organizationId: ORG, codigo: "DEN-2026-0001", tipo: "fraude", estado: "recebida", gravidade: "media", anonima: true,
      responsavelId: "u1", descricao: "", identidade: null, pessoaId: null, pin: "", mensagens: [], notas: [],
    });
    expect(d.recebidaEm).toMatch(/^2026-10-1[45]$/);
    expect(d.confirmadaEm).toMatch(/^2026-10-1[56]$/);
  });

  it("um estado, um tipo ou uma gravidade fora das listas é um erro, nunca um valor adivinhado", () => {
    expect(() => denunciaDeLista(linha({ estado: "pendente" }), ORG)).toThrow(FormaInvalida);
    expect(() => denunciaDeLista(linha({ tipo: "roubo" }), ORG)).toThrow(FormaInvalida);
    expect(() => denunciaDeLista(linha({ gravidade: "critica" }), ORG)).toThrow(FormaInvalida);
    expect(() => denunciaDeLista(linha({ id: undefined as unknown as string }), ORG)).toThrow(FormaInvalida);
  });

  it("comoLista aceita nulo como lista vazia e recusa o que não é lista", () => {
    expect(comoLista(null, "x")).toEqual([]);
    expect(comoLista([1], "x")).toEqual([1]);
    expect(() => comoLista({ a: 1 }, "x")).toThrow(FormaInvalida);
  });
});

describe("a denúncia aberta", () => {
  it("separa visados e conflitos, traduz o autor das mensagens e dá nome ao histórico", () => {
    const d = denunciaDeAberta(aberta({
      estado: "em_analise",
      impedidos: [{ anew_user_id: "u3", motivo: "visado" }, { anew_user_id: "u4", motivo: "conflito" }],
      mensagens: [
        { id: "m1", autor: "canal", texto: "Pode dizer-nos desde quando?", pedido_informacao: true, criada_em: "2026-10-16T10:00:00Z" },
        { id: "m2", autor: "denunciante", texto: "Desde Março.", criada_em: "2026-10-17T10:00:00Z" },
      ],
      notas: [{ id: "n1", autor_nome: "Helena Matos", texto: "Cruzar com o registo.", criada_em: "2026-10-16T11:00:00Z" }],
      eventos: [
        { id: "e1", tipo: "recebida", quem_nome: null, criado_em: "2026-10-15T09:30:00Z" },
        { id: "e2", tipo: "gravidade_alterada", quem_nome: "Helena Matos", dados: { depois: "alta" }, criado_em: "2026-10-16T09:00:00Z" },
        { id: "e3", tipo: "denunciante_respondeu", quem_nome: null, criado_em: "2026-10-17T10:00:00Z" },
      ],
      anexos: [{ nome_exibicao: "anexo-1.pdf", tamanho_bytes: 2048 }],
    }), ORG);
    expect(d.denunciados).toEqual(["u3"]);
    expect(d.conflitos).toEqual(["u4"]);
    expect(d.mensagens.map((m) => m.autor)).toEqual(["responsavel", "denunciante"]);
    expect(d.notas[0]).toMatchObject({ quem: "Helena Matos", texto: "Cruzar com o registo." });
    expect(d.historico.map((e) => e.quem)).toEqual(["@sistema", "Helena Matos", "@denunciante"]);
    expect(d.historico[1]).toMatchObject({ acao: "gravidade_alterada", detalhe: "alta" });
    expect(d.anexos).toEqual([{ nome: "anexo-1.pdf", tamanho: 2048 }]);
  });

  it("concluída leva a decisão e arquivada leva o motivo; as outras não levam nenhum dos dois", () => {
    const concluida = denunciaDeAberta(aberta({ estado: "concluida", resultado: "procedente", medidas: "Formação", fundamentacao: "Provado", decidida_em: "2026-10-20T10:00:00Z" }), ORG);
    expect(concluida.decisao).toMatchObject({ resultado: "procedente", medidas: "Formação", fundamentacao: "Provado" });
    expect(concluida.motivoArquivo).toBeNull();
    const arquivada = denunciaDeAberta(aberta({ estado: "arquivada", motivo_arquivo: "Duplicada" }), ORG);
    expect(arquivada.motivoArquivo).toBe("Duplicada");
    expect(arquivada.decisao).toBeNull();
    expect(denunciaDeAberta(aberta({ estado: "em_analise" }), ORG)).toMatchObject({ decisao: null, motivoArquivo: null });
  });

  it("concluída sem resultado válido é um erro (não se inventa o desfecho)", () => {
    expect(() => denunciaDeAberta(aberta({ estado: "concluida", resultado: null }), ORG)).toThrow(FormaInvalida);
  });

  it("listas em falta (mensagens, notas, eventos, anexos, impedidos) são um erro, não «vazio»", () => {
    expect(() => denunciaDeAberta(aberta({ mensagens: undefined as never }), ORG)).toThrow(FormaInvalida);
    expect(() => denunciaDeAberta(aberta({ impedidos: undefined as never }), ORG)).toThrow(FormaInvalida);
  });

  it("nunca leva identidade, mesmo que a resposta traga campos a mais", () => {
    const extra = { ...aberta(), identidade: { nome: "Inês" }, nome: "Inês", email: "i@x.pt" } as unknown as DenunciaAbertaDb;
    const d = denunciaDeAberta(extra, ORG);
    expect(d.identidade).toBeNull();
    expect(JSON.stringify(d)).not.toContain("Inês");
  });
});

describe("a vista do denunciante", () => {
  const vista = (extra: Partial<VistaDenuncianteDb> = {}): VistaDenuncianteDb => ({
    codigo: "DEN-2026-0039", estado: "mais_info", recebida_em: "2026-09-21T10:00:00Z", confirmada_em: "2026-09-23T10:00:00Z",
    resultado: null, medidas: null, motivo_arquivo: null, mensagens: [{ id: "m1", autor: "canal", texto: "Mais informação?", criada_em: "2026-09-24T10:00:00Z" }], ...extra,
  });

  it("usa o id dado, nunca mostra gravidade, notas nem responsável, e as mensagens do canal ficam «responsavel»", () => {
    const d = denunciaDeVista(vista(), ORG, "acomp:DEN-2026-0039");
    expect(d).toMatchObject({ id: "acomp:DEN-2026-0039", codigo: "DEN-2026-0039", estado: "mais_info", responsavelId: null, notas: [], historico: [] });
    expect(d.mensagens[0].autor).toBe("responsavel");
  });

  it("o desfecho de uma concluída aparece e o de uma arquivada também", () => {
    expect(denunciaDeVista(vista({ estado: "concluida", resultado: "improcedente", medidas: "Nenhuma" }), ORG, "x").decisao).toMatchObject({ resultado: "improcedente", medidas: "Nenhuma" });
    expect(denunciaDeVista(vista({ estado: "arquivada", motivo_arquivo: "Sem competência" }), ORG, "x").motivoArquivo).toBe("Sem competência");
  });
});

describe("identidade, responsáveis e contagem", () => {
  it("a identidade passa a ter texto vazio onde a base devolve nulo, e o contacto só se presume restrito", () => {
    expect(identidadeDeDb({ nome: "Inês", email: null, telefone: null, pode_contactar: false, so_responsavel: true })).toEqual({
      nome: "Inês", email: "", telefone: "", podemContactar: false, soResponsavel: true,
    });
  });

  it("um responsável sem nome é um erro", () => {
    expect(responsavelDeDb({ id: "u1", nome: "Helena Matos" })).toEqual({ id: "u1", nome: "Helena Matos", area: "" });
    expect(() => responsavelDeDb({ id: "u1" } as never)).toThrow(FormaInvalida);
  });

  it("a contagem do menu é um inteiro; qualquer outra coisa é um erro, nunca zero", () => {
    expect(contagemDe(3)).toBe(3);
    expect(contagemDe("2")).toBe(2);
    expect(contagemDe(0)).toBe(0);
    for (const mau of [null, undefined, -1, 1.5, "x", {}]) expect(() => contagemDe(mau)).toThrow(FormaInvalida);
  });
});
