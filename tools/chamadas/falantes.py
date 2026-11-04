"""Quem está a falar: comercial ou cliente, pela voz.

Usa o modelo ECAPA do SpeechBrain (CPU chega) para tirar uma "impressão" da voz
de cada fala. Duas formas de decidir:

1. Com a voz do comercial registada (vozes/<nome>.wav, feita com registar_voz.py):
   cada fala é comparada com essa voz. Parecida: comercial. Caso contrário: cliente.
   É a forma fiável e é a que se deve usar no dia a dia.
2. Sem registo: a primeira fala é do comercial (é ele que liga) e a partir daí
   cada voz nova vai para o grupo mais parecido. Serve para testar.

As falas muito curtas (menos de 0,7 s) têm impressão fraca: ficam com confiança baixa.
"""
import os
import sys
import wave
from pathlib import Path

import numpy as np

AQUI = Path(__file__).parent
VOZES = AQUI / "vozes"
TAXA = 16000
MIN_S = 0.7
LIMIAR_MESMA_VOZ = float(os.environ.get("CHAMADAS_LIMIAR_VOZ", "0.3"))

_codificador = None


def _carregar():
    global _codificador
    if _codificador is not None:
        return _codificador
    import torch  # noqa: F401
    from speechbrain.inference.speaker import EncoderClassifier
    kw = {"source": "speechbrain/spkrec-ecapa-voxceleb", "savedir": str(AQUI / ".modelos" / "ecapa"),
          "run_opts": {"device": "cpu"}}
    try:
        from speechbrain.utils.fetching import LocalStrategy
        kw["local_strategy"] = LocalStrategy.COPY  # no Windows os symlinks pedem privilégios
    except ImportError:
        pass
    _codificador = EncoderClassifier.from_hparams(**kw)
    return _codificador


def ler_wav(caminho: Path) -> np.ndarray:
    """WAV 16 kHz mono → float32 em [-1, 1]. Se for estéreo, fica a soma."""
    with wave.open(str(caminho), "rb") as w:
        assert w.getframerate() == TAXA, f"{caminho}: esperava 16 kHz, tem {w.getframerate()}"
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        if w.getnchannels() > 1:
            pcm = pcm.reshape(-1, w.getnchannels()).mean(axis=1)
    return pcm


def impressao(pcm: np.ndarray) -> np.ndarray:
    """Vetor unitário que descreve a voz de um trecho (float32 a 16 kHz)."""
    import torch
    cod = _carregar()
    with torch.no_grad():
        x = torch.from_numpy(np.ascontiguousarray(pcm, dtype=np.float32)).unsqueeze(0)
        e = cod.encode_batch(x).squeeze().cpu().numpy().astype(np.float32)
    return e / (np.linalg.norm(e) + 1e-9)


def impressao_de_ficheiro(wav: Path) -> np.ndarray:
    return impressao(ler_wav(wav))


class Falantes:
    """Decide, fala a fala, se é o comercial ou o cliente."""

    def __init__(self, voz_comercial: np.ndarray | None = None):
        self.comercial = voz_comercial
        self.registado = voz_comercial is not None
        self.cliente: np.ndarray | None = None
        self.n_comercial = 0
        self.n_cliente = 0

    @classmethod
    def com_voz_registada(cls, nome: str) -> "Falantes":
        wav = VOZES / f"{nome}.wav"
        if not wav.exists():
            raise FileNotFoundError(f"Não há voz registada em {wav}. Corra: python registar_voz.py {nome}")
        return cls(impressao_de_ficheiro(wav))

    def _media(self, atual: np.ndarray | None, n: int, novo: np.ndarray) -> np.ndarray:
        if atual is None:
            return novo
        m = (atual * n + novo) / (n + 1)
        return m / (np.linalg.norm(m) + 1e-9)

    def atribuir(self, pcm: np.ndarray) -> tuple[str, float]:
        """Devolve (quem, confiança). quem é 'comercial' ou 'cliente'."""
        curta = len(pcm) < MIN_S * TAXA
        e = impressao(pcm)
        if self.comercial is None:  # sem registo: a primeira fala é do comercial
            self.comercial, self.n_comercial = e, 1
            return "comercial", 0.5
        s_com = float(e @ self.comercial)
        s_cli = float(e @ self.cliente) if self.cliente is not None else None
        if s_cli is None:
            quem = "comercial" if s_com >= LIMIAR_MESMA_VOZ else "cliente"
            conf = abs(s_com - LIMIAR_MESMA_VOZ) * 2
        else:
            quem = "comercial" if s_com >= s_cli else "cliente"
            conf = abs(s_com - s_cli) * 2
        conf = float(min(1.0, max(0.05, conf)))
        if curta:
            conf = min(conf, 0.4)
        # só aprende com falas longas e claras; a voz registada do comercial não se mexe
        if not curta and conf >= 0.3:
            if quem == "cliente":
                self.cliente = self._media(self.cliente, self.n_cliente, e)
                self.n_cliente += 1
            elif not self.registado:
                self.comercial = self._media(self.comercial, self.n_comercial, e)
                self.n_comercial += 1
        return quem, round(conf, 2)


def separar_segmentos(pcm: np.ndarray, segmentos: list[dict], voz_comercial: np.ndarray | None = None) -> list[dict]:
    """Para uma gravação já transcrita (mono): põe 'falante' e 'confianca_falante' em cada segmento."""
    f = Falantes(voz_comercial)
    for s in segmentos:
        a, b = int(s["inicio"] * TAXA), int(s["fim"] * TAXA)
        trecho = pcm[a:b]
        if len(trecho) < 0.3 * TAXA:
            s["falante"], s["confianca_falante"] = (segmentos[segmentos.index(s) - 1]["falante"] if segmentos.index(s) else "comercial"), 0.1
            continue
        s["falante"], s["confianca_falante"] = f.atribuir(trecho)
    return segmentos


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 3:
        print("Uso: python falantes.py <a.wav> <b.wav>   (diz se são a mesma voz)")
        sys.exit(1)
    a, b = impressao_de_ficheiro(Path(sys.argv[1])), impressao_de_ficheiro(Path(sys.argv[2]))
    s = float(a @ b)
    print(f"semelhança {s:.2f} → {'mesma voz' if s >= LIMIAR_MESMA_VOZ else 'vozes diferentes'}")
