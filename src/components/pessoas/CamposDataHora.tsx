// Dia e hora lado a lado, com erro por campo (`aria-describedby`). Partilhado pelo diálogo "Marcar visita" das submissões
// e pelo "Registar chamada". Os textos (rótulos e erros) vêm de quem usa; o dia nunca pode ser anterior a `hoje`.
import type { Ref } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOCO } from "@/components/negocio-metas/estilos";

/**
 * Uma mensagem de erro com ícone (a cor não é o único sinal). O texto vai em `text-foreground` (a cor destrutiva em texto pequeno
 * não chega a 4,5:1 de contraste) e a cor fica só no ícone. É um alerta: o erro de um campo que já tem o foco também se anuncia.
 */
export function MensagemErro({ id, texto }: { id: string; texto: string }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1.5 text-sm text-foreground">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      {texto}
    </p>
  );
}

interface CamposDataHoraProps {
  id: string;
  data: string;
  hora: string;
  hoje: string;
  rotuloData: string;
  rotuloHora: string;
  /** Os textos dos erros, já traduzidos; `null` sem erro. */
  erroData: string | null;
  erroHora: string | null;
  campoData?: Ref<HTMLInputElement>;
  aoMudar: (parcial: { data?: string; hora?: string }) => void;
}

export function CamposDataHora(p: CamposDataHoraProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${p.id}-data`}>{p.rotuloData}</Label>
        <Input
          ref={p.campoData} id={`${p.id}-data`} type="date" min={p.hoje} value={p.data} aria-invalid={p.erroData ? true : undefined}
          aria-describedby={p.erroData ? `${p.id}-data-erro` : undefined} className={cn("min-h-11", FOCO, p.erroData && "border-destructive")}
          onChange={(e) => p.aoMudar({ data: e.target.value })}
        />
        {p.erroData && <MensagemErro id={`${p.id}-data-erro`} texto={p.erroData} />}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p.id}-hora`}>{p.rotuloHora}</Label>
        <Input
          id={`${p.id}-hora`} type="time" value={p.hora} aria-invalid={p.erroHora ? true : undefined}
          aria-describedby={p.erroHora ? `${p.id}-hora-erro` : undefined} className={cn("min-h-11", FOCO, p.erroHora && "border-destructive")}
          onChange={(e) => p.aoMudar({ hora: e.target.value })}
        />
        {p.erroHora && <MensagemErro id={`${p.id}-hora-erro`} texto={p.erroHora} />}
      </div>
    </div>
  );
}
