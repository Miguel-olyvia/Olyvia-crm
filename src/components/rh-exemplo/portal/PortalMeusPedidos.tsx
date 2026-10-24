// A aba «Os meus pedidos» do portal: a pessoa PEDE documentos ao RH («Pedir documento» abre um painel lateral). Cada pedido
// mostra o estado (Pedido, Em preparação, Disponível, Recusado com motivo); quando fica disponível, o documento aparece
// também em «Recebidos».
import { useState } from "react";
import { Link } from "react-router-dom";
import { FilePlus2, Inbox } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { DocRecebido, PedidoPessoa } from "@/components/rh-exemplo/lib/portalDocumentos";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { cn } from "@/lib/utils";
import { SeloPedidoPessoa } from "./aspeto";
import { diaMes, tituloPedidoPessoa } from "./textosPortal";
import { PedirDocumentoSheet } from "./PedirDocumentoSheet";

function ItemPedido({ pedido, documento }: { pedido: PedidoPessoa; documento: DocRecebido | undefined }) {
  const { t } = useTranslation();
  return (
    <li data-testid={`meu-pedido-${pedido.id}`} className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-medium">{tituloPedidoPessoa(t, pedido)}</h3>
          <p className="text-xs text-muted-foreground">
            {t("rhPortal.meus.pedidoEm", { data: diaMes(pedido.criadoEm) })} · {t(`rhPortal.urgencia.${pedido.urgencia}`)}
          </p>
        </div>
        <SeloPedidoPessoa estado={pedido.estado} t={t} />
      </div>
      {pedido.nota && <p className="text-sm text-muted-foreground">{pedido.nota}</p>}
      {pedido.estado === "recusado" && pedido.motivoRecusa && (
        <p role="status" className="rounded-md border-l-4 border-destructive bg-destructive/5 px-3 py-1.5 text-sm">
          {t("rhPortal.meus.recusadoMotivo", { motivo: pedido.motivoRecusa })}
        </p>
      )}
      {pedido.estado === "disponivel" && documento && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t("rhPortal.meus.disponivelEm", { nome: documento.nomeFicheiro })}</span>
          <Link to={{ search: "?sec=documentos&aba=recebidos" }} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11", FOCO)}>
            {t("rhPortal.meus.verEmRecebidos")}
          </Link>
        </p>
      )}
    </li>
  );
}

interface PortalMeusPedidosProps {
  token: string | undefined;
  pedidos: PedidoPessoa[];
  recebidos: DocRecebido[];
}

export function PortalMeusPedidos({ token, pedidos, recebidos }: PortalMeusPedidosProps) {
  const { t } = useTranslation();
  const [painel, setPainel] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("rhPortal.meus.sub")}</p>
        <Button type="button" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setPainel(true)}>
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          {t("rhPortal.meus.pedir")}
        </Button>
      </div>
      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("rhPortal.meus.vazio")}</p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label={t("rhPortal.meus.lista")}>
          {pedidos.map((p) => <ItemPedido key={p.id} pedido={p} documento={recebidos.find((d) => d.id === p.documentoId)} />)}
        </ul>
      )}
      <PedirDocumentoSheet aberto={painel} token={token} aoFechar={() => setPainel(false)} />
    </div>
  );
}
