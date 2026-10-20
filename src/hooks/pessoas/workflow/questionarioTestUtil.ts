// Só para testes: o questionário tal como neg_questionario_levantamento o devolve (com inativas), com ids reais e a ordem da base.
// Tem Visitas e Medidas (especiais), uma secção normal com uma condição, e a Qualificação com escolha múltipla, texto e número.
export const uuid = (n: number): string => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const opcao = (n: number, chave: string, texto: string, ordem: number, activa = true) => ({ id: uuid(n), chave, texto, ordem, activa });

const SEC_VISITAS = { id: uuid(1), chave: "visitas", titulo: "Visitas", aba: "visita", especial: "visitas", ordem: 0, activa: true, perguntas: [] };
const SEC_EXTERIOR = {
  id: uuid(2), chave: "exterior", titulo: "Exterior do edifício", aba: "visita", especial: null, ordem: 1, activa: true,
  perguntas: [
    {
      id: uuid(10), chave: "acesso", texto: "Acesso", tipo: "escolha_unica", bloco: "Acesso e estacionamento", ordem: 0, activa: true,
      numero: null, texto_max: null, depende: null,
      opcoes: [opcao(100, "facil", "Fácil", 0), opcao(101, "dificil", "Difícil", 1)],
    },
    {
      id: uuid(11), chave: "impactoPreco", texto: "Impacto no preço", tipo: "escolha_unica", bloco: "Acesso e estacionamento", ordem: 1, activa: true,
      numero: null, texto_max: null,
      depende: { pergunta_id: uuid(10), pergunta_chave: "acesso", opcoes: ["dificil"], sem_resposta: false },
      opcoes: [opcao(110, "p5", "5%", 0), opcao(111, "p10", "10%", 1, false)],
    },
    {
      id: uuid(12), chave: "notas", texto: "Notas sobre o exterior", tipo: "texto", bloco: null, ordem: 2, activa: true,
      numero: null, texto_max: 2000, depende: null, opcoes: [],
    },
  ],
};
const SEC_MEDIDAS = { id: uuid(3), chave: "medidas", titulo: "Medidas da área", aba: "visita", especial: "medidas", ordem: 2, activa: true, perguntas: [] };
const SEC_QUALIFICACAO = {
  id: uuid(4), chave: "qualificacao", titulo: "Qualificação", aba: "qualificacao", especial: null, ordem: 3, activa: true,
  perguntas: [
    {
      id: uuid(20), chave: "imovel", texto: "Tipo de imóvel", tipo: "escolha_multipla", bloco: null, ordem: 0, activa: true,
      numero: null, texto_max: null, depende: null,
      opcoes: [opcao(200, "apartamento", "Apartamento", 0), opcao(201, "moradia", "Moradia", 1)],
    },
    {
      id: uuid(21), chave: "orcCliente", texto: "Orçamento do cliente", tipo: "numero", bloco: null, ordem: 1, activa: true,
      numero: { min: 0, max: 100000, casas: 2, unidade: "€" }, texto_max: null, depende: null, opcoes: [],
    },
  ],
};

export const QUESTIONARIO_BRUTO = { versao: 7, seccoes: [SEC_VISITAS, SEC_EXTERIOR, SEC_MEDIDAS, SEC_QUALIFICACAO] };

/** Uma cópia profunda, para um teste mexer sem estragar os outros. */
export const copiarBruto = (): typeof QUESTIONARIO_BRUTO => JSON.parse(JSON.stringify(QUESTIONARIO_BRUTO));
