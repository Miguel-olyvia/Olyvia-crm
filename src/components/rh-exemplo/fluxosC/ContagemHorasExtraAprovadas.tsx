/**
 * Processamento salarial > Configuração > «Horas extra» > «Contagem das horas extra».
 *
 * O interruptor da organização: «as horas extra contam no relatório e no pagamento só depois de confirmadas, a partir de [data]».
 * Desligado, tudo como até aqui. Ligado, a partir da data só contam as confirmadas; o excesso por aprovar fica pendente e não é
 * pago, e o fecho da folha exige as pendentes decididas. Ligar, alterar e desligar pedem confirmação, porque depois de fechar uma
 * folha com a contagem ligada a base já não deixa desligar, adiar nem antecipar (Alterar e Desligar ficam então `aria-disabled`,
 * com a razão em texto); e sem o interruptor, uma folha já fechada obriga a ligar numa data posterior ao fim dela.
 *
 * Ler pede `hr.assiduidade.view`; alterar, `hr.assiduidade.gerir` (quem só vê, vê o estado). Se a base ainda não tem a RPC, o
 * ecrã diz «ainda não disponível» sem partir.
 */
import { useRef, useState } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { hojeLisboa, useHorasExtraContagem } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { usePermissoesAssiduidade } from "@/components/rh-exemplo/hooks/usePermissoesAssiduidade";
import { dataCurta } from "./formatosC";

/** O que a base aceita: de 2000-01-01 até hoje mais 5 anos. */
const DATA_MINIMA = "2000-01-01";
const ANOS_A_FRENTE = 5;
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

type Accao = "ligar" | "alterar" | "desligar";
/** O que o diálogo mostra: guardado ao abrir, para o título e o texto não mudarem durante a animação de fecho. */
interface Pedido { accao: Accao; data: string }

const dataMaxima = (hoje: string): string => `${Number(hoje.slice(0, 4)) + ANOS_A_FRENTE}${hoje.slice(4)}`;
const dataValida = (v: string, maxima: string): boolean => FORMATO_DATA.test(v) && v >= DATA_MINIMA && v <= maxima;

export function ContagemHorasExtraAprovadas() {
  const { t } = useTranslation();
  const { permissoes, loading: aCarregarPermissoes } = usePermissoesAssiduidade();
  const { estado, contagem, aGuardar, guardar } = useHorasExtraContagem(permissoes.view);
  const hoje = hojeLisboa();
  const maxima = dataMaxima(hoje);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const estadoRef = useRef<HTMLParagraphElement>(null);
  const focoNoEstado = useRef(false);

  const actual = contagem?.aprovacaoDesde ?? null;
  const ligada = actual !== null;
  const folhas = contagem?.folhasFechadasDesde ?? null;
  const ultimaFolha = contagem?.ultimaFolhaFechadaAte ?? null;
  /** Com folhas fechadas e a contagem ligada, a base recusa desligar, adiar e antecipar. */
  const bloqueada = ligada && folhas !== null;
  const data = escolhida ?? actual ?? hoje;
  const anteriorAFolha = !ligada && ultimaFolha !== null && data <= ultimaFolha;
  const valida = dataValida(data, maxima) && !anteriorAFolha;
  const podeAlterar = permissoes.gerir && contagem !== null;

  const abrir = (accao: Accao) => {
    setPedido({ accao, data });
    setAberto(true);
  };

  const confirmar = async () => {
    if (!pedido || aGuardar) return;
    const desde = pedido.accao === "desligar" ? null : pedido.data;
    const res = await guardar(desde);
    setAberto(false);
    if (!res.ok) {
      setErro(res.erro);
      return;
    }
    setErro(null);
    setEscolhida(null);
    focoNoEstado.current = true;
    toast.success(desde === null ? t("rhHeReal.contagem.toast.desligada") : t(pedido.accao === "ligar" ? "rhHeReal.contagem.toast.ligada" : "rhHeReal.contagem.toast.alterada", { data: dataCurta(desde) }));
  };

  const corpo = () => {
    if (aCarregarPermissoes) return <p role="status" className="text-sm text-muted-foreground">{t("rhHeReal.aCarregar")}</p>;
    if (!permissoes.view) return <p role="note" className="text-sm text-muted-foreground" data-testid="he-contagem-sem-ver">{t("rhHeReal.contagem.semVer")}</p>;
    if (estado === "sem-organizacao") return <p role="note" className="text-sm text-muted-foreground" data-testid="he-contagem-sem-organizacao">{t("rhHeReal.contagem.semOrganizacao")}</p>;
    if (estado === "a-carregar") return <p role="status" className="text-sm text-muted-foreground">{t("rhHeReal.aCarregar")}</p>;
    if (estado === "indisponivel") return <p role="note" className="text-sm text-muted-foreground" data-testid="he-contagem-indisponivel">{t("rhHeReal.contagem.indisponivel")}</p>;
    if (estado === "erro" || !contagem) return <p role="alert" className="text-sm text-destructive">{t("rhHeReal.contagem.erroLeitura")}</p>;
    return (
      <>
        <p ref={estadoRef} tabIndex={-1} className="text-sm font-medium outline-none" role="status" data-testid="he-contagem-estado">
          {ligada ? t("rhHeReal.contagem.estadoLigada", { data: dataCurta(actual) }) : t("rhHeReal.contagem.estadoDesligada")}
        </p>
        {folhas && <p role="note" className="text-sm text-muted-foreground" data-testid="he-contagem-folhas">{t("rhHeReal.contagem.folhasFechadas", { data: dataCurta(folhas) })}</p>}
        {!ligada && ultimaFolha && <p role="note" className="text-sm text-muted-foreground" data-testid="he-contagem-ultima-folha">{t("rhHeReal.contagem.ultimaFolha", { data: dataCurta(ultimaFolha) })}</p>}
        {!permissoes.gerir && <p role="note" className="text-xs text-muted-foreground">{t("rhHeReal.contagem.soLeitura")}</p>}
        {podeAlterar && (
          <>
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="he-contagem-data">{t("rhHeReal.contagem.data")}</Label>
              <Input id="he-contagem-data" type="date" className="min-h-11" min={DATA_MINIMA} max={maxima} value={data} aria-invalid={!valida}
                aria-describedby={valida ? undefined : "he-contagem-data-erro"} readOnly={aGuardar} aria-disabled={aGuardar || undefined}
                onChange={(e) => { if (aGuardar) return; setEscolhida(e.target.value); setErro(null); }} />
              {!valida && (
                <p id="he-contagem-data-erro" role="alert" className="text-sm text-destructive">
                  {anteriorAFolha && ultimaFolha
                    ? t("rhHeReal.contagem.dataAnteriorFolha", { data: dataCurta(ultimaFolha) })
                    : t("rhHeReal.contagem.dataInvalida", { de: dataCurta(DATA_MINIMA), ate: dataCurta(maxima) })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {ligada ? (
                <>
                  <Button type="button" className="min-h-11" aria-disabled={bloqueada || !valida || data === actual || aGuardar || undefined}
                    aria-describedby={bloqueada ? "he-contagem-bloqueio" : undefined}
                    onClick={() => { if (!bloqueada && valida && data !== actual && !aGuardar) abrir("alterar"); }}>{t("rhHeReal.contagem.alterar")}</Button>
                  <Button type="button" variant="outline" className="min-h-11" aria-disabled={bloqueada || aGuardar || undefined}
                    aria-describedby={bloqueada ? "he-contagem-bloqueio" : undefined}
                    onClick={() => { if (!bloqueada && !aGuardar) abrir("desligar"); }}>{t("rhHeReal.contagem.desligar")}</Button>
                </>
              ) : (
                <Button type="button" className="min-h-11" aria-disabled={!valida || aGuardar || undefined}
                  onClick={() => { if (valida && !aGuardar) abrir("ligar"); }}>{t("rhHeReal.contagem.ligar")}</Button>
              )}
            </div>
            {bloqueada && <p id="he-contagem-bloqueio" role="note" className="text-sm text-muted-foreground" data-testid="he-contagem-bloqueio">{t("rhHeReal.contagem.bloqueio")}</p>}
          </>
        )}
        {erro && <p role="alert" className="text-sm text-destructive" data-testid="he-contagem-erro">{erro}</p>}
      </>
    );
  };

  return (
    <Card data-testid="he-contagem">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("rhHeReal.contagem.titulo")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("rhHeReal.contagem.ajuda")}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("rhHeReal.contagem.efeitoDesligada")}</li>
          <li>{t("rhHeReal.contagem.efeitoLigada")}</li>
          <li>{t("rhHeReal.contagem.efeitoPendentes")}</li>
          <li>{t("rhHeReal.contagem.efeitoFecho")}</li>
        </ul>
      </CardHeader>
      <CardContent className="space-y-4">{corpo()}</CardContent>
      <AlertDialog open={aberto} onOpenChange={(a) => { if (!a && !aGuardar) setAberto(false); }}>
        <AlertDialogContent onCloseAutoFocus={(e) => {
          // Depois de gravar, o botão que abriu o diálogo pode já não existir: o foco vai para o estado novo.
          if (focoNoEstado.current) {
            e.preventDefault();
            focoNoEstado.current = false;
            estadoRef.current?.focus();
          }
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{pedido ? t(`rhHeReal.contagem.confirma.titulo.${pedido.accao}`) : ""}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{pedido ? t(`rhHeReal.contagem.confirma.texto.${pedido.accao}`, { data: dataCurta(pedido.data) }) : ""}</p>
                {pedido && pedido.accao !== "desligar" && <p data-testid="he-contagem-aviso-folhas">{t("rhHeReal.contagem.confirma.avisoFolhas")}</p>}
                {pedido?.accao === "ligar" && ultimaFolha && <p data-testid="he-contagem-aviso-ultima">{t("rhHeReal.contagem.ultimaFolha", { data: dataCurta(ultimaFolha) })}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aGuardar}>{t("rhHeReal.contagem.confirma.cancelar")}</AlertDialogCancel>
            <Button type="button" disabled={aGuardar} onClick={() => void confirmar()}>{t("rhHeReal.contagem.confirma.confirmar")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}