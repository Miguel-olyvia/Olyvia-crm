// O resumo de leitura de cada passo do guia (rótulo e valor), só com o que a ficha e o negócio já trazem. Com os textos reais em português;
// um valor `null` é «nada guardado» (o ecrã escreve «Por preencher»).
import { describe, expect, it } from "vitest";
import type { RespostaGravada } from "@/components/negocio-metas/respostasQuestionario";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import { dadosDoGuia } from "./guiaDados";
import { resumosDoGuia } from "./guiaResumos";
import { contactoBase, levantamentoBase, negocioBase, pessoaBase, visitaPessoaBase } from "./fabricaTestes";
import { calcularPassoGuiado, fasesDaPessoa, type LinhaResumo } from "./processo/passoGuiado";
import type { ItemProcesso } from "./processo/tiposProcesso";

const textos = pessoasPaginaTranslations.pt as Record<string, string>;
const t = (chave: string, params?: Record<string, string | number>): string =>
  Object.entries(params ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), textos[chave] ?? chave);

const VAZIOS = { contactos: [], visitas: [], levantamentos: [] };
/** As linhas de um passo como `{ rótulo: valor }`, para ler o teste. */
const lidas = (linhas: readonly LinhaResumo[] | undefined): Record<string, string | null> => Object.fromEntries((linhas ?? []).map((l) => [l.rotulo, l.valor]));

const gravada = (extra: Partial<RespostaGravada>): RespostaGravada => ({
  seccao: "s", pergunta: "p", resposta: null, tipo: null, perguntaTexto: null, seccaoTitulo: null, bloco: null, ordem: null,
  escolhas: null, escolhasTexto: null, valorTexto: null, valorNumero: null, ...extra,
});

describe("resumosDoGuia: Por contactar", () => {
  it("quem pede mostra o nome, o tipo, a empresa e os últimos 3 dígitos do NIF", () => {
    const p = pessoaBase("a", { nome: "Ana Lopes", tipoCliente: "empresa", empresa: { nome: "Lopes & Filhos" }, nifUltimos3: "789", temNif: true });
    expect(lidas(resumosDoGuia(t, p, VAZIOS).quemPede)).toEqual({ Nome: "Ana Lopes", "Tipo de cliente": "Empresa", Empresa: "Lopes & Filhos", NIF: "Terminado em 789" });
  });

  it("um particular sem nada: não pergunta pela empresa; tipo e NIF ficam por preencher (null)", () => {
    const l = lidas(resumosDoGuia(t, pessoaBase("a", { nome: "Rui" }), VAZIOS).quemPede);
    expect(l).toEqual({ Nome: "Rui", "Tipo de cliente": null, NIF: null });
  });

  it("com NIF registado sem dígitos diz «Registado»", () => {
    expect(lidas(resumosDoGuia(t, pessoaBase("a", { temNif: true }), VAZIOS).quemPede).NIF).toBe("Registado");
  });

  it("o contacto traz telefone, email e as preferências; o que falta fica null", () => {
    const p = pessoaBase("a", { contacto: { telefone: "912 000 000", email: null }, contactoPreferido: "whatsapp", horaPreferida: "tarde", lingua: "pt" });
    expect(lidas(resumosDoGuia(t, p, VAZIOS).contacto)).toEqual({
      Telefone: "912 000 000", Email: null, "Prefere ser contactado": "WhatsApp", "Melhor hora": "Tarde", Idioma: "Português",
    });
  });

  it("uma língua que a lista não conhece mostra o código tal como a base o guarda", () => {
    expect(lidas(resumosDoGuia(t, pessoaBase("a", { lingua: "es" }), VAZIOS).contacto).Idioma).toBe("es");
  });

  it("a origem mostra a campanha e o formulário, e null onde não há", () => {
    expect(lidas(resumosDoGuia(t, pessoaBase("a", { campanha: "Verão" }), VAZIOS).origem)).toEqual({ Campanha: "Verão", Formulário: null });
  });
});

describe("resumosDoGuia: Contactado", () => {
  it("a chamada é a mais recente, com resultado, dia, hora e nota; e quantas há", () => {
    const registos = { ...VAZIOS, contactos: [
      contactoBase("c1", { data: "2026-10-20", resultado: "naoAtendeu", nota: "Antiga" }),
      contactoBase("c2", { data: "2026-10-25", hora: "09:30", resultado: "atendeuInteressado", nota: "Quer visita" }),
    ] };
    expect(lidas(resumosDoGuia(t, pessoaBase(), registos).chamada)).toEqual({
      "Chamadas registadas": "2", Resultado: "Atendeu · interessado", Quando: "25/10/2026 · 09:30", Nota: "Quer visita",
    });
  });

  it("sem chamadas tudo fica por preencher; uma nota vazia também", () => {
    expect(lidas(resumosDoGuia(t, pessoaBase(), VAZIOS).chamada)).toEqual({ "Chamadas registadas": null, Resultado: null, Quando: null, Nota: null });
    const semNota = { ...VAZIOS, contactos: [contactoBase("c1", { nota: "  " })] };
    expect(lidas(resumosDoGuia(t, pessoaBase(), semNota).chamada).Nota).toBeNull();
  });

  it("a qualificação lê o pedido e as respostas gravadas (texto visto, não a chave); sem nada guardado não há resumo", () => {
    const negocio = {
      pedidoCliente: "Casa de banho nova",
      qualificacaoGravada: [
        gravada({ pergunta: "q1", perguntaTexto: "Quando quer a obra?", escolhasTexto: ["Este mês", "Já"] }),
        gravada({ pergunta: "q2", perguntaTexto: "Orçamento previsto", valorNumero: 5000 }),
        gravada({ pergunta: "q3", perguntaTexto: "Notas", valorTexto: "  " }),
      ],
    };
    expect(lidas(resumosDoGuia(t, pessoaBase(), VAZIOS, negocio).qualificacao)).toEqual({
      "O que o cliente pediu": "Casa de banho nova", "Quando quer a obra?": "Este mês, Já", "Orçamento previsto": "5000", Notas: null,
    });
    expect(resumosDoGuia(t, pessoaBase(), VAZIOS, {}).qualificacao).toBeUndefined();
    expect(resumosDoGuia(t, pessoaBase(), VAZIOS).qualificacao).toBeUndefined();
  });

  it("a visita marcada mostra dia, hora, estado, tipo, quem vai, duração, morada e nota", () => {
    const v = visitaPessoaBase("v1", {
      data: "2026-10-30", hora: "14:30", quemVaiEstar: "casal", duracao: "h1", nota: "Levar trena", tipo: "medicao",
      morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "2.º Esq" },
      agenda: { boardId: "b1", recursos: [{ id: "r1", nome: "Marta" }, { id: "r2", nome: "Hugo" }], duracaoMinutos: 60 },
    });
    expect(lidas(resumosDoGuia(t, pessoaBase(), { ...VAZIOS, visitas: [v] }).visitaMarcada)).toEqual({
      Quando: "30/10/2026 · 14:30", Estado: "Marcada", "Tipo de visita": "Medição técnica", "Quem vai à visita": "Marta, Hugo", "Quem vai estar": "O casal",
      Duração: "1 h", Morada: "Rua A 1, 1000-001 Lisboa, 2.º Esq", Nota: "Levar trena",
    });
  });

  it("sem visita (ou só cancelada) todas as linhas ficam por preencher", () => {
    const cancelada = { ...VAZIOS, visitas: [visitaPessoaBase("v1", { estado: "cancelada" })] };
    for (const registos of [VAZIOS, cancelada]) {
      const valores = Object.values(lidas(resumosDoGuia(t, pessoaBase(), registos).visitaMarcada));
      expect(valores.length).toBeGreaterThan(0);
      expect(valores.every((x) => x === null)).toBe(true);
    }
  });
});

describe("resumosDoGuia: Visita e Levantamento", () => {
  it("a visita feita mostra o dia, o resultado, quem a fez e a nota", () => {
    const v = visitaPessoaBase("v1", { estado: "feita", data: "2026-10-20", hora: "10:00", resultado: "aPensar", feitoPor: "Marta", nota: "Quer ver preços" });
    expect(lidas(resumosDoGuia(t, pessoaBase(), { ...VAZIOS, visitas: [v] }).visitaFeita)).toEqual({
      Quando: "20/10/2026 · 10:00", Resultado: "A pensar", "Feito por": "Marta", Nota: "Quer ver preços",
    });
  });

  it("uma visita só marcada não tem visita feita: resultado e nota por preencher", () => {
    const l = lidas(resumosDoGuia(t, pessoaBase(), { ...VAZIOS, visitas: [visitaPessoaBase("v1")] }).visitaFeita);
    expect(l.Quando).toBeNull();
    expect(l.Resultado).toBeNull();
  });

  it("o levantamento conta as linhas de medidas e as respostas, e mostra as observações", () => {
    const linha = { id: "x", divisao: "WC", trabalho: "t", trabalhoOutro: "", medida: "4", unidade: "m2" as const, observacoes: "" };
    const lev = levantamentoBase("l1", {
      data: "2026-10-21", feitoPor: "Hugo",
      rascunho: { linhas: [linha, { ...linha, id: "y" }], observacoes: "Azulejo partido", respostas: {}, gravadas: [gravada({ pergunta: "a" })] },
    });
    expect(lidas(resumosDoGuia(t, pessoaBase(), { ...VAZIOS, levantamentos: [lev] }).levantamento)).toEqual({
      Quando: "21/10/2026", "Feito por": "Hugo", "Linhas de medidas": "2", "Respostas ao questionário": "1", Observações: "Azulejo partido",
    });
  });

  it("um levantamento vazio deixa medidas, respostas e observações por preencher", () => {
    const l = lidas(resumosDoGuia(t, pessoaBase(), { ...VAZIOS, levantamentos: [levantamentoBase("l1")] }).levantamento);
    expect(l).toMatchObject({ "Linhas de medidas": null, "Respostas ao questionário": null, Observações: null });
  });
});

describe("resumosDoGuia: documentos do negócio", () => {
  it("o orçamento diz quantos há e o valor do escolhido", () => {
    const n = negocioBase("n", { orcamentos: [{ id: "o1", valor: 1500, escolhido: true }, { id: "o2", valor: 900, escolhido: false }] });
    const l = lidas(resumosDoGuia(t, pessoaBase(), VAZIOS, n).orcamento);
    expect(l.Orçamentos).toBe("2");
    expect(l["Valor do orçamento escolhido"]).toMatch(/^1\s?500,00\s€$/);
  });

  it("proposta e contrato dizem o estado; a resposta e a assinatura só quando aconteceram", () => {
    const pendente = resumosDoGuia(t, pessoaBase(), VAZIOS, negocioBase("n", { proposta: { estado: "enviada" }, contrato: { estado: "pendente" } }));
    expect(lidas(pendente.propostaEnviada)).toEqual({ "Estado da proposta": "Enviada" });
    expect(lidas(pendente.respostaCliente)).toEqual({ "Resposta do cliente": null });
    expect(lidas(pendente.contratoCriado)).toEqual({ "Estado do contrato": "Por assinar" });
    expect(lidas(pendente.contratoAssinado)).toEqual({ "Contrato assinado": null });
    const feito = resumosDoGuia(t, pessoaBase(), VAZIOS, negocioBase("n", { proposta: { estado: "aceite" }, contrato: { estado: "assinado" } }));
    expect(lidas(feito.respostaCliente)).toEqual({ "Resposta do cliente": "Aceite" });
    expect(lidas(feito.contratoAssinado)).toEqual({ "Contrato assinado": "Assinado" });
  });

  it("sem proposta nem contrato os estados ficam por preencher; sem negócio não há resumo de documentos", () => {
    const vazio = resumosDoGuia(t, pessoaBase(), VAZIOS, negocioBase("n"));
    expect(lidas(vazio.propostaCriada)).toEqual({ "Estado da proposta": null });
    expect(lidas(vazio.orcamento)).toEqual({ Orçamentos: null, "Valor do orçamento escolhido": null });
    expect(resumosDoGuia(t, pessoaBase(), VAZIOS).orcamento).toBeUndefined();
  });
});

describe("dadosDoGuia e calcularPassoGuiado levam o resumo até à lista da fase", () => {
  const item = (extra: Partial<ItemProcesso>): ItemProcesso => ({
    id: "pessoa-a", pessoaId: "a", tipo: "pessoa", fase: "visita", trabalho: null, valor: null, prazo: null, atrasado: false, orcamentos: 0,
    verificacao: "semDetalhe", propostaRascunho: false, visitaFeita: false, ...extra,
  });
  const contexto = (dados: ReturnType<typeof dadosDoGuia>) => ({
    dados, fases: fasesDaPessoa("visita"), podeEditar: true, podeCriar: true, pessoaFechada: false, ligados: new Set<never>(),
  });

  it("sem tradutor não há resumos (nem linhas nos itens)", () => {
    const d = dadosDoGuia(pessoaBase("a", { nome: "Paulo" }), VAZIOS);
    expect(d.resumos).toBeUndefined();
    expect(calcularPassoGuiado(item({}), contexto(d)).feitas[0].itens.every((i) => i.linhas === undefined)).toBe(true);
  });

  it("numa fase feita cada item leva as suas linhas, e a qualificação entra em Contactado só se houver o que ler", () => {
    const negocio = { pedidoCliente: "WC" };
    const d = dadosDoGuia(pessoaBase("a", { nome: "Paulo", campanha: "Verão" }), VAZIOS, t, negocio);
    const feitas = calcularPassoGuiado(item({}), contexto(d)).feitas;
    expect(lidas(feitas[0].itens.find((i) => i.id === "quemPede")?.linhas).Nome).toBe("Paulo");
    expect(feitas[1].itens.map((i) => i.id)).toEqual(["chamada", "qualificacao", "visitaMarcada"]);
    expect(lidas(feitas[1].itens.find((i) => i.id === "qualificacao")?.linhas)).toEqual({ "O que o cliente pediu": "WC" });
    const sem = calcularPassoGuiado(item({}), contexto(dadosDoGuia(pessoaBase(), VAZIOS, t))).feitas;
    expect(sem[1].itens.map((i) => i.id)).toEqual(["chamada", "visitaMarcada"]);
  });
});
