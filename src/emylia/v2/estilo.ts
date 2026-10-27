// As classes comuns dos ecrãs da V2 (Operações e Financeiro): alvos de 44 px e texto a 15–16 px.
import { cn } from "@/lib/utils";

export const BOTAO = "min-h-11 text-[15px]";
export const CHIP = (ativo: boolean): string => cn("min-h-11 rounded-full border px-4 text-[15px] transition-colors motion-reduce:transition-none",
  ativo ? "border-foreground bg-foreground text-background" : "border-input bg-card hover:border-foreground");
export const INPUT = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-base";
