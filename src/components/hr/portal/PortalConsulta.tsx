/**
 * O portal em modo de CONSULTA LIMITADA: o que se mostra ao abrir o link, sem sessao. So o
 * minimo publico (organizacao, primeiro nome, estado do processo e prazo), a faixa de
 * progresso e o botao que leva ao passo do codigo. Nenhum dado pessoal ou sensivel aparece.
 */
import { forwardRef, type Ref } from "react";
import { Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import type { AvisoPortal } from "@/hooks/useConviteAdmissaoPublico";
import { ConviteSaudacao } from "@/components/hr/convite/ConviteSaudacao";
import { mensagemErroPortal, type ConvitePublico } from "@/lib/hr/portalAdmissao";
import { PortalProgresso } from "./PortalProgresso";
import { SeloEstadoProcesso, SeloPrazo } from "./PortalSelos";

interface TopoPortalProps {
  nome: string | null;
  /** So no formulario: a pagina em que se esta ("Passo X de 2"). */
  pagina?: 1 | 2;
  /** So com sessao: os 4 ultimos digitos do NISS e do IBAN ja guardados. */
  nissUltimos4?: string | null;
  ibanUltimos4?: string | null;
}

/**
 * O topo do portal: a saudacao do convite que ja existia (`ConviteSaudacao`, com o unico h1 da pagina),
 * numa caixa que recebe o foco quando a vista muda (`tabIndex=-1`: focavel sem entrar na ordem de tabulacao).
 * O prazo diz-o o selo do portal, por isso a saudacao nao o repete.
 */
export const TopoPortal = forwardRef<HTMLDivElement, TopoPortalProps>(function TopoPortal(
  { nome, pagina, nissUltimos4 = null, ibanUltimos4 = null },
  ref,
) {
  const { t } = useTranslation();
  return (
    <div ref={ref} id="portal-topo" tabIndex={-1} className="outline-none">
      <ConviteSaudacao
        t={t}
        pagina={pagina}
        estado={{ pessoa_nome: nome, niss_ultimos4: nissUltimos4, conta_ultimos4: ibanUltimos4 }}
      />
    </div>
  );
});

/** O que aconteceu a sessao que a pessoa tinha: terminada por ela, expirada ou aberta noutro sitio. */
export function AvisoSessaoPerdida({ aviso }: { aviso: AvisoPortal }) {
  const { t } = useTranslation();
  const texto =
    aviso === "terminada"
      ? t("portal.sessao.terminada")
      : mensagemErroPortal(t, aviso === "substituida" ? "sessao_substituida" : "sessao_expirada");
  // Sessao terminada pela pessoa e informacao (`status`); expirada ou substituida e um alerta.
  const role = aviso === "terminada" ? "status" : "alert";
  return (
    <div role={role} className="flex items-start gap-2 rounded-lg border border-amber-500/70 bg-amber-500/10 px-4 py-3 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{texto}</p>
    </div>
  );
}

interface PortalConsultaProps {
  convite: ConvitePublico;
  aviso: AvisoPortal | null;
  aoConfirmarIdentidade: () => void;
  tituloRef: Ref<HTMLDivElement>;
}

export function PortalConsulta({ convite, aviso, aoConfirmarIdentidade, tituloRef }: PortalConsultaProps) {
  const { t } = useTranslation();
  return (
    <>
      {aviso && <AvisoSessaoPerdida aviso={aviso} />}
      <TopoPortal ref={tituloRef} nome={convite.primeiro_nome} />
      <div className="flex flex-wrap gap-2">
        <SeloEstadoProcesso estado={convite.estado} />
        <SeloPrazo validUntil={convite.valid_until} />
      </div>
      <PortalProgresso estado={convite.estado} />
      <section aria-labelledby="portal-consulta-titulo" className="space-y-3 rounded-lg border bg-background p-5">
        <h2 id="portal-consulta-titulo" className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t("portal.consulta.titulo")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("portal.consulta.texto")}</p>
        {convite.precisa_otp && (
          <Button type="button" className="min-h-11" onClick={aoConfirmarIdentidade}>
            {t("portal.consulta.botao")}
          </Button>
        )}
      </section>
    </>
  );
}
