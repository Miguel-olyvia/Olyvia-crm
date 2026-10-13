// Peças pequenas da área de custos: campo numérico que grava ao sair, cabeçalho
// de secção com âncora, e mensagens de erro.
import { useEffect, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { lerNumero } from "@/lib/custos";

/** Número escrito à portuguesa; grava no blur ou Enter, só se mudou. */
export function CampoNumero({
  valor,
  onGravar,
  casas = 2,
  vazioPermitido = false,
  disabled,
  className,
  sufixo,
  ariaLabel,
}: {
  valor: number | null | undefined;
  onGravar: (v: number | null) => void;
  casas?: number;
  vazioPermitido?: boolean;
  disabled?: boolean;
  className?: string;
  sufixo?: string;
  ariaLabel: string;
}) {
  const mostrar = (v: number | null | undefined) =>
    v == null ? "" : String(Math.round(Number(v) * 10 ** casas) / 10 ** casas).replace(".", ",");
  const [texto, setTexto] = useState(mostrar(valor));
  useEffect(() => setTexto(mostrar(valor)), [valor]); // eslint-disable-line react-hooks/exhaustive-deps

  const gravar = () => {
    const n = lerNumero(texto);
    if (n == null && !vazioPermitido) {
      setTexto(mostrar(valor));
      return;
    }
    if (n === (valor == null ? null : Number(valor))) return;
    onGravar(n);
  };
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Input
        aria-label={ariaLabel}
        inputMode="decimal"
        className="h-8 text-right tabular-nums"
        value={texto}
        disabled={disabled}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={gravar}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {sufixo && <span className="text-xs text-muted-foreground whitespace-nowrap">{sufixo}</span>}
    </div>
  );
}

/** Texto que grava ao sair. */
export function CampoTexto({
  valor,
  onGravar,
  disabled,
  ariaLabel,
  placeholder,
}: {
  valor: string | null | undefined;
  onGravar: (v: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => setTexto(valor ?? ""), [valor]);
  return (
    <Input
      aria-label={ariaLabel}
      className="h-8"
      value={texto}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const t = texto.trim();
        if (!t) setTexto(valor ?? "");
        else if (t !== (valor ?? "")) onGravar(t);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function Seccao({
  id,
  titulo,
  descricao,
  acoes,
  children,
}: {
  id: string;
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{titulo}</h2>
            {descricao && <p className="text-sm text-muted-foreground max-w-3xl">{descricao}</p>}
          </div>
          {acoes}
        </div>
        {children}
      </Card>
    </section>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground py-4 text-center">{children}</p>;
}

export function Numero({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{children}</span>;
}
