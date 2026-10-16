/**
 * O cabecalho do convite: saudacao com o nome, o que o RH ja tem registado e
 * ate quando o link serve.
 *
 * O NIF mostra-se por inteiro (e o que o documento diz) mas o NISS e a conta
 * so com os ultimos 4 algarismos. O IBAN nunca se mostra por inteiro.
 *
 * Usa-o o portal temporario (`/admissao/:token`), onde so ha o que o portal
 * sabe: o primeiro nome e, com sessao, os ultimos 4 do NISS e do IBAN guardados.
 * Por isso so pede o que mostra, e `pagina` e `valid_until` sao opcionais (a
 * consulta limitada nao tem paginas, e o prazo ja o diz o selo do portal).
 */
import type { TraduzirFn } from "@/lib/hr/errosAdmissao";
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";

/** O que a saudacao mostra; tudo o que falta (ou e `null`) simplesmente nao se diz. */
export interface DadosSaudacaoConvite {
  pessoa_nome?: string | null;
  /** O NIF ja registado na ficha, por inteiro (decisao de produto: e o que o documento diz). */
  nif?: string | null;
  niss_ultimos4?: string | null;
  conta_ultimos4?: string | null;
  /** Ate quando o link serve (ISO). */
  valid_until?: string | null;
}

interface ConviteSaudacaoProps {
  t: TraduzirFn;
  estado: DadosSaudacaoConvite;
  /** A pagina do formulario em que se esta; sem ela nao se diz "Passo X de 2". */
  pagina?: 1 | 2;
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
      {pagina && (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {t("hr.convite.paginaDe", { atual: String(pagina), total: "2" })}
        </p>
      )}
    </div>
  );
}
