// A Qualificação de "Novo negócio": as seis perguntas e as opções do protótipo (grupo "Qualificação" de campos.ts),
// copiadas como constantes de exemplo próprias. Todas opcionais. Só exemplo.
import type { BlocoDef } from "./perguntasTipos";
import { SIM_NAO } from "./perguntasTipos";

export const BLOCO_QUALIFICACAO: BlocoDef = {
  id: "qualificacao",
  perguntas: [
    {
      id: "imovel", rotulo: ["Tipo de imóvel", "Property type"],
      opcoes: [["apartamento", "Apartamento", "Apartment"], ["moradia", "Moradia", "House"], ["loja", "Loja", "Shop"], ["escritorio", "Escritório", "Office"]],
    },
    {
      id: "posse", rotulo: ["O cliente é", "The client is"],
      opcoes: [["proprietario", "Proprietário", "Owner"], ["inquilino", "Inquilino", "Tenant"], ["administracao", "Administração", "Management"]],
    },
    {
      id: "decisor", rotulo: ["Quem decide", "Who decides"],
      opcoes: [["proprio", "O próprio", "The client"], ["familia", "Com a família", "With the family"], ["administracao", "Administração", "Management"]],
    },
    {
      id: "orcCliente", rotulo: ["Orçamento do cliente", "Client budget"],
      opcoes: [
        ["ate3000", "Até 3.000 €", "Up to €3,000"], ["de3000a6000", "3.000 a 6.000 €", "€3,000 to €6,000"],
        ["de6000a10000", "6.000 a 10.000 €", "€6,000 to €10,000"], ["mais10000", "Mais de 10.000 €", "Over €10,000"],
        ["naoSabe", "Não sabe", "Does not know"],
      ],
    },
    {
      id: "prazo", rotulo: ["Para quando", "When"],
      opcoes: [
        ["urgente", "Urgente (1 mês)", "Urgent (1 month)"], ["de1a3", "1 a 3 meses", "1 to 3 months"],
        ["de3a6", "3 a 6 meses", "3 to 6 months"], ["semPressa", "Sem pressa", "No rush"],
      ],
    },
    { id: "outrosOrc", rotulo: ["Pediu outros orçamentos", "Asked for other quotes"], opcoes: SIM_NAO },
  ],
};
