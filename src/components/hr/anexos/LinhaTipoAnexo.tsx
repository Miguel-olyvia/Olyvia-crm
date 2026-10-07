/**
 * As linhas de UM tipo de anexo na ficha da pessoa: os ficheiros que ja la estao
 * (com Ver/Abrir, Substituir e Remover), os envios a decorrer ou falhados, e a
 * linha de Anexar quando o tipo ainda tem lugar.
 *
 * AS PERMISSOES AQUI SO ESCONDEM: `podeEscrever` decide se aparecem Anexar,
 * Substituir e Remover, e o servidor repete a decisao por tipo. Ler e outra
 * permissao (`podeAbrirAnexo`): a lista so traz o que a base deixa ler.
 *
 * VER OU ABRIR
 * ------------
 * O cartao de cidadao e o comprovativo de IBAN sao sensiveis: "Ver" abre-os numa
 * janela por cima da ficha, com registo (`aoVer`). A fotografia nao e: "Abrir"
 * abre-a como sempre (`aoAbrir`) e mostra-se em miniatura.
 *
 * REMOVER pede confirmacao e diz que apaga de vez.
 */
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MiniaturaFotografia, MiniaturaLocal } from "@/components/hr/anexos/Miniaturas";
import { SeletorFicheiroAnexo } from "@/components/hr/anexos/SeletorFicheiroAnexo";
import { useTranslation } from "@/hooks/useTranslation";
import type { EnvioAnexoRh } from "@/hooks/useAnexarAnexoRh";
import type { ResultadoAccaoAnexo } from "@/hooks/usePessoaAnexos";
import { podeAbrirAnexo, type PermissoesAnexos } from "@/lib/hr/anexosAdmissao";
import { chaveDeErroAnexoRh, formatarTamanho, type TipoAnexoRh } from "@/lib/hr/anexosRh";
import type { IdiomaConvite } from "@/lib/hr/conviteAdmissaoEcra";
import type { PessoaAnexo } from "@/types/hr";

const TIPOS_SENSIVEIS: readonly TipoAnexoRh[] = ["cartao_cidadao", "comprovativo_iban"];

export interface AccoesLinhaAnexo {
  aoVer: (anexo: PessoaAnexo) => void;
  aoAbrir: (anexo: PessoaAnexo) => void;
  aAbrir: string | null;
  anexar: (tipo: TipoAnexoRh, file: File) => Promise<ResultadoAccaoAnexo>;
  substituir: (anexoId: string, tipo: TipoAnexoRh, file: File) => Promise<ResultadoAccaoAnexo>;
  remover: (anexoId: string) => Promise<ResultadoAccaoAnexo>;
  descartarEnvio: (id: string) => void;
  limparErroRemocao: (anexoId: string) => void;
  /** Depois de anexar, substituir ou remover a FOTOGRAFIA com sucesso. */
  aoFotografiaAlterada?: () => void;
}

interface LinhaTipoAnexoProps {
  tipo: TipoAnexoRh;
  anexos: PessoaAnexo[];
  permissoes: PermissoesAnexos;
  souAPessoa: boolean;
  podeEscrever: boolean;
  /** O tipo ainda tem lugar para mais um ficheiro (limites do tipo e do total). */
  cabeMais: boolean;
  envios: Array<[string, EnvioAnexoRh]>;
  aRemover: ReadonlySet<string>;
  errosRemocao: Record<string, string>;
  /** A recusa local por limite, se for deste tipo. */
  codigoErroLimite: string | null;
  idioma: IdiomaConvite;
  dataDe: (iso: string | null) => string;
  accoes: AccoesLinhaAnexo;
}

export function LinhaTipoAnexo({
  tipo,
  anexos,
  permissoes,
  souAPessoa,
  podeEscrever,
  cabeMais,
  envios,
  aRemover,
  errosRemocao,
  codigoErroLimite,
  idioma,
  dataDe,
  accoes,
}: LinhaTipoAnexoProps) {
  const { t } = useTranslation();
  const [escolhido, setEscolhido] = useState<File | null>(null);
  const [aConfirmar, setAConfirmar] = useState<PessoaAnexo | null>(null);
  const rotuloTipo = t(`hr.anexos.tipo.${tipo}`);
  const sensivel = TIPOS_SENSIVEIS.includes(tipo);
  const aEnviarAgora = envios.some(([, e]) => e.fase !== "erro") || escolhido !== null;

  const enviar = async (file: File, accao: () => Promise<ResultadoAccaoAnexo>): Promise<void> => {
    setEscolhido(file);
    try {
      const resultado = await accao();
      if (resultado.ok && tipo === "fotografia") accoes.aoFotografiaAlterada?.();
    } finally {
      setEscolhido(null);
    }
  };

  const remover = async (anexo: PessoaAnexo): Promise<void> => {
    const resultado = await accoes.remover(anexo.id);
    if (resultado.ok && tipo === "fotografia") accoes.aoFotografiaAlterada?.();
  };

  const idAjuda = `ajuda-anexar-${tipo}`;
  const enviosEmCurso = envios.filter(([, e]) => e.fase !== "erro");
  const enviosComErro = envios.filter(([, e]) => e.fase === "erro");

  return (
    <>
      {anexos.map((anexo) => {
        const podeAbrir = podeAbrirAnexo(anexo.tipo, permissoes, souAPessoa);
        const aApagar = aRemover.has(anexo.id);
        const alvo = podeAbrir ? anexo.nome_original : rotuloTipo;
        const erroRemocao = errosRemocao[anexo.id];
        return (
          <li key={anexo.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
            {tipo === "fotografia" && podeAbrir && (
              <MiniaturaFotografia anexoId={anexo.id} alt={rotuloTipo} />
            )}
            <span className="w-44 shrink-0 font-medium">{rotuloTipo}</span>
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
                disabled={accoes.aAbrir !== null}
                aria-label={`${t(sensivel ? "hr.anexos.ver" : "hr.anexos.abrir")}: ${anexo.nome_original}`}
                onClick={() => (sensivel ? accoes.aoVer(anexo) : accoes.aoAbrir(anexo))}
              >
                {accoes.aAbrir === anexo.id && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                {t(sensivel ? "hr.anexos.ver" : "hr.anexos.abrir")}
              </Button>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("hr.anexos.semPermissao")}
              </span>
            )}
            {podeEscrever && (
              <>
                <SeletorFicheiroAnexo
                  tipo={tipo}
                  accao="substituir"
                  alvo={alvo}
                  idAlvo={anexo.id}
                  desactivado={aApagar || aEnviarAgora}
                  onEscolher={(file) =>
                    void enviar(file, () => accoes.substituir(anexo.id, tipo, file))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={aApagar || aEnviarAgora}
                  aria-busy={aApagar ? true : undefined}
                  aria-label={`${t("hr.anexos.remover")}: ${alvo}`}
                  onClick={() => {
                    accoes.limparErroRemocao(anexo.id);
                    setAConfirmar(anexo);
                  }}
                >
                  {aApagar ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("hr.anexos.remover")}
                </Button>
              </>
            )}
            {erroRemocao && (
              <p role="alert" className="basis-full text-xs text-destructive">
                {t(chaveDeErroAnexoRh(erroRemocao))}
              </p>
            )}
          </li>
        );
      })}

      {escolhido && (
        <li className="flex items-center gap-3 py-2 text-sm">
          <MiniaturaLocal file={escolhido} alt={rotuloTipo} />
        </li>
      )}

      {enviosEmCurso.map(([id, envio]) => (
        <li key={id} className="space-y-1 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{envio.nome}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {envio.fase === "a_verificar" ? t("hr.anexos.aVerificar") : t("hr.anexos.aEnviar")}
            </span>
          </div>
          {envio.fase === "a_enviar" && (
            <Progress
              value={envio.progresso}
              className="h-2"
              aria-label={t("hr.anexos.progresso", { nome: envio.nome })}
            />
          )}
        </li>
      ))}

      {enviosComErro.map(([id, envio]) => (
        <li key={id} className="flex items-start gap-2 py-2 text-sm">
          <p role="alert" className="min-w-0 flex-1 text-xs text-destructive">
            <span className="font-medium">{envio.nome}</span>: {t(chaveDeErroAnexoRh(envio.codigoErro))}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => accoes.descartarEnvio(id)}>
            {t("hr.anexos.fechar")}
          </Button>
        </li>
      ))}

      {podeEscrever && cabeMais && (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
          <span className="w-44 shrink-0 font-medium">{rotuloTipo}</span>
          <span id={idAjuda} className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t(tipo === "fotografia" ? "hr.anexos.ajudaFotografia" : "hr.anexos.ajudaFicheiros")}
          </span>
          <SeletorFicheiroAnexo
            tipo={tipo}
            accao="anexar"
            alvo={rotuloTipo}
            idAlvo={tipo}
            desactivado={aEnviarAgora}
            descritoPor={idAjuda}
            onEscolher={(file) => void enviar(file, () => accoes.anexar(tipo, file))}
          />
          {codigoErroLimite && (
            <p role="alert" className="basis-full text-xs text-destructive">
              {t(chaveDeErroAnexoRh(codigoErroLimite))}
            </p>
          )}
        </li>
      )}

      <AlertDialog open={aConfirmar !== null} onOpenChange={(aberto) => !aberto && setAConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.anexos.removerConfirmar.titulo")}</AlertDialogTitle>
            <AlertDialogDescription>{t("hr.anexos.removerConfirmar.descricao")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const alvo = aConfirmar;
                setAConfirmar(null);
                if (alvo) void remover(alvo);
              }}
            >
              {t("hr.anexos.remover")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
