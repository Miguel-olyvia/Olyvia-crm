/**
 * Os documentos no portal: o cartao de anexos do convite (`ConviteAnexosCard`) com o que o portal sabe de
 * obrigatoriedade, mais o aviso fixo de que os ficheiros e os campos se guardam de maneira diferente.
 *
 * O estado dos ficheiros (`useConviteAnexos`) vive em `PortalFormulario`, que precisa dele para dizer o que falta
 * antes de submeter; aqui so se mostra. Hoje so o comprovativo de IBAN esta aberto, e e obrigatorio quando a pessoa
 * indicou um IBAN (`anexos_obrigatorios` da `ler`). Cartao de cidadao e fotografia nao aparecem.
 */
import { ConviteAnexosCard } from "@/components/hr/convite/ConviteAnexosCard";
import { useTranslation } from "@/hooks/useTranslation";
import type { ResultadoConviteAnexos } from "@/hooks/useConviteAnexos";
import type { IdiomaConvite } from "@/lib/hr/conviteAdmissaoEcra";

interface PortalDocumentosProps {
  estado: Pick<ResultadoConviteAnexos, "anexos" | "envios" | "contagem" | "adicionar" | "remover">;
  /** Os tipos de anexo sem os quais nao se submete (da `ler`). */
  obrigatorios: readonly string[];
  /** O id do resumo «Falta enviar...» (role="alert"), para o botao de adicionar o ler. */
  idAlerta?: string;
  /** A submeter: nao se adiciona nem se remove. */
  bloqueado?: boolean;
}

export function PortalDocumentos({ estado, obrigatorios, idAlerta, bloqueado }: PortalDocumentosProps) {
  const { t, language } = useTranslation();
  return (
    <section aria-labelledby="portal-documentos-titulo" className="space-y-3">
      <h2 id="portal-documentos-titulo" className="sr-only">
        {t("portal.documentos.titulo")}
      </h2>
      <ConviteAnexosCard
        t={t}
        idioma={language as IdiomaConvite}
        estado={estado}
        obrigatorios={obrigatorios}
        idAlerta={idAlerta}
        bloqueado={bloqueado}
      />
      <p className="text-sm text-muted-foreground">{t("portal.documentos.aviso")}</p>
    </section>
  );
}
