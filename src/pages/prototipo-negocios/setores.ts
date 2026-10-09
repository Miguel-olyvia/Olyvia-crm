// Modelos por setor (protótipo, 09/10/2026): o mesmo fluxo de Negócios serve
// empresas diferentes só com ajustes aos campos. Cada modelo é um CfgCampos;
// a empresa parte dele e continua a ajustar no editor.
import type { CfgCampos } from "./campos";

export interface Setor { id: string; nome: string; texto: string; cfg: CfgCampos }

const SN = (k: string, l: string, extra: object = {}) => ({ k, l, t: "sim_nao" as const, novo: true, ...extra });
const ESC = (k: string, l: string, op: string[], extra: object = {}) => ({ k, l, t: "escolha" as const, op, novo: true, ...extra });

export const SETORES: Setor[] = [
  {
    id: "remodelacao", nome: "Remodelação", texto: "Casas de banho e cozinhas. É o modelo da Mudelar: os campos de base, sem ajustes.",
    cfg: {},
  },
  {
    id: "avac", nome: "Climatização (AVAC)", texto: "Ar condicionado e bombas de calor. A visita olha para o espaço a climatizar e para a eletricidade.",
    cfg: {
      "Local · exterior (edifício e acessos)": {
        nome: "Exterior e unidade exterior",
        ocultos: ["n_fracoes_por_andar"],
        novos: [
          ESC("ext_unidade", "Onde fica a unidade exterior", ["Varanda", "Fachada", "Telhado", "Terraço"], { bloco: "Unidade exterior" }),
          SN("ext_condominio", "Precisa de autorização do condomínio", { bloco: "Unidade exterior" }),
          ESC("ext_distancia", "Distância à unidade interior", ["Até 3 m", "3 a 10 m", "Mais de 10 m"], { bloco: "Unidade exterior" }),
        ],
      },
      "Local · interior": {
        nome: "A casa e a eletricidade",
        ocultos: ["pavimento", "canalizacao", "gas", "amianto", "n_casas_banho"],
        rotulos: { n_divisoes: "Divisões a climatizar" },
        novos: [
          ESC("int_equip", "Equipamento que já existe", ["Nenhum", "Split", "Multi-split", "Bomba de calor"], { bloco: "Instalações" }),
          ESC("int_potencia", "Potência contratada", ["3,45 kVA", "6,9 kVA", "10,35 kVA", "Mais"], { bloco: "Instalações" }),
        ],
      },
      "Área de intervenção": {
        nome: "Divisões a climatizar",
        ocultos: ["diag_tipo_area", "diag_intervencao_tipo", "diag_altura_revestimento", "diag_gas", "diag_toalheiro", "diag_local_cortes", "diag_demolir_descricao"],
        novos: [
          { k: "av_area", l: "Área a climatizar", t: "numero", un: "m²", novo: true, bloco: "A divisão" },
          ESC("av_orientacao", "Orientação das janelas", ["Norte", "Sul", "Este", "Oeste"], { bloco: "A divisão" }),
          ESC("av_isolamento", "Isolamento", ["Fraco", "Médio", "Bom"], { bloco: "A divisão" }),
        ],
      },
      "Escolhas do cliente": {
        novos: [ESC("av_ruido", "Importa o ruído", ["Pouco", "Muito"]), SN("av_wifi", "Quer comando por Wi-Fi")],
      },
    },
  },
  {
    id: "solar", nome: "Painéis solares", texto: "Fotovoltaico em moradias e prédios. A visita olha para o telhado, as sombras e o consumo.",
    cfg: {
      "Local · exterior (edifício e acessos)": {
        nome: "O telhado",
        ocultos: ["n_elevadores", "n_fracoes_por_andar", "andar", "zona_estacionamento"],
        novos: [
          ESC("sol_telhado", "Tipo de telhado", ["Telha", "Chapa", "Terraço plano"], { bloco: "Telhado" }),
          ESC("sol_orientacao", "Orientação", ["Sul", "Sudeste ou sudoeste", "Este ou oeste", "Norte"], { bloco: "Telhado" }),
          ESC("sol_sombras", "Sombras ao longo do dia", ["Nenhuma", "Algumas", "Muitas"], { bloco: "Telhado" }),
          { k: "sol_area", l: "Área livre no telhado", t: "numero", un: "m²", novo: true, bloco: "Telhado" },
        ],
      },
      "Local · interior": {
        nome: "Consumo e quadro elétrico",
        ocultos: ["tipologia", "n_divisoes", "n_casas_banho", "pavimento", "canalizacao", "gas", "amianto", "habitada_durante_obra", "animais"],
        novos: [
          { k: "sol_consumo", l: "Consumo médio por mês", t: "numero", un: "kWh", novo: true, bloco: "Consumo" },
          ESC("sol_potencia", "Potência contratada", ["3,45 kVA", "6,9 kVA", "10,35 kVA", "Mais"], { bloco: "Consumo" }),
          SN("sol_bateria", "Quer bateria", { bloco: "Consumo" }),
        ],
      },
      "Área de intervenção": { oculto: true },
      "Escolhas do cliente": { ocultos: ["materiais_cliente", "cor_estilo"], novos: [ESC("sol_objetivo", "Objetivo", ["Poupar na fatura", "Autoconsumo total", "Vender à rede"])] },
    },
  },
];
