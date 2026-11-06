/**
 * A CASCA do painel de UMA pessoa da fila de trabalho, igual no mapa de assiduidade e no ecra de Ausencias: gaveta lateral no
 * computador e ecra inteiro no telemovel, com a lista cronologica das pendencias (cada item com a etiqueta do seu tipo e as
 * accoes nele proprio). O que difere de ecra para ecra (os dialogos de decisao, as accoes, o rodape) entra de fora.
 *
 * FOCO: ao abrir, vai para o titulo (nao para o primeiro botao, para nao se decidir sem querer); Escape fecha; ao fechar,
 * volta a linha da pessoa ou, se ela ja nao esta na lista, a linha seguinte. Quando o ultimo item sai, o foco vai para
 * «Fechar» e o painel diz «Nada por tratar» (so se a fonte leu bem; senao avisa que os itens podem estar desactualizados).
 *
 * UM SO `role="status"` para o resultado das decisoes; o erro vai noutro `role="alert"` FORA dele (dentro seria anunciado
 * duas vezes).
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { cn } from "@/lib/utils";
import { dataCurta } from "@/components/rh-exemplo/fluxosC/formatosC";
import { type AccaoDoItem, type IdDeAccao, type ItemFila, type PessoaNaFila } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { textoDasPendencias } from "./aspectoTipoFila";
import { ItemDaFila } from "./ItemFila";
import { resumoDasContagens } from "./LinhaFilaPessoa";

export interface PessoaAberta {
  id: string;
  nome: string;
}

export interface MensagemDoPainel {
  texto: string;
  erro: boolean;
}

export interface PainelFilaBaseProps {
  aberta: PessoaAberta;
  /** O que a fila diz dela agora; `null` quando ja nao tem nada por tratar. */
  pessoa: PessoaNaFila | null;
  hoje: string;
  /** Todas as fontes leram bem: so entao se pode dizer «Nada por tratar». */
  lidaComSucesso: boolean;
  /** As fontes cuja ultima leitura falhou: os itens delas podem estar desactualizados. */
  fontesComProblema: readonly string[];
  /** As accoes de cada item, com a permissao de quem ve (uma sem permissao leva o motivo). */
  accoesDe: (item: ItemFila) => readonly AccaoDoItem[];
  aoAccionar: (item: ItemFila, accao: IdDeAccao) => void;
  aoAbrirDetalhe?: (item: ItemFila) => void;
  /** O resultado da ultima decisao (ou o erro). */
  mensagem?: MensagemDoPainel | null;
  /** Ligacao a ficha da pessoa. */
  hrefFicha: string;
  chaveFicha: string;
  chaveLista?: string;
  chaveResumo?: string;
  /** Por cima da lista (por exemplo o formulario de uma accao sobre um alerta). */
  blocoExtra?: ReactNode;
  /** Rodape fixo (por exemplo «Registar tempo a mais»). */
  rodape?: ReactNode;
  /** Os dialogos de decisao: renderizam-se dentro da gaveta, por cima dela. */
  children?: ReactNode;
  aoFechar: () => void;
  /** Devolve o foco ao fechar (a lista sabe para onde). */
  aoDevolverFoco: (evento: Event) => void;
}

export function PainelFilaBase({ aoFechar, aoDevolverFoco, ...resto }: PainelFilaBaseProps) {
  const conteudoRef = useRef<HTMLDivElement>(null);
  return (
    <Sheet open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <SheetContent
        ref={conteudoRef}
        side="right"
        hideClose
        data-testid="painel-fila-pessoa"
        className="flex h-dvh w-full max-w-none flex-col gap-0 p-0 sm:max-w-xl motion-reduce:animate-none motion-reduce:transition-none"
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          conteudoRef.current?.querySelector<HTMLElement>("[data-fila-titulo]")?.focus();
        }}
        onCloseAutoFocus={aoDevolverFoco}
      >
        <ConteudoDaBase {...resto} />
      </SheetContent>
    </Sheet>
  );
}

type ConteudoProps = Omit<PainelFilaBaseProps, "aoFechar" | "aoDevolverFoco">;

function ConteudoDaBase({
  aberta,
  pessoa,
  hoje,
  lidaComSucesso,
  fontesComProblema,
  accoesDe,
  aoAccionar,
  aoAbrirDetalhe,
  mensagem = null,
  hrefFicha,
  chaveFicha,
  chaveLista = "rhFila.painel.lista",
  chaveResumo = "rhFila.painel.resumo",
  blocoExtra,
  rodape,
  children,
}: ConteudoProps) {
  const { t } = useTranslation();
  const fecharRef = useRef<HTMLButtonElement>(null);
  const jaTeveItens = useRef(false);

  const semItens = pessoa === null;
  useEffect(() => {
    if (!semItens) {
      jaTeveItens.current = true;
    } else if (jaTeveItens.current) {
      // O ultimo item saiu: o foco nao pode ficar num botao que desapareceu.
      fecharRef.current?.focus();
    }
  }, [semItens]);

  const dias = useMemo(() => {
    const porDia = new Map<string, ItemFila[]>();
    for (const item of pessoa?.itens ?? []) porDia.set(item.data, [...(porDia.get(item.data) ?? []), item]);
    return [...porDia.entries()];
  }, [pessoa]);

  const resumo = pessoa
    ? t(chaveResumo, {
        total: textoDasPendencias(t, pessoa.total),
        tipos: resumoDasContagens(t, pessoa),
        data: dataCurta(pessoa.maisAntigo),
      })
    : t(lidaComSucesso ? "rhFila.painel.semPendencias" : "rhFila.painel.semItensLidos");
  // «Nada por tratar» so quando as fontes leram bem; com uma a falhar o painel di-lo em vez de o afirmar.
  const nada = semItens && lidaComSucesso;

  return (
    <>
      <SheetClose asChild>
        <Button ref={fecharRef} type="button" variant="ghost" size="icon" className="absolute right-3 top-3 h-11 w-11" aria-label={t("rhFila.painel.fechar")}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </SheetClose>
      <SheetHeader className="space-y-1 border-b p-4 pr-16 text-left">
        <SheetTitle tabIndex={-1} data-fila-titulo className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {aberta.nome}
        </SheetTitle>
        <SheetDescription>{resumo}</SheetDescription>
        <Link
          to={hrefFicha}
          className={cn("relative w-fit rounded-sm text-sm font-medium underline underline-offset-2 after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']", FOCO)}
        >
          {t(chaveFicha)}
        </Link>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {fontesComProblema.length > 0 && (
          <p role="alert" data-testid="painel-fila-desactualizado" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            {t("rhFila.painel.desactualizado", { fontes: fontesComProblema.map((fonte) => t(`rhFila.fonte.${fonte}`)).join(", ") })}
          </p>
        )}
        {mensagem?.erro && (
          <p role="alert" data-testid="painel-fila-aviso" className="text-sm font-medium text-destructive">
            {mensagem.texto}
          </p>
        )}
        <div role="status" className="space-y-1" data-testid="painel-fila-estado">
          {mensagem && !mensagem.erro && (
            <p data-testid="painel-fila-aviso" className="text-sm font-medium">
              {mensagem.texto}
            </p>
          )}
          {nada && <p className="text-sm text-muted-foreground">{t("rhFila.painel.nada", { nome: aberta.nome })}</p>}
        </div>

        {blocoExtra}

        {pessoa && (
          <ol aria-label={t(chaveLista, { nome: aberta.nome })} className="space-y-4">
            {dias.map(([data, itens]) => (
              <li key={data}>
                <h3 className="pb-1 text-sm font-semibold tabular-nums">{dataCurta(data)}</h3>
                <ul className="divide-y">
                  {itens.map((item) => (
                    <ItemDaFila
                      key={item.id}
                      item={item}
                      nome={aberta.nome}
                      hoje={hoje}
                      accoes={accoesDe(item)}
                      aoAccionar={aoAccionar}
                      aoAbrirDetalhe={aoAbrirDetalhe}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      {rodape}
      {children}
    </>
  );
}
