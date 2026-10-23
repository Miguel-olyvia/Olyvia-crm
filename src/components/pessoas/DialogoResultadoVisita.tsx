// «Resultado da visita»: o diálogo que regista como correu uma visita (interessado, a pensar, sem interesse, obra inviável). Os dois últimos
// encerram a abordagem (sem negócio) e pedem o motivo; com um negócio aberto só há os dois primeiros. O aviso para o leitor de ecrã só sai
// depois de o diálogo fechar (enquanto sai, o resto da página está escondido do leitor).
import { useId, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/negocio-metas/estilos";
import { RESULTADOS_VISITA, resultadoEncerra, type ResultadoVisita, type VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { DadosResultadoVisita } from "./acoesVisitaPessoa";
import { classeCartao } from "./cartaoOpcao";
import { CamposMotivo, erroDoMotivo } from "./CamposMotivo";
import { ErroAcao } from "./ErroAcao";
import { focarLinhaVisita } from "./focoVisita";
import { diaDaSemana, textoDiaCompleto } from "./formatoPessoas";
import { Visto } from "./OpcoesResultado";
import type { MotivoEncerramento, Pessoa } from "./pessoasTipos";
import { ehAcaoAssincrona } from "./seguirAcao";
import { useExecutarAcao } from "./useExecutarAcao";

const R = "pessoasPagina.visitResult.";

interface DialogoResultadoVisitaProps {
  /** A visita a que se regista o resultado; `null` com o diálogo fechado. */
  visita: VisitaPessoa | null;
  pessoa: Pessoa;
  /** A pessoa tem um negócio aberto: não há abordagem a encerrar, por isso só há os resultados que a deixam seguir. */
  comNegocioAberto: boolean;
  aoGuardar: (visitaId: string, dados: DadosResultadoVisita) => void | Promise<void>;
  aoFechar: () => void;
  /** Diz uma frase ao leitor de ecrã, já com o diálogo fechado. */
  aoAnunciar: (mensagem: string) => void;
}

interface FormResultadoProps extends Omit<DialogoResultadoVisitaProps, "aoAnunciar"> {
  visita: VisitaPessoa;
  aoPendente: (m: string) => void;
  /** Avisa o diálogo de que começou ou acabou de gravar na base (para não se deixar fechar a meio). */
  aoOcupado: (ocupado: boolean) => void;
}

function FormResultado({ visita, pessoa, comNegocioAberto, aoGuardar, aoFechar, aoPendente, aoOcupado }: FormResultadoProps) {
  const { t } = useTranslation();
  const nome = useId();
  const idLegenda = useId();
  const idDica = useId();
  const [resultado, setResultado] = useState<ResultadoVisita | "">("");
  const [motivo, setMotivo] = useState<MotivoEncerramento | "">("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const opcoes = RESULTADOS_VISITA.filter((r) => !comNegocioAberto || !resultadoEncerra(r));
  const encerra = resultado !== "" && resultadoEncerra(resultado);
  const incompleto = resultado === "" || (encerra && erroDoMotivo(motivo, motivoOutro) !== null);
  const acao = useExecutarAcao();
  const guardar = () => {
    if (resultado === "" || incompleto) return;
    const dados: DadosResultadoVisita = encerra
      ? { resultado, motivo: motivo === "" ? undefined : motivo, motivoOutro: motivo === "outro" ? motivoOutro.trim() : undefined }
      : { resultado };
    // Só fecha (e só anuncia) quando a ação terminou: na base pode demorar ou falhar, e então o erro fica à vista aqui dentro.
    const mensagem = t(`${R}done`, { name: pessoa.nome, result: t(`${R}result.${resultado}`) });
    acao.executar(() => {
      const resposta = aoGuardar(visita.id, dados);
      if (!ehAcaoAssincrona(resposta)) return resposta;
      // Lê-se no instante do clique (antes de qualquer render): daí a ref do pai, e não só o estado de `acao`.
      aoOcupado(true);
      return resposta.finally(() => aoOcupado(false));
    }, () => {
      aoPendente(mensagem);
      aoFechar();
    }, mensagem);
  };
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-labelledby={idLegenda} className="space-y-2">
        <p id={idLegenda} className="text-sm font-semibold text-foreground">{t(`${R}label`)}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {opcoes.map((r) => (
            <label key={r} className="relative flex cursor-pointer">
              {/* aria-disabled e não disabled: desativar o rádio com o foco nele deixava o foco cair para o body, dentro do diálogo. */}
              <input
                type="radio" name={nome} className="peer sr-only" checked={resultado === r} aria-disabled={acao.aGuardar || undefined}
                onChange={() => { if (!acao.aGuardar) setResultado(r); }}
              />
              <span className={classeCartao(resultado === r)}>
                {t(`${R}result.${r}`)}
                <Visto escolhido={resultado === r} />
              </span>
            </label>
          ))}
        </div>
      </div>
      {encerra && (
        <>
          <p className="text-sm text-foreground">{t(`${R}closesHint`)}</p>
          <CamposMotivo
            motivo={motivo} motivoOutro={motivoOutro} erro={null} rotulo={t("pessoasPagina.close.reasonLabel")}
            aoMudar={(p) => { if (p.motivo !== undefined) setMotivo(p.motivo); if (p.motivoOutro !== undefined) setMotivoOutro(p.motivoOutro); }}
          />
        </>
      )}
      <ErroAcao chave={acao.erro} chaveExtra={acao.erroExtra} />
      <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:space-x-0">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button" variant="outline" className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
            aria-disabled={acao.aGuardar || undefined} onClick={() => { if (!acao.aGuardar) aoFechar(); }}
          >
            {t(`${R}cancel`)}
          </Button>
          <Button
            type="button" aria-disabled={incompleto || acao.aGuardar || undefined} aria-busy={acao.aGuardar || undefined}
            aria-describedby={incompleto ? idDica : undefined}
            className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)} onClick={() => { if (!acao.aGuardar) guardar(); }}
          >
            {acao.aGuardar ? t("pessoasPagina.real.ficha.saving") : t(`${R}save`)}
          </Button>
        </div>
        {incompleto && <p id={idDica} className="text-xs text-muted-foreground">{t(`${R}hintMissing`)}</p>}
      </DialogFooter>
    </div>
  );
}

export function DialogoResultadoVisita({ visita, pessoa, comNegocioAberto, aoGuardar, aoFechar, aoAnunciar }: DialogoResultadoVisitaProps) {
  const { t } = useTranslation();
  // Enquanto o diálogo sai, continua a mostrar a última visita (o formulário não se remonta a meio da saída).
  const ultima = useRef(visita);
  if (visita) ultima.current = visita;
  const mostrada = visita ?? ultima.current;
  const pendente = useRef<string | null>(null);
  // Uma gravação na base está a correr: o diálogo não se deixa fechar (Escape, clique fora, «Cancelar»).
  const ocupado = useRef(false);
  const quando = mostrada ? `${t(`pessoasPagina.weekday.${diaDaSemana(mostrada.data)}`)}, ${textoDiaCompleto(mostrada.data)}` : "";
  return (
    <Dialog open={visita !== null} onOpenChange={(aberto) => { if (!aberto && !ocupado.current) aoFechar(); }}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto motion-reduce:!animate-none"
        onEscapeKeyDown={(e) => { if (ocupado.current) e.preventDefault(); }}
        onInteractOutside={(e) => { if (ocupado.current) e.preventDefault(); }}
        onCloseAutoFocus={(e) => {
          const mensagem = pendente.current;
          pendente.current = null;
          if (!mensagem) return;
          // Registado o resultado, o botão que abriu o diálogo deixa de existir: o foco vai para a linha da visita.
          if (mostrada && focarLinhaVisita(mostrada.id)) e.preventDefault();
          aoAnunciar(mensagem);
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(`${R}title`)}</DialogTitle>
          <DialogDescription>{t(`${R}description`, { when: quando, name: pessoa.nome })}</DialogDescription>
        </DialogHeader>
        {mostrada && (
          <FormResultado
            key={mostrada.id} visita={mostrada} pessoa={pessoa} comNegocioAberto={comNegocioAberto} aoGuardar={aoGuardar} aoFechar={aoFechar}
            aoPendente={(m) => { pendente.current = m; }} aoOcupado={(a) => { ocupado.current = a; }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
