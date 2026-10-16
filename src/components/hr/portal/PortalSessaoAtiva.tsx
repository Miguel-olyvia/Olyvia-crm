/**
 * O portal com sessao activa (V3a): o formulario do convite (reutilizado, ver `PortalFormulario`)
 * preenchido com o que o estado do processo permite ver e editar, a nota do RH em processos
 * devolvidos e, desenhado mas DESACTIVADO, o que depende da V3b. O aviso discreto de sessao a
 * expirar (30 min sem actividade; 4 h no maximo) oferece "Manter sessao".
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import type { ResultadoSensiveis } from "@/hooks/useConviteAdmissaoPublico";
import { mensagemErroPortal, type ConvitePublico, type PortalLer } from "@/lib/hr/portalAdmissao";
import { PortalDevolvida } from "./PortalDados";
import { TopoPortal } from "./PortalConsulta";
import { PortalFormulario } from "./PortalFormulario";
import { PortalProgresso } from "./PortalProgresso";
import { PortalProximaFase } from "./PortalProximaFase";
import { SeloEstadoProcesso, SeloPrazo } from "./PortalSelos";

interface PortalSessaoAtivaProps {
  convite: ConvitePublico;
  dados: PortalLer | null;
  erroLeitura: string | null;
  sessaoAExpirar: boolean;
  aoManterSessao: () => void;
  aoGravarSensiveis: (valores: { niss?: string; iban?: string }) => Promise<ResultadoSensiveis>;
  tituloRef: RefObject<HTMLDivElement>;
}

export function PortalSessaoAtiva({
  convite,
  dados,
  erroLeitura,
  sessaoAExpirar,
  aoManterSessao,
  aoGravarSensiveis,
  tituloRef,
}: PortalSessaoAtivaProps) {
  const { t } = useTranslation();
  const [pagina, setPagina] = useState<1 | 2>(1);
  const estado = dados?.estado ?? convite.estado;

  // FOCO. Ao mudar de pagina o botao que o tinha desaparece e o foco cairia para o corpo da pagina:
  // leva-se ao topo (a saudacao, que e focavel sem entrar na ordem de tabulacao).
  const primeiraPagina = useRef(true);
  useEffect(() => {
    if (primeiraPagina.current) {
      primeiraPagina.current = false;
      return;
    }
    tituloRef.current?.scrollIntoView?.();
    tituloRef.current?.focus({ preventScroll: true });
  }, [pagina, tituloRef]);

  return (
    <>
      <TopoPortal
        ref={tituloRef}
        nome={convite.primeiro_nome}
        pagina={dados ? pagina : undefined}
        nissUltimos4={dados?.niss_ultimos4}
        ibanUltimos4={dados?.iban_ultimos4}
      />
      <div className="flex flex-wrap gap-2">
        <SeloEstadoProcesso estado={estado} />
        <SeloPrazo validUntil={convite.valid_until} />
      </div>
      <p className="text-sm text-muted-foreground">{t("portal.ligado.aviso")}</p>

      {sessaoAExpirar && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/70 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("portal.sessao.aExpirar")}
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoManterSessao}>
            {t("portal.sessao.manter")}
          </Button>
        </div>
      )}

      <PortalProgresso estado={estado} />

      {!dados && erroLeitura && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/50 px-4 py-3 text-sm">
          <p>{mensagemErroPortal(t, erroLeitura)}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoManterSessao}>
            {t("portal.ligado.tentarDeNovo")}
          </Button>
        </div>
      )}

      {dados && (
        <>
          {dados.devolucao && dados.estado === "devolvida" && <PortalDevolvida devolucao={dados.devolucao} />}
          <PortalFormulario dados={dados} pagina={pagina} aoMudarPagina={setPagina} aoGravarSensiveis={aoGravarSensiveis} />
          <PortalProximaFase devolvida={dados.estado === "devolvida"} />
        </>
      )}
    </>
  );
}
