/**
 * "Isto ja foi corrigido" -- o indicador, e o painel que o abre.
 *
 * UMA CORRECCAO NUNCA SUBSTITUI O ORIGINAL
 * ----------------------------------------
 * Corrigir e um LANCAMENTO NOVO que aponta ao errado. A linha antiga fica na
 * base para sempre, marcada como substituida. O ecra tem de mostrar as duas
 * coisas ao mesmo tempo: o valor que vale hoje, em primeiro plano, e o que la
 * estava antes, a um clique de distancia.
 *
 * PORQUE E QUE O INDICADOR E TAO DISCRETO
 * ---------------------------------------
 * Quem so quer saber as horas do mes nao quer ler a historia de cada linha.
 * Sem correccoes nao ha indicador nenhum -- nem um espaco reservado. Com
 * correccoes, aparece um botao pequeno que diz quantas foram. E a mesma regra
 * do indicador de ajustes no contador das ausencias.
 *
 * AS LINHAS SUBSTITUIDAS DESENHAM-SE ESBATIDAS E NAO RISCADAS: o que interessa
 * nelas e justamente conseguir le-las.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

/** Uma volta da historia, ja traduzida por quem chama. */
export interface PassoDoHistorico {
  id: string;
  /** "09:00 — 13:00, Armazem" -- o valor daquela versao, em texto. */
  valor: string;
  /** Quem registou ou corrigiu, e quando. */
  autor: string | null;
  quando: string | null;
  /** O tipo de correccao, quando houve. Vazio no lancamento original. */
  tipo?: string | null;
  /** O motivo escrito. Obrigatorio na base para toda a correccao. */
  motivo?: string | null;
  /** Anulada: mostra-se com o motivo da anulacao e nao desaparece. */
  anulada?: boolean;
  anulacaoMotivo?: string | null;
}

interface HistoricoCorreccoesProps {
  titulo: string;
  descricao: string;
  passos: PassoDoHistorico[];
  /** Rotulo do botao, ja no plural certo por quem chama. */
  rotulo: string;
}

export function HistoricoCorreccoes({
  titulo,
  descricao,
  passos,
  rotulo,
}: HistoricoCorreccoesProps) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);

  // Sem correccoes nao ha nada a mostrar, e nao se desenha um botao que abre
  // um painel com uma linha so.
  if (passos.length <= 1) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
        onClick={() => setAberto(true)}
      >
        <History className="h-3 w-3" />
        {rotulo}
      </Button>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{titulo}</SheetTitle>
            <SheetDescription>{descricao}</SheetDescription>
          </SheetHeader>

          <ol className="mt-6 space-y-4">
            {passos.map((passo, indice) => {
              const emVigor = indice === passos.length - 1;
              return (
                <li
                  key={passo.id}
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    emVigor ? "border-primary/50 bg-primary/5" : "opacity-70",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium tabular-nums">{passo.valor}</span>
                    {emVigor ? (
                      <Badge variant="default" className="font-normal">
                        {t("hr.assiduidade.historico.emVigor")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal">
                        {t("hr.assiduidade.historico.substituido")}
                      </Badge>
                    )}
                    {passo.anulada && (
                      <Badge variant="outline" className="font-normal">
                        {t("hr.assiduidade.historico.anulada")}
                      </Badge>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {indice === 0
                      ? t("hr.assiduidade.historico.registadoPor", {
                          autor: passo.autor ?? t("hr.assiduidade.historico.autorDesconhecido"),
                          quando: passo.quando ?? "—",
                        })
                      : t("hr.assiduidade.historico.corrigidoPor", {
                          autor: passo.autor ?? t("hr.assiduidade.historico.autorDesconhecido"),
                          quando: passo.quando ?? "—",
                        })}
                  </p>

                  {passo.tipo && (
                    <p className="mt-1 text-xs">
                      <span className="text-muted-foreground">
                        {t("hr.assiduidade.historico.tipo")}:{" "}
                      </span>
                      {passo.tipo}
                    </p>
                  )}
                  {passo.motivo && <p className="mt-1 text-xs">{passo.motivo}</p>}
                  {passo.anulada && passo.anulacaoMotivo && (
                    <p className="mt-1 text-xs text-destructive">{passo.anulacaoMotivo}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </SheetContent>
      </Sheet>
    </>
  );
}
