// ESBOÇO MÍNIMO (agente FICHA, 14/10/2026) com a API do contrato comum. O dono deste ficheiro
// é o agente NECESSIDADES: na junção, a versão dele substitui esta por inteiro.
// Exporta as chaves fixas das ilustrações e dos ícones de serviço, <Ilustracao> e <IconeServico>.
import {
  Bath, Brush, Building2, ClipboardList, Cog, DoorOpen, Droplets, Flame, Grid3x3, Hammer, Lightbulb, PanelTop, Refrigerator,
  ShowerHead, Sofa, Sparkles, Toilet, Trash2, Truck, Users, Wind, Wrench, Zap, ShieldCheck, Layers, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const ICONE: Record<IconeServicoKey, LucideIcon> = {
  demolicao: Hammer, entulho: Trash2, canalizacao: Droplets, esgoto: Droplets, gas: Flame, eletricidade: Zap, iluminacao: Lightbulb,
  revestimento: Grid3x3, pavimento: Layers, pladur: PanelTop, pintura: Brush, carpintaria: Wrench, cozinha: Refrigerator, moveis: Sofa,
  loucas: Toilet, duche: ShowerHead, janela: PanelTop, porta: DoorOpen, avac: Wind, impermeabilizacao: ShieldCheck, limpeza: Sparkles,
  deslocacao: Truck, projeto: ClipboardList, subcontrato: Users, outro: Cog,
};

/** O ícone de um serviço (lucide), a herdar a cor do texto. */
export function IconeServico({ k, className }: { k: IconeServicoKey; className?: string }) {
  const I = ICONE[k] ?? Cog;
  return <I className={cn("h-5 w-5", className)} aria-hidden="true" />;
}

const DA_ILUSTRACAO: Partial<Record<IlustracaoKey, LucideIcon>> = {
  sanita: Toilet, bide: Toilet, banheira: Bath, "base-duche": ShowerHead, "coluna-duche": ShowerHead, torneira: Droplets,
  revestimento: Grid3x3, pavimento: Layers, eletrico: Zap, iluminacao: Lightbulb, avac: Wind, esquentador: Flame, porta: DoorOpen,
  janela: PanelTop, eletrodomestico: Refrigerator, "armario-cozinha": Building2, limpeza: Sparkles, ferramenta: Wrench,
};

/** A ilustração de um produto (esboço: um quadrado claro com um ícone; a versão final tem SVG próprio). */
export function Ilustracao({ k, className }: { k: IlustracaoKey; className?: string }) {
  const I = DA_ILUSTRACAO[k] ?? Cog;
  return (
    <span aria-hidden="true" className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground", className)}>
      <I className="h-1/2 w-1/2" strokeWidth={1.5} />
    </span>
  );
}
