// ESBOÇO MÍNIMO (agente DADOS, 14/10/2026) com a API do contrato comum. O dono deste ficheiro
// é o agente NECESSIDADES: na junção, a versão dele substitui esta por inteiro.
// Só existe para os dados (Produto.img, Catalogo.icone) poderem usar as chaves fixas.
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

/** Esboço: um quadrado cinzento (a versão do agente NECESSIDADES tem os desenhos). */
export function Ilustracao({ k, className }: { k: IlustracaoKey | undefined | null; className?: string }) {
  return <span aria-hidden="true" data-ilustracao={k ?? "generico"} className={cn("block h-16 w-16 shrink-0 rounded-xl bg-muted", className)} />;
}
/** Esboço: um ponto (a versão do agente NECESSIDADES usa os ícones lucide). */
export function IconeServico({ k, className }: { k: IconeServicoKey | undefined | null; className?: string }) {
  return <span aria-hidden="true" data-icone={k ?? "outro"} className={cn("inline-block h-5 w-5 shrink-0 rounded-full bg-muted", className)} />;
}
