// A grelha recurso × ação de um subgrupo do editor de papéis: uma tabela semântica, uma linha por recurso (grelhaPermissoes.ts) e as
// colunas Ver, Criar, Editar, Eliminar e Outras. Com `edicao` cada célula é uma caixa de seleção, cada ação de Outras um botão
// liga/desliga (aria-pressed), e há "marcar linha" (no início da linha) e "marcar coluna" (no cabeçalho), com estado indeterminado.
// Sem `edicao` é só leitura (ficha da role): ícone e texto "Tem"/"Não tem" em cada célula.
//
// Ecrã estreito: a tabela rola na horizontal DENTRO do seu contentor e a 1.ª coluna (recurso) fica fixa. Escolhido em vez de virar
// lista porque mantém um só DOM (os mesmos controlos para o leitor de ecrã, sem duplicados escondidos), mantém os cabeçalhos de
// coluna e o "marcar coluna", e a página nunca ganha scroll horizontal.
import { useId, type ReactNode } from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { BlocoCategoria } from "./gruposPermissoes";
import {
  COLUNAS_FIXAS, estadoConjunto, linhasDosBlocos, permissoesDaColuna, permissoesOutras,
  type ColunaFixa, type EstadoConjunto, type LinhaGrelha,
} from "./grelhaPermissoes";
import type { Permissao } from "./tipos";

/** O que a grelha precisa para deixar de ser só leitura. */
export interface EdicaoMatriz {
  /** Role de sistema: os controlos ficam desligados e não há "marcar tudo". */
  desativada: boolean;
  /** Sem a permissão Ver do módulo: a célula fica assinalada e não se marca (matriz.ts > podeAlterar). */
  bloqueada: (codigo: string) => boolean;
  aoAlternar: (p: Permissao) => void;
  /** "Marcar tudo" / "Limpar" do módulo. */
  aoModulo: (lista: Permissao[], marcar: boolean) => void;
  /** Marcar/desmarcar uma linha ou uma coluna (matriz.ts > definirConjunto). */
  aoConjunto: (lista: Permissao[], marcar: boolean) => void;
}

const CHAVE_COLUNA: Record<ColunaFixa, string> = { ver: "view", criar: "create", editar: "edit", eliminar: "delete" };
const G = "usersProfiles.form.matrix.grid.";

/** Caixa com os três estados (o Checkbox de ui/ só desenha o visto). */
function CaixaTriEstado({ estado, rotulo, desligada, aoMudar }: {
  estado: EstadoConjunto; rotulo: string; desligada: boolean; aoMudar: () => void;
}) {
  return (
    <CheckboxPrimitive.Root
      checked={estado} disabled={desligada} aria-label={rotulo} onCheckedChange={aoMudar}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        FOCO,
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {estado === "indeterminate" ? <Minus className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/** O texto da dica e da descrição acessível: nome, código, descrição, perigosa e porque está bloqueada. */
function Dica({ permissao: p, bloqueada }: { permissao: Permissao; bloqueada: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="block max-w-xs space-y-0.5 text-left">
      <span className="block font-medium">{p.nome}</span>
      <span className="block font-mono text-xs text-muted-foreground">{p.codigo}</span>
      {p.descricao && <span className="block text-xs">{p.descricao}</span>}
      {p.perigosa && <span className="block text-xs font-medium text-destructive">{t("usersProfiles.dangerous")}</span>}
      {bloqueada && <span className="block text-xs">{t("usersProfiles.form.matrix.needsView")}</span>}
    </span>
  );
}

interface ControloProps {
  permissao: Permissao;
  /** Nome acessível ("Leads: Criar"). */
  rotulo: string;
  /** O texto visível do chip ("Converter"). */
  acao: string;
  concedida: boolean;
  edicao: EdicaoMatriz;
  /** Célula de coluna fixa (caixa) ou ação de Outras (botão liga/desliga). */
  tipo: "celula" | "chip";
}

function ControloPermissao({ permissao: p, rotulo, acao, concedida, edicao, tipo }: ControloProps) {
  const id = useId();
  const bloqueada = !edicao.desativada && edicao.bloqueada(p.codigo) && !concedida;
  const idDica = `${id}-dica`;
  const descricao = <span id={idDica} className="sr-only"><Dica permissao={p} bloqueada={bloqueada} /></span>;
  const perigo = p.perigosa && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />;
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
      <CheckboxPrimitive.Root
        id={id} checked={concedida} aria-label={rotulo} {...comum}
        // Controlada: o estado só muda quando `concedida` mudar (o clique vai por onClick, para a bloqueada também avisar).
        onCheckedChange={() => undefined}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded-sm border ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
          p.perigosa ? "border-destructive" : "border-primary",
          bloqueada && "opacity-50",
          FOCO,
        )}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
          <Check className="h-4 w-4" aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {perigo}
    </label>
  ) : (
    <button
      type="button" aria-pressed={concedida} aria-label={rotulo} {...comum}
      className={cn(
        "inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors motion-reduce:transition-none",
        concedida ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40",
        p.perigosa && !concedida && "border-destructive/60",
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
        <TooltipContent><Dica permissao={p} bloqueada={bloqueada} /></TooltipContent>
      </Tooltip>
      {descricao}
    </>
  );
}

/** Só leitura: ícone mais texto escondido ("Tem"/"Não tem"), e a dica nativa com o nome. */
function Leitura({ permissao: p, rotulo, acao, concedida, tipo }: Omit<ControloProps, "edicao">) {
  const { t } = useTranslation();
  const estado = t(concedida ? "usersProfiles.matrix.has" : "usersProfiles.matrix.hasNot");
  const titulo = [p.nome, p.descricao, p.perigosa ? t("usersProfiles.dangerous") : ""].filter(Boolean).join(" · ");
  const Icone = concedida ? Check : Minus;
  if (tipo === "celula") {
    return (
      <span title={titulo} className="inline-flex h-11 min-w-11 items-center justify-center gap-1">
        <Icone className={cn("h-4 w-4", concedida ? "text-primary dark:text-violet-300" : "text-muted-foreground")} aria-hidden="true" />
        {p.perigosa && <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />}
        <span className="sr-only">{`${rotulo}: ${estado}`}{p.perigosa ? ` (${t("usersProfiles.dangerous")})` : ""}</span>
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
      {acao}
      {p.perigosa && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />}
      <span className="sr-only">{`: ${estado}`}{p.perigosa ? ` (${t("usersProfiles.dangerous")})` : ""}</span>
    </span>
  );
}

interface GrelhaRecursoAcaoProps {
  /** O nome da tabela (grupo ou "grupo › subgrupo"), para a legenda e os rótulos das colunas. */
  titulo: string;
  blocos: BlocoCategoria[];
  concedida: (codigo: string) => boolean;
  edicao?: EdicaoMatriz;
}

const TH_FIXO = "sticky left-0 z-10 bg-background";

export function GrelhaRecursoAcao({ titulo, blocos, concedida, edicao }: GrelhaRecursoAcaoProps) {
  const { t } = useTranslation();
  const linhas = linhasDosBlocos(blocos);
  const legenda = t(`${G}caption`, { table: titulo });
  const comMarcar = !!edicao && !edicao.desativada;
  const rotuloColuna = (c: ColunaFixa) => t(`${G}${CHAVE_COLUNA[c]}`);

  const controlo = (l: LinhaGrelha, p: Permissao, acao: string, tipo: "celula" | "chip"): ReactNode => {
    const rotulo = t(`${G}cell`, { row: l.rotulo, action: acao });
    return edicao
      ? <ControloPermissao key={p.codigo} permissao={p} rotulo={rotulo} acao={acao} concedida={concedida(p.codigo)} edicao={edicao} tipo={tipo} />
      : <Leitura key={p.codigo} permissao={p} rotulo={rotulo} acao={acao} concedida={concedida(p.codigo)} tipo={tipo} />;
  };

  const cabecalho = (texto: string, lista: Permissao[]) => (
    <span className="inline-flex flex-col items-center gap-1">
      <span>{texto}</span>
      {comMarcar && lista.length > 0 && (
        <CaixaTriEstado
          estado={estadoConjunto(lista, concedida)} desligada={false}
          rotulo={t(`${G}column`, { action: texto, table: titulo })}
          aoMudar={() => edicao.aoConjunto(lista, estadoConjunto(lista, concedida) !== true)}
        />
      )}
    </span>
  );

  return (
    <TooltipProvider delayDuration={300}>
      {/* A região rola na horizontal só por dentro; é focável para se poder rolar com o teclado. */}
      <div role="region" aria-label={legenda} tabIndex={0} className={cn("relative overflow-x-auto rounded-md border border-border", FOCO)}>
        <table className="w-full min-w-[36rem] table-fixed border-collapse text-sm">
          <caption className="sr-only">{legenda}</caption>
          <thead>
            <tr className="border-b border-border text-xs font-medium text-muted-foreground">
              <th scope="col" className={cn(TH_FIXO, "w-44 px-3 py-2 text-left font-medium")}>{t(`${G}resource`)}</th>
              {COLUNAS_FIXAS.map((c) => (
                <th key={c} scope="col" className="w-16 px-1 py-2 text-center font-medium">
                  {cabecalho(rotuloColuna(c), permissoesDaColuna(linhas, c))}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-left font-medium">
                <span className="inline-flex items-center gap-2">
                  {t(`${G}other`)}
                  {comMarcar && permissoesOutras(linhas).length > 0 && (
                    <CaixaTriEstado
                      estado={estadoConjunto(permissoesOutras(linhas), concedida)} desligada={false}
                      rotulo={t(`${G}column`, { action: t(`${G}other`), table: titulo })}
                      aoMudar={() => edicao.aoConjunto(permissoesOutras(linhas), estadoConjunto(permissoesOutras(linhas), concedida) !== true)}
                    />
                  )}
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {linhas.map((l) => (
              <tr key={l.chave}>
                <th scope="row" className={cn(TH_FIXO, "px-3 py-1 text-left font-medium text-foreground")}>
                  <span className="flex items-center gap-2">
                    {comMarcar && (
                      <CaixaTriEstado
                        estado={estadoConjunto(l.permissoes, concedida)} desligada={false}
                        rotulo={t(`${G}row`, { row: l.rotulo })}
                        aoMudar={() => edicao.aoConjunto(l.permissoes, estadoConjunto(l.permissoes, concedida) !== true)}
                      />
                    )}
                    <span>{l.rotulo}</span>
                  </span>
                </th>
                {COLUNAS_FIXAS.map((c) => {
                  const p = l.fixas[c];
                  return (
                    <td key={c} className="px-1 py-0 text-center">
                      {p ? controlo(l, p, rotuloColuna(c), "celula") : (
                        <span className="text-muted-foreground">
                          <span aria-hidden="true">–</span>
                          <span className="sr-only">{t(`${G}none`)}</span>
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5">
                  <span className="flex flex-wrap gap-1.5">{l.outras.map((o) => controlo(l, o.permissao, o.rotulo, "chip"))}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
