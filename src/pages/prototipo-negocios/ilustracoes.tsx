// Ilustrações dos produtos e ícones dos serviços (14/10/2026).
// · <Ilustracao k="sanita" />: desenhos próprios em SVG, traço simples de 2 px (não escala), cinzento para a forma
//   e a cor de destaque do tema (hsl(var(--primary))) só no pormenor (a água, a luz, o puxador). Legíveis a 48–96 px.
//   São decorativas (aria-hidden): o nome do produto está sempre escrito ao lado.
// · <IconeServico k="canalizacao" />: um ícone lucide por tipo de serviço.
// · ilustracaoDe / ilustracaoDoProduto / iconeDoOficio / iconeDoServico: a escolha por palavras-chave quando o
//   Catálogo não diz (Produto.img, Catalogo.icone).
import type { ReactNode } from "react";
import {
  AirVent, Armchair, AppWindow, BrickWall, CookingPot, DoorOpen, Droplets, Flame, Grid3x3, Hammer, Handshake, Lightbulb,
  PaintRoller, PanelTop, PencilRuler, Pickaxe, ShowerHead, Sparkles, Toilet, Trash2, Truck, Umbrella, Waves, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ chaves */
export const ILUSTRACOES = [
  "sanita", "bide", "lavatorio", "base-duche", "banheira", "coluna-duche", "resguardo", "torneira", "movel-wc", "espelho", "toalheiro",
  "acessorio-wc", "revestimento", "pavimento", "cola", "armario-cozinha", "bancada", "lava-loica", "eletrodomestico", "exaustor", "janela",
  "porta", "roupeiro", "eletrico", "iluminacao", "avac", "esquentador", "quimico", "limpeza", "material", "ferramenta", "generico",
] as const;
export type IlustracaoKey = (typeof ILUSTRACOES)[number];

export const ICONES_SERVICO = [
  "demolicao", "entulho", "canalizacao", "esgoto", "gas", "eletricidade", "iluminacao", "revestimento", "pavimento", "pladur", "pintura",
  "carpintaria", "cozinha", "moveis", "loucas", "duche", "janela", "porta", "avac", "impermeabilizacao", "limpeza", "deslocacao", "projeto",
  "subcontrato", "outro",
] as const;
export type IconeServicoKey = (typeof ICONES_SERVICO)[number];

/* ------------------------------------------------------------------ desenhos */
// Forma em cinzento (G), pormenor na cor do tema (P), e uma área suave da mesma cor (F).
const G = { stroke: "hsl(var(--muted-foreground))" };
const P = { stroke: "hsl(var(--primary))" };
const F = { stroke: "hsl(var(--primary))", fill: "hsl(var(--primary) / 0.12)" };

const DESENHOS: Record<IlustracaoKey, ReactNode> = {
  sanita: <>
    <g {...G}><rect x="10" y="9" width="13" height="21" rx="2.5" /><path d="M8 30h46c0 8-6 14-16 14h-6l2 11H17l1-12c-6-2-10-7-10-13Z" /></g>
    <g {...P}><path d="M14 30c4 4 30 4 36 0" /><circle cx="16.5" cy="15" r="1.6" /></g>
  </>,
  bide: <>
    <g {...G}><path d="M8 32h48c0 8-6 13-16 13H26l1 10H15l1-12c-5-2-8-6-8-11Z" /></g>
    <g {...P}><path d="M40 32v-7h7v3" /><path d="M14 32c4 3 26 3 34 0" /></g>
  </>,
  lavatorio: <>
    <g {...G}><path d="M6 8v48" /><path d="M6 28h50c0 10-10 17-25 17S6 38 6 28Z" /><path d="M31 45v9h-6" /></g>
    <g {...P}><path d="M38 28v-9h8v3" /><circle cx="46" cy="25.5" r="1.2" /></g>
  </>,
  "base-duche": <>
    <g {...G}><path d="M4 42 20 32h40L44 42Z" /><path d="M4 42v5h40l16-10v-5M44 47v-5" /></g>
    <g {...F}><ellipse cx="32" cy="37" rx="4" ry="1.8" /></g>
    <g {...P}><path d="M24 12v6M32 10v8M40 12v6" /></g>
  </>,
  banheira: <>
    <g {...G}><path d="M6 30h52v4c0 9-6 14-14 14H20c-8 0-14-5-14-14Z" /><path d="M16 48l-2 6M48 48l2 6" /></g>
    <g {...P}><path d="M50 30V16h-7v3" /><path d="M12 36c8 3 32 3 40 0" /></g>
  </>,
  "coluna-duche": <>
    <g {...G}><path d="M20 58V12h18" /><path d="M14 40h12" /></g>
    <g {...F}><path d="M32 12h16l-2 6H34Z" /></g>
    <g {...P}><path d="M36 24v5M41 24v7M46 24v5" /></g>
  </>,
  resguardo: <>
    <g {...G}><rect x="16" y="8" width="30" height="46" rx="2" /><path d="M8 56h48" /><path d="M46 14h4M46 46h4" /></g>
    <g {...P}><path d="M22 22l9-9M22 33l16-16" /></g>
  </>,
  torneira: <>
    <g {...G}><path d="M8 24h4v12H8z" /><path d="M12 26h24c7 0 11 4 11 11v3h-8v-3c0-2-1-3-3-3H12" /><path d="M26 26v-8M19 18h14" /></g>
    <g {...P}><path d="M43 46v4M43 55v2" /></g>
  </>,
  "movel-wc": <>
    <g {...G}><rect x="10" y="26" width="44" height="26" rx="2" /><path d="M32 26v26" /><path d="M8 22h48v4H8z" /></g>
    <g {...P}><path d="M28 34v8M36 34v8" /><path d="M32 22v-7h6v3" /></g>
  </>,
  espelho: <>
    <g {...G}><ellipse cx="32" cy="30" rx="17" ry="23" /><path d="M32 7V3" /></g>
    <g {...P}><path d="M23 22l7-7M22 33l14-14" /></g>
  </>,
  toalheiro: <>
    <g {...G}><path d="M18 6v52M46 6v52" /><path d="M14 58h8M42 58h8" /></g>
    <g {...P}><path d="M18 16h28M18 25h28M18 34h28M18 43h28" /></g>
  </>,
  "acessorio-wc": <>
    <g {...G}><path d="M6 14v14" /><path d="M6 21h14" /><circle cx="26" cy="32" r="11" /><circle cx="26" cy="32" r="3" /></g>
    <g {...P}><path d="M37 32v20H24" /></g>
  </>,
  revestimento: <>
    <g {...G}><rect x="8" y="8" width="48" height="48" rx="2" /><path d="M8 24h48M8 40h48M32 8v16M20 24v16M44 24v16M32 40v16" /></g>
    <g {...F}><path d="M20 24h24v16H20z" /></g>
  </>,
  pavimento: <>
    <g {...G}><path d="M4 54 18 22h28l14 32Z" /><path d="M9 43h46M14 32h36M27 22l-5 32M37 22l5 32" /></g>
    <g {...F}><path d="M27.3 32h9.4l1.7 11H25.6Z" /></g>
  </>,
  cola: <>
    <g {...G}><path d="M16 10h32l4 8v34a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V18Z" /><path d="M12 18h40" /></g>
    <g {...F}><rect x="20" y="27" width="24" height="16" rx="2" /></g>
    <g {...P}><path d="M25 35h14" /></g>
  </>,
  "armario-cozinha": <>
    <g {...G}><rect x="6" y="6" width="52" height="14" rx="2" /><rect x="6" y="34" width="52" height="22" rx="2" /><path d="M32 6v14M24 34v22M42 34v22" /></g>
    <g {...P}><path d="M4 34h56" /><path d="M28 12h-2M38 12h-2M20 40v4M28 40v4M46 40v4" /></g>
  </>,
  bancada: <>
    <g {...G}><path d="M6 30v6h40v-6M46 36l12-8v-6" /><path d="M12 36v20M40 36v20" /></g>
    <g {...F}><path d="M6 30 18 22h40L46 30Z" /></g>
  </>,
  "lava-loica": <>
    <g {...G}><path d="M4 30h56" /><path d="M14 30v6c0 6 4 10 10 10h16c6 0 10-4 10-10v-6" /></g>
    <g {...P}><path d="M30 30V14h9v4" /><circle cx="32" cy="38" r="1.6" /></g>
  </>,
  eletrodomestico: <>
    <g {...G}><rect x="12" y="6" width="40" height="52" rx="3" /><path d="M12 18h40" /></g>
    <g {...F}><rect x="19" y="26" width="26" height="22" rx="2" /></g>
    <g {...P}><circle cx="20" cy="12" r="1.6" /><circle cx="27" cy="12" r="1.6" /><path d="M38 12h8" /></g>
  </>,
  exaustor: <>
    <g {...G}><path d="M26 6h12v16H26z" /><path d="M10 34 22 22h20l12 12Z" /><path d="M8 34h48v4H8z" /></g>
    <g {...P}><path d="M22 44l-2 5M32 44v6M42 44l2 5" /></g>
  </>,
  janela: <>
    <g {...G}><rect x="10" y="6" width="44" height="46" rx="2" /><path d="M32 6v46M10 28h44" /><path d="M6 56h52" /></g>
    <g {...P}><path d="M15 18l5-5M37 18l5-5M15 40l7-7" /></g>
  </>,
  porta: <>
    <g {...G}><path d="M16 56V6h32v50" /><path d="M8 56h48" /><rect x="22" y="12" width="20" height="16" rx="1.5" /><rect x="22" y="34" width="20" height="16" rx="1.5" /></g>
    <g {...P}><circle cx="44" cy="31" r="1.8" /></g>
  </>,
  roupeiro: <>
    <g {...G}><rect x="10" y="6" width="44" height="48" rx="2" /><path d="M32 6v48M14 54v4M50 54v4" /></g>
    <g {...P}><path d="M28 24v10M36 24v10" /></g>
  </>,
  eletrico: <>
    <g {...G}><rect x="12" y="12" width="40" height="40" rx="9" /><circle cx="32" cy="32" r="12" /></g>
    <g {...F}><circle cx="27" cy="32" r="2.2" /><circle cx="37" cy="32" r="2.2" /></g>
  </>,
  iluminacao: <>
    <g {...G}><path d="M32 10c-9 0-15 6-15 14 0 6 4 9 6 13v4h18v-4c2-4 6-7 6-13 0-8-6-14-15-14Z" /><path d="M24 47h16M27 52h10" /></g>
    <g {...P}><path d="M28 34l4-6 4 6" /><path d="M7 24h4M53 24h4M13 9l3 3M51 9l-3 3" /></g>
  </>,
  avac: <>
    <g {...G}><rect x="6" y="12" width="52" height="22" rx="5" /><path d="M12 28h40" /></g>
    <g {...P}><path d="M18 42c3 3 3 7 0 10M32 42c3 3 3 7 0 10M46 42c3 3 3 7 0 10" /><circle cx="50" cy="19" r="1.4" /></g>
  </>,
  esquentador: <>
    <g {...G}><rect x="18" y="6" width="28" height="44" rx="4" /><path d="M26 50v8M38 50v8" /><rect x="24" y="13" width="16" height="6" rx="1.5" /></g>
    <g {...F}><path d="M32 41c-5-3-4-8 0-13 1 3 5 5 4 9-.5 2-2 3.5-4 4Z" /></g>
  </>,
  quimico: <>
    <g {...G}><path d="M27 6h10v8l7 9v29a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V23l7-9Z" /></g>
    <g {...F}><path d="M20 38h24v14a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4Z" /></g>
    <g {...P}><path d="M27 28h10" /></g>
  </>,
  limpeza: <>
    <g {...G}><path d="M22 24h16v30a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4Z" /><path d="M26 24v-6h8v6" /><path d="M24 18V10h12l6 4h-6" /></g>
    <g {...P}><path d="M50 12v8M46 16h8M48 30v4M46 32h4" /></g>
  </>,
  material: <>
    <g {...G}><rect x="6" y="40" width="24" height="12" rx="1.5" /><rect x="34" y="40" width="24" height="12" rx="1.5" /><rect x="20" y="28" width="24" height="12" rx="1.5" /></g>
    <g {...F}><rect x="20" y="16" width="24" height="12" rx="1.5" /></g>
  </>,
  ferramenta: <>
    <g {...G}><path d="M24 56l14-28" /><path d="M21 54.5l14-28" /></g>
    <g {...F}><path d="M28 14l15-6 7 12-15 6Z" /></g>
  </>,
  generico: <>
    <g {...G}><path d="M32 8 54 20v24L32 56 10 44V20Z" /><path d="M10 20l22 12 22-12M32 32v24" /></g>
    <g {...P}><path d="M21 14l22 12" /></g>
  </>,
};

/** Uma ilustração de produto. Decorativa: o nome do produto vai sempre escrito ao lado. */
export function Ilustracao({ k, className }: { k: IlustracaoKey | undefined | null; className?: string }) {
  const desenho = DESENHOS[k ?? "generico"] ?? DESENHOS.generico;
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" data-ilustracao={k ?? "generico"}
      fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={cn("h-16 w-16 shrink-0 [&_*]:[vector-effect:non-scaling-stroke]", className)}>
      {desenho}
    </svg>
  );
}

/* ------------------------------------------------------------------ ícones dos serviços */
export const ICONE_SERVICO: Record<IconeServicoKey, LucideIcon> = {
  demolicao: Pickaxe, entulho: Trash2, canalizacao: Droplets, esgoto: Waves, gas: Flame, eletricidade: Zap, iluminacao: Lightbulb,
  revestimento: BrickWall, pavimento: Grid3x3, pladur: PanelTop, pintura: PaintRoller, carpintaria: Hammer, cozinha: CookingPot,
  moveis: Armchair, loucas: Toilet, duche: ShowerHead, janela: AppWindow, porta: DoorOpen, avac: AirVent, impermeabilizacao: Umbrella,
  limpeza: Sparkles, deslocacao: Truck, projeto: PencilRuler, subcontrato: Handshake, outro: Wrench,
};
export function IconeServico({ k, className }: { k: IconeServicoKey | undefined | null; className?: string }) {
  const I = ICONE_SERVICO[k ?? "outro"] ?? Wrench;
  return <I className={cn("h-5 w-5 shrink-0", className)} aria-hidden="true" strokeWidth={1.75} />;
}

/* ------------------------------------------------------------------ a escolha por palavras */
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
type Regra<K> = [RegExp, K];
const escolher = <K,>(regras: Regra<K>[], texto: string | null | undefined): K | null => {
  if (!texto) return null;
  const t = sem(texto);
  for (const [re, k] of regras) if (re.test(t)) return k;
  return null;
};

// A ordem conta: o mais específico primeiro ("espelho com LED" é espelho, não iluminação; "porta-rolos" é acessório, não porta).
const REGRAS_ILUSTRACAO: Regra<IlustracaoKey>[] = [
  [/porta[- ]?rolos?|saboneteira|cabide|piaçaba|piacaba|dispensador|acessorios? (de )?(wc|casa de banho)|barra de apoio|acessorio de seguranca|^acessorios?/, "acessorio-wc"],
  [/espelho/, "espelho"],
  [/toalheiro/, "toalheiro"],
  [/bide/, "bide"],
  [/sanita|autoclismo|louca sanitaria|vaso sanitario/, "sanita"],
  [/base de duche|base duche|bases de duche/, "base-duche"],
  [/banheira/, "banheira"],
  [/coluna de duche|coluna duche|chuveiro|kit de duche/, "coluna-duche"],
  [/resguardo|divisoria|vidro|serigrafia/, "resguardo"],
  [/lava[- ]?loica|lava[- ]?louca/, "lava-loica"],
  [/torneira|misturadora|monocomando|termostatica/, "torneira"],
  [/lavatorio/, "lavatorio"],
  [/movel (de )?(wc|casa de banho|lavatorio|suspenso)|moveis? de casa de banho|^movel\b|movel \d/, "movel-wc"],
  [/bancada|tampo/, "bancada"],
  [/exaustor|chamine|extrator/, "exaustor"],
  [/forno|placa (de )?(inducao|vitro|gas|fogao)|fogao|frigorifico|micro[- ]?ondas|maquina de lavar|eletrodomestico|congelador/, "eletrodomestico"],
  [/moveis? de cozinha|modulo|armario|cozinha/, "armario-cozinha"],
  [/roupeiro/, "roupeiro"],
  [/janela|caixilh|estore/, "janela"],
  [/\bporta/, "porta"],
  [/esquentador|termoacumulador|caldeira|cilindro|bomba de calor/, "esquentador"],
  [/ar condicionado|avac|climatiza|split|ventax|ventila/, "avac"],
  [/\bled\b|candeeiro|luminaria|foco|lampada|iluminacao|aplique|calha/, "iluminacao"],
  [/tomada|interruptor|cabo|fio eletrico|disjuntor|quadro eletrico|eletric|eletrico/, "eletrico"],
  [/cola|argamassa|cimento|betume|reboco|massa|junta/, "cola"],
  [/pavimento|vinilico|flutuante|soalho|rodape|mosaico/, "pavimento"],
  [/revestimento|azulejo|ceramico|parede|pedra/, "revestimento"],
  [/primario|impermeabiliz|tinta|verniz|diluente|silicone|acido|quimico|selante/, "quimico"],
  [/limpeza|detergente|lixivia/, "limpeza"],
  [/broca|disco|berbequim|serra|martelo|espatula|talocha|ferramenta|lamina|rebarbadora/, "ferramenta"],
  [/tubo|abracadeira|parafuso|bucha|fita|saco|pequeno material|material|tijolo|placa de gesso|pladur|perfil/, "material"],
  [/louca/, "sanita"],
  [/mobiliario|moveis/, "armario-cozinha"],
];

/** A ilustração que um texto (nome de produto, subcategoria, nó da árvore) sugere; sem nenhuma, "generico". */
export function ilustracaoDe(texto: string | null | undefined): IlustracaoKey {
  return escolher(REGRAS_ILUSTRACAO, texto) ?? "generico";
}

/** A ilustração de um produto: a do Catálogo (img), senão pelo nome, pela subcategoria e pelo nó da árvore. */
export function ilustracaoDoProduto(p: { n: string; img?: IlustracaoKey; sub?: string }, caminhoNo?: string | null): IlustracaoKey {
  if (p.img && (ILUSTRACOES as readonly string[]).includes(p.img)) return p.img;
  for (const t of [p.n, p.sub, caminhoNo?.split(" › ").pop(), caminhoNo]) {
    const k = escolher(REGRAS_ILUSTRACAO, t);
    if (k) return k;
  }
  return "generico";
}

const REGRAS_OFICIO: Regra<IconeServicoKey>[] = [
  [/demoli/, "demolicao"],
  [/entulho|residuo/, "entulho"],
  [/esgoto/, "esgoto"],
  [/gas|itg/, "gas"],
  [/ilumina/, "iluminacao"],
  [/eletric/, "eletricidade"],
  [/canaliza|agua/, "canalizacao"],
  [/pavimento/, "pavimento"],
  [/revest|alvenaria|azulej/, "revestimento"],
  [/pladur|teto|tecto/, "pladur"],
  [/pintura/, "pintura"],
  [/cozinha/, "cozinha"],
  [/mobil|moveis/, "moveis"],
  [/louca|sanit/, "loucas"],
  [/duche|banho/, "duche"],
  [/janela|caixilh/, "janela"],
  [/porta/, "porta"],
  [/avac|climat|ar condicionado/, "avac"],
  [/impermeab/, "impermeabilizacao"],
  [/limpeza/, "limpeza"],
  [/desloca|transporte/, "deslocacao"],
  [/projeto|licen|arquitet/, "projeto"],
  [/subcontrat/, "subcontrato"],
  [/carpint/, "carpintaria"],
];
/** O ícone por omissão de um ofício (pelo nome); sem nenhum, "outro". */
export function iconeDoOficio(oficio: string | null | undefined): IconeServicoKey {
  return escolher(REGRAS_OFICIO, oficio) ?? "outro";
}

// O nome do serviço diz mais do que o ofício ("Instalação de Coluna de Duche" é duche, embora seja Canalização).
const REGRAS_SERVICO: Regra<IconeServicoKey>[] = [
  [/demoli|levantamento de sanit|remocao|supressao/, "demolicao"],
  [/entulho/, "entulho"],
  [/gas/, "gas"],
  [/esgoto/, "esgoto"],
  [/sanita|bide|louca|lavatorio/, "loucas"],
  [/duche|banheira|resguardo|vidro lateral|serigrafia/, "duche"],
  [/ventax|ar condicionado|avac|climatiza/, "avac"],
  [/eletrodomestic|lava loica|lava-loica|torneira de cozinha/, "cozinha"],
  [/gaveta|gavetao|mobiliario|moveis|vista superior|dispenseiro/, "moveis"],
  [/espelho com led|ilumina|candeeiro/, "iluminacao"],
  [/toalheiro|eletric|tomada|fio/, "eletricidade"],
  [/torneira|ponto de agua|canaliza|roco/, "canalizacao"],
  [/pavimento|rodape/, "pavimento"],
  [/nicho|revestimento|murete|alvenaria|parede/, "revestimento"],
  [/pladur|teto/, "pladur"],
  [/pintura/, "pintura"],
  [/janela/, "janela"],
  [/porta/, "porta"],
  [/impermeab/, "impermeabilizacao"],
  [/limpeza/, "limpeza"],
  [/desloca/, "deslocacao"],
  [/projeto/, "projeto"],
];
/** O ícone de um serviço: o do Catálogo, senão pelo nome, senão o do ofício. */
export function iconeDoServico(nome: string, oficio?: string | null, doCatalogo?: IconeServicoKey | null): IconeServicoKey {
  if (doCatalogo && (ICONES_SERVICO as readonly string[]).includes(doCatalogo)) return doCatalogo;
  return escolher(REGRAS_SERVICO, nome) ?? iconeDoOficio(oficio);
}
