/**
 * Ficha da pessoa > cartao «Direitos salariais» (20270107600000, Entrega B): se esta pessoa tem direito a IHT, km e ajudas de
 * custo. Os VALORES vem da regra da organizacao; aqui so se escolhe o direito.
 *
 * Quem tem `hr.pessoas.retribuicao.edit` (`podeAlterar`) muda os interruptores (cada um grava logo os tres direitos); os outros veem
 * a lista «Tem direito» / «Sem direito» em texto. Quem usa este cartao decide se o mostra (`hr.pessoas.retribuicao.view`).
 * Enquanto a migration nao estiver aplicada diz-se numa linha calma, sem erro vermelho.
 *
 * Gravar parte SEMPRE da ultima leitura confirmada pela base (nunca do que estava no render), e os tres interruptores ficam
 * desactivados enquanto se grava e se relê: dois cliques seguidos nao desfazem um direito.
 */
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Switch } from "@/components/ui/switch";
import { usePessoaDireitosSalariais } from "@/hooks/usePessoaDireitosSalariais";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import type { DireitosSalariais } from "@/types/hr";

const DIREITOS: ReadonlyArray<keyof DireitosSalariais> = ["iht", "km", "ajudas"];

interface CartaoDireitosSalariaisProps {
  pessoaId: string;
  organizationId: string;
  /** `hr.pessoas.retribuicao.edit`. */
  podeAlterar: boolean;
}

export function CartaoDireitosSalariais({ pessoaId, organizationId, podeAlterar }: CartaoDireitosSalariaisProps) {
  const { t } = useTranslation();
  const { direitos, estado, isLoading, isSaving, guardar, recarregar } = usePessoaDireitosSalariais(pessoaId, organizationId);
  // O valor mostrado enquanto se grava (optimista, por interruptor); some quando a base responde.
  const [otimista, setOtimista] = useState<Partial<DireitosSalariais>>({});
  const [anuncio, setAnuncio] = useState("");
  // A ultima leitura confirmada: e dela que se parte, nunca de um render antigo.
  const confirmados = useRef(direitos);
  confirmados.current = direitos;

  const ligado = (d: keyof DireitosSalariais): boolean => otimista[d] ?? direitos[d];
  const idTitulo = `direitos-titulo-${pessoaId}`;
  const idSubtitulo = `direitos-subtitulo-${pessoaId}`;

  const alternar = async (direito: keyof DireitosSalariais, novo: boolean) => {
    if (isSaving) return;
    setOtimista({ [direito]: novo });
    const { erro } = await guardar({ ...confirmados.current, [direito]: novo });
    setOtimista({});
    if (erro) {
      toast.error(t(erro));
      setAnuncio(t(erro));
      return;
    }
    toast.success(t("hr.direitosSalariais.guardarSucesso"));
    setAnuncio(t("hr.direitosSalariais.guardarSucesso"));
  };

  const texto = (d: keyof DireitosSalariais): string => (ligado(d) ? t("hr.direitosSalariais.tem") : t("hr.direitosSalariais.naoTem"));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle id={idTitulo} className="text-base">
          {t("hr.direitosSalariais.titulo")}
        </CardTitle>
        <p id={idSubtitulo} className="text-sm text-muted-foreground">
          {t("hr.direitosSalariais.subtitulo")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Resultado de gravar, para leitores de ecra (o toast tem a sua propria regiao aria-live). */}
        <p role="status" className="sr-only" data-testid="direitos-salariais-anuncio">
          {anuncio}
        </p>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <OlyviaLoader size={24} />
          </div>
        ) : estado === "indisponivel" ? (
          <p role="status" className="text-sm text-muted-foreground" data-testid="direitos-salariais-indisponivel">
            {t("hr.direitosSalariais.indisponivel")}
          </p>
        ) : estado === "recusado" ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("hr.direitosSalariais.recusado")}
          </p>
        ) : estado === "erro" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm font-medium text-destructive">
              {t("hr.direitosSalariais.erroLeitura")}
            </p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void recarregar()}>
              {t("rhExemplo.leitura.tentarDeNovo")}
            </Button>
          </div>
        ) : podeAlterar ? (
          <div role="group" aria-labelledby={idTitulo} aria-describedby={idSubtitulo}>
            <ul className="divide-y">
              {DIREITOS.map((direito) => {
                const id = `direito-salarial-${direito}-${pessoaId}`;
                return (
                  <li key={direito} className="flex min-h-11 items-center justify-between gap-3 py-2">
                    <Label htmlFor={id} className="text-sm">
                      {t(`hr.direitosSalariais.${direito}`)}
                    </Label>
                    <div className="flex items-center gap-3">
                      <span id={`${id}-estado`} className="text-sm text-muted-foreground">
                        {texto(direito)}
                      </span>
                      {/* A area de toque (44 px) estende-se alem do interruptor de 24 px. */}
                      <Switch
                        id={id}
                        className="relative after:absolute after:-inset-2.5 after:content-['']"
                        checked={ligado(direito)}
                        aria-disabled={isSaving ? true : undefined}
                        aria-describedby={`${id}-estado`}
                        onCheckedChange={(novo) => void alternar(direito, novo)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {isSaving && (
              <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t("hr.direitosSalariais.aGravar")}
              </p>
            )}
          </div>
        ) : (
          <div role="group" aria-labelledby={idTitulo} aria-describedby={idSubtitulo}>
            <dl className="divide-y">
              {DIREITOS.map((direito) => (
                <div key={direito} className="flex min-h-11 items-center justify-between gap-3 py-2">
                  <dt className="text-sm">{t(`hr.direitosSalariais.${direito}`)}</dt>
                  <dd className="text-sm font-medium" data-testid={`direito-texto-${direito}`}>
                    {texto(direito)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
