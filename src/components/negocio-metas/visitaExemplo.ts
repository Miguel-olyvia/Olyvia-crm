// A Visita de "Novo negócio": as sete secções do protótipo, com as perguntas de escolha rápida e as opções que lá
// existem (campos.ts: VISITA_BASE, EXTERIOR, INTERIOR, AREA, ESCOLHAS; PERGUNTA0 do catálogo), copiadas como constantes
// de exemplo próprias. Ficam de fora as perguntas de número, contador, texto e escolha múltipla (as medidas e o texto
// livre vivem nas linhas do levantamento). Só exemplo.
import type { SeccaoDef } from "./perguntasTipos";
import { SIM_NAO, SIM_NAO_NAO_SEI } from "./perguntasTipos";

const VISITAS: SeccaoDef = {
  id: "visitas", titulo: ["Visitas", "Visits"], especial: "visitas",
  blocos: [{
    id: "visita",
    perguntas: [
      {
        id: "tipoVisita", rotulo: ["Tipo de visita", "Visit type"],
        opcoes: [
          ["levantamento", "Levantamento", "Survey"], ["medicao", "Medição técnica", "Technical measurement"],
          ["materiais", "Escolha de materiais", "Choice of materials"], ["revisita", "Revisita", "Revisit"],
        ],
      },
      {
        id: "hora", rotulo: ["Hora", "Time"],
        opcoes: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"].map((h) => [`h${h.slice(0, 2)}`, h, h] as const),
      },
      {
        id: "presentes", rotulo: ["Quem vai estar", "Who will be there"],
        opcoes: [["cliente", "O cliente", "The client"], ["casal", "O casal", "The couple"], ["familia", "A família", "The family"], ["outra", "Outra pessoa", "Someone else"]],
      },
      {
        id: "duracao", rotulo: ["Duração", "Duration"],
        opcoes: [["m30", "30 min", "30 min"], ["h1", "1 h", "1 h"], ["h1m30", "1 h 30", "1 h 30"], ["h2", "2 h", "2 h"]],
      },
    ],
  }],
};

const EXTERIOR: SeccaoDef = {
  id: "exterior", titulo: ["Exterior do edifício", "Building exterior"],
  blocos: [
    {
      id: "acessoEstacionamento", titulo: ["Acesso e estacionamento", "Access and parking"],
      perguntas: [
        { id: "acesso", rotulo: ["Acesso", "Access"], opcoes: [["facil", "Fácil", "Easy"], ["dificil", "Difícil", "Difficult"]] },
        {
          id: "impactoPreco", rotulo: ["Impacto no preço", "Price impact"], se: { pergunta: "acesso", valores: ["dificil"] },
          opcoes: [["p5", "5%", "5%"], ["p10", "10%", "10%"], ["p15", "15%", "15%"], ["p20", "20%", "20%"]],
        },
        {
          id: "estacionamento", rotulo: ["Estacionamento", "Parking"],
          opcoes: [["pago", "Pago", "Paid"], ["naoPago", "Não pago", "Free"], ["sem", "Sem estacionamento", "No parking"]],
        },
        {
          id: "zonaEstacionamento", rotulo: ["Zona de estacionamento", "Parking zone"], se: { pergunta: "estacionamento", valores: ["pago"] },
          opcoes: [["verde", "Verde", "Green"], ["amarela", "Amarela", "Yellow"], ["vermelha", "Vermelha", "Red"]],
        },
        {
          id: "distEntulho", rotulo: ["Da porta ao big bag ou contentor", "From the door to the big bag or skip"],
          opcoes: [["ate10", "Até 10 m", "Up to 10 m"], ["de10a30", "10 a 30 m", "10 to 30 m"], ["mais30", "Mais de 30 m", "Over 30 m"]],
        },
      ],
    },
    { id: "predio", titulo: ["O prédio", "The building"], perguntas: [{ id: "temElevador", rotulo: ["Tem elevador", "Has a lift"], opcoes: SIM_NAO }] },
  ],
};

const INTERIOR: SeccaoDef = {
  id: "interior", titulo: ["Interior do espaço", "Interior"],
  blocos: [
    {
      id: "espaco", titulo: ["O espaço", "The space"],
      perguntas: [
        { id: "tipoEspaco", rotulo: ["Tipo de espaço", "Space type"], opcoes: [["casa", "Casa", "Home"], ["escritorio", "Escritório", "Office"]] },
        {
          id: "tipologia", rotulo: ["Tipologia", "Layout"], se: { pergunta: "tipoEspaco", valores: ["casa", ""] },
          opcoes: ["T0", "T1", "T2", "T3", "T4", "T5+"].map((t) => [t.toLowerCase().replace("+", "mais"), t, t] as const),
        },
        {
          id: "epoca", rotulo: ["Época de construção", "Construction period"],
          opcoes: [
            ["antes1950", "Antes de 1950", "Before 1950"], ["de1950a1970", "1950 a 1970", "1950 to 1970"], ["de1970a1990", "1970 a 1990", "1970 to 1990"],
            ["de1990a2010", "1990 a 2010", "1990 to 2010"], ["depois2010", "Depois de 2010", "After 2010"],
          ],
        },
      ],
    },
    {
      id: "instalacoes", titulo: ["Instalações", "Installations"],
      perguntas: [
        { id: "eletrica", rotulo: ["Instalação elétrica", "Electrical installation"], opcoes: [["antiga", "Antiga", "Old"], ["renovada", "Renovada", "Renovated"]] },
        { id: "quadroDiferencial", rotulo: ["Quadro com diferencial", "Panel with RCD"], opcoes: SIM_NAO },
        {
          id: "canalizacao", rotulo: ["Canalização", "Plumbing"],
          opcoes: [
            ["ferro", "Ferro", "Iron"], ["pvc", "PVC", "PVC"], ["multicamada", "Multicamada", "Multilayer"],
            ["cobre", "Cobre", "Copper"], ["misto", "Misto", "Mixed"], ["naoSei", "Não sei", "Not sure"],
          ],
        },
        { id: "gas", rotulo: ["Gás", "Gas"], opcoes: [["canalizado", "Canalizado", "Piped"], ["garrafa", "Garrafa", "Bottle"], ["semGas", "Sem gás", "No gas"]] },
      ],
    },
    {
      id: "duranteObra", titulo: ["Durante a obra", "During the works"],
      perguntas: [
        { id: "amianto", rotulo: ["Amianto", "Asbestos"], opcoes: SIM_NAO_NAO_SEI },
        { id: "habitada", rotulo: ["Habitada durante a obra", "Lived in during the works"], opcoes: SIM_NAO },
        { id: "animais", rotulo: ["Animais", "Pets"], opcoes: SIM_NAO },
      ],
    },
  ],
};

const AREA: SeccaoDef = {
  id: "area", titulo: ["Área de intervenção", "Work area"],
  blocos: [
    {
      id: "divisao", titulo: ["A divisão", "The room"],
      perguntas: [
        {
          id: "intervencao", rotulo: ["Intervenção", "Type of work"],
          opcoes: [["total", "Remodelação total", "Full renovation"], ["parcial", "Remodelação parcial", "Partial renovation"], ["substituir", "Só substituir", "Replace only"]],
        },
        {
          id: "peDireito", rotulo: ["Pé-direito", "Ceiling height"],
          opcoes: [["m24", "2,4 m", "2.4 m"], ["m25", "2,5 m", "2.5 m"], ["m26", "2,6 m", "2.6 m"], ["m27", "2,7 m", "2.7 m"], ["m28", "2,8 m", "2.8 m"], ["m3", "3 m ou mais", "3 m or more"]],
        },
      ],
    },
    {
      id: "instalacoesDivisao", titulo: ["Instalações da divisão", "Room installations"],
      perguntas: [
        {
          id: "gasArea", rotulo: ["Gás na área", "Gas in the area"],
          opcoes: [["naoHa", "Não há", "None"], ["manter", "Manter", "Keep"], ["anular", "Anular", "Cap off"], ["instalar", "Instalar", "Install"]],
        },
        { id: "toalheiro", rotulo: ["Toalheiro elétrico", "Electric towel rail"], opcoes: SIM_NAO },
        { id: "janela", rotulo: ["Janela na área", "Window in the area"], opcoes: SIM_NAO },
      ],
    },
    {
      id: "trabalhoProtecoes", titulo: ["Trabalho e proteções", "Work and protection"],
      perguntas: [
        {
          id: "localCortes", rotulo: ["Onde se fazem os cortes", "Where cutting is done"],
          opcoes: [["propria", "Na própria área", "In the area itself"], ["varanda", "Varanda", "Balcony"], ["fora", "Fora (garagem, rua)", "Outside (garage, street)"]],
        },
        {
          id: "distEntrada", rotulo: ["Da entrada até à área", "From the entrance to the area"],
          opcoes: [["curta", "Curta (até 5 m)", "Short (up to 5 m)"], ["media", "Média (5–15 m)", "Medium (5–15 m)"], ["longa", "Longa (+15 m)", "Long (15+ m)"]],
        },
        {
          id: "mobilada", rotulo: ["Casa mobilada no caminho", "Furniture in the way"],
          opcoes: [["pouco", "Pouco", "Little"], ["medio", "Médio", "Some"], ["muito", "Muito", "A lot"]],
        },
      ],
    },
  ],
};

const MEDIDAS: SeccaoDef = { id: "medidas", titulo: ["Medidas da área", "Area measurements"], blocos: [], especial: "medidas" };

const SIM_MANTEM = [["sim", "Sim, mantém", "Yes, keeps it"], ["nao", "Não, vai trocar", "No, will replace it"]] as const;

const NECESSIDADES: SeccaoDef = {
  id: "necessidades", titulo: ["Necessidades do cliente", "Client needs"],
  blocos: [{
    id: "manter", titulo: ["O que o cliente mantém", "What the client keeps"],
    perguntas: [
      { id: "mantemLoucas", rotulo: ["O cliente mantém a sanita e a base de duche?", "Does the client keep the toilet and the shower tray?"], opcoes: SIM_MANTEM },
      { id: "mantemBanheira", rotulo: ["O cliente mantém a banheira?", "Does the client keep the bathtub?"], opcoes: SIM_MANTEM },
      { id: "mantemPavimento", rotulo: ["O cliente mantém o pavimento?", "Does the client keep the flooring?"], opcoes: SIM_MANTEM },
      { id: "mantemMoveis", rotulo: ["O cliente mantém os móveis?", "Does the client keep the furniture?"], opcoes: SIM_MANTEM },
    ],
  }],
};

const ESCOLHAS: SeccaoDef = {
  id: "escolhas", titulo: ["Escolhas do cliente", "Client choices"],
  blocos: [{
    id: "escolhasCliente",
    perguntas: [
      { id: "materiaisCliente", rotulo: ["O cliente fornece materiais", "The client supplies materials"], opcoes: SIM_NAO },
      { id: "mobilidadeReduzida", rotulo: ["Mobilidade reduzida", "Reduced mobility"], opcoes: SIM_NAO },
    ],
  }],
};

/** As sete secções da aba Visita, pela ordem do protótipo. */
export const SECCOES_VISITA: readonly SeccaoDef[] = [VISITAS, EXTERIOR, INTERIOR, AREA, MEDIDAS, NECESSIDADES, ESCOLHAS];
