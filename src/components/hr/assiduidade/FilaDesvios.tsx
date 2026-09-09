/**
 * A fila de trabalho: o que a base PROPOE que alguem trate.
 *
 * `hr_assiduidade_desvios` devolve quatro tipos e mais nada: turno planeado
 * sem horas, horas sem turno planeado, picagem por emparelhar, e falta que
 * passou a estar coberta por uma ausencia aprovada. Propoe, nao escreve, e
 * NAO FILTRA TOLERANCIAS.
 *
 * O FILTRO DE MINUTOS E DESTE ECRA, E TEM DE SE VER
 * -------------------------------------------------
 * Sem o filtro escrito por cima da lista, uma fila vazia por causa dele passa
 * por uma fila vazia por nao haver nada -- e isso e a diferenca entre "esta
 * tudo em ordem" e "nao estas a ver metade". Por isso o controlo esta sempre
 * visivel e a contagem diz o filtro em vigor.
 *
 * A picagem por emparelhar nunca e filtrada: nao tem duracao nenhuma, e nao ha
 * tolerancia que a torne irrelevante.
 *
 * Cada linha abre o dia dessa pessoa, que e onde vivem as accoes. Repetir aqui
 * os botoes de marcar falta, corrigir e consolidar dava dois sitios para o
 * mesmo gesto e duas maneiras de ele ficar diferente.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";
import { formatarDuracao, horaCurta } from "@/lib/hr/assiduidade";
import type { Desvio } from "@/types/hrAssiduidade";

const TOLERANCIAS = ["0", "5", "10", "15", "30"] as const;

interface FilaDesviosProps {
  desvios: Desvio[];
  nomePorPessoaId: Map<string, string>;
  onAbrirDia: (pessoaId: string, data: string) => void;
  idPrefixo?: string;
}

export function FilaDesvios({
  desvios,
  nomePorPessoaId,
  onAbrirDia,
  idPrefixo = "hr-desvios",
}: FilaDesviosProps) {
  const { t } = useTranslation();
  const [tolerancia, setTolerancia] = useState<string>("10");

  const minutosMinimos = Number(tolerancia);

  const visiveis = useMemo(
    () =>
      desvios.filter((desvio) => {
        if (desvio.tipo === "pendente_par") return true;
        if (minutosMinimos <= 0) return true;
        return (desvio.minutos ?? 0) >= minutosMinimos;
      }),
    [desvios, minutosMinimos],
  );

  const idTolerancia = `${idPrefixo}-tolerancia`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("hr.assiduidade.desvios.titulo")}</CardTitle>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor={idTolerancia}>{t("hr.assiduidade.desvios.tolerancia")}</Label>
            <Select value={tolerancia} onValueChange={setTolerancia}>
              <SelectTrigger id={idTolerancia} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOLERANCIAS.map((valor) => (
                  <SelectItem key={valor} value={valor}>
                    {valor === "0"
                      ? t("hr.assiduidade.desvios.semTolerancia")
                      : t("hr.assiduidade.desvios.ignorarAbaixoDe", { minutos: valor })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p aria-live="polite" className="pb-2 text-sm text-muted-foreground">
            {minutosMinimos > 0
              ? t("hr.assiduidade.desvios.contagemFiltrada", {
                  quantos: String(visiveis.length),
                  minutos: tolerancia,
                })
              : t("hr.assiduidade.desvios.contagem", { quantos: String(visiveis.length) })}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {visiveis.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {minutosMinimos > 0
              ? t("hr.assiduidade.desvios.vazioFiltrado", { minutos: tolerancia })
              : t("hr.assiduidade.desvios.vazio")}
          </p>
        ) : (
          <ul className="divide-y">
            {visiveis.map((desvio, indice) => (
              <li key={`${desvio.pessoa_id}-${desvio.data}-${desvio.tipo}-${indice}`}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  onClick={() => onAbrirDia(desvio.pessoa_id, desvio.data)}
                >
                  <span className="w-24 tabular-nums text-muted-foreground">{desvio.data}</span>
                  <span className="min-w-40 font-medium">
                    {nomePorPessoaId.get(desvio.pessoa_id) ?? desvio.pessoa_id}
                  </span>
                  <Badge variant="outline" className="font-normal">
                    {t(`hr.assiduidade.desvios.tipo.${desvio.tipo}`)}
                  </Badge>
                  {desvio.hora_inicio && (
                    <span className="tabular-nums text-muted-foreground">
                      {horaCurta(desvio.hora_inicio)} — {horaCurta(desvio.hora_fim)}
                    </span>
                  )}
                  {desvio.minutos !== null && desvio.minutos > 0 && (
                    <span className="tabular-nums text-muted-foreground">
                      {formatarDuracao(desvio.minutos)}
                    </span>
                  )}
                  {desvio.detalhe && (
                    <span className="text-xs text-muted-foreground">{desvio.detalhe}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
