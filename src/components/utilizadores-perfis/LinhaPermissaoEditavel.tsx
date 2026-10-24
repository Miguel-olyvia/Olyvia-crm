// Uma permissão EDITÁVEL na matriz da role: caixa de seleção com o nome como rótulo (a linha toda é o alvo, 44 px), o
// distintivo de ação e a marca de perigosa em ícone e texto. Uma permissão que não é "ver" fica desligada, com a razão
// escrita, enquanto a de ver do módulo não estiver concedida.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FOCO } from "@/components/negocio-metas/estilos";
import { distintivoAcao } from "./gruposPermissoes";
import { MarcaPerigosa } from "./pecas";
import type { Permissao } from "./tipos";

/** O que a árvore precisa para deixar de ser só leitura. */
export interface EdicaoMatriz {
  /** Role de sistema: as caixas ficam desligadas e não há "marcar tudo". */
  desativada: boolean;
  bloqueada: (codigo: string) => boolean;
  aoAlternar: (p: Permissao) => void;
  aoModulo: (lista: Permissao[], marcar: boolean) => void;
}

interface LinhaPermissaoEditavelProps {
  permissao: Permissao;
  concedida: boolean;
  edicao: EdicaoMatriz;
}

export function LinhaPermissaoEditavel({ permissao: p, concedida, edicao }: LinhaPermissaoEditavelProps) {
  const { t } = useTranslation();
  const id = useId();
  const bloqueada = edicao.bloqueada(p.codigo);
  const desligada = edicao.desativada || bloqueada;
  const acao = distintivoAcao(p.codigo);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0 text-sm">
      <label htmlFor={id} className={cn("flex min-h-11 min-w-0 items-center gap-3 py-1", desligada ? "cursor-not-allowed" : "cursor-pointer")}>
        <Checkbox
          id={id} checked={concedida} disabled={desligada} className={FOCO}
          aria-describedby={bloqueada && !edicao.desativada ? `${id}-ver` : undefined}
          onCheckedChange={() => edicao.aoAlternar(p)}
        />
        <span className={cn("text-foreground", concedida && "font-medium", desligada && "opacity-70")}>{p.nome}</span>
      </label>
      <Badge variant="secondary" className={cn("px-1.5 text-xs", acao.classes)}>{acao.rotulo}</Badge>
      {p.perigosa && <MarcaPerigosa />}
      {bloqueada && !edicao.desativada && <span id={`${id}-ver`} className="text-xs text-muted-foreground">{t("usersProfiles.form.matrix.needsView")}</span>}
    </li>
  );
}
