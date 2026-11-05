/**
 * O painel de UMA pessoa da fila de trabalho: gaveta lateral no computador e ecra inteiro no telemovel. Resolve-se tudo ali,
 * numa so lista cronologica (horas extra, justificacoes, alertas do fim do dia), cada item com a etiqueta do seu tipo.
 *
 * Os dialogos e formularios de decisao sao os que ja existiam, sem os reescrever: `DecidirHoraExtraDialog`,
 * `DialogosDecisaoDia` com `useDecisaoDoDia`, `AccaoDoDesvio` e `RegistarTempoAMaisDialog`. Depois de gravar, a fila
 * le outra vez as tres fontes (`aoRecarregar`) e o mapa o mes (`aoAlterarMapa`).
 *
 * FOCO: ao abrir, vai para o titulo (nao para o primeiro botao, para nao se decidir sem querer); Escape fecha; ao fechar,
 * volta a linha da pessoa ou, se ela ja nao esta na lista, a linha seguinte. Quando o ultimo item sai, o foco vai para
 * «Fechar» e o painel diz «Nada por tratar».
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { cn } from "@/lib/utils";
import { AccaoDoDesvio } from "@/components/rh-exemplo/fluxosB/alertas/AccaoDoDesvio";
import { DialogosDecisaoDia, type PedidoDecisaoDia } from "@/components/rh-exemplo/fluxosB/justificacaoDia/DialogosDecisaoDia";
import { useDecisaoDoDia } from "@/components/rh-exemplo/fluxosB/justificacaoDia/useDecisaoDoDia";
import { DecidirHoraExtraDialog, type PedidoDecisao } from "@/components/rh-exemplo/fluxosC/DecidirHoraExtraDialog";
import { dataCurta } from "@/components/rh-exemplo/fluxosC/formatosC";
import { RegistarTempoAMaisDialog } from "@/components/rh-exemplo/fluxosC/RegistarTempoAMaisDialog";
import { accoesDoItem, type FonteFila, type IdDeAccao, type ItemFila, type PessoaNaFila } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";
import { textoDasPendencias } from "./aspectoTipoFila";
import { ItemDaFila } from "./ItemFila";
import { resumoDasContagens } from "./LinhaFilaPessoa";

export interface PessoaAberta {
  id: string;
  nome: string;
}

interface PainelFilaPessoaProps {
  /** A pessoa aberta; `null` com o painel fechado. */
  aberta: PessoaAberta | null;
  /** O que a fila diz dela agora; `null` quando ja nao tem nada por tratar. */
  pessoa: PessoaNaFila | null;
  hoje: string;
  /** As tres fontes leram bem: so entao se pode dizer «Nada por tratar». */
  lidaComSucesso: boolean;
  /** As fontes cuja ultima leitura falhou: os itens delas podem estar desactualizados. */
  fontesComProblema: readonly FonteFila[];
  permissoes: PermissoesAssiduidade;
  locais: LocalTrabalho[];
  minhaPessoaId: string | null;
  /** Relê as tres fontes da fila. */
  aoRecarregar: () => Promise<void>;
  /** O que mexe no mapa do mes (faltas, horas corrigidas): para ele reler. */
  aoAlterarMapa: () => void;
  aoFechar: () => void;
  /** Devolve o foco ao fechar (a lista sabe para onde). */
  aoDevolverFoco: (evento: Event) => void;
}

export function PainelFilaPessoa({ aberta, aoFechar, aoDevolverFoco, ...resto }: PainelFilaPessoaProps) {
  const conteudoRef = useRef<HTMLDivElement>(null);
  if (!aberta) return null;
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
        <ConteudoDoPainel aberta={aberta} {...resto} />
      </SheetContent>
    </Sheet>
  );
}

type ConteudoProps = Omit<PainelFilaPessoaProps, "aberta" | "aoFechar" | "aoDevolverFoco"> & { aberta: PessoaAberta };

function ConteudoDoPainel({ aberta, pessoa, hoje, lidaComSucesso, fontesComProblema, permissoes, locais, minhaPessoaId, aoRecarregar, aoAlterarMapa }: ConteudoProps) {
  const { t } = useTranslation();
  const [pedidoHoraExtra, setPedidoHoraExtra] = useState<PedidoDecisao | null>(null);
  const [pedidoJustificacao, setPedidoJustificacao] = useState<PedidoDecisaoDia | null>(null);
  const [pedidoAlerta, setPedidoAlerta] = useState<{ item: Extract<ItemFila, { tipo: "alerta" }>; accao: IdDeAccao } | null>(null);
  const [registarAberto, setRegistarAberto] = useState(false);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const blocoDaAccaoRef = useRef<HTMLDivElement>(null);
  const jaTeveItens = useRef(false);

  const aposGravar = (): void => {
    void aoRecarregar();
    aoAlterarMapa();
  };
  const { decidir, mensagem, executor } = useDecisaoDoDia(aposGravar);
  /** Recusar devolve uma promessa: quando acaba (bem ou mal) a fila le outra vez. Aceitar relê por `aoCriarFalta`. */
  const decidirERecarregar: typeof decidir = (justificacao, decisao, motivo) => {
    const resposta = decidir(justificacao, decisao, motivo);
    if (resposta instanceof Promise) void resposta.finally(() => void aoRecarregar());
    return resposta;
  };

  const semItens = pessoa === null;
  useEffect(() => {
    if (!semItens) {
      jaTeveItens.current = true;
    } else if (jaTeveItens.current) {
      // O ultimo item saiu: o foco nao pode ficar num botao que desapareceu.
      fecharRef.current?.focus();
    }
  }, [semItens]);

  // O formulario de uma accao sobre um alerta abre por cima da lista: traz-se a vista para ele.
  useEffect(() => {
    if (pedidoAlerta) blocoDaAccaoRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [pedidoAlerta]);

  const dias = useMemo(() => {
    const porDia = new Map<string, ItemFila[]>();
    for (const item of pessoa?.itens ?? []) porDia.set(item.data, [...(porDia.get(item.data) ?? []), item]);
    return [...porDia.entries()];
  }, [pessoa]);

  const accionar = (item: ItemFila, accao: IdDeAccao): void => {
    if (item.tipo === "hora_extra") {
      setPedidoHoraExtra({ hora: item.hora, decisao: accao === "confirmar" ? "confirmar" : "rejeitar", pessoaNome: aberta.nome });
    } else if (item.tipo === "justificacao") {
      setPedidoJustificacao({ justificacao: item.justificacao, tipo: accao === "aceitar" ? "aceitar" : "recusar", pessoaNome: aberta.nome });
    } else {
      setPedidoAlerta({ item, accao });
    }
  };

  const resumo = pessoa
    ? t("rhFila.painel.resumo", {
        total: textoDasPendencias(t, pessoa.total),
        tipos: resumoDasContagens(t, pessoa),
        data: dataCurta(pessoa.maisAntigo),
      })
    : t(lidaComSucesso ? "rhFila.painel.semPendencias" : "rhFila.painel.semItensLidos");
  // «Nada por tratar» so quando as tres fontes leram bem; com uma a falhar o painel di-lo em vez de o afirmar.
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
          to={`/rh-exemplo/pessoas/${aberta.id}?aba=planeamento`}
          className={cn("relative w-fit rounded-sm text-sm font-medium underline underline-offset-2 after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']", FOCO)}
        >
          {t("rhFila.painel.abrirFicha")}
        </Link>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {fontesComProblema.length > 0 && (
          <p role="alert" data-testid="painel-fila-desactualizado" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            {t("rhFila.painel.desactualizado", { fontes: fontesComProblema.map((fonte) => t(`rhFila.fonte.${fonte}`)).join(", ") })}
          </p>
        )}
        {/* Um `alert` so para o erro, FORA do `status`: dentro dele seria anunciado duas vezes. */}
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

        {pedidoAlerta && (
          <div ref={blocoDaAccaoRef}>
            <AccaoDoDesvio
              key={`${pedidoAlerta.item.id}-${pedidoAlerta.accao}`}
              desvio={pedidoAlerta.item.desvio}
              accao={pedidoAlerta.accao as "corrigir" | "marcar_falta" | "anular_por_ausencia"}
              nome={aberta.nome}
              locais={locais}
              onAlterado={aposGravar}
              onFechar={() => setPedidoAlerta(null)}
            />
          </div>
        )}

        {pessoa && (
          <ol aria-label={t("rhFila.painel.lista", { nome: aberta.nome })} className="space-y-4">
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
                      accoes={accoesDoItem(item, permissoes, minhaPessoaId)}
                      aoAccionar={accionar}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      {permissoes.gerir && (
        <div className="border-t p-4">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setRegistarAberto(true)}>
            {t("rhFila.painel.registar")}
          </Button>
        </div>
      )}

      <DecidirHoraExtraDialog pedido={pedidoHoraExtra} aoFechar={() => setPedidoHoraExtra(null)} />
      <DialogosDecisaoDia pedido={pedidoJustificacao} aoFechar={() => setPedidoJustificacao(null)} aoDecidir={decidirERecarregar} />
      {executor}
      <RegistarTempoAMaisDialog aberto={registarAberto} aoFechar={() => setRegistarAberto(false)} pessoaIdInicial={aberta.id} />
    </>
  );
}
