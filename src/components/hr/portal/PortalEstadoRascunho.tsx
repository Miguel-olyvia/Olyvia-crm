/**
 * O estado da gravacao automatica, sempre visivel junto aos botoes: «Rascunho guardado as HH:MM» (a hora que
 * a Edge devolveu, na hora local de quem preenche), «A guardar...» ou o erro, traduzido. A regiao `status` esta
 * sempre presente para o leitor de ecra anunciar o que muda; o erro e um `alert` a parte. Nunca se finge que
 * esta guardado: sem hora da Edge nao se diz nada.
 */
import { useTranslation } from "@/hooks/useTranslation";
import { mensagemErroPortal } from "@/lib/hr/portalAdmissao";

/** Estes dois codigos so podem vir do NISS/IBAN: o rascunho, esse, ficou gravado. */
const ERROS_DO_SENSIVEL: readonly string[] = ["niss_invalido", "iban_invalido"];

const dois = (n: number): string => String(n).padStart(2, "0");

/** HH:MM na hora local, ou `null` se a data nao for valida. */
export function horaLocal(iso: string | null): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : `${dois(data.getHours())}:${dois(data.getMinutes())}`;
}

interface PortalEstadoRascunhoProps {
  guardadoEm: string | null;
  aGravar: boolean;
  erro: string | null;
}

export function PortalEstadoRascunho({ guardadoEm, aGravar, erro }: PortalEstadoRascunhoProps) {
  const { t } = useTranslation();
  const hora = horaLocal(guardadoEm);
  const texto = aGravar ? t("portal.rascunho.aGuardar") : hora ? t("portal.rascunho.guardado", { hora }) : "";
  const mensagem = erro ? mensagemErroPortal(t, erro) : null;
  return (
    <div className="space-y-1 text-sm">
      <p role="status" data-testid="portal-rascunho-estado" className="text-muted-foreground">
        {texto}
      </p>
      {mensagem && (
        <p role="alert" className="font-medium text-destructive">
          {ERROS_DO_SENSIVEL.includes(erro ?? "") ? mensagem : `${t("portal.rascunho.falha")} ${mensagem}`}
        </p>
      )}
    </div>
  );
}
