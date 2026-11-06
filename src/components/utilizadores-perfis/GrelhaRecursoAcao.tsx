// A grelha recurso × ação de um grupo do editor de papéis (v2): UMA tabela por grupo, partida em secções (grelhaPermissoes.ts >
// secoesDoGrupo). Cada linha é um recurso inteiro. A linha de secção traz o título, os cabeçalhos Ver/Criar/Editar/Eliminar/Outras
// (só nas secções com colunas) e o "Tudo" da secção. Secções "só ações" desenham-se como chips por linha, sem colunas vazias.
// Com `edicao`: caixas de seleção nas colunas fixas, chips liga/desliga (aria-pressed) em Outras, e o botão "Tudo"/"Nenhum" no fim
// de cada linha. Sem `edicao` é só leitura (ficha da role): ícone e "Tem"/"Não tem".
//
// Ecrã estreito: a tabela rola na horizontal DENTRO do seu contentor e a 1.ª coluna (recurso) fica fixa — um só DOM para o leitor
// de ecrã, os cabeçalhos mantêm-se, e a página nunca ganha scroll horizontal.
import { useId, type ReactNode } from "react";
import { Check, Minus, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { GrupoMenu } from "./gruposPermissoes";
import { COLUNAS_FIXAS, estadoConjunto, secoesDoGrupo, type ColunaFixa, type LinhaGrelha, type SecaoGrelha } from "./grelhaPermissoes";
import type { Permissao } from "./tipos";

/** O que a grelha precisa para deixar de ser só leitura. */
export interface EdicaoMatriz {
  /** Role de sistema: os controlos ficam desligados e não há "Tudo". */
  desativada: boolean;
  /** Sem a permissão de que depende: a célula fica esbatida e não se marca (matriz.ts > podeAlterar). */
  bloqueada: (codigo: string) => boolean;
  /** Porque está bloqueada, com o nome da permissão que falta («Precisa primeiro de «Ficha: Ver»»). */
  motivoBloqueio: (codigo: string) => string;
  aoAlternar: (p: Permissao) => void;
  /** "Tudo" / "Limpar" do grupo. */
  aoModulo: (lista: Permissao[], marcar: boolean) => void;
  /** "Tudo"/"Nenhum" de uma linha ou de uma secção (matriz.ts > definirConjunto). */
  aoConjunto: (lista: Permissao[], marcar: boolean) => void;
}

const CHAVE_COLUNA: Record<ColunaFixa, string> = { ver: "view", criar: "create", editar: "edit", eliminar: "delete" };
const G = "usersProfiles.form.matrix.grid.";
/** Fundo sólido da coluna fixa (tem de tapar o que rola por baixo). */
const FIXA = "sticky left-0 z-10";

/** O texto da dica e da descrição acessível: nome, código, descrição, perigosa e porque está bloqueada. */
function Dica({ permissao: p, motivo }: { permissao: Permissao; motivo: string | null }) {
  const { t } = useTranslation();
  return (
    <span className="block max-w-xs space-y-0.5 text-left">
      <span className="block font-medium">{p.nome}</span>
      <span className="block font-mono text-xs text-muted-foreground">{p.codigo}</span>
      {p.descricao && <span className="block text-xs">{p.descricao}</span>}
      {p.perigosa && <span className="block text-xs font-medium text-destructive">{t("usersProfiles.dangerous")}</span>}
      {motivo && <span className="block text-xs">{motivo}</span>}
    </span>
  );
}

interface ControloProps {
  permissao: Permissao;
  /** Nome acessível ("Leads: Criar"). */
  rotulo: string;
  /** Texto visível do chip ("Converter"). */
  acao: string;
  concedida: boolean;
  tipo: "celula" | "chip";
}

function ControloPermissao({ permissao: p, rotulo, acao, concedida, edicao, tipo }: ControloProps & { edicao: EdicaoMatriz }) {
  const id = useId();
  const bloqueada = !edicao.desativada && edicao.bloqueada(p.codigo) && !concedida;
  const idDica = `${id}-dica`;
  const motivo = bloqueada ? edicao.motivoBloqueio(p.codigo) : null;
  // Bloqueada: continua focável (aria-disabled) para se ler a razão; o clique só avisa (MatrizEditavel), não muda nada.
  const comum = {
    "aria-describedby": idDica,
    "aria-disabled": bloqueada || undefined,
    disabled: edicao.desativada,
    onClick: () => edicao.aoAlternar(p),
  };
  const gatilho = tipo === "celula" ? (
    <label
      htmlFor={id}
      className={cn("inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-md px-1",
        edicao.desativada || bloqueada ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted")}
    >
      <Checkbox
        id={id} checked={concedida} aria-label={rotulo} {...comum}
        // Controlada: o estado só muda quando `concedida` mudar (o clique vai por onClick, para a bloqueada também avisar).
        onCheckedChange={() => undefined}
        className={cn("h-[18px] w-[18px] rounded-[4px]", p.perigosa && "border-destructive", bloqueada && "opacity-40", FOCO)}
      />
      {p.perigosa && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />}
    </label>
  ) : (
    <button
      type="button" aria-pressed={concedida} aria-label={rotulo} {...comum}
      className={cn(
        "inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors motion-reduce:transition-none",
        concedida ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40",
        (bloqueada || edicao.desativada) && "cursor-not-allowed opacity-50",
        FOCO,
      )}
    >
      {concedida && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {acao}
      {p.perigosa && <ShieldAlert className={cn("h-3.5 w-3.5 shrink-0", !concedida && "text-destructive")} aria-hidden="true" />}
    </button>
  );
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{gatilho}</TooltipTrigger>
        <TooltipContent><Dica permissao={p} motivo={motivo} /></TooltipContent>
      </Tooltip>
      <span id={idDica} className="sr-only"><Dica permissao={p} motivo={motivo} /></span>
    </>
  );
}

/** Só leitura: ícone mais texto escondido ("Tem"/"Não tem"), e a dica nativa com o nome. */
function Leitura({ permissao: p, rotulo, acao, concedida, tipo }: ControloProps) {
  const { t } = useTranslation();
  const estado = t(concedida ? "usersProfiles.matrix.has" : "usersProfiles.matrix.hasNot");
  const perigosa = p.perigosa ? ` (${t("usersProfiles.dangerous")})` : "";
  const titulo = [p.nome, p.descricao, p.perigosa ? t("usersProfiles.dangerous") : ""].filter(Boolean).join(" · ");
  const Icone = concedida ? Check : Minus;
  if (tipo === "celula") {
    return (
      <span title={titulo} className="inline-flex h-11 min-w-11 items-center justify-center gap-1">
        <Icone className={cn("h-4 w-4", concedida ? "text-primary dark:text-violet-300" : "text-muted-foreground")} aria-hidden="true" />
        {p.perigosa && <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />}
        <span className="sr-only">{`${rotulo}: ${estado}${perigosa}`}</span>
      </span>
    );
  }
  return (
    <span
      title={titulo}
      className={cn("inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium",
        concedida ? "border-primary bg-primary/10 text-foreground" : "border-dashed border-input text-muted-foreground")}
    >
      <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{acao}</span>
      {p.perigosa && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />}
      <span className="sr-only">{`${rotulo}: ${estado}${perigosa}`}</span>
    </span>
  );
}

/** "Tudo" (marca o que falta) ou "Nenhum" (quando já está tudo marcado) de uma linha ou secção. */
function BotaoTudo({ nome, lista, concedida, edicao }: { nome: string; lista: Permissao[]; concedida: (c: string) => boolean; edicao: EdicaoMatriz }) {
  const { t } = useTranslation();
  const tudo = estadoConjunto(lista, concedida) === true;
  return (
    <Button
      type="button" variant="ghost" size="sm"
      className={cn("h-8 px-2 text-xs font-medium text-primary hover:text-primary dark:text-violet-300", FOCO)}
      aria-label={t(tudo ? `${G}unmarkRow` : `${G}markRow`, { row: nome })}
      onClick={() => edicao.aoConjunto(lista, !tudo)}
    >
      {t(tudo ? `${G}nothing` : `${G}all`)}
    </Button>
  );
}

interface GrelhaRecursoAcaoProps {
  grupo: GrupoMenu;
  concedida: (codigo: string) => boolean;
  edicao?: EdicaoMatriz;
}

export function GrelhaRecursoAcao({ grupo, concedida, edicao }: GrelhaRecursoAcaoProps) {
  const { t } = useTranslation();
  const secoes = secoesDoGrupo(grupo);
  const comTudo = !!edicao && !edicao.desativada;
  const rotuloColuna = (c: ColunaFixa) => t(`${G}${CHAVE_COLUNA[c]}`);

  const controlo = (l: LinhaGrelha, p: Permissao, acao: string, tipo: "celula" | "chip"): ReactNode => {
    const props = { permissao: p, rotulo: t(`${G}cell`, { row: l.rotulo, action: acao }), acao, concedida: concedida(p.codigo), tipo };
    return edicao ? <ControloPermissao key={p.codigo} {...props} edicao={edicao} /> : <Leitura key={p.codigo} {...props} />;
  };
  const chips = (l: LinhaGrelha) => (
    <span className="flex flex-wrap gap-1.5">{l.outras.map((o) => controlo(l, o.permissao, o.rotulo, "chip"))}</span>
  );
  const tudoLinha = (nome: string, lista: Permissao[]) => (comTudo && edicao
    ? <td className="px-1 text-right"><BotaoTudo nome={nome} lista={lista} concedida={concedida} edicao={edicao} /></td>
    : null);

  const cabecalhoSecao = (s: SecaoGrelha) => {
    // Secção só de ações sem título: não há nada a dizer na linha de secção.
    if (s.soAcoes && !s.titulo) return null;
    const titulo = s.titulo ?? t(`${G}resource`);
    return (
      <tr className="bg-muted text-xs font-medium text-muted-foreground">
        <th scope={s.soAcoes ? "colgroup" : "col"} colSpan={s.soAcoes ? 6 : 1} className={cn(FIXA, "bg-muted px-3 py-2 text-left text-sm font-semibold text-foreground")}>
          {titulo}
        </th>
        {!s.soAcoes && COLUNAS_FIXAS.map((c) => <th key={c} scope="col" className="px-1 py-2 text-center font-medium">{rotuloColuna(c)}</th>)}
        {!s.soAcoes && <th scope="col" className="px-3 py-2 text-left font-medium">{t(`${G}other`)}</th>}
        {comTudo && edicao && (
          <td className="px-1 text-right">
            {s.titulo && <BotaoTudo nome={s.titulo} lista={s.permissoes} concedida={concedida} edicao={edicao} />}
          </td>
        )}
      </tr>
    );
  };

  const linhaTabela = (l: LinhaGrelha) => {
    const semCrud = Object.keys(l.fixas).length === 0;
    return (
      <tr key={l.chave} className="border-t border-border/60">
        <th scope="row" className={cn(FIXA, "bg-background px-3 py-1 text-left font-medium text-foreground")}>{l.rotulo}</th>
        {COLUNAS_FIXAS.map((c) => {
          const p = l.fixas[c];
          return (
            <td key={c} className="px-1 py-0 text-center">
              {p ? controlo(l, p, rotuloColuna(c), "celula") : !semCrud && (
                <span className="text-muted-foreground">
                  <span aria-hidden="true">–</span>
                  <span className="sr-only">{t(`${G}none`)}</span>
                </span>
              )}
            </td>
          );
        })}
        <td className="px-3 py-1.5">{chips(l)}</td>
        {tudoLinha(l.rotulo, l.permissoes)}
      </tr>
    );
  };

  const linhaAcoes = (l: LinhaGrelha) => (
    <tr key={l.chave} className="border-t border-border/60">
      <th scope="row" className={cn(FIXA, "bg-background px-3 py-1.5 text-left align-top font-medium text-foreground")}>
        <span className="flex min-h-8 items-center">{l.rotulo}</span>
      </th>
      <td colSpan={5} className="px-3 py-1.5">{chips(l)}</td>
      {tudoLinha(l.rotulo, l.permissoes)}
    </tr>
  );

  return (
    <TooltipProvider delayDuration={300}>
      {/* A região rola na horizontal só por dentro; é focável para se poder rolar com o teclado. */}
      <div role="region" aria-label={grupo.rotulo} tabIndex={0} className={cn("relative overflow-x-auto rounded-md border border-border", FOCO)}>
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
          <caption className="sr-only">{grupo.rotulo}</caption>
          <colgroup>
            <col className="w-40" />
            {COLUNAS_FIXAS.map((c) => <col key={c} className="w-16" />)}
            <col />
            {comTudo && <col className="w-20" />}
          </colgroup>
          {secoes.map((s) => (
            <tbody key={s.chave} data-secao={s.titulo ?? ""}>
              {cabecalhoSecao(s)}
              {s.linhas.map((l) => (s.soAcoes ? linhaAcoes(l) : linhaTabela(l)))}
            </tbody>
          ))}
        </table>
      </div>
    </TooltipProvider>
  );
}
