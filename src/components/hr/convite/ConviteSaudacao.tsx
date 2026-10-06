/**
 * O cabecalho do convite: saudacao com o nome, o que o RH ja tem registado e
 * ate quando o link serve.
 *
 * O NIF mostra-se por inteiro (e o que o documento diz) mas o NISS e a conta
 * so com os ultimos 4 algarismos. O IBAN nunca se mostra por inteiro.
 */
import type { ConviteEstado } from "@/hooks/useConviteAdmissaoPublico";
import type { TraduzirFn } from "@/lib/hr/errosAdmissao";
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";

interface ConviteSaudacaoProps {
  t: TraduzirFn;
  estado: ConviteEstado;
  pagina: 1 | 2;
}

export function ConviteSaudacao({ t, estado, pagina }: ConviteSaudacaoProps) {
  const registados = [
    estado.nif ? t("hr.convite.jaRegistadoNif", { nif: estado.nif }) : null,
    estado.niss_ultimos4
      ? t("hr.convite.jaRegistadoNiss", { ultimos4: estado.niss_ultimos4 })
      : null,
    estado.conta_ultimos4
      ? t("hr.convite.jaRegistadoConta", { ultimos4: estado.conta_ultimos4 })
      : null,
  ].filter((linha): linha is string => linha !== null);
  const validoAte = formatarDataHora(estado.valid_until);

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("hr.convite.tituloPagina")}</h1>
      <p className="text-muted-foreground">
        {estado.pessoa_nome
          ? t("hr.convite.saudacao", { nome: estado.pessoa_nome })
          : t("hr.convite.subtituloPagina")}
      </p>
      {registados.length > 0 && (
        <div className="mt-2 text-sm text-muted-foreground">
          <p>{t("hr.convite.jaRegistado")}</p>
          <ul className="list-disc pl-5">
            {registados.map((linha) => (
              <li key={linha}>{linha}</li>
            ))}
          </ul>
        </div>
      )}
      {validoAte && (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("hr.convite.validoAte", { data: validoAte })}
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground" role="status">
        {t("hr.convite.paginaDe", { atual: String(pagina), total: "2" })}
      </p>
    </div>
  );
}
