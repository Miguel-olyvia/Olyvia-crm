import { useEffect, useRef, useState } from "react";
import { Button, Modal, Textarea, cx } from "./ui";
import { Mic } from "./icons";
import { falaSuportada, ouvir, type SessaoFala } from "../lib/fala";
import { interpretarFala, resumoProposta, type IntencaoFala, type PropostaFala } from "../domain/voz";
import { MOTIVOS_ATRASO, ROTULO_MOTIVO_ATRASO, rotuloMotivoAtraso, type MotivoAtraso } from "../domain/atrasos";
import { hojeIso } from "../domain/obras";

/**
 * O botão do microfone: dita-se uma frase, o sistema propõe o que fazer, a
 * pessoa confirma (ou corrige). Nada se grava aqui — quem chama decide:
 *   · atraso → abre a folha "Vai atrasar" já preenchida (com o impacto);
 *   · feita  → o mesmo caminho do botão Terminar;
 *   · nota   → legenda da próxima foto.
 *
 * Sem Web Speech API no browser, o botão aparece desligado e o tooltip diz
 * porquê.
 */
export default function FalarTarefa({
  tarefa,
  intencoes = ["atraso", "feita", "nota"],
  rotulo = "Ditar",
  aoConfirmar,
}: {
  tarefa: { nome: string; inicio_planeado: string | null; fim_planeado: string | null };
  /** O que esta pessoa pode fazer com a frase, por ordem de preferência. */
  intencoes?: readonly IntencaoFala[];
  rotulo?: string;
  aoConfirmar: (p: PropostaFala) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const suportada = falaSuportada();

  if (!suportada) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center gap-1.5 text-sm text-slate-300"
        title="O ditado não funciona neste browser. Usa o Chrome (Android ou computador) ou o Safari."
        aria-disabled="true"
      >
        <Mic width={15} height={15} /> {rotulo}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand"
        title="Fala e o sistema propõe o que registar"
      >
        <Mic width={15} height={15} /> {rotulo}
      </button>
      {aberto && (
        <FolhaDitado
          tarefa={tarefa}
          intencoes={intencoes}
          aoFechar={() => setAberto(false)}
          aoConfirmar={(p) => {
            setAberto(false);
            aoConfirmar(p);
          }}
        />
      )}
    </>
  );
}

const ROTULO_INTENCAO: Record<IntencaoFala, string> = {
  atraso: "Atraso",
  feita: "Está feita",
  nota: "Nota / legenda",
};

export function FolhaDitado({
  tarefa,
  intencoes,
  aoFechar,
  aoConfirmar,
  hoje = hojeIso(),
}: {
  tarefa: { nome: string; inicio_planeado: string | null; fim_planeado: string | null };
  intencoes: readonly IntencaoFala[];
  aoFechar: () => void;
  aoConfirmar: (p: PropostaFala) => void;
  hoje?: string;
}) {
  const [aOuvir, setAOuvir] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [proposta, setProposta] = useState<PropostaFala | null>(null);
  const sessao = useRef<SessaoFala | null>(null);
  const fimAtual = tarefa.fim_planeado ?? tarefa.inicio_planeado;

  const propor = (frase: string) => {
    const p = interpretarFala(frase, { hoje, fimAtual });
    // A intenção proposta tem de ser uma que esta pessoa pode usar.
    if (!intencoes.includes(p.intencao)) p.intencao = intencoes.includes("nota") ? "nota" : intencoes[0];
    if (p.intencao === "atraso" && !p.motivo) p.motivo = "outro";
    setProposta(p);
  };

  const comecar = () => {
    setErro(null);
    setProposta(null);
    setTexto("");
    const s = ouvir({
      aoTexto: setTexto,
      aoFim: (t) => {
        setAOuvir(false);
        sessao.current = null;
        if (t) setTexto(t);
        if (t) propor(t);
        else setErro("Não se ouviu nada. Carrega no microfone e fala perto do telemóvel.");
      },
      aoErro: (m) => {
        setAOuvir(false);
        sessao.current = null;
        setErro(m);
      },
    });
    sessao.current = s;
    setAOuvir(!!s);
  };

  // Começa a ouvir mal abre; pára se a folha fechar.
  useEffect(() => {
    comecar();
    return () => sessao.current?.cancelar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mudarIntencao = (i: IntencaoFala) =>
    setProposta((p) => (p ? { ...p, intencao: i, motivo: i === "atraso" ? p.motivo ?? "outro" : p.motivo } : p));

  const confirmar = () => {
    if (!proposta) return;
    aoConfirmar({ ...proposta, texto: texto.trim() || proposta.texto });
  };

  return (
    <Modal
      title={`Ditar — ${tarefa.nome}`}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!proposta || aOuvir || !texto.trim()} className="min-w-[8rem]">
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => (aOuvir ? sessao.current?.parar() : comecar())}
            aria-pressed={aOuvir}
            aria-label={aOuvir ? "Parar de ouvir" : "Falar outra vez"}
            className={cx(
              "flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95",
              aOuvir ? "animate-pulse bg-red-600" : "bg-brand"
            )}
          >
            <Mic width={34} height={34} />
          </button>
          <p className="text-sm text-slate-500" aria-live="polite">
            {aOuvir ? "A ouvir… fala e carrega para parar." : proposta ? "Corrige o texto se for preciso." : "Carrega para falar."}
          </p>
        </div>

        <Textarea
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          // Escrito à mão (sem ditado, ou depois de um erro): propõe ao sair da caixa.
          // Com proposta já feita, mantém a escolha da pessoa — o texto segue como está.
          onBlur={() => !proposta && texto.trim() && !aOuvir && propor(texto)}
          placeholder="Ex.: falta o sifão, só chega amanhã"
          className="w-full"
          aria-label="O que foi dito"
        />

        {erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {erro}
          </p>
        )}

        {proposta && (
          <div className="space-y-3 rounded-xl border border-brand/20 bg-brand-50/40 p-3" data-testid="proposta-fala">
            <p className="text-sm font-medium text-slate-800">{resumoProposta(proposta, rotuloMotivoAtraso)}</p>
            {proposta.porque.length > 0 && (
              <p className="text-xs text-slate-500">Porque se ouviu: {proposta.porque.join(", ")}</p>
            )}
            {proposta.intencao === "atraso" && proposta.dataOuvida && !proposta.novoFim && proposta.quantidade == null && (
              <p className="text-xs text-slate-500">
                A data ouvida ({proposta.dataOuvida.split("-").reverse().slice(0, 2).join("/")}) não passa do fim previsto — diz
                quanto tempo a mais na folha seguinte.
              </p>
            )}

            {intencoes.length > 1 && (
              <div className="flex gap-1 rounded-lg bg-white p-1 text-sm ring-1 ring-slate-200">
                {intencoes.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => mudarIntencao(i)}
                    aria-pressed={proposta.intencao === i}
                    className={cx(
                      "flex-1 rounded-md px-2 py-1.5 transition-colors",
                      proposta.intencao === i ? "bg-brand font-medium text-white" : "text-slate-600"
                    )}
                  >
                    {ROTULO_INTENCAO[i]}
                  </button>
                ))}
              </div>
            )}

            {proposta.intencao === "atraso" && (
              <div className="grid grid-cols-2 gap-1.5">
                {MOTIVOS_ATRASO.map((m: MotivoAtraso) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setProposta((p) => (p ? { ...p, motivo: m } : p))}
                    aria-pressed={proposta.motivo === m}
                    className={cx(
                      "min-h-[40px] rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ring-1 ring-inset",
                      proposta.motivo === m ? "bg-brand text-white ring-brand" : "bg-white text-slate-700 ring-slate-200"
                    )}
                  >
                    {ROTULO_MOTIVO_ATRASO[m]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
