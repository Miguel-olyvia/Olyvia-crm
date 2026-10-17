// Os levantamentos de exemplo dos casos variados (ver `pessoasExemploVariado.ts`): as linhas de medidas e as respostas das secções da
// visita (Exterior, Interior, Área, Necessidades e Escolhas; as Visitas e as Medidas são a lista de visitas e as linhas). As chaves
// são as das listas da aba Visita (`visitaExemplo.ts`) e do levantamento (`levantamentoExemplo.ts`). Valores inventados.
import { levantamentoDoPedido, linha, linhaOutro } from "./exemploVariadoApoio";

/** Helga (pedido): casa de banho completa. 5 linhas de medidas e 15 respostas, das 5 secções com perguntas. */
export const LEVANTAMENTO_HELGA = levantamentoDoPedido(
  [
    linha("l1", "casaDeBanho", "bancaPorDuche", "1", "un", "Base de 120x80, a banheira sai inteira"),
    linha("l2", "casaDeBanho", "sanita", "1", "un"),
    linha("l3", "casaDeBanho", "azulejos", "18,5", "m2", "Até ao teto, cor clara"),
    linha("l4", "casaDeBanho", "canalizacao", "1", "un", "Trocar as colunas de água quente e fria"),
    linhaOutro("l5", "outra", "Janela de ventilação", "1"),
  ],
  {
    acesso: "facil", estacionamento: "naoPago", distEntulho: "ate10", temElevador: "nao",
    tipoEspaco: "casa", tipologia: "t2", epoca: "de1970a1990", eletrica: "antiga", canalizacao: "ferro", habitada: "sim",
    intervencao: "total", peDireito: "m25", toalheiro: "sim", mantemLoucas: "nao", materiaisCliente: "nao",
  },
  "Moradia com um só quarto de banho; a obra tem de acabar antes do Natal.",
);

/** Otília (negócio em Proposta): outra casa de banho, com menos trabalhos. */
export const LEVANTAMENTO_OTILIA_BANHO = levantamentoDoPedido(
  [
    linha("l1", "casaDeBanho", "bancaPorDuche", "1", "un"),
    linha("l2", "casaDeBanho", "azulejos", "14", "m2", "Só as paredes do duche"),
    linha("l3", "casaDeBanho", "canalizacao", "1", "un"),
  ],
  {
    acesso: "facil", estacionamento: "pago", zonaEstacionamento: "verde", temElevador: "sim", tipoEspaco: "casa", tipologia: "t3",
    eletrica: "renovada", habitada: "sim", intervencao: "parcial", peDireito: "m26", toalheiro: "nao", mantemLoucas: "sim",
    mantemPavimento: "sim", materiaisCliente: "nao",
  },
  "Mantém a sanita e o pavimento.",
);

/** Otília (negócio em Contrato): cozinha, com bancada e eletrodomésticos. */
export const LEVANTAMENTO_OTILIA_COZINHA = levantamentoDoPedido(
  [
    linha("l1", "cozinha", "bancada", "4,2", "m", "Em L, com 60 cm de profundidade"),
    linha("l2", "cozinha", "eletrodomesticos", "5", "un", "Forno, placa, exaustor, frigorífico e máquina de loiça"),
    linha("l3", "cozinha", "azulejos", "9", "m2"),
    linha("l4", "cozinha", "pavimento", "14", "m2", "Vinílico, sobre o existente"),
  ],
  {
    acesso: "dificil", impactoPreco: "p10", estacionamento: "sem", distEntulho: "de10a30", temElevador: "nao",
    tipoEspaco: "casa", tipologia: "t3", epoca: "de1990a2010", gas: "canalizado", habitada: "sim",
    intervencao: "total", peDireito: "m25", gasArea: "manter", mantemMoveis: "nao", materiaisCliente: "sim", mobilidadeReduzida: "nao",
  },
  "O cliente fornece o frigorífico e a máquina de loiça.",
);
