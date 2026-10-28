// Um seletor de template (ou de minuta) para os passos do Negócio da Emylia: rótulo, lista com «Nenhum», o por omissão marcado, e os estados de
// carga, erro e vazio ditos em texto (vazio: «ainda não há…» com a ligação à página onde se criam). Nada de exemplo: só mostra o que a base devolveu.
import { useId } from "react";
import { Link } from "react-router-dom";
import { FOCO } from "@/components/negocio-metas/estilos";
import { cn } from "@/lib/utils";

export interface OpcaoDeTemplate { id: string; nome: string; porOmissao: boolean }

interface SeletorDeTemplateProps {
  rotulo: string;
  ajuda?: string;
  valor: string | null;
  opcoes: readonly OpcaoDeTemplate[];
  aLer: boolean;
  erro: string | null;
  aoTentar: () => void;
  aoEscolher: (id: string | null) => void;
  desativado?: boolean;
  /** Para onde se vai criar templates quando não há nenhum. */
  paginaDeCriacao: { para: string; texto: string };
  vazio: string;
}

export function SeletorDeTemplate({ rotulo, ajuda, valor, opcoes, aLer, erro, aoTentar, aoEscolher, desativado = false, paginaDeCriacao, vazio }: SeletorDeTemplateProps) {
  const id = useId();
  if (aLer) return <p role="status" className="text-[15px] text-muted-foreground">{rotulo}: a ler os templates…</p>;
  if (erro) {
    return (
      <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
        <p className="text-destructive">Não foi possível ler os templates ({rotulo}): {erro}</p>
        <button type="button" onClick={aoTentar} className={cn("min-h-11 rounded-lg border border-input px-4 font-medium", FOCO)}>Tentar outra vez</button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[15px] font-semibold text-foreground">{rotulo}</label>
      {ajuda && <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">{ajuda}</p>}
      {opcoes.length === 0 && (
        <p role="status" className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-[15px] text-muted-foreground">
          {vazio} <Link to={paginaDeCriacao.para} className="font-medium text-foreground underline underline-offset-4">{paginaDeCriacao.texto}</Link>
        </p>
      )}
      <select
        id={id} value={valor ?? ""} disabled={desativado} aria-describedby={ajuda ? `${id}-ajuda` : undefined}
        onChange={(ev) => aoEscolher(ev.target.value === "" ? null : ev.target.value)}
        className={cn("min-h-11 w-full max-w-md rounded-lg border border-input bg-background px-3 text-[15px]", FOCO)}
      >
        <option value="">Nenhum</option>
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}{o.porOmissao ? " (por omissão)" : ""}</option>)}
      </select>
    </div>
  );
}
