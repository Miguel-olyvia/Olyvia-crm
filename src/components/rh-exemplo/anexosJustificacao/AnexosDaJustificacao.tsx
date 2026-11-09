/**
 * Os anexos de uma justificação (do dia ou de uma falta), lidos por `rpc_hr_justificacao_anexos_listar`: quem decide o que cada
 * pessoa vê e faz é a base. «Abrir» só aparece com `pode_abrir` (a abertura do RH fica registada); «Remover» só com
 * `pode_remover`. Quando o nome vem oculto (quem só decide não vê o nome: pode ser dado de saúde) mostra-se «Anexo» e o tamanho,
 * e o título diz «N anexos». Quem não tem acesso, ou uma justificação sem anexos, não ocupa lugar.
 *
 * `alvoAnexar` (opcional) junta o botão de anexar a uma justificação que ainda aceita anexos: os ficheiros sobem logo e a lista
 * relê-se; os que falham ficam com «Tentar outra vez» (que repete só o que falta: ver `enviarAnexo`).
 *
 * A lista relê-se também quando alguém avisa que as justificações mudaram (`avisarMudancaDeJustificacoes`): é o que acontece
 * quando o formulário da pessoa acaba de subir os ficheiros da fase 2 para uma justificação que já estava a ser mostrada.
 *
 * «Abrir» abre a janela no próprio clique e só depois lhe atribui o URL (depois de um `await` o browser bloquearia o pop-up);
 * se for bloqueado, mostra uma ligação para o mesmo URL.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { useAnexarJustificacao, type AlvoAnexo, type AlvoListagem, type ResultadoEnvio } from "@/hooks/useAnexarJustificacao";
import { subscreverMudancaDeJustificacoes } from "@/hooks/useJustificacoesDoDia";
import {
  ACCEPT_ANEXOS,
  MAX_ANEXOS_JUSTIFICACAO_REAIS,
  chaveDoErroDeAnexo,
  escolherAnexos,
  rotuloDoAnexo,
  type AnexoListado,
} from "@/lib/hr/justificacaoAnexos";

interface Props {
  alvo: AlvoListagem;
  /** Com isto aparece o campo de anexar; sem isto só se lê, abre e remove. */
  alvoAnexar?: AlvoAnexo | null;
  /** Muda para forçar uma nova leitura (por exemplo, depois de a justificação ser enviada). */
  versao?: number;
  /** Diz quantos anexos há (para quem quer mostrar a contagem noutro sítio). */
  aoLer?: (total: number) => void;
}

interface FalhaDeEnvio {
  id: number;
  ficheiro: File;
  codigo: string;
  /** O resultado falhado (reserva e se o upload correu), para repetir só o que falta. */
  anterior: ResultadoEnvio;
}

/** Onde pôr o foco quando a lista muda: num item (por posição) ou, sem item, no campo de ficheiros. */
interface PedidoDeFoco {
  item: number | null;
}

const chaveDoAlvo = (a: AlvoListagem): string => ("justificacaoDiaId" in a ? `d:${a.justificacaoDiaId}` : `f:${a.faltaId}`);

export function AnexosDaJustificacao({ alvo, alvoAnexar = null, versao = 0, aoLer }: Props) {
  const { t } = useTranslation();
  const { listar, anexar, remover, abrir, aOcupar } = useAnexarJustificacao();
  const [anexos, setAnexos] = useState<AnexoListado[]>([]);
  const [lido, setLido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<FalhaDeEnvio[]>([]);
  /** O URL do ficheiro quando o browser bloqueou a janela. */
  const [ligacao, setLigacao] = useState<string | null>(null);
  const [foco, setFoco] = useState<PedidoDeFoco | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const vivo = useRef(true);
  const proxima = useRef(1);
  const aoLerRef = useRef(aoLer);
  aoLerRef.current = aoLer;
  const chave = chaveDoAlvo(alvo);

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const ler = useCallback(async () => {
    const r = await listar(alvoDaChave(chave));
    if (!vivo.current) return;
    setAnexos(r.anexos);
    setLido(true);
    aoLerRef.current?.(r.anexos.length);
  }, [listar, chave]);

  useEffect(() => { void ler(); }, [ler, versao]);
  // Quem muda as justificações (o formulário, ao acabar de subir os ficheiros) avisa por aqui: relê-se em silêncio.
  useEffect(() => subscreverMudancaDeJustificacoes(() => { void ler(); }), [ler]);

  // O foco só se muda quando nada está ocupado (os botões desactivados não o aceitam) e depois de a lista já ter sido relida.
  useEffect(() => {
    if (!foco || aOcupar) return;
    setFoco(null);
    const botao = foco.item === null ? null : lista.current?.querySelectorAll("li")[foco.item]?.querySelector("button");
    (botao ?? campo.current)?.focus();
  }, [foco, aOcupar]);

  const aAbrir = async (a: AnexoListado) => {
    setErro(null);
    setLigacao(null);
    // A janela abre-se já, no clique: depois do `await` o browser tratá-la-ia como pop-up e bloqueava-a.
    const janela = window.open("about:blank", "_blank");
    if (janela) janela.opener = null;
    const r = await abrir(a.id);
    if (!vivo.current || !r.ok || !r.url) {
      janela?.close();
      if (vivo.current) setErro(chaveDoErroDeAnexo(r.codigo));
      return;
    }
    if (janela && !janela.closed) janela.location.href = r.url;
    else setLigacao(r.url);
  };

  const aRemover = async (a: AnexoListado) => {
    const indice = anexos.findIndex((x) => x.id === a.id);
    setErro(null);
    const r = await remover(a.id);
    if (!vivo.current) return;
    if (!r.ok) setErro(chaveDoErroDeAnexo(r.codigo));
    await ler();
    if (vivo.current) setFoco({ item: indice >= 0 ? indice : null });
  };

  const enviar = async (ficheiros: File[], anteriores?: ResultadoEnvio[]) => {
    if (!alvoAnexar || ficheiros.length === 0) return;
    setErro(null);
    const resultados = await anexar(alvoAnexar, ficheiros, undefined, anteriores);
    if (!vivo.current) return;
    setFalhas((antes) => [
      ...antes,
      ...resultados.filter((r) => !r.ok).map((r) => ({ id: proxima.current++, ficheiro: r.ficheiro, codigo: r.codigo ?? "erro_inesperado", anterior: r })),
    ]);
    await ler();
    // Uma repetição que correu bem: o ficheiro entrou na lista e o botão que a pessoa carregou desapareceu; o foco vai ao campo.
    if (vivo.current && anteriores && resultados.every((r) => r.ok)) setFoco({ item: null });
  };

  const escolher = (ficheiros: File[]) => {
    const { aceites, erro: recusa } = escolherAnexos(anexos.length, ficheiros);
    setErro(recusa ? chaveDoErroDeAnexo(recusa) : null);
    void enviar(aceites);
  };

  const tentarOutraVez = (falha: FalhaDeEnvio) => {
    setFalhas((antes) => antes.filter((f) => f.id !== falha.id));
    void enviar([falha.ficheiro], [falha.anterior]);
  };

  if (!lido || (anexos.length === 0 && falhas.length === 0 && !alvoAnexar)) return null;
  const nomesOcultos = anexos.some((a) => a.nome === null);
  const generico = t("rhJust.anexo.generico");

  return (
    <div className="space-y-2" data-testid="rhjd-anexos">
      {anexos.length > 0 && (
        <>
          {nomesOcultos && <p className="text-sm" data-testid="rhjd-anexos-contagem">{t(anexos.length === 1 ? "rhJust.anexo.contagemUm" : "rhJust.anexo.contagem", { n: String(anexos.length) })}</p>}
          <ul ref={lista} aria-label={t("rhJust.anexo.lista")} className="space-y-1 text-sm">
            {anexos.map((a) => {
              const rotulo = rotuloDoAnexo(a, generico);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2" data-testid={`rhjd-anexo-listado-${a.id}`}>
                  <span className="break-all">{rotulo}</span>
                  {a.podeAbrir && (
                    <Button type="button" variant="outline" className="min-h-11" disabled={aOcupar} aria-label={t("rhJust.anexo.abrirNome", { nome: rotulo })} onClick={() => void aAbrir(a)}>
                      {t("rhJust.anexo.abrir")}
                    </Button>
                  )}
                  {a.podeRemover && (
                    <Button type="button" variant="ghost" className="min-h-11" disabled={aOcupar} aria-label={t("rhJust.anexo.removerNome", { nome: rotulo })} onClick={() => void aRemover(a)}>
                      {t("rhJust.anexo.remover")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {ligacao && (
        <p role="status" className="text-sm" data-testid="rhjd-anexo-ligacao">
          {t("rhJust.anexo.abrirBloqueado")}{" "}
          <a href={ligacao} target="_blank" rel="noopener noreferrer" className="font-medium underline">{t("rhJust.anexo.abrirLigacao")}</a>
        </p>
      )}
      {falhas.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid="rhjd-anexo-falhou">
          <span className="break-all">{f.ficheiro.name}</span>
          <span role="alert" className="text-xs font-medium text-destructive">{t(chaveDoErroDeAnexo(f.codigo))}</span>
          <Button type="button" variant="outline" className="min-h-11" disabled={aOcupar} aria-label={t("rhJust.anexo.tentarOutraVezNome", { nome: f.ficheiro.name })} onClick={() => tentarOutraVez(f)}>
            {t("rhJust.anexo.tentarOutraVez")}
          </Button>
        </div>
      ))}
      {alvoAnexar && (
        <div className="space-y-1.5">
          <Label htmlFor={`anexar-${chave}`}>{t("rhJust.anexo.anexar")}</Label>
          <Input
            ref={campo} id={`anexar-${chave}`} type="file" multiple accept={ACCEPT_ANEXOS} className="min-h-11" disabled={aOcupar}
            onChange={(e) => { escolher(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />
          <p role="status" className="text-xs text-muted-foreground">{aOcupar ? t("rhJust.anexo.aEnviar") : ""}</p>
        </div>
      )}
      {erro && <p role="alert" className="text-sm font-medium text-destructive" data-testid="rhjd-anexos-erro">{t(erro, { max: String(MAX_ANEXOS_JUSTIFICACAO_REAIS) })}</p>}
    </div>
  );
}

function alvoDaChave(chave: string): AlvoListagem {
  return chave.startsWith("d:") ? { justificacaoDiaId: chave.slice(2) } : { faltaId: chave.slice(2) };
}
