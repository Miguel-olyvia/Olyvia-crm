"""Regista a voz de um comercial (uma vez) para o direto saber quem fala.

Grava 20 segundos do microfone e guarda em vozes/<nome>.wav. Durante a gravação a
pessoa fala normalmente: diz o nome, a empresa e o que costuma dizer ao telefone.

Uso:  python registar_voz.py <nome> [--segundos 20] [--de-ficheiro gravacao.wav]
"""
import argparse
import sys
import wave
from pathlib import Path

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

TAXA = 16000
VOZES = Path(__file__).parent / "vozes"


def gravar(segundos: float) -> np.ndarray:
    import sounddevice as sd
    print(f"A gravar {segundos:.0f} s... fale normalmente (nome, empresa, o que diz ao telefone).")
    pcm = sd.rec(int(segundos * TAXA), samplerate=TAXA, channels=1, dtype="float32")
    for i in range(int(segundos)):
        sd.sleep(1000)
        print(f"  {i + 1:2d}/{int(segundos)}", end="\r")
    sd.wait()
    print()
    return pcm[:, 0]


def guardar(nome: str, pcm: np.ndarray) -> Path:
    VOZES.mkdir(exist_ok=True)
    destino = VOZES / f"{nome}.wav"
    with wave.open(str(destino), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes((np.clip(pcm, -1, 1) * 32767).astype(np.int16).tobytes())
    return destino


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("nome")
    ap.add_argument("--segundos", type=float, default=20)
    ap.add_argument("--de-ficheiro", type=Path, default=None, help="usar um WAV 16 kHz já gravado em vez do microfone")
    a = ap.parse_args()
    if a.de_ficheiro:
        from falantes import ler_wav
        pcm = ler_wav(a.de_ficheiro)
    else:
        pcm = gravar(a.segundos)
    nivel = float(np.sqrt((pcm ** 2).mean()))
    if nivel < 0.005:
        print("Aviso: o som está muito baixo. Aproxime-se do microfone e repita.")
    destino = guardar(a.nome, pcm)
    print(f"Voz de {a.nome} guardada em {destino} ({len(pcm) / TAXA:.0f} s)")
