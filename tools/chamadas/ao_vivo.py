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
BLOCO = 480  # 30 ms
PRE_ROLL_S = 0.4
PAUSA_FIM_S = 0.8     # silêncio que fecha uma fala
FALA_MAX_S = 20.0     # corta falas longas para o texto ir aparecendo
FALA_MIN_S = 0.35
PISO_MIN = 0.004

COR = {"comercial": "\033[94m", "cliente": "\033[33m", "fim": "\033[0m", "cinza": "\033[90m"}


class Detetor:
    """Separa o som do microfone em falas, por energia, com piso de ruído adaptativo."""

    def __init__(self):
        self.piso = PISO_MIN
        self.buffer: list[np.ndarray] = []
        self.pre: list[np.ndarray] = []
        self.a_falar = False
        self.silencio = 0.0
        self.inicio_s = 0.0
        self.t = 0.0  # tempo absoluto do próximo bloco

    def alimentar(self, bloco: np.ndarray) -> tuple[np.ndarray, float] | None:
        """Devolve (fala, inicio_s) quando uma fala termina; senão None."""
        dur = len(bloco) / TAXA
        rms = float(np.sqrt((bloco ** 2).mean()))
        if not self.a_falar:  # desce depressa, sobe devagar
            self.piso = max(PISO_MIN, rms if rms < self.piso else self.piso * 0.999 + rms * 0.001)
        limiar = max(self.piso * 3.5, PISO_MIN * 2)
        com_som = rms > limiar
        resultado = None
        if self.a_falar:
            self.buffer.append(bloco)
            self.silencio = 0.0 if com_som else self.silencio + dur
            duracao = sum(len(b) for b in self.buffer) / TAXA
            if self.silencio >= PAUSA_FIM_S or duracao >= FALA_MAX_S:
                fala = np.concatenate(self.buffer)
                if self.silencio >= PAUSA_FIM_S:
                    fala = fala[: len(fala) - int((self.silencio - 0.2) * TAXA)]  # tira o silêncio final
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


def _esperar_enter(parar: threading.Event):
    try:
        input()
    except EOFError:
        return
    parar.set()


def correr(nome: str, comercial: str | None, ficheiro: Path | None, rapido: bool, sem_ficha: bool,
           dispositivo: int | None, segundos: float | None = None) -> Path:
    import whisper_local
    from falantes import Falantes

    SAIDA.mkdir(exist_ok=True)
    print("A carregar modelos...", end=" ", flush=True)
    whisper_local.modelo()
    falantes = Falantes.com_voz_registada(comercial) if comercial else Falantes()
    print("pronto." + ("" if comercial else " Sem voz registada: a primeira fala conta como do comercial."))
    print(f"{'A ouvir o microfone' if not ficheiro else 'A ler ' + ficheiro.name}. Enter ou Ctrl+C para terminar.\n")

    fila: queue.Queue = queue.Queue()
    parar = threading.Event()
    if ficheiro:
        threading.Thread(target=_fonte_ficheiro, args=(fila, parar, ficheiro, rapido), daemon=True).start()
    else:
        threading.Thread(target=_fonte_microfone, args=(fila, parar, dispositivo), daemon=True).start()
    threading.Thread(target=_esperar_enter, args=(parar,), daemon=True).start()

    detetor = Detetor()
    gravacao: list[np.ndarray] = []
    segmentos: list[dict] = []
    t0 = time.time()
    caminho_json = SAIDA / f"{nome}.transcricao.json"

    def tratar(fala: np.ndarray, inicio_s: float):
        t_ini = time.time()
        segs = whisper_local.transcrever_trecho(fala, inicio_s)
        if not segs:
            return
        quem, conf = falantes.atribuir(fala)
        texto = " ".join(s["texto"] for s in segs)
        seg = {"inicio": segs[0]["inicio"], "fim": segs[-1]["fim"], "texto": texto, "falante": quem,
               "confianca_falante": conf, "latencia_s": round(time.time() - t_ini, 2)}
        segmentos.append(seg)
        m, s = divmod(int(inicio_s), 60)
        aviso = "" if conf >= 0.3 else " (?)"
        print(f"{COR['cinza']}{m}:{s:02d}{COR['fim']} {COR[quem]}{quem.capitalize()}{aviso}:{COR['fim']} {texto}", flush=True)
        caminho_json.write_text(json.dumps({"ficheiro": f"{nome}.wav", "modo": "direto (microfone)", "segmentos": segmentos},
                                           ensure_ascii=False, indent=2), encoding="utf-8")

    try:
        while not parar.is_set():
            try:
                bloco = fila.get(timeout=0.2)
            except queue.Empty:
                continue
            if bloco is None:
                break
            gravacao.append(bloco)
            if segundos and len(gravacao) * BLOCO / TAXA >= segundos:
                break
            r = detetor.alimentar(bloco)
            if r:
                tratar(*r)
    except KeyboardInterrupt:
        pass
    r = detetor.despejar()
    if r:
        tratar(*r)
    parar.set()

    pcm = np.concatenate(gravacao) if gravacao else np.zeros(0, dtype=np.float32)
    wav = SAIDA / f"{nome}.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(TAXA)
        w.writeframes((np.clip(pcm, -1, 1) * 32767).astype(np.int16).tobytes())
    txt = SAIDA / f"{nome}.transcricao.txt"
    txt.write_text("\n".join(f"[{s['inicio']:6.1f}s] {s['falante'].capitalize()}: {s['texto']}" for s in segmentos), encoding="utf-8")
    caminho_json.write_text(json.dumps({"ficheiro": wav.name, "modo": "direto (microfone)", "modelo": "faster-whisper large-v3",
                                        "segmentos": segmentos}, ensure_ascii=False, indent=2), encoding="utf-8")
    lat = [s["latencia_s"] for s in segmentos]
    print(f"\nChamada terminada: {len(pcm) / TAXA / 60:.1f} min, {len(segmentos)} falas, "
          f"latência média {np.mean(lat) if lat else 0:.1f} s. Gravação em {wav}")
    if sem_ficha or not segmentos:
        return caminho_json
    print("A preencher a ficha com o LLM...", flush=True)
    whisper_local.libertar()  # senão o whisper e o qwen não cabem juntos na GPU
    from extrair import extrair
    from rever import rever
    ext = extrair(caminho_json, AQUI / "campos.json", SAIDA)
    ficha = rever(ext, SAIDA, caminho_json)
    if not ficheiro:
        os.startfile(ficha)  # abre no browser
    return ficha


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--comercial", default=None, help="nome da voz registada em vozes/")
    ap.add_argument("--ficheiro", type=Path, default=None, help="WAV 16 kHz a fingir de microfone")
    ap.add_argument("--rapido", action="store_true", help="com --ficheiro, não espera o tempo real")
    ap.add_argument("--nome", default=None)
    ap.add_argument("--sem-ficha", action="store_true")
    ap.add_argument("--dispositivo", type=int, default=None, help="índice do microfone (python -m sounddevice)")
    ap.add_argument("--segundos", type=float, default=None, help="parar sozinho ao fim deste tempo (testes)")
    a = ap.parse_args()
    nome = a.nome or ("direto-" + datetime.now().strftime("%Y-%m-%d-%H%M"))
    correr(nome, a.comercial, a.ficheiro, a.rapido, a.sem_ficha, a.dispositivo, a.segundos)
