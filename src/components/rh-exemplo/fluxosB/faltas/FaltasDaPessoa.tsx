/**
 * As faltas JA MARCADAS de uma pessoa, na aba Justificacoes da ficha: o estado de cada uma e o detalhe, onde se
 * regista a justificacao (RPC) e o RH a decide (RPC). Le o que a aba Assiduidade ja carregou para o mes visivel,
 * em bruto, e mostra o valor em vigor.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { FaltaDetalhe } from "@/components/rh-exemplo/fluxosB/faltas/FaltaDetalhe";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import type { AssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import { LEITOR_FALTAS, emVigor } from "@/components/rh-exemplo/lib/assiduidade";
import { rotuloDaJustificacao } from "@/components/rh-exemplo/lib/faltasB";
import { permissoesDaVista } from "@/components/rh-exemplo/lib/vistaDaPessoa";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

interface FaltasDaPessoaProps {
  pessoaNome: string;
  souAPessoa: boolean;
  permissoes: PermissoesAssiduidade;
  assiduidade: Pick<AssiduidadeDaPessoa, "faltas" | "faltasRecusadas" | "recarregar">;
}

export function FaltasDaPessoa({ pessoaNome, souAPessoa, permissoes, assiduidade }: FaltasDaPessoaProps) {
  const { t } = useTranslation();
  const [aberta, setAberta] = useState<string | null>(null);
  const faltas = useMemo(
    () => emVigor(assiduidade.faltas, LEITOR_FALTAS).sort((a, b) => b.data.localeCompare(a.data) || b.hora_inicio.localeCompare(a.hora_inicio)),
    [assiduidade.faltas],
  );
  const falta = aberta ? faltas.find((f) => f.id === aberta) ?? null : null;

  // Uma leitura recusada nao e «sem faltas»: o bloco nao se desenha.
  if (assiduidade.faltasRecusadas) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("rhExemplo.fal.listaTitulo")}</CardTitle>
      </CardHeader>
      <CardContent>
        {faltas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("rhExemplo.fal.semFaltas")}</p>
        ) : (
          <ul className="divide-y" data-testid="rha-faltas-da-pessoa">
            {faltas.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="tabular-nums">{formatarData(f.data)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {`${f.hora_inicio.slice(0, 5)}–${f.hora_fim.slice(0, 5)} · ${formatarHorasMinutos(f.minutos)}`}
                </span>
                <Badge variant="outline" className="font-normal">
                  {t(`rhExemplo.fal.estado.${rotuloDaJustificacao(f)}`)}
                </Badge>
                <Button type="button" size="sm" variant="ghost" className="ml-auto min-h-11" onClick={() => setAberta(f.id)}>
                  {t("rhExemplo.fal.verDetalhe")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {falta && (
        <FaltaDetalhe
          falta={falta}
          nome={pessoaNome}
          permissoes={permissoesDaVista(permissoes, souAPessoa)}
          onFechar={() => setAberta(null)}
          onAlterado={() => void assiduidade.recarregar()}
        />
      )}
    </Card>
  );
}
