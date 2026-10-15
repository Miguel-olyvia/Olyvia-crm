// A secção «Ficha de admissão» do portal: os passos da admissão com o estado atual e, por baixo, o ecrã que corresponde à fase
// (o formulário a preencher, só os campos devolvidos com os comentários do RH, «À espera da decisão do RH», admissão aprovada
// com o contrato em Documentos). Reutiliza o formulário e os ecrãs do convite, sem os duplicar.
import { Link } from "react-router-dom";
import { Check, ChevronRight, Circle, CircleDot, ClipboardCheck, FileSignature, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { dataEHora } from "@/components/rh-exemplo/admissao/auxiliares";
import { ConviteDevolvida } from "@/components/rh-exemplo/convite/ConviteDevolvida";
import { ConviteFaixaPrazo } from "@/components/rh-exemplo/convite/ConviteFaixaPrazo";
import { camposEditaveis, type Admissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { passosDaAdmissao, type SituacaoPasso } from "@/components/rh-exemplo/lib/portalEstado";
import { useIdiomaConvite } from "@/components/rh-exemplo/hooks/useIdiomaConvite";
import { ConviteAdmissaoEcra } from "@/pages/rh-exemplo/RhConviteAdmissao";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const ICONE: Record<SituacaoPasso, typeof Check> = { feito: Check, atual: CircleDot, falta: Circle, rejeitado: XCircle };

function Passos({ admissao }: { admissao: Admissao }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("rhPortal.passos.aria")}>
      <ol className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-4">
        {passosDaAdmissao(admissao.estado).map(({ passo, situacao }) => {
          const Icone = ICONE[situacao];
          return (
            <li
              key={passo} aria-current={situacao === "atual" ? "step" : undefined}
              className={cn("flex items-start gap-2 text-sm", situacao === "falta" ? "text-muted-foreground" : "text-foreground", situacao === "rejeitado" && "text-destructive")}
            >
              <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex flex-col">
                <span className={cn(situacao === "atual" && "font-semibold")}>{t(`rhPortal.passos.${passo}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`rhPortal.passos.situacao.${situacao}`)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function EstadoDaFicha({ admissao }: { admissao: Admissao }) {
  const { t } = useTranslation();
  const estado = admissao.estado;
  const comContrato = estado === "contrato_por_assinar";
  const assinado = estado === "contrato_assinado" || estado === "acesso_enviado";
  const chave = estado === "submetida" ? "espera" : assinado ? "assinado" : comContrato ? "contratoPorAssinar" : "aprovada";
  const Icone = comContrato || assinado ? FileSignature : ClipboardCheck;
  const quando = admissao.submetidaEm ? dataEHora(admissao.submetidaEm) : null;
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <Icone className="h-10 w-10 text-primary" aria-hidden="true" />
        <h2 className="text-xl font-semibold leading-none tracking-tight">{t(`rhPortal.ficha.${chave}.titulo`)}</h2>
        <CardDescription role="status">{t(`rhPortal.ficha.${chave}.texto`)}</CardDescription>
        {estado === "submetida" && quando && <p className="text-xs text-muted-foreground">{t("rhPortal.ficha.submetidaEm", quando)}</p>}
      </CardHeader>
      {comContrato && (
        <CardContent className="flex justify-center">
          <Link to={{ search: "?sec=documentos" }} className={cn(buttonVariants({ variant: "default" }), "min-h-11 gap-2")}>
            {t("rhPortal.ficha.irParaDocumentos")}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </CardContent>
      )}
    </Card>
  );
}

interface PortalFichaProps {
  token: string | undefined;
  admissao: Admissao;
  nome: string | null;
  /** A pessoa ainda pode editar (a preencher, convite enviado ou devolvida). */
  editavel: boolean;
}

export function PortalFicha({ token, admissao, nome, editavel }: PortalFichaProps) {
  const { t } = useTranslation();
  const idioma = useIdiomaConvite();
  const devolvida = editavel && camposEditaveis(admissao) !== null;
  return (
    <section aria-labelledby="portal-ficha-titulo" className="space-y-4">
      <div className="space-y-1">
        <h1 id="portal-ficha-titulo" className="text-2xl font-bold">{t("rhPortal.ficha.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("rhPortal.ficha.sub")}</p>
      </div>
      <Passos admissao={admissao} />
      {devolvida && <ConviteDevolvida token={token} admissao={admissao} nome={nome} />}
      {editavel && !devolvida && (
        <>
          <ConviteFaixaPrazo admissao={admissao} comRascunho />
          <ConviteAdmissaoEcra idioma={idioma} />
        </>
      )}
      {!editavel && <EstadoDaFicha admissao={admissao} />}
    </section>
  );
}
