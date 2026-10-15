/**
 * O organograma da organização: Grupo > Empresas > Filiais > Centros, no mesmo desenho do organograma de pessoas (lista
 * aninhada de cartões com a linha de ligação à esquerda, que em ecrã estreito continua a ser a mesma lista aninhada).
 *
 * Teclado (padrão ARIA de árvore, foco no próprio item): ↑↓ percorrem os nós visíveis, → abre ou desce ao primeiro filho,
 * ← fecha ou sobe ao pai, Home/End, Enter ou espaço abrem o painel do nó. O Esc fecha o painel (é do próprio painel).
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronRight, Users } from "lucide-react";
import { ChipTipo } from "@/components/rh-exemplo/organizacao/Chips";
import { ICONE_TIPO } from "@/components/rh-exemplo/organizacao/iconesTipo";
import { listaVisivel } from "@/components/rh-exemplo/organizacao/arvore";
import { useTranslation } from "@/hooks/useTranslation";
import type { NoOrg } from "@/components/rh-exemplo/organizacao/tipos";

interface Contexto {
  abertos: ReadonlySet<string>;
  seleccionado: string | null;
  focoId: string;
  aoFocar: (id: string) => void;
  aoAlternar: (id: string) => void;
  aoAbrir: (id: string) => void;
  aoTeclar: (e: KeyboardEvent<HTMLLIElement>, no: NoOrg) => void;
}

const idRotulo = (id: string): string => `rhOrg-no-${id}`;

function Contador({ no }: { no: NoOrg }) {
  const { t } = useTranslation();
  const n = no.locais ?? no.legais;
  const chave = no.locais !== null ? "rhOrg.aqui" : "rhOrg.pessoas";
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
      <Users className="h-3.5 w-3.5" aria-hidden="true" />
      {t(n === 1 ? `${chave}.um` : `${chave}.n`, { n })}
    </span>
  );
}

const ANEL = "group-focus-visible/item:ring-2 group-focus-visible/item:ring-ring group-focus-visible/item:ring-offset-2 group-focus-visible/item:ring-offset-background";

/** O cartão do nó: o chevron (só rato; o teclado usa as setas) e a linha clicável com ícone, nome, tipo e contador. */
function Linha({ no, ctx }: { no: NoOrg; ctx: Contexto }) {
  const aberto = ctx.abertos.has(no.id);
  const Icone = ICONE_TIPO[no.tipo];
  const escolhido = ctx.seleccionado === no.id;
  return (
    <div className="flex items-stretch gap-1">
      {no.filhos.length > 0 ? (
        <span
          aria-hidden="true"
          onClick={() => ctx.aoAlternar(no.id)}
          className="flex min-h-11 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className={`h-4 w-4 transition-transform motion-reduce:transition-none ${aberto ? "rotate-90" : ""}`} />
        </span>
      ) : (
        <span aria-hidden="true" className="w-8 shrink-0" />
      )}
      <div
        id={idRotulo(no.id)}
        onClick={() => ctx.aoAbrir(no.id)}
        className={`flex min-h-11 min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 motion-reduce:transition-none ${ANEL} ${escolhido ? "border-primary bg-muted/50" : ""}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">{no.nome}</span>
        <ChipTipo tipo={no.tipo} />
        <Contador no={no} />
      </div>
    </div>
  );
}

function ItemNo({ no, nivel, ctx }: { no: NoOrg; nivel: number; ctx: Contexto }) {
  const aberto = ctx.abertos.has(no.id);
  const temFilhos = no.filhos.length > 0;
  return (
    <li
      role="treeitem"
      aria-level={nivel}
      aria-labelledby={idRotulo(no.id)}
      aria-expanded={temFilhos ? aberto : undefined}
      aria-selected={ctx.seleccionado === no.id}
      data-no={no.id}
      tabIndex={ctx.focoId === no.id ? 0 : -1}
      onFocus={(e) => e.target === e.currentTarget && ctx.aoFocar(no.id)}
      onKeyDown={(e) => ctx.aoTeclar(e, no)}
      className="group/item space-y-2 outline-none"
    >
      <Linha no={no} ctx={ctx} />
      {temFilhos && aberto && (
        <ul role="group" className="ml-6 space-y-2 border-l pl-4">
          {no.filhos.map((f) => <ItemNo key={f.id} no={f} nivel={nivel + 1} ctx={ctx} />)}
        </ul>
      )}
    </li>
  );
}

interface ArvoreProps {
  raiz: NoOrg;
  abertos: ReadonlySet<string>;
  seleccionado: string | null;
  aoAlternar: (id: string) => void;
  aoAbrir: (id: string) => void;
}

export function ArvoreOrganizacao({ raiz, abertos, seleccionado, aoAlternar, aoAbrir }: ArvoreProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLUListElement>(null);
  const [foco, setFoco] = useState<string>(raiz.id);
  const visiveis = listaVisivel(raiz, abertos);
  const focoId = visiveis.some((v) => v.no.id === foco) ? foco : raiz.id;

  const irPara = (id: string | undefined | null): void => {
    if (!id) return;
    setFoco(id);
    ref.current?.querySelector<HTMLElement>(`[data-no="${id}"]`)?.focus();
  };

  const aoTeclar = (e: KeyboardEvent<HTMLLIElement>, no: NoOrg): void => {
    if (e.target !== e.currentTarget) return;
    const i = visiveis.findIndex((v) => v.no.id === no.id);
    const aberto = abertos.has(no.id);
    const filhos = no.filhos.length > 0;
    const acoes: Record<string, () => void> = {
      ArrowDown: () => irPara(visiveis[i + 1]?.no.id),
      ArrowUp: () => irPara(visiveis[i - 1]?.no.id),
      Home: () => irPara(visiveis[0]?.no.id),
      End: () => irPara(visiveis[visiveis.length - 1]?.no.id),
      ArrowRight: () => (!filhos ? undefined : aberto ? irPara(no.filhos[0]?.id) : aoAlternar(no.id)),
      ArrowLeft: () => (aberto && filhos ? aoAlternar(no.id) : irPara(visiveis[i]?.paiId)),
      Enter: () => aoAbrir(no.id),
      " ": () => aoAbrir(no.id),
    };
    const acao = acoes[e.key];
    if (!acao) return;
    e.preventDefault();
    acao();
  };

  const ctx: Contexto = { abertos, seleccionado, focoId, aoFocar: setFoco, aoAlternar, aoAbrir, aoTeclar };
  return (
    <ul ref={ref} role="tree" aria-label={t("rhOrg.arvore")} className="space-y-2">
      <ItemNo no={raiz} nivel={1} ctx={ctx} />
    </ul>
  );
}
