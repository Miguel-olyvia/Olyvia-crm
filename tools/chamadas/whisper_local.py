"""faster-whisper em GPU, com os dois remendos que esta máquina precisa.

1. O PyAV está bloqueado por política do Windows: mete-se um módulo vazio no lugar
   dele e dá-se o áudio como numpy em vez de caminho de ficheiro.
2. O ctranslate2 não encontra o cuBLAS: pré-carregam-se as DLLs do pacote nvidia.
"""
import ctypes
import glob
import os
import site
import sys
import types

import numpy as np

_modelo = None


def _preparar() -> None:
    if "av" not in sys.modules:
        sys.modules["av"] = types.ModuleType("av")
    if os.name != "nt":
        return
    dlls = []
    for sp in site.getsitepackages() + [site.getusersitepackages()]:
        dlls += glob.glob(os.path.join(sp, "nvidia", "*", "bin", "*.dll"))
    pendentes = dlls
    for _ in range(6):
        restantes = []
        for d in pendentes:
            try:
                ctypes.WinDLL(d)
            except OSError:
                restantes.append(d)
        pendentes = restantes
        if not pendentes:
            break


def modelo(nome: str | None = None):
    """Carrega uma vez e devolve o WhisperModel (large-v3 em float16 por defeito)."""
    global _modelo
    if _modelo is None:
        _preparar()
        from faster_whisper import WhisperModel
        nome = nome or os.environ.get("CHAMADAS_FW_MODELO", "large-v3")
        try:
            _modelo = WhisperModel(nome, device="cuda", compute_type="float16")
        except Exception as e:  # noqa: BLE001
            print(f"GPU indisponível ({e}); a usar CPU int8, mais lento.")
            _modelo = WhisperModel(nome, device="cpu", compute_type="int8")
    return _modelo


def libertar() -> None:
    """Descarrega o modelo da GPU (o LLM da ficha precisa da memória toda)."""
    global _modelo
    _modelo = None
    import gc
    gc.collect()


PROMPT = ("Chamada telefónica em português de Portugal entre um comercial da Mudelar, empresa de "
          "remodelações, e um cliente. Fala-se de casa de banho, cozinha, tipologia, elevador, "
          "estacionamento, orçamento e visita.")

# Frases que o whisper inventa em silêncio ou ruído.
ALUCINACOES = {"obrigado", "obrigada", "legendas pela comunidade amara.org", "amara.org", "tchau", "até à próxima", "subtitles by"}


def _eco_do_prompt(texto: str) -> bool:
    """Em ruído ou silêncio o whisper repete pedaços do prompt inicial."""
    import difflib
    t = texto.lower().strip(".!?… ")
    if len(t) < 12:
        return False
    return t in PROMPT.lower() or difflib.SequenceMatcher(None, t, PROMPT.lower()).find_longest_match().size >= 0.6 * len(t)


def transcrever_trecho(pcm: np.ndarray, deslocamento_s: float = 0.0) -> list[dict]:
    """Transcreve um trecho (float32, 16 kHz). Devolve segmentos com tempos absolutos."""
    m = modelo()
    segs, _ = m.transcribe(np.ascontiguousarray(pcm, dtype=np.float32), language="pt", beam_size=5,
                           vad_filter=False, condition_on_previous_text=False, initial_prompt=PROMPT)
    saida = []
    for s in segs:
        texto = s.text.strip()
        if not texto or s.no_speech_prob > 0.7 or texto.lower().strip(".!?… ") in ALUCINACOES or _eco_do_prompt(texto):
            continue
        saida.append({"inicio": round(deslocamento_s + s.start, 2), "fim": round(deslocamento_s + s.end, 2), "texto": texto,
                      "logprob": round(float(s.avg_logprob), 2)})
    return saida
