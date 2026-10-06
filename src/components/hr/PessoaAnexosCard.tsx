/**
 * Os anexos da admissao na ficha da pessoa: cartao de cidadao, comprovativo de
 * IBAN e fotografia que a pessoa enviou pelo convite.
 *
 * A LISTA E UMA COISA, O CONTEUDO E OUTRA
 * ----------------------------------------
 * A lista (tipo, nome, tamanho, data) e visivel a quem ve a ficha -- e o que a
 * RLS de `pessoas_anexos` deixa ler. Abrir o ficheiro e que e gated: cada tipo
 * tem a sua permissao (`podeAbrirAnexo`) e o servidor (`hr-anexo-url`) repete a
 * decisao e audita o cartao e o comprovativo. Aqui o botao "Abrir" so aparece
 * a quem o servidor vai deixar abrir; os outros leem o texto de sem permissao.
 *
 * O URL assinado nunca se guarda: cada abertura pede um novo. O separador abre
 * em branco DENTRO do clique (para o bloqueador de janelas o aceitar) e so
 * depois recebe o endereco, sem `opener`.
 *
 * Este cartao e IRMAO do separador de documentos, nao filho: esse separador
 * devolve "sem acesso" a quem nao tem permissoes de documentos, o que
 * esconderia os anexos a quem ve a ficha.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { usePessoaAnexos } from "@/hooks/usePessoaAnexos";
import { podeAbrirAnexo, type PermissoesAnexos } from "@/lib/hr/anexosAdmissao";
import { formatarTamanho } from "@/lib/hr/conviteAnexos";
import type { IdiomaConvite } from "@/lib/hr/conviteAdmissaoEcra";
import type { PessoaAnexo } from "@/types/hr";

interface PessoaAnexosCardProps {
  pessoaId: string;
  organizationId: string;
  /** Quem olha e a propria pessoa (`useMinhaPessoa`). */
  souAPessoa: boolean;
  permissoes: PermissoesAnexos;
}

export function PessoaAnexosCard({
  pessoaId,
  organizationId,
  souAPessoa,
  permissoes,
}: PessoaAnexosCardProps) {
  const { t, language } = useTranslation();
  const { anexos, loading, recusado, obterUrl } = usePessoaAnexos(pessoaId, organizationId);
  const [aAbrir, setAAbrir] = useState<string | null>(null);
  const [erroAbrir, setErroAbrir] = useState(false);

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
        ) : anexos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(podeVerTodosOsTipos ? "hr.anexos.vazio" : "hr.anexos.vazioRestrito")}
          </p>
        ) : (
          <ul className="divide-y">
            {anexos.map((anexo) => {
              const podeAbrir = podeAbrirAnexo(anexo.tipo, permissoes, souAPessoa);
              return (
              <li key={anexo.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="w-44 shrink-0 font-medium">
                  {t(`hr.anexos.tipo.${anexo.tipo}`)}
                </span>
                {/* O nome e texto livre da pessoa (pode ser "CC 12345678.pdf"):
                    so a quem pode abrir o tipo. */}
                {podeAbrir && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{anexo.nome_original}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatarTamanho(anexo.tamanho_bytes ?? 0, idioma)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t("hr.anexos.promovidoEm", { data: dataDe(anexo.promovido_em) })}
                    </span>
                  </>
                )}
                {podeAbrir ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={aAbrir !== null}
                    aria-label={`${t("hr.anexos.abrir")}: ${anexo.nome_original}`}
                    onClick={() => void abrir(anexo)}
                  >
                    {aAbrir === anexo.id && (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    )}
                    {t("hr.anexos.abrir")}
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t("hr.anexos.semPermissao")}
                  </span>
                )}
              </li>
              );
            })}
          </ul>
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
    </Card>
  );
}
