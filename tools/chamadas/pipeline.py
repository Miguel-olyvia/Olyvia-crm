"""Pipeline das chamadas: gravação → transcrição (whisper local) → campos (LLM) → ficha de revisão.

Uso:
  python pipeline.py <gravacao.wav|mp3|m4a>      trata um ficheiro
  python pipeline.py --vigiar                      fica a ver a pasta entrada/ e trata o que lá cair

Tudo o que sai vai para saida/<nome>.*  (transcricao.json, transcricao.txt, extracao.json, revisao.html).
Na pasta vigiada, a gravação tratada é movida para saida/ ao lado dos resultados.
"""
import argparse
import shutil
import sys
import time
from pathlib import Path

from extrair import extrair
from rever import rever
from transcrever import transcrever

sys.stdout.reconfigure(encoding="utf-8")

AQUI = Path(__file__).parent
ENTRADA = AQUI / "entrada"
SAIDA = AQUI / "saida"
CAMPOS = AQUI / "campos.json"
EXTENSOES = {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".flac", ".aac", ".wma"}


def tratar(audio: Path, saida: Path = SAIDA, comercial: str = "esquerdo") -> Path:
    t0 = time.time()
    print(f"\n=== {audio.name} ===")
    trans = transcrever(audio, saida, comercial)
    ext = extrair(trans, CAMPOS, saida)
    ficha = rever(ext, saida, trans)
    print(f"Pronto em {time.time() - t0:.0f} s → {ficha}")
    return ficha


def vigiar(entrada: Path = ENTRADA, saida: Path = SAIDA, intervalo: float = 5.0) -> None:
    entrada.mkdir(exist_ok=True)
    print(f"A vigiar {entrada} (Ctrl+C para parar)")
    while True:
        for audio in sorted(p for p in entrada.iterdir() if p.suffix.lower() in EXTENSOES):
            # espera que o ficheiro deixe de crescer (cópia a meio)
            tamanho = audio.stat().st_size
            time.sleep(2)
            if audio.stat().st_size != tamanho:
                continue
            try:
                tratar(audio, saida)
                shutil.move(str(audio), str(saida / audio.name))
            except Exception as e:  # noqa: BLE001 — segue para o próximo, fica no log
                print(f"ERRO em {audio.name}: {e}")
                falhados = entrada / "falhados"
                falhados.mkdir(exist_ok=True)
                shutil.move(str(audio), str(falhados / audio.name))
        time.sleep(intervalo)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", nargs="?", type=Path)
    ap.add_argument("--vigiar", action="store_true")
    ap.add_argument("--comercial", choices=["esquerdo", "direito"], default="esquerdo")
    a = ap.parse_args()
    if a.vigiar:
        vigiar()
    elif a.audio:
        tratar(a.audio, comercial=a.comercial)
    else:
        ap.error("indique uma gravação ou --vigiar")
