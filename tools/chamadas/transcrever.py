"""Transcreve uma gravação de chamada com o whisper.cpp local (GPU).

- Converte qualquer formato (mp3, m4a, wav, ogg) para WAV 16 kHz com ffmpeg.
- Se a gravação for estéreo (um canal por pessoa, como nas centrais), transcreve
  cada canal à parte e junta pelos tempos: fica cada frase com o seu falante.
- Se for mono, transcreve tudo como um só falante (sem diarização nesta versão).

Uso:  python transcrever.py <audio> [--saida pasta] [--comercial esquerdo|direito]
Sai:  <nome>.transcricao.json  e  <nome>.transcricao.txt
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

WHISPER = Path(os.environ.get("CHAMADAS_WHISPER", r"D:\tools\whisper\cuda\Release\whisper-cli.exe"))
MODELO = Path(os.environ.get("CHAMADAS_WHISPER_MODELO", r"D:\tools\whisper\ggml-large-v3.bin"))
PROMPT = ("Chamada telefónica em português de Portugal entre um comercial da Mudelar, empresa de "
          "remodelações, e um cliente. Fala-se de casa de banho, cozinha, tipologia, elevador, "
          "estacionamento, orçamento e visita.")
TAXA = 16000


def _canais(audio: Path) -> int:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                          "stream=channels", "-of", "csv=p=0", str(audio)], capture_output=True, text=True, check=True)
    return int(out.stdout.strip() or "1")


def _wav16k(audio: Path, destino: Path, canal: int | None) -> Path:
    filtro = [] if canal is None else ["-af", f"pan=mono|c0=c{canal}"]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(audio), *filtro, "-ac", "1", "-ar", "16000",
                    "-c:a", "pcm_s16le", str(destino)], check=True)
    return destino


def _ler_wav(wav: Path) -> np.ndarray:
    with wave.open(str(wav), "rb") as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def _regioes_de_fala(pcm: np.ndarray, janela_s: float = 0.03, limiar: float = 300.0,
                     margem_s: float = 0.25, juntar_s: float = 0.8) -> list[tuple[int, int]]:
    """Regiões (início, fim) em amostras onde há som, por energia RMS. Chega para
    separar fala de silêncio num canal de central; não substitui um VAD a sério."""
    j = int(janela_s * TAXA)
    n = len(pcm) // j
    rms = np.sqrt((pcm[: n * j].astype(np.float64).reshape(n, j) ** 2).mean(axis=1))
    com_som = rms > limiar
    regioes: list[list[int]] = []
    for i, ativo in enumerate(com_som):
        if not ativo:
            continue
        ini, fim = i * j, (i + 1) * j
        if regioes and ini - regioes[-1][1] <= juntar_s * TAXA:
            regioes[-1][1] = fim
        else:
            regioes.append([ini, fim])
    m = int(margem_s * TAXA)
    return [(max(0, a - m), min(len(pcm), b + m)) for a, b in regioes]


def _whisper_bruto(wav: Path, prefixo: Path) -> list[dict]:
    cmd = [str(WHISPER), "-m", str(MODELO), "-f", str(wav), "-l", "pt", "-bs", "5", "-mc", "0",
           "-oj", "-of", str(prefixo), "-np"]  # sem --prompt: fora do tema o whisper repetia-o
    subprocess.run(cmd, check=True, capture_output=True)
    dados = json.loads(Path(str(prefixo) + ".json").read_text(encoding="utf-8"))
    segs = []
    for s in dados.get("transcription", []):
        texto = s.get("text", "").strip()
        if texto:
            segs.append({"inicio": s["offsets"]["from"] / 1000, "fim": s["offsets"]["to"] / 1000, "texto": texto})
    return segs


def _whisper(wav: Path, prefixo: Path) -> list[dict]:
    """Transcreve só as regiões com fala (coladas, com 0,5 s entre elas) e devolve
    os segmentos com os tempos da gravação original. O whisper perde-se com
    silêncios longos, que é o normal num canal de central telefónica."""
    pcm = _ler_wav(wav)
    regioes = _regioes_de_fala(pcm)
    if not regioes:
        return []
    gap = np.zeros(int(0.5 * TAXA), dtype=np.int16)
    partes, mapa, t = [], [], 0  # mapa: (inicio_colado, inicio_original, duracao) em amostras
    for a, b in regioes:
        partes += [pcm[a:b], gap]
        mapa.append((t, a, b - a))
        t += (b - a) + len(gap)
    colado = prefixo.with_name(prefixo.name + "-colado.wav")
    with wave.open(str(colado), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(TAXA)
        w.writeframes(np.concatenate(partes).tobytes())

    def original(seg_s: float) -> float:
        x = int(seg_s * TAXA)
        for ini_c, ini_o, dur in mapa:
            if x < ini_c + dur + len(gap):
                return (ini_o + max(0, x - ini_c)) / TAXA
        return (mapa[-1][1] + mapa[-1][2]) / TAXA

    segs = []
    for s in _whisper_bruto(colado, prefixo):
        segs.append({"inicio": round(original(s["inicio"]), 2), "fim": round(original(s["fim"]), 2), "texto": s["texto"]})
    return segs


def transcrever(audio: Path, saida: Path, comercial: str = "esquerdo") -> Path:
    saida.mkdir(parents=True, exist_ok=True)
    nome = audio.stem
    n = _canais(audio)
    segmentos: list[dict] = []
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        if n >= 2:
            papeis = {0: "comercial", 1: "cliente"} if comercial == "esquerdo" else {0: "cliente", 1: "comercial"}
            for canal, papel in papeis.items():
                wav = _wav16k(audio, t / f"{papel}.wav", canal)
                for s in _whisper(wav, t / papel):
                    s["falante"] = papel
                    segmentos.append(s)
            segmentos.sort(key=lambda s: s["inicio"])
            modo = "estereo (um canal por falante)"
        else:
            wav = _wav16k(audio, t / "mono.wav", None)
            for s in _whisper(wav, t / "mono"):
                s["falante"] = "desconhecido"
                segmentos.append(s)
            modo = "mono (sem separação de falantes)"
    resultado = {"ficheiro": audio.name, "modo": modo, "modelo": MODELO.name, "segmentos": segmentos}
    (saida / f"{nome}.transcricao.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
    linhas = [f"[{s['inicio']:6.1f}s] {s['falante'].capitalize()}: {s['texto']}" for s in segmentos]
    txt = saida / f"{nome}.transcricao.txt"
    txt.write_text("\n".join(linhas), encoding="utf-8")
    print(f"{audio.name}: {len(segmentos)} segmentos, {modo} → {txt}")
    return saida / f"{nome}.transcricao.json"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", type=Path)
    ap.add_argument("--saida", type=Path, default=Path(__file__).parent / "saida")
    ap.add_argument("--comercial", choices=["esquerdo", "direito"], default="esquerdo",
                    help="canal onde está o comercial numa gravação estéreo")
    a = ap.parse_args()
    transcrever(a.audio, a.saida, a.comercial)
