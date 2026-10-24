// O aspeto de um cartão de opção (escolha única) de "Registar chamada": o resultado e o próximo passo.
import { cn } from "@/lib/utils";

const CARTAO = [
  "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors motion-reduce:transition-none",
  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
].join(" ");

/** O aspeto de um cartão de opção: escolhido (cor, contorno e visto) ou não. Partilhado com o "E agora?". */
export const classeCartao = (escolhido: boolean): string =>
  cn(CARTAO, escolhido ? "border-primary bg-primary/10 font-medium text-foreground ring-1 ring-primary" : "border-input bg-background text-foreground hover:bg-accent");
