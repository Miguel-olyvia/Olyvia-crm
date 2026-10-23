import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import type { SeccaoEd } from "@/hooks/pessoas/workflow/questionario";
import type { CampoProblema } from "@/hooks/pessoas/workflow/questionarioEdicao";

export const W = "pessoasPagina.real.workflow.";

/** O que cada peça do editor precisa de saber e de poder fazer, sem cada uma ter de conhecer o separador. */
export interface ContextoEditor {
  /** Há uma gravação em curso: os campos bloqueiam-se e as ações não fazem nada. */
  desativado: boolean;
  seccoes: readonly SeccaoEd[];
  /** Perguntas abertas (com o editor à vista). */
  abertas: ReadonlySet<string>;
  alternar: (k: string) => void;
  abrir: (k: string) => void;
  /** Muda o rascunho; `foco` é o id do elemento que recebe o foco depois, e `anuncio` o que o leitor de ecrã ouve. */
  mudar: (f: (seccoes: SeccaoEd[]) => SeccaoEd[], opcoes?: { foco?: string; anuncio?: string }) => void;
  /** O campo `campo` do item `k` tem um problema à vista (para aria-invalid). */
  invalido: (k: string, campo: CampoProblema) => boolean;
}

interface BotaoIconeProps {
  id?: string;
  rotulo: string;
  icone: LucideIcon;
  /** aria-disabled: continua focável (o foco não se perde) e o clique não faz nada. */
  inativo?: boolean;
  aoClicar: () => void;
}

/** Um botão só de ícone, com 44 px, nome para o leitor de ecrã e `aria-disabled` em vez de `disabled`. */
export function BotaoIcone({ id, rotulo, icone: Icone, inativo = false, aoClicar }: BotaoIconeProps) {
  return (
    <Button
      type="button" variant="outline" size="icon" id={id} aria-label={rotulo} aria-disabled={inativo || undefined}
      className={cn("min-h-11 min-w-11", FOCO, PISTA_DESATIVADO)} onClick={() => { if (!inativo) aoClicar(); }}
    >
      <Icone aria-hidden="true" />
    </Button>
  );
}

interface BotaoTextoProps {
  id?: string;
  icone: LucideIcon;
  inativo?: boolean;
  aoClicar: () => void;
  children: ReactNode;
}

/** Um botão de texto com ícone (adicionar), com `aria-disabled`. */
export function BotaoTexto({ id, icone: Icone, inativo = false, aoClicar, children }: BotaoTextoProps) {
  return (
    <Button
      type="button" variant="outline" id={id} aria-disabled={inativo || undefined}
      className={cn("min-h-11 gap-1.5", FOCO, PISTA_DESATIVADO)} onClick={() => { if (!inativo) aoClicar(); }}
    >
      <Icone aria-hidden="true" />
      {children}
    </Button>
  );
}

interface CampoProps {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  desativado: boolean;
  invalido?: boolean;
  tipo?: "text" | "number";
  ajuda?: string;
  /** O que se vê no campo vazio (por exemplo o valor de omissão). */
  marcador?: string;
}

/** Um campo de texto com a etiqueta ligada, desativado enquanto grava e marcado quando tem um problema. */
export function Campo({ id, rotulo, valor, aoMudar, desativado, invalido = false, tipo = "text", ajuda, marcador }: CampoProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">{rotulo}</Label>
      <Input
        id={id} type={tipo} step={tipo === "number" ? "any" : undefined} value={valor} disabled={desativado} className={FOCO}
        placeholder={marcador} aria-invalid={invalido || undefined} aria-describedby={ajuda ? `${id}-ajuda` : undefined} onChange={(e) => aoMudar(e.target.value)}
      />
      {ajuda && <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

interface CaixaProps {
  id: string;
  rotulo: string;
  marcada: boolean;
  aoMudar: (marcada: boolean) => void;
  desativado: boolean;
}

/** Uma caixa de marcar com a etiqueta ligada e 44 px de altura. */
export function Caixa({ id, rotulo, marcada, aoMudar, desativado }: CaixaProps) {
  return (
    <div className="flex min-h-11 items-center gap-2">
      <Checkbox id={id} checked={marcada} disabled={desativado} className={FOCO} onCheckedChange={(v) => aoMudar(v === true)} />
      <Label htmlFor={id} className="flex min-h-11 flex-1 cursor-pointer items-center text-sm font-normal">{rotulo}</Label>
    </div>
  );
}
