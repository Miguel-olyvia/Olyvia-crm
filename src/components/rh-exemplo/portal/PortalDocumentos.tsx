// A secção «Documentos» do portal: a troca nos dois sentidos com o RH, em três abas sublinhadas: «Recebidos» (o que o RH
// enviou), «Pedidos do RH» (o que o RH pede, e o histórico «Enviados por mim») e «Os meus pedidos» (o que a pessoa pede).
// A aba ativa fica no endereço (`?aba=`).
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ABA, LISTA_ABAS } from "@/components/ficha-comum/estilosAbas";
import type { Admissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import {
  pedidoRhPedeAcao, recebidoPedeAcao, type DocRecebido, type PortalPessoa,
} from "@/components/rh-exemplo/lib/portalDocumentos";
import { ABAS_DOCUMENTOS, type AbaDocumentos } from "@/components/rh-exemplo/lib/portalEstado";
import { useTranslation } from "@/hooks/useTranslation";
import { PortalMeusPedidos } from "./PortalMeusPedidos";
import { PortalPedidosRh } from "./PortalPedidosRh";
import { PortalRecebidos } from "./PortalRecebidos";

interface PortalDocumentosProps {
  token: string | undefined;
  admissao: Admissao;
  portal: PortalPessoa;
  /** Os recebidos já com o contrato à cabeça. */
  recebidos: DocRecebido[];
  aba: AbaDocumentos;
  aoMudarAba: (aba: AbaDocumentos) => void;
}

function Contador({ n, rotulo }: { n: number; rotulo: string }) {
  if (n === 0) return null;
  return (
    <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary dark:text-violet-300">
      {n}
      <span className="sr-only"> {rotulo}</span>
    </span>
  );
}

export function PortalDocumentos({ token, admissao, portal, recebidos, aba, aoMudarAba }: PortalDocumentosProps) {
  const { t } = useTranslation();
  const porTratar = t("rhPortal.docs.porTratar");
  const contagens: Record<AbaDocumentos, number> = {
    recebidos: recebidos.filter(recebidoPedeAcao).length,
    pedidos: portal.pedidosRh.filter(pedidoRhPedeAcao).length,
    meus: 0,
  };
  return (
    <section aria-labelledby="portal-docs-titulo" className="space-y-4">
      <div className="space-y-1">
        <h1 id="portal-docs-titulo" className="text-2xl font-bold">{t("rhPortal.docs.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("rhPortal.docs.sub")}</p>
      </div>
      <Tabs value={aba} onValueChange={(v) => aoMudarAba(v as AbaDocumentos)}>
        <TabsList className={LISTA_ABAS} aria-label={t("rhPortal.docs.abas")}>
          {ABAS_DOCUMENTOS.map((a) => (
            <TabsTrigger key={a} value={a} className={ABA}>
              {t(`rhPortal.docs.aba.${a}`)}
              <Contador n={contagens[a]} rotulo={porTratar} />
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="recebidos" className="mt-4">
          <h2 className="sr-only">{t("rhPortal.docs.aba.recebidos")}</h2>
          <PortalRecebidos token={token} recebidos={recebidos} vistos={portal.vistos} admissao={admissao} />
        </TabsContent>
        <TabsContent value="pedidos" className="mt-4">
          <h2 className="sr-only">{t("rhPortal.docs.aba.pedidos")}</h2>
          <PortalPedidosRh token={token} pedidos={portal.pedidosRh} />
        </TabsContent>
        <TabsContent value="meus" className="mt-4">
          <h2 className="sr-only">{t("rhPortal.docs.aba.meus")}</h2>
          <PortalMeusPedidos token={token} pedidos={portal.pedidosPessoa} recebidos={recebidos} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
