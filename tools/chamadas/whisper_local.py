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

# Sem prompt inicial: com fala fora do tema o whisper devolvia o próprio prompt
# (visto numa gravação real a 04/11). O PROMPT fica só para o filtro de ecos.

# Frases que o whisper inventa em silêncio ou ruído.
ALUCINACOES = {"obrigado", "obrigada", "legendas pela comunidade amara.org", "amara.org", "tchau", "até à próxima", "subtitles by"}


_PALAVRAS_PROMPT: set[str] = set()


def _eco_do_prompt(texto: str) -> bool:
    """Em ruído ou silêncio o whisper repete pedaços do prompt inicial: quase todas
    as palavras da fala (4 ou mais, com mais de 3 letras) estão no prompt."""
    import re
    if not _PALAVRAS_PROMPT:
        _PALAVRAS_PROMPT.update(w for w in re.findall(r"\w+", PROMPT.lower()) if len(w) > 3)
    palavras = [w for w in re.findall(r"\w+", texto.lower()) if len(w) > 3]
    if len(palavras) < 4:
        return False
    return sum(w in _PALAVRAS_PROMPT for w in palavras) / len(palavras) >= 0.8


def transcrever_trecho(pcm: np.ndarray, deslocamento_s: float = 0.0) -> list[dict]:
    """Transcreve um trecho (float32, 16 kHz). Devolve segmentos com tempos absolutos."""
    m = modelo()
    segs, _ = m.transcribe(np.ascontiguousarray(pcm, dtype=np.float32), language="pt", beam_size=5,
                           vad_filter=False, condition_on_previous_text=False)
    saida = []
    for s in segs:
        texto = s.text.strip()
        if not texto or s.no_speech_prob > 0.7 or texto.lower().strip(".!?… ") in ALUCINACOES or _eco_do_prompt(texto):
            continue
        saida.append({"inicio": round(deslocamento_s + s.start, 2), "fim": round(deslocamento_s + s.end, 2), "texto": texto,
                      "logprob": round(float(s.avg_logprob), 2)})
    return saida
