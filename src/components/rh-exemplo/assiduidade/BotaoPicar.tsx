/**
 * Picar: um botao grande, e um so.
 *
 * O SENTIDO NAO SE PERGUNTA
 * -------------------------
 * O ecra ja sabe: se a ultima picagem em vigor do dia foi uma entrada, o botao
 * regista a saida; sem nenhuma, regista a entrada. Pedir a quem esta a chegar
 * ao servico que escolha "entrada" num selector e atrito por atrito.
 *
 * NAO HA CONFIRMACAO
 * ------------------
 * Nenhum dialogo, nenhum "tem a certeza". A rede de seguranca de uma picagem
 * errada e a CORRECCAO -- que fica com autor, motivo e rasto -- e nao um passo
 * a mais para as noventa e nove vezes em que esta certa.
 *
 * O LOCAL VEM DO PLANEADO E FICA EDITAVEL
 * ---------------------------------------
 * Pre-selecciona-se o local do intervalo planeado que contem a hora actual --
 * que e tambem o que a RPC vai ligar. Fica editavel porque quem trabalha em
 * dois sitios no mesmo dia e o caso central deste modulo, e nao a excepcao.
 *
 * NA APRESENTACAO NAO SE PEDE LOCALIZACAO
 * ----------------------------------------
 * No modulo real a picagem so fica registada com a localizacao do dispositivo. Aqui picar tem de funcionar sempre,
 * sem pedir permissoes ao navegador: a picagem fica sem coordenadas e o resto (sentido, local, hora) e igual.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { agoraHoraLocal, horaCurta, sentidoSeguinte } from "@/components/rh-exemplo/lib/assiduidade";
import { planeadoQueContemHora } from "@/components/rh-exemplo/lib/planeadoDoDia";
import type { Picagem, SentidoPicagem } from "@/components/rh-exemplo/tiposAssiduidade";
import type { HorarioPlaneado, LocalTrabalho } from "@/components/rh-exemplo/tipos";

const SEM_LOCAL = "__sem_local__";

interface BotaoPicarProps {
  /** As picagens de hoje JA em vigor. O sentido sai da ultima. */
  picagensDeHoje: Picagem[];
  planeadoDeHoje: HorarioPlaneado[];
  locais: LocalTrabalho[];
  podePicar: boolean;
  aGravar: boolean;
  onPicar: (args: {
    sentido: SentidoPicagem;
    localId: string | null;
    latitude: number | null;
    longitude: number | null;
    precisaoMetros: number | null;
  }) => Promise<string | null>;
  idPrefixo?: string;
}

export function BotaoPicar({
  picagensDeHoje,
  planeadoDeHoje,
  locais,
  podePicar,
  aGravar,
  onPicar,
  idPrefixo = "hr-picar",
}: BotaoPicarProps) {
  const { t } = useTranslation();
  const [agora, setAgora] = useState(() => agoraHoraLocal());
  const [localEscolhido, setLocalEscolhido] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [aLocalizar, setALocalizar] = useState(false);
  const [alerta, setAlerta] = useState<{ texto: string; seq: number } | null>(null);
  const tocado = useRef(false);

  // O relogio anda: quem olha para o ecra antes de picar tem de ver a hora que
  // vai ficar gravada, e nao a de quando abriu a pagina.
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(agoraHoraLocal()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const planeadoAgora = useMemo(
    () => planeadoQueContemHora(planeadoDeHoje, agora),
    [planeadoDeHoje, agora],
  );

  // Enquanto ninguem mexer no selector, o local segue o planeado; a partir do
  // momento em que alguem escolhe, a escolha manda.
  const localEfectivo = tocado.current ? localEscolhido : (planeadoAgora?.local_id ?? null);

  const sentido = sentidoSeguinte(picagensDeHoje);
  const eEntrada = sentido === "entrada";

  const picar = async () => {
    setALocalizar(true);
    const resultado = await localizacaoActual().finally(() => setALocalizar(false));
    if (resultado.estado !== "ok") {
      const mensagem = t(CHAVE_ERRO_LOCALIZACAO[resultado.estado]);
      setAlerta((anterior) => ({ texto: mensagem, seq: (anterior?.seq ?? 0) + 1 }));
      toast.error(mensagem);
      return;
    }
    setAlerta(null);
    const erro = await onPicar({
      sentido,
      localId: localEfectivo,
      latitude: resultado.posicao?.latitude ?? null,
      longitude: resultado.posicao?.longitude ?? null,
      precisaoMetros: resultado.posicao?.precisao ?? null,
    });
    if (erro) {
      toast.error(t(erro));
      return;
    }
    const hora = agoraHoraLocal();
    const mensagem = eEntrada
      ? t("hr.assiduidade.picar.entradaRegistada", { hora })
      : t("hr.assiduidade.picar.saidaRegistada", { hora });
    setAnuncio(mensagem);
    toast.success(mensagem);
  };

  if (!podePicar) return null;

  const idLocal = `${idPrefixo}-local`;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        className="h-16 w-full text-base"
        disabled={aGravar || aLocalizar}
        onClick={() => void picar()}
      >
        {aGravar || aLocalizar ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : eEntrada ? (
          <LogIn className="mr-2 h-5 w-5" />
        ) : (
          <LogOut className="mr-2 h-5 w-5" />
        )}
        {aLocalizar
          ? t("hr.assiduidade.picar.aLocalizar")
          : eEntrada
            ? t("hr.assiduidade.picar.entrar")
            : t("hr.assiduidade.picar.sair")}
      </Button>

      <p className="text-center text-sm text-muted-foreground tabular-nums">
        {t("hr.assiduidade.picar.agoraSao", { hora: agora })}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={idLocal}>{t("hr.assiduidade.picar.local")}</Label>
        <Select
          value={localEfectivo ?? SEM_LOCAL}
          onValueChange={(valor) => {
            tocado.current = true;
            setLocalEscolhido(valor === SEM_LOCAL ? null : valor);
          }}
        >
          <SelectTrigger id={idLocal}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_LOCAL}>{t("hr.assiduidade.semLocal")}</SelectItem>
            {locais.map((local) => (
              <SelectItem key={local.id} value={local.id}>
                {local.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {planeadoAgora && (
          <p className="text-xs text-muted-foreground">
            {t("hr.assiduidade.picar.doPlaneado", {
              inicio: horaCurta(planeadoAgora.hora_inicio),
              fim: horaCurta(planeadoAgora.hora_fim),
            })}
          </p>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      {alerta && (
        <p key={alerta.seq} role="alert" className="sr-only">
          {alerta.texto}
        </p>
      )}
    </div>
  );
}

interface Localizacao {
  latitude: number;
  longitude: number;
  precisao: number | null;
}

type ResultadoLocalizacao =
  | { estado: "ok"; posicao: Localizacao | null }
  | { estado: "recusada" }
  | { estado: "semSinal" }
  | { estado: "indisponivel" };

const CHAVE_ERRO_LOCALIZACAO: Record<
  Exclude<ResultadoLocalizacao["estado"], "ok">,
  string
> = {
  recusada: "hr.assiduidade.picar.localizacaoRecusada",
  semSinal: "hr.assiduidade.picar.localizacaoSemSinal",
  indisponivel: "hr.assiduidade.picar.localizacaoIndisponivel",
};

/**
 * A localizacao na apresentacao: nunca se pede ao navegador. Devolve sempre "ok", sem coordenadas, para o botao
 * de picar funcionar em qualquer dispositivo e sem janelas de permissao.
 */
async function localizacaoActual(): Promise<ResultadoLocalizacao> {
  return { estado: "ok", posicao: null };
}
