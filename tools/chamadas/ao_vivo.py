"""Transcrição em direto: o telemóvel em alta voz, o microfone do PC a ouvir.

Enquanto a chamada decorre, cada fala é transcrita mal a pessoa faz uma pausa e
aparece no ecrã com quem falou (comercial ou cliente). No fim (Enter ou Ctrl+C)
guarda a gravação e a transcrição, preenche a ficha com o LLM e abre a página de
revisão no browser.

Uso:
  python ao_vivo.py --comercial tiago            # voz registada com registar_voz.py
  python ao_vivo.py                              # sem voz registada: a 1.ª fala é do comercial
  python ao_vivo.py --ficheiro exemplos/chamada-teste-maria-mono.wav [--rapido]
                                                 # testa com um WAV a fingir de microfone
Opções: --nome <nome da chamada>  --sem-ficha (não corre o LLM no fim)  --dispositivo <n>
"""
import argparse
import json
import os
import queue
import sys
import threading
import time
import wave
from datetime import datetime
from pathlib import Path

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

AQUI = Path(__file__).parent
SAIDA = AQUI / "saida"
TAXA = 16000
BLOCO = 512  # 32 ms, o que o VAD Silero espera
PRE_ROLL_S = 0.3
PAUSA_FIM_S = 0.4     # silêncio que fecha uma fala (ao telefone responde-se depressa)
FALA_MAX_S = 20.0     # corta falas longas para o texto ir aparecendo
FALA_MIN_S = 0.35
PISO_MIN = 0.004
VAD_LIMIAR = 0.5

COR = {"comercial": "\033[94m", "cliente": "\033[33m", "fim": "\033[0m", "cinza": "\033[90m"}


class VadSilero:
    """VAD Silero (vem com o faster-whisper), em modo contínuo: guarda o estado entre blocos."""

    def __init__(self):
        import whisper_local  # garante o stub do PyAV antes de importar o faster_whisper
        from faster_whisper.vad import get_vad_model
        self.modelo = get_vad_model()
        self.h = np.zeros((1, 1, 128), dtype="float32")
        self.c = np.zeros((1, 1, 128), dtype="float32")
        self.contexto = np.zeros(64, dtype="float32")

    def prob_fala(self, bloco: np.ndarray) -> float:
        x = np.concatenate([self.contexto, bloco.astype("float32")])[None, :]
        out, self.h, self.c = self.modelo.session.run(None, {"input": x, "h": self.h, "c": self.c})
        self.contexto = bloco[-64:].astype("float32")
        return float(out.reshape(-1)[0])


class Detetor:
    """Separa o som do microfone em falas: o VAD diz se há voz em cada bloco de 32 ms;
    uma pausa fecha a fala. A energia fica só para o medidor e para ignorar o quase silêncio."""

    def __init__(self):
        self.vad = VadSilero()
        self.piso = PISO_MIN
        self.ultimo_rms = 0.0
        self.ultima_prob = 0.0
        self.buffer: list[np.ndarray] = []
        self.pre: list[np.ndarray] = []
        self.a_falar = False
        self.silencio = 0.0
        self.inicio_s = 0.0
        self.t = 0.0  # tempo absoluto do próximo bloco

    def alimentar(self, bloco: np.ndarray) -> tuple[np.ndarray, float] | None:
        """Devolve (fala, inicio_s) quando uma fala termina; senão None."""
        if len(bloco) != BLOCO:
            bloco = np.pad(bloco, (0, BLOCO - len(bloco)))[:BLOCO]
        dur = len(bloco) / TAXA
        rms = float(np.sqrt((bloco ** 2).mean()))
        self.ultimo_rms = rms
        self.piso = max(PISO_MIN, rms if rms < self.piso else self.piso + (rms - self.piso) * 0.002)
        self.ultima_prob = self.vad.prob_fala(bloco)
        com_som = self.ultima_prob >= VAD_LIMIAR and rms > PISO_MIN
        resultado = None
        if self.a_falar:
            self.buffer.append(bloco)
            self.silencio = 0.0 if com_som else self.silencio + dur
            duracao = sum(len(b) for b in self.buffer) / TAXA
            pausa = PAUSA_FIM_S if duracao < 8 else PAUSA_FIM_S * 0.75
            if self.silencio >= pausa or duracao >= FALA_MAX_S:
                fala = np.concatenate(self.buffer)
                if self.silencio >= pausa:
                    fala = fala[: len(fala) - int(max(0, self.silencio - 0.15) * TAXA)]  # tira o silêncio final
                self.buffer, self.a_falar, self.silencio = [], False, 0.0
                if len(fala) >= FALA_MIN_S * TAXA:
                    resultado = (fala, self.inicio_s)
        elif com_som:
            self.a_falar = True
            self.buffer = self.pre + [bloco]
            self.inicio_s = self.t - len(self.pre) * dur
            self.pre = []
        else:
            self.pre.append(bloco)
            self.pre = self.pre[-int(PRE_ROLL_S / dur):]
        self.t += dur
        return resultado

    def despejar(self) -> tuple[np.ndarray, float] | None:
        if self.a_falar and self.buffer:
            fala = np.concatenate(self.buffer)
            self.buffer, self.a_falar = [], False
            if len(fala) >= FALA_MIN_S * TAXA:
                return fala, self.inicio_s
        return None


def _fonte_microfone(fila: queue.Queue, parar: threading.Event, dispositivo: int | None):
    import sounddevice as sd

    def cb(indata, frames, t, status):
        if status:
            print(COR["cinza"] + f"[áudio] {status}" + COR["fim"])
        fila.put(indata[:, 0].copy())

    with sd.InputStream(samplerate=TAXA, channels=1, dtype="float32", blocksize=BLOCO, callback=cb, device=dispositivo):
        while not parar.is_set():
            time.sleep(0.1)


def _fonte_ficheiro(fila: queue.Queue, parar: threading.Event, wav: Path, rapido: bool):
    from falantes import ler_wav
    pcm = ler_wav(wav)
    for i in range(0, len(pcm), BLOCO):
        if parar.is_set():
            return
        fila.put(pcm[i:i + BLOCO])
        if not rapido:
            time.sleep(BLOCO / TAXA)
    fila.put(None)  # fim do ficheiro


def _limpar_teclado():
    """Deita fora Enters que ficaram no teclado (por exemplo durante o registo da voz)."""
    if os.name == "nt":
        import msvcrt
        while msvcrt.kbhit():
            msvcrt.getwch()


def _esperar_enter(parar: threading.Event):
    try:
        _limpar_teclado()
        input()
    except EOFError:
        return
    parar.set()


class Sessao:
    """Uma chamada em direto: recebe áudio em blocos, devolve as falas transcritas com o
    falante, e no fim guarda tudo e preenche a ficha. Serve o Terminal e o servidor web."""

    def __init__(self, nome: str, comercial: str | None = None, primeiro: str = "cliente"):
        import whisper_local
        from falantes import Falantes
        SAIDA.mkdir(exist_ok=True)
        whisper_local.modelo()
        self.whisper = whisper_local
        self.nome = nome
        self.falantes = Falantes.com_voz_registada(comercial) if comercial else Falantes(primeiro=primeiro)
        self.detetor = Detetor()
        self.gravacao: list[np.ndarray] = []
        self.segmentos: list[dict] = []
        self.wav = SAIDA / f"{nome}.wav"
        self.json = SAIDA / f"{nome}.transcricao.json"
        self._ultima_gravacao = time.time()
        self._resto = np.zeros(0, dtype=np.float32)

    # ---- entrada de áudio -------------------------------------------------
    def alimentar(self, pcm: np.ndarray) -> list[dict]:
        """Recebe áudio float32 a 16 kHz (qualquer tamanho) e devolve as falas novas."""
        novas: list[dict] = []
        dados = np.concatenate([self._resto, pcm.astype(np.float32)])
        n = (len(dados) // BLOCO) * BLOCO
        self._resto = dados[n:]
        for i in range(0, n, BLOCO):
            bloco = dados[i:i + BLOCO]
            self.gravacao.append(bloco)
            r = self.detetor.alimentar(bloco)
            if r:
                novas += self._tratar(*r)
        if time.time() - self._ultima_gravacao >= 30:
            self._ultima_gravacao = time.time()
            self.guardar_wav()
        return novas

    def nivel(self) -> dict:
        d = self.detetor
        return {"som": round(d.ultimo_rms, 3), "voz": round(d.ultima_prob, 2), "a_falar": d.a_falar,
                "segundos": round(len(self.gravacao) * BLOCO / TAXA)}

    # ---- transcrição e falante --------------------------------------------
    def _tratar(self, fala: np.ndarray, inicio_s: float) -> list[dict]:
        t_ini = time.time()
        segs = self.whisper.transcrever_trecho(fala, inicio_s)
        if not segs:
            return []
        # quem fala, frase a frase: ao telefone a resposta vem colada à pergunta e a mesma
        # "fala" traz as duas pessoas. Frases curtas herdam o falante da fala inteira.
        quem_fala, conf_fala = self.falantes.atribuir(fala)
        linhas: list[dict] = []
        for sg in segs:
            a, b = int((sg["inicio"] - inicio_s) * TAXA), int((sg["fim"] - inicio_s) * TAXA)
            trecho = fala[max(0, a):min(len(fala), b)]
            if len(trecho) >= 0.7 * TAXA and len(segs) > 1:
                quem, conf = self.falantes.atribuir(trecho)
            else:
                quem, conf = quem_fala, conf_fala
            if linhas and linhas[-1]["falante"] == quem:
                linhas[-1]["texto"] += " " + sg["texto"]
                linhas[-1]["fim"] = sg["fim"]
                linhas[-1]["confianca_falante"] = min(linhas[-1]["confianca_falante"], conf)
            else:
                linhas.append({"inicio": sg["inicio"], "fim": sg["fim"], "texto": sg["texto"], "falante": quem,
                               "confianca_falante": conf})
        latencia = round(time.time() - t_ini, 2)
        for seg in linhas:
            seg["latencia_s"] = latencia
            self.segmentos.append(seg)
        self._guardar_json(parcial=True)
        return linhas

    # ---- fim ---------------------------------------------------------------
    def guardar_wav(self) -> np.ndarray:
        pcm = np.concatenate(self.gravacao) if self.gravacao else np.zeros(0, dtype=np.float32)
        with wave.open(str(self.wav), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(TAXA)
            w.writeframes((np.clip(pcm, -1, 1) * 32767).astype(np.int16).tobytes())
        return pcm

    def _guardar_json(self, parcial: bool) -> None:
        dados = {"ficheiro": self.wav.name, "modo": "direto (microfone)", "modelo": "faster-whisper large-v3",
                 "parcial": parcial, "segmentos": self.segmentos}
        self.json.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def definicao_da_app(campos: list[dict]) -> dict:
        """Os campos da app (Def de src/emylia/campos.ts: k, l, t, op, ajuda) na forma de campos.json."""
        tipos = {"sim_nao": "sim_nao", "escolha": "escolha", "varios": "texto", "numero": "numero", "contador": "numero",
                 "texto": "texto", "texto_longo": "texto_longo", "data": "texto"}
        lista = []
        for c in campos:
            tipo = tipos.get(c.get("t", "texto"), "texto")
            ajuda = c.get("ajuda") or ""
            if c.get("t") == "varios" and c.get("op"):
                ajuda = (ajuda + " " if ajuda else "") + "Lista separada por vírgulas, de entre: " + ", ".join(c["op"])
            elif c.get("t") == "data":
                ajuda = (ajuda + " " if ajuda else "") + "Data no formato AAAA-MM-DD, se for dita."
            lista.append({"chave": c["k"], "rotulo": c.get("l", c["k"]), "tipo": tipo, "ajuda": ajuda or None,
                          "opcoes": [{"valor": o, "rotulo": o} for o in (c.get("op") or [])] if tipo == "escolha" else [],
                          "unidade": c.get("un"), "casas_decimais": 2 if c.get("t") == "numero" else 0})
        return {"fichas": [{"ficha": "negocio", "rotulo": "Lead e Contacto", "campos": lista}]}

    def terminar(self, com_ficha: bool = True, campos: list[dict] | None = None) -> dict:
        """Fecha a chamada: última fala, WAV, transcrição e, se pedido, a ficha de revisão.
        Com `campos` (os da app), a extração usa-os em vez de campos.json e devolve-a em `extracao`."""
        r = self.detetor.despejar()
        novas = self._tratar(*r) if r else []
        pcm = self.guardar_wav()
        (SAIDA / f"{self.nome}.transcricao.txt").write_text(
            "\n".join(f"[{s['inicio']:6.1f}s] {s['falante'].capitalize()}: {s['texto']}" for s in self.segmentos), encoding="utf-8")
        self._guardar_json(parcial=False)
        lat = [s["latencia_s"] for s in self.segmentos]
        resultado = {"nome": self.nome, "minutos": round(len(pcm) / TAXA / 60, 1), "falas": len(self.segmentos),
                     "latencia_media": round(float(np.mean(lat)), 2) if lat else 0.0, "wav": str(self.wav),
                     "transcricao": str(self.json), "novas": novas, "ficha": None}
        resultado["extracao"] = None
        if com_ficha and self.segmentos:
            self.whisper.libertar()  # senão o whisper e o qwen não cabem juntos na GPU
            from extrair import extrair
            from rever import rever
            definicao = self.definicao_da_app(campos) if campos else None
            ext = extrair(self.json, AQUI / "campos.json", SAIDA, definicao)
            resultado["extracao"] = json.loads(ext.read_text(encoding="utf-8"))
            resultado["ficha"] = str(rever(ext, SAIDA, self.json))
        return resultado


def _imprimir(seg: dict) -> None:
    m, s = divmod(int(seg["inicio"]), 60)
    aviso = "" if seg["confianca_falante"] >= 0.3 else " (?)"
    print(f"{COR['cinza']}{m}:{s:02d}{COR['fim']} {COR[seg['falante']]}{seg['falante'].capitalize()}{aviso}:{COR['fim']} {seg['texto']}", flush=True)


def correr(nome: str, comercial: str | None, ficheiro: Path | None, rapido: bool, sem_ficha: bool,
           dispositivo: int | None, segundos: float | None = None, primeiro: str = "cliente") -> Path:
    print("A carregar modelos...", end=" ", flush=True)
    sessao = Sessao(nome, comercial, primeiro)
    print("pronto." + ("" if comercial else f" Sem voz registada: a primeira voz conta como do {primeiro}."))
    print(f"{'A ouvir o microfone' if not ficheiro else 'A ler ' + ficheiro.name}. Enter ou Ctrl+C para terminar.\n")

    fila: queue.Queue = queue.Queue()
    parar = threading.Event()
    if ficheiro:
        threading.Thread(target=_fonte_ficheiro, args=(fila, parar, ficheiro, rapido), daemon=True).start()
    else:
        threading.Thread(target=_fonte_microfone, args=(fila, parar, dispositivo), daemon=True).start()
    threading.Thread(target=_esperar_enter, args=(parar,), daemon=True).start()

    ultimo_nivel = time.time()
    try:
        while not parar.is_set():
            try:
                bloco = fila.get(timeout=0.2)
            except queue.Empty:
                continue
            if bloco is None:
                break
            for seg in sessao.alimentar(bloco):
                _imprimir(seg)
            if segundos and len(sessao.gravacao) * BLOCO / TAXA >= segundos:
                break
            if not ficheiro and time.time() - ultimo_nivel >= 5:
                ultimo_nivel = time.time()
                n = sessao.nivel()
                barra = "▮" * min(20, int(n["som"] * 100))
                estado = "a ouvir fala" if n["a_falar"] else "silêncio"
                print(f"{COR['cinza']}   som {n['som']:.3f} voz {n['voz']:.2f} {estado} {barra}{COR['fim']}", flush=True)
    except KeyboardInterrupt:
        pass
    parar.set()
    if not sem_ficha:
        print("\nA terminar e a preencher a ficha com o LLM...", flush=True)
    r = sessao.terminar(com_ficha=not sem_ficha)
    for seg in r["novas"]:
        _imprimir(seg)
    print(f"\nChamada terminada: {r['minutos']} min, {r['falas']} falas, latência média {r['latencia_media']} s. Gravação em {r['wav']}")
    if r["ficha"]:
        if not ficheiro:
            os.startfile(r["ficha"])  # abre no browser
        return Path(r["ficha"])
    return Path(r["transcricao"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--comercial", default=None, help="nome da voz registada em vozes/")
    ap.add_argument("--ficheiro", type=Path, default=None, help="WAV 16 kHz a fingir de microfone")
    ap.add_argument("--rapido", action="store_true", help="com --ficheiro, não espera o tempo real")
    ap.add_argument("--nome", default=None)
    ap.add_argument("--sem-ficha", action="store_true")
    ap.add_argument("--dispositivo", type=int, default=None, help="índice do microfone (python -m sounddevice)")
    ap.add_argument("--segundos", type=float, default=None, help="parar sozinho ao fim deste tempo (testes)")
    ap.add_argument("--primeiro", choices=["cliente", "comercial"], default="cliente",
                    help="sem voz registada, de quem é a primeira voz (numa chamada de saída é o cliente a atender)")
    a = ap.parse_args()
    nome = a.nome or ("direto-" + datetime.now().strftime("%Y-%m-%d-%H%M"))
    correr(nome, a.comercial, a.ficheiro, a.rapido, a.sem_ficha, a.dispositivo, a.segundos, a.primeiro)
