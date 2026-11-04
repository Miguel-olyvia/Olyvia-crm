"""Transcrição de cada fala pelo Gemini (Google), sem GPU.

Recebe o áudio de uma fala (float32 a 16 kHz), manda-o como WAV ao Gemini e recebe as
frases com tempos aproximados dentro da fala. A mesma interface de whisper_local:
`transcrever_trecho(pcm, deslocamento_s)` devolve [{inicio, fim, texto}], com tempos absolutos.

Chave: GEMINI_API_KEY (em tools/chamadas/.env ou no ambiente). Modelo: CHAMADAS_GEMINI_MODELO
(por defeito gemini-3.1-flash-lite: 2 s por fala, bom em PT). Custo de referência: cerca de
0,12 $ por hora de áudio.
"""
import io
import json
import os
import re
import time
import wave

import numpy as np

import whisper_local  # só para carregar o .env e partilhar o filtro de alucinações

MODELO = os.environ.get("CHAMADAS_GEMINI_MODELO", "gemini-3.1-flash-lite")
TAXA = 16000
CONFIANCA_MIN = float(os.environ.get("CHAMADAS_GEMINI_CONFIANCA", "0.5"))
_client = None

# A instrução é curta de propósito: com áudio abafado o modelo decalca frases do que lhe dizemos
# (visto a 4/11: «Estou a ligar da Mudelar, a empresa de remodelações» num troço de ruído).
INSTRUCAO = (
    "Transcreve literalmente este áudio, em português de Portugal, dividido em frases com início e fim "
    "em segundos. Regras: só escreves o que se ouve com clareza; se um troço for ruído, silêncio ou "
    "impercetível, omite-o; se não se perceber nada, devolve []. Nunca completes, resumas, traduzas ou "
    "corrijas. Em cada frase dá a tua confiança de 0 a 1 de que foi mesmo isso que se disse."
)
# Sem vocabulário na instrução: com áudio abafado o modelo punha «walk-in shower» e «Mudelar» onde não
# estavam. Os nomes da casa corrigem-se depois, de forma determinística.
CORRECOES = [(re.compile(p, re.I), r) for p, r in [
    (r"\bMudoar\b|\bModular\b", "Mudelar"),
    (r"\bwalking shower\b|\bwalk in shower\b", "walk-in shower"),
    (r"\bS\.P\.C\.?", "SPC"),
]]


def _corrigir(texto: str) -> str:
    for rx, r in CORRECOES:
        texto = rx.sub(r, texto)
    return texto

ESQUEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "inicio": {"type": "NUMBER"},
            "fim": {"type": "NUMBER"},
            "texto": {"type": "STRING"},
            "confianca": {"type": "NUMBER"},
        },
        "required": ["inicio", "fim", "texto", "confianca"],
    },
}

_PALAVRAS_INSTRUCAO = {w for w in re.findall(r"\w+", INSTRUCAO.lower()) if len(w) > 3}


def _eco_da_instrucao(texto: str) -> bool:
    """Quase todas as palavras da frase (4 ou mais, com mais de 3 letras) estão na instrução: é decalque."""
    palavras = [w for w in re.findall(r"\w+", texto.lower()) if len(w) > 3]
    if len(palavras) < 4:
        return False
    return sum(w in _PALAVRAS_INSTRUCAO for w in palavras) / len(palavras) >= 0.8


def _cliente():
    global _client
    if _client is None:
        from google import genai
        chave = os.environ.get("GEMINI_API_KEY", "")
        if not chave:
            raise SystemExit("Falta GEMINI_API_KEY (tools/chamadas/.env).")
        _client = genai.Client(api_key=chave)
    return _client


def _wav_bytes(pcm: np.ndarray) -> bytes:
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes((np.clip(pcm, -1, 1) * 32767).astype(np.int16).tobytes())
    return b.getvalue()


def modelo():
    """Mesma interface de whisper_local.modelo(): aqui só prepara o cliente (sem nada para carregar)."""
    return _cliente()


def libertar() -> None:
    """Nada a libertar: não há modelo em memória."""


def transcrever_trecho(pcm: np.ndarray, deslocamento_s: float = 0.0, tentativas: int = 2) -> list[dict]:
    from google.genai import types
    dur = len(pcm) / TAXA
    if dur < 0.3:
        return []
    cfg = types.GenerateContentConfig(response_mime_type="application/json", response_schema=ESQUEMA, temperature=0)
    audio = types.Part.from_bytes(data=_wav_bytes(pcm), mime_type="audio/wav")
    ultimo_erro: Exception | None = None
    for tentativa in range(tentativas):
        try:
            r = _cliente().models.generate_content(model=MODELO, contents=[audio, INSTRUCAO], config=cfg)
            dados = json.loads(r.text or "[]")
            break
        except Exception as e:  # noqa: BLE001 — rede, quota: tenta outra vez e depois desiste da fala
            ultimo_erro = e
            time.sleep(1.0 * (tentativa + 1))
    else:
        print(f"[gemini] fala perdida ({ultimo_erro})", flush=True)
        return []
    saida = []
    for s in dados if isinstance(dados, list) else []:
        texto = _corrigir(str(s.get("texto", "")).strip())
        conf = float(s.get("confianca", 1) or 0)
        if not texto or conf < CONFIANCA_MIN or texto.lower().strip(".!?… ") in whisper_local.ALUCINACOES or _eco_da_instrucao(texto):
            continue
        ini = min(max(float(s.get("inicio", 0) or 0), 0.0), dur)
        fim = min(max(float(s.get("fim", dur) or dur), ini), dur)
        saida.append({"inicio": round(deslocamento_s + ini, 2), "fim": round(deslocamento_s + fim, 2), "texto": texto,
                      "confianca_texto": round(conf, 2)})
    return saida
