// O ↶ Anular / ↷ Refazer no cabeçalho do novo Inventário (fatia 3): o BotoesPassos do Estúdio da obra (tal como está, só com
// o tipo do passo alargado), ligado ao livro da sessão (useLivroDaSessao) e APENAS às reversões que já existem
// (anularInventario.ts):
//  · receção de PO → abre o "Reverter receção" clássico (Encomendas, ?open=&item=), que pede o motivo e reverte como hoje;
//  · saída de EC reversível → "Reverter a saída de X?" e rpc_revert_client_order_stock_exit com os parâmetros e a permissão
//    do ClientOrders.tsx (confirmExitGate); na dúvida, abre a EC nas Saídas;
//  · o resto (ajustes, transferências…) → fora da pilha (não tranca os passos anteriores); só uma nota com quantos são.
// Refazer nunca corre sozinho: reabre a ação clássica. Ctrl+Z anula, Ctrl+Shift+Z / Ctrl+Y refazem — fora das caixas de
// texto, sem folhas/diálogos abertos e sem a lista dos passos aberta. Sem nenhuma das permissões de reversão, os botões
// ficam desligados com o motivo.
// O toast escuro (ToastEscuro) só aparece com uma ação: um passo novo que se pode anular, ou um anulado que se pode refazer.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inventoryTodayQueryKey } from "@/hooks/useInventoryToday";
import { usePermissionGate } from "@/components/inventory/ui/RowActions";
import { DisabledReasonInfo } from "@/components/inventory/ui/DisabledReason";
import { clientOrderReadinessQueryKey } from "@/components/client-orders/clientOrderList";
import type { ClientOrderDocumentLine } from "@/components/client-orders/clientOrderExit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BotoesPassos } from "@/emylia/estudioObra/BotoesPassos";
import {
  oQueAnular,
  oQueRefazer,
  passosDoLivro,
  reverterSaida,
  teclaAnular,
  textoDoPasso,
  tipoDoMovimento,
  type ClienteRpc,
  type MovimentoLivro,
  type PassoAnular,
} from "./anularInventario";
import { ToastEscuro, type AvisoEscuro } from "./ToastEscuro";

/** As permissões das reversões clássicas: PurchaseOrders.tsx (revertReceiptGate) e ClientOrders.tsx (confirmExitGate). */
export const PERMISSOES_REVERTER_RECECAO = ["purchase_orders.revert_receipt", "inventory.edit"];
export const PERMISSOES_REVERTER_SAIDA = ["inventory.edit", "client_orders.confirm_stock_exit", "client_orders.view"];

interface Confirmar {
  contractId: string;
  movementId: string;
  pergunta: string;
  mov: MovimentoLivro;
  /** As parcelas da mesma saída (este incluído) que a RPC estorna juntas. */
  irmas: string[];
}

export interface BotoesAnularProps {
  orgId: string | null;
  movimentos: readonly MovimentoLivro[] | undefined;
  recarregar: () => void;
  /** Depois de reverter aqui (o Existências embebido relê). */
  aoMudarStock?: () => void;
}

export function BotoesAnular({ orgId, movimentos, recarregar, aoMudarStock }: BotoesAnularProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gate = usePermissionGate();
  const rececaoGate = gate(PERMISSOES_REVERTER_RECECAO, true);
  const saidaGate = gate(PERMISSOES_REVERTER_SAIDA, true);
  const bloqueio = !rececaoGate.allowed && !saidaGate.allowed
    ? (saidaGate.reason ?? rececaoGate.reason ?? "Sem permissão para anular.")
    : null;
  const motivoId = useId();

  const { L, pos, foraDaPilha } = useMemo(
    () => passosDoLivro(movimentos ?? [], { rececao: rececaoGate, saida: saidaGate }),
    // os gates são recalculados a cada render; contam só os booleanos/motivos
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movimentos, rececaoGate.allowed, rececaoGate.reason, saidaGate.allowed, saidaGate.reason],
  );

  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [aReverter, setAReverter] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aVer, setAVer] = useState(false);
  const [aviso, setAviso] = useState<AvisoEscuro | null>(null);
  /** Os movimentos revertidos AQUI (com as parcelas irmãs): o toast "Saída revertida" é o último, sem "Anulado" por cima. */
  const acabeiDeReverter = useRef<Set<string>>(new Set());
  /** Guarda síncrona: um segundo Ctrl+Z (ou clique) enquanto o primeiro ainda lê a EC não abre outra leitura nem outro diálogo. */
  const emCurso = useRef(false);
  /** O contentor dos botões: com a lista dos passos do BotoesPassos aberta (o seu [role=dialog]) os atalhos não atuam. */
  const caixa = useRef<HTMLDivElement>(null);

  const refazerPasso = (p: PassoAnular | undefined) => {
    if (!p || bloqueio) return;
    const r = oQueRefazer(p.mov);
    if (r) navigate(r.to);
  };

  const anularPasso = async (p: PassoAnular | undefined) => {
    if (!p || bloqueio || aVer || !p.pode || emCurso.current) return;
    emCurso.current = true;
    try {
      await anularPassoJa(p);
    } finally {
      emCurso.current = false;
    }
  };
  const anularPassoJa = async (p: PassoAnular) => {
    const m = p.mov;
    let linhasEc: ClientOrderDocumentLine[] | null = null;
    if (tipoDoMovimento(m) === "saida" && saidaGate.allowed && m.sale_source_id) {
      // A linha da EC com este movimento de saída: a mesma leitura do ecrã (rpc_get_client_order_document).
      setAVer(true);
      try {
        const { data, error } = await supabase.rpc("rpc_get_client_order_document", { p_contract_id: m.sale_source_id });
        if (!error) linhasEc = ((data as { lines?: ClientOrderDocumentLine[] | null } | null)?.lines ?? null);
      } catch {
        linhasEc = null; // na dúvida, o deep link
      } finally {
        setAVer(false);
      }
    }
    const o = oQueAnular(m, { linhasEc, podeReverterSaida: saidaGate.allowed, movimentos: movimentos ?? [] });
    if (o.tipo === "link") navigate(o.to);
    else if (o.tipo === "reverter") { setErro(null); setConfirmar({ contractId: o.contractId, movementId: o.movementId, pergunta: o.pergunta, mov: m, irmas: o.irmas }); }
  };

  const anular = () => { void anularPasso(L[pos - 1]); };
  const refazer = () => refazerPasso(L[pos]);
  /** No Estúdio volta-se a um ponto anulando um a um; aqui cada passo é uma ação clássica, por isso dá-se só o passo seguinte nesse sentido. */
  const voltarAte = (k: number) => {
    if (k + 1 < pos) anular();
    else if (k + 1 > pos) refazer();
  };

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (fora das caixas de texto, sem folhas/diálogos abertos, sem a lista dos passos aberta —
  // detetada pelo [role=dialog] que o BotoesPassos põe dentro do contentor, sem mexer no BotoesPassos).
  const atalhos = useRef({ anular, refazer, ativo: false });
  atalhos.current = { anular, refazer, ativo: !bloqueio };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const a = teclaAnular(e);
      if (!a || !atalhos.current.ativo) return;
      if (caixa.current?.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      if (a === "anular") atalhos.current.anular();
      else atalhos.current.refazer();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  // O toast escuro: um passo novo que se pode anular, ou um que passou a anulado e se pode refazer (nunca na primeira leitura).
  const antes = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    if (!movimentos) return;
    const agora = new Map(L.map((p) => [p.mov.id, p.mov.anulado]));
    const prev = antes.current;
    antes.current = agora;
    if (!prev || bloqueio) return;
    const novo = [...L.slice(0, pos)].reverse().find((p) => !prev.has(p.mov.id) && p.pode && tipoDoMovimento(p.mov) !== "outro");
    if (novo) {
      setAviso({ n: Date.now(), texto: textoDoPasso(novo.mov), acao: { rotulo: "Anular", fazer: () => { void anularPasso(novo); } } });
      return;
    }
    // As parcelas revertidas aqui (a RPC estorna a saída repartida inteira) já têm o toast "Saída revertida".
    const desfeito = L.slice(pos).find((p) => prev.get(p.mov.id) === false && oQueRefazer(p.mov) && !acabeiDeReverter.current.has(p.mov.id));
    if (desfeito) {
      setAviso({ n: Date.now(), texto: `Anulado: ${textoDoPasso(desfeito.mov)}`, acao: { rotulo: "Refazer", fazer: () => refazerPasso(desfeito) } });
    }
  }, [movimentos]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmarReverter = async () => {
    if (!confirmar || aReverter || !saidaGate.allowed) return;
    setAReverter(true);
    setErro(null);
    try {
      await reverterSaida(supabase as unknown as ClienteRpc, confirmar.contractId, confirmar.movementId);
      const c = confirmar;
      for (const id of [c.mov.id, ...c.irmas]) acabeiDeReverter.current.add(id);
      setConfirmar(null);
      setAviso({ n: Date.now(), texto: `Saída revertida: ${textoDoPasso(c.mov)}`, acao: { rotulo: "Refazer", fazer: () => refazerPasso({ n: 0, texto: "", pode: true, mov: c.mov }) } });
      // O que o ecrã clássico refresca depois de reverter (a EC e a lista) + os números do Hoje e o livro.
      if (orgId) {
        void queryClient.invalidateQueries({ queryKey: inventoryTodayQueryKey(orgId) });
        void queryClient.invalidateQueries({ queryKey: clientOrderReadinessQueryKey(orgId) });
      }
      void queryClient.invalidateQueries({ queryKey: ["inventario-novo-ese-ec"] });
      recarregar();
      aoMudarStock?.();
    } catch (e) {
      setErro((e as { message?: string } | null)?.message || "Não foi possível reverter a saída.");
    } finally {
      setAReverter(false);
    }
  };

  /** Nº de parcelas da saída a reverter, quando é repartida (a RPC estorna-as todas); null se for uma só. */
  const repartida = confirmar && confirmar.irmas.length > 1 ? confirmar.irmas.length : null;

  return (
    <>
      <div ref={caixa} className="hidden items-center gap-1 sm:inline-flex">
        <fieldset disabled={!!bloqueio || aVer} aria-describedby={bloqueio ? motivoId : undefined} className="m-0 inline-flex min-w-0 border-0 p-0">
          <BotoesPassos L={L} pos={pos} anular={anular} refazer={refazer} voltarAte={voltarAte} />
        </fieldset>
        {foraDaPilha > 0 && (
          <span className="text-xs text-muted-foreground" data-testid="fora-da-pilha">
            {foraDaPilha === 1 ? "1 movimento que não se anula aqui" : `${foraDaPilha} movimentos que não se anulam aqui`}
          </span>
        )}
        {aVer && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="A ver a encomenda" />}
        {bloqueio && (
          <>
            <span id={motivoId} className="sr-only">{bloqueio}</span>
            <DisabledReasonInfo reason={bloqueio} label="Anular e refazer" />
          </>
        )}
      </div>

      <AlertDialog open={confirmar !== null} onOpenChange={(o) => { if (!o && !aReverter) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar?.pergunta ?? "Reverter a saída?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {repartida
                ? `A saída foi repartida em ${repartida} parcelas e reverte-se inteira: o stock volta a cada armazém de onde saiu e a linha da encomenda fica outra vez por sair.`
                : "O stock volta ao armazém de onde saiu e a linha da encomenda fica outra vez por sair."}
              {" "}É o mesmo «Reverter saída» das Saídas para clientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aReverter}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={aReverter} onClick={(e) => { e.preventDefault(); void confirmarReverter(); }}>
              {aReverter && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}{repartida ? `Reverter toda a saída (${repartida} parcelas)` : "Reverter saída"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ToastEscuro aviso={aviso} fechar={() => setAviso(null)} />
    </>
  );
}
