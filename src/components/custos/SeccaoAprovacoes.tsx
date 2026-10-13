import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatarEur, formatarPct } from "@/lib/custos";
import { custosApi, useAprovacoes, useGravarCustos, type PedidoAprovacao } from "@/hooks/custos/useCustos";
import { Numero, Seccao, Vazio } from "./pecas";
import { mensagemErro } from "./erros";

const ESTADO: Record<PedidoAprovacao["estado"], { t: string; v: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { t: "Pendente", v: "secondary" },
  aprovada: { t: "Aprovada", v: "default" },
  recusada: { t: "Recusada", v: "destructive" },
  anulada: { t: "Substituída", v: "outline" },
};

const data = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export function SeccaoAprovacoes({ org, podeAprovar }: { org: string; podeAprovar: boolean }) {
  const [todas, setTodas] = useState(false);
  const lista = useAprovacoes(org, todas ? null : "pendente");

  return (
    <Seccao
      id="aprovacoes"
      titulo="Aprovações"
      descricao="Orçamentos com margem abaixo do mínimo da linha, à espera da Direção. Abaixo do custo não chegam aqui: bloqueiam."
      acoes={
        <Button variant="outline" size="sm" onClick={() => setTodas((v) => !v)}>
          {todas ? "Ver só as pendentes" : "Ver todas"}
        </Button>
      }
    >
      {lista.isLoading ? (
        <Vazio>A carregar…</Vazio>
      ) : lista.error ? (
        <Vazio>{mensagemErro(lista.error)}</Vazio>
      ) : (lista.data ?? []).length === 0 ? (
        <Vazio>{todas ? "Ainda não houve pedidos." : "Nada à espera de aprovação."}</Vazio>
      ) : (
        <ul className="space-y-3">
          {(lista.data ?? []).map((p) => <Pedido key={p.id} p={p} org={org} podeAprovar={podeAprovar} />)}
        </ul>
      )}
    </Seccao>
  );
}

function Pedido({ p, org, podeAprovar }: { p: PedidoAprovacao; org: string; podeAprovar: boolean }) {
  const { toast } = useToast();
  const [recusar, setRecusar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const decidir = useGravarCustos(org, (a: { d: "aprovada" | "recusada"; m: string | null }) => custosApi.decidir(p.id, a.d, a.m));
  const feito = (d: string) => () => toast({ title: d === "aprovada" ? "Margem aprovada" : "Margem recusada", description: "Quem pediu já foi avisado." });
  const erro = (e: unknown) => toast({ title: "Não foi possível decidir", description: mensagemErro(e), variant: "destructive" });
  const est = ESTADO[p.estado];

  return (
    <li className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">
          {p.quote_number ?? "Orçamento"} {p.titulo && <span className="text-muted-foreground font-normal">· {p.titulo}</span>}
        </div>
        <Badge variant={est.v}>{est.t}</Badge>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {p.total != null && <span>Total: <Numero>{formatarEur(p.total)} €</Numero></span>}
        <span>Margem: <Numero className="font-semibold">{formatarPct(p.margem)}%</Numero></span>
        {p.margem_minima != null && <span>Mínimo: <Numero>{formatarPct(p.margem_minima)}%</Numero></span>}
        {p.margem_linha_min != null && <span>Pior linha: <Numero>{formatarPct(p.margem_linha_min)}%</Numero></span>}
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">Pedido por {p.pedida_por ?? "—"} em {data(p.pedida_em)}:</span> {p.motivo}
      </p>
      {p.alertas?.filter((a) => a.nivel !== "aviso").length > 0 && (
        <ul className="text-sm list-disc pl-5 text-amber-800 dark:text-amber-300">
          {p.alertas.filter((a) => a.nivel !== "aviso").map((a, i) => <li key={i}>{a.mensagem}</li>)}
        </ul>
      )}
      {p.estado !== "pendente" && p.decidida_em && (
        <p className="text-xs text-muted-foreground">
          Decidido por {p.decidida_por ?? "—"} em {data(p.decidida_em)}{p.motivo_decisao ? `: ${p.motivo_decisao}` : "."}
        </p>
      )}
      {p.estado === "pendente" && podeAprovar && (
        recusar ? (
          <div className="space-y-2">
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Porque recusa? (quem pediu vai ler)" aria-label="Motivo da recusa" />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={motivo.trim().length < 3 || decidir.isPending}
                onClick={() => decidir.mutate({ d: "recusada", m: motivo.trim() }, { onSuccess: feito("recusada"), onError: erro })}>
                Recusar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRecusar(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" disabled={decidir.isPending}
              onClick={() => decidir.mutate({ d: "aprovada", m: null }, { onSuccess: feito("aprovada"), onError: erro })}>
              <Check className="mr-1 h-4 w-4" />Aprovar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRecusar(true)}>
              <X className="mr-1 h-4 w-4" />Recusar…
            </Button>
          </div>
        )
      )}
    </li>
  );
}
