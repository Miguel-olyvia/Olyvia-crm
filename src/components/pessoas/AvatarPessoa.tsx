import { cn } from "@/lib/utils";

/** As iniciais de um nome: a primeira letra da primeira e da última palavra ("Marta Silveira" dá "MS"). */
function iniciais(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "";
  const ultima = palavras.length > 1 ? palavras[palavras.length - 1] : "";
  return `${palavras[0][0]}${ultima[0] ?? ""}`.toLocaleUpperCase("pt");
}

/** O avatar: as iniciais num círculo (48 px na ficha, 36 px na lista). É só decoração (o nome está ao lado, em texto). */
export function AvatarPessoa({ nome, pequeno = false }: { nome: string; pequeno?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-semibold text-foreground",
        pequeno ? "h-9 w-9 text-sm" : "h-12 w-12 text-base",
      )}
    >
      {iniciais(nome)}
    </span>
  );
}
