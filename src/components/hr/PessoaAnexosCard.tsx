/**
 * Os anexos da pessoa na ficha: cartao de cidadao, comprovativo de IBAN e
 * fotografia -- os que a pessoa enviou pelo convite e os que o RH anexa,
 * substitui e remove aqui.
 *
 * A LISTA E UMA COISA, O CONTEUDO E OUTRA
 * ----------------------------------------
 * A lista (tipo, nome, tamanho, data) e visivel a quem ve a ficha -- e o que a
 * RLS de `pessoas_anexos` deixa ler. Abrir o ficheiro e que e gated: cada tipo
 * tem a sua permissao (`podeAbrirAnexo`) e o servidor (`hr-anexo-url`) repete a
 * decisao e audita o cartao e o comprovativo. Aqui o botao so aparece a quem o
 * servidor vai deixar abrir; os outros leem o texto de sem permissao.
 *
 * - O cartao de cidadao e o comprovativo de IBAN VEEM-SE numa janela por cima
 *   desta pagina (`VisualizadorAnexoSensivel`), com registo, marca de agua e
 *   fecho automatico. A fotografia mostra-se em miniatura e abre-se como sempre.
 * - ESCREVER (anexar, substituir, remover) e uma permissao POR TIPO
 *   (`permissoesEscrita`): so esconde o que o servidor ia recusar.
 *
 * O URL assinado nunca se guarda: cada abertura pede um novo. A fotografia abre
 * num separador em branco aberto DENTRO do clique (para o bloqueador de janelas
 * o aceitar) e so depois recebe o endereco, sem `opener`.
 *
 * Este cartao e IRMAO do separador de documentos, nao filho: esse separador
 * devolve "sem acesso" a quem nao tem permissoes de documentos, o que
 * esconderia os anexos a quem ve a ficha.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinhaTipoAnexo, type AccoesLinhaAnexo } from "@/components/hr/anexos/LinhaTipoAnexo";
import { VisualizadorAnexoSensivel } from "@/components/hr/anexos/VisualizadorAnexoSensivel";
import { useTranslation } from "@/hooks/useTranslation";
import { usePessoaAnexos } from "@/hooks/usePessoaAnexos";
import type { PermissoesAnexos } from "@/lib/hr/anexosAdmissao";
import {
  podeAnexarTipo,
  verificarLimitesDeContagem,
  type PermissoesEscritaAnexos,
  type TipoAnexoRh,
} from "@/lib/hr/anexosRh";
import { TIPOS_ANEXO_CONVITE, contarPorTipo } from "@/lib/hr/conviteAnexos";
import type { IdiomaConvite } from "@/lib/hr/conviteAdmissaoEcra";
import type { PessoaAnexo } from "@/types/hr";

interface PessoaAnexosCardProps {
  pessoaId: string;
  organizationId: string;
  /** Quem olha e a propria pessoa (`useMinhaPessoa`). */
  souAPessoa: boolean;
  permissoes: PermissoesAnexos;
  /** Quem pode anexar, substituir e remover cada tipo; sem isto o cartao so le. */
  permissoesEscrita?: PermissoesEscritaAnexos;
  /** A fotografia mudou (anexada, substituida ou removida): a ficha refaz o avatar. */
  onFotografiaAlterada?: () => void;
}

export function PessoaAnexosCard({
  pessoaId,
  organizationId,
  souAPessoa,
  permissoes,
  permissoesEscrita,
  onFotografiaAlterada,
}: PessoaAnexosCardProps) {
  const { t, language } = useTranslation();
  const estado = usePessoaAnexos(pessoaId, organizationId);
  const { anexos, loading, recusado, obterUrl } = estado;
  const [aAbrir, setAAbrir] = useState<string | null>(null);
  const [erroAbrir, setErroAbrir] = useState(false);
  const [aVer, setAVer] = useState<PessoaAnexo | null>(null);

  if (recusado) return null;

  const abrir = async (anexo: PessoaAnexo): Promise<void> => {
    if (aAbrir) return;
    setAAbrir(anexo.id);
    setErroAbrir(false);
    // Abre JA, dentro do gesto do utilizador; o endereco chega depois.
    const janela = window.open("", "_blank");
    if (janela) janela.opener = null;
    try {
      const { url } = await obterUrl(anexo.id);
      if (janela) {
        janela.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      janela?.close();
      setErroAbrir(true);
    } finally {
      setAAbrir(null);
    }
  };

  const idioma = language as IdiomaConvite;
  const dataDe = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(language) : "");

  // A base so entrega cada tipo a quem tem a permissao dele, por isso uma
  // lista vazia (ou curta) para quem nao as tem todas NAO quer dizer que nao
  // ha anexos: nao se afirma o contrario.
  const podeVerTodosOsTipos =
    souAPessoa ||
    (permissoes.pessoasView && permissoes.identificacaoReveal && permissoes.bancariosEdit);

  const contagem = contarPorTipo(anexos);
  const algumaEscrita = TIPOS_ANEXO_CONVITE.some((tipo) => podeAnexarTipo(tipo, permissoesEscrita));
  const mostrarLista = anexos.length > 0 || algumaEscrita || Object.keys(estado.envios).length > 0;

  const accoes: AccoesLinhaAnexo = {
    aoVer: setAVer,
    aoAbrir: (anexo) => void abrir(anexo),
    aAbrir,
    anexar: estado.anexar,
    substituir: estado.substituir,
    remover: estado.remover,
    descartarEnvio: estado.descartarEnvio,
    limparErroRemocao: estado.limparErroRemocao,
    aoFotografiaAlterada: onFotografiaAlterada,
  };

  const cabeMais = (tipo: TipoAnexoRh) => verificarLimitesDeContagem(tipo, contagem) === null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("hr.anexos.titulo")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="sr-only">{t("common.loading")}</span>
          </div>
        ) : (
          <>
            {anexos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(podeVerTodosOsTipos ? "hr.anexos.vazio" : "hr.anexos.vazioRestrito")}
              </p>
            )}
            {mostrarLista && (
              <ul className="divide-y">
                {TIPOS_ANEXO_CONVITE.map((tipo) => (
                  <LinhaTipoAnexo
                    key={tipo}
                    tipo={tipo}
                    anexos={anexos.filter((a) => a.tipo === tipo)}
                    permissoes={permissoes}
                    souAPessoa={souAPessoa}
                    podeEscrever={podeAnexarTipo(tipo, permissoesEscrita)}
                    cabeMais={cabeMais(tipo)}
                    envios={Object.entries(estado.envios).filter(([, e]) => e.tipo === tipo)}
                    aRemover={estado.aRemover}
                    errosRemocao={estado.errosRemocao}
                    codigoErroLimite={estado.erroLimite?.tipo === tipo ? estado.erroLimite.codigo : null}
                    idioma={idioma}
                    dataDe={dataDe}
                    accoes={accoes}
                  />
                ))}
              </ul>
            )}
          </>
        )}
        {!loading && !podeVerTodosOsTipos && anexos.length > 0 && (
          <p className="text-xs text-muted-foreground">{t("hr.anexos.notaRestrita")}</p>
        )}
        {erroAbrir && (
          <p role="alert" className="text-sm text-destructive">
            {t("hr.anexos.erroAbrir")}
          </p>
        )}
      </CardContent>

      <VisualizadorAnexoSensivel
        anexoId={aVer?.id ?? null}
        nomeFicheiro={aVer?.nome_original ?? ""}
        rotuloTipo={aVer ? t(`hr.anexos.tipo.${aVer.tipo}`) : ""}
        obterUrl={obterUrl}
        aoFechar={() => setAVer(null)}
      />
    </Card>
  );
}
