/**
 * Ditar em português (Web Speech API do browser — sem serviços pagos).
 *
 * Chrome/Edge no Android e no computador, e o Safari recente, têm-na; o
 * Firefox não. Sem suporte, o botão do microfone não aparece. O áudio não é
 * guardado em lado nenhum: só o texto chega à aplicação.
 */

interface ResultadoFala {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface EventoFala {
  readonly resultIndex: number;
  readonly results: ArrayLike<ResultadoFala>;
}
interface ErroFala {
  readonly error: string;
}
interface Reconhecedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoFala) => void) | null;
  onerror: ((e: ErroFala) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type ConstrutorReconhecedor = new () => Reconhecedor;

function construtor(): ConstrutorReconhecedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorReconhecedor;
    webkitSpeechRecognition?: ConstrutorReconhecedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function falaSuportada(): boolean {
  return construtor() !== null;
}

export interface SessaoFala {
  parar(): void;
  cancelar(): void;
}

/**
 * Começa a ouvir. `aoTexto` recebe o texto acumulado (provisório incluído) a
 * cada pedaço; `aoFim` o texto final quando a pessoa pára de falar (ou
 * carrega em parar). `aoErro` traduz os erros do browser para português.
 */
export function ouvir(cb: {
  aoTexto: (texto: string) => void;
  aoFim: (texto: string) => void;
  aoErro: (mensagem: string) => void;
}): SessaoFala | null {
  const C = construtor();
  if (!C) return null;
  const r = new C();
  r.lang = "pt-PT";
  r.continuous = true;
  r.interimResults = true;

  let final = "";
  let provisorio = "";
  let acabou = false;

  r.onresult = (e) => {
    provisorio = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) final += res[0].transcript + " ";
      else provisorio += res[0].transcript;
    }
    cb.aoTexto((final + provisorio).trim());
  };
  r.onerror = (e) => {
    acabou = true;
    cb.aoErro(mensagemDeErro(e.error));
  };
  r.onend = () => {
    if (acabou) return;
    acabou = true;
    cb.aoFim((final + provisorio).trim());
  };
  try {
    r.start();
  } catch {
    cb.aoErro("Não foi possível ligar o microfone.");
    return null;
  }
  return {
    parar: () => r.stop(),
    cancelar: () => {
      acabou = true;
      r.abort();
    },
  };
}

export function mensagemDeErro(codigo: string): string {
  switch (codigo) {
    case "not-allowed":
    case "service-not-allowed":
      return "O browser não deixou usar o microfone. Autoriza o microfone para este site e tenta outra vez.";
    case "no-speech":
      return "Não se ouviu nada. Carrega no microfone e fala perto do telemóvel.";
    case "audio-capture":
      return "Não há microfone disponível.";
    case "network":
      return "O ditado precisa de rede. Escreve o texto à mão, ou tenta quando houver rede.";
    case "aborted":
      return "Ditado cancelado.";
    default:
      return "O ditado falhou. Podes escrever o texto à mão.";
  }
}
