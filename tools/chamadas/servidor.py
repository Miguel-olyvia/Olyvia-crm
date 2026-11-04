"""Chamadas em direto a partir do browser.

A página capta o microfone do PC da comercial, manda o áudio por WebSocket, e o
servidor (onde está a GPU) transcreve, diz quem fala e devolve as falas em direto.
No fim, "Terminar" preenche a ficha e mostra-a para rever.

Uso:  python servidor.py [--porta 8765] [--host 127.0.0.1]
Abrir: http://127.0.0.1:8765/
Para outros PCs da rede: --host 0.0.0.0 e abrir http://<ip-deste-pc>:8765/ (o browser só
dá acesso ao microfone em https ou em localhost; na rede precisa de https à frente).
"""
import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

sys.stdout.reconfigure(encoding="utf-8")

AQUI = Path(__file__).parent
SAIDA = AQUI / "saida"
VOZES = AQUI / "vozes"
SAIDA.mkdir(exist_ok=True)
VOZES.mkdir(exist_ok=True)

app = FastAPI(title="Olyvia — chamadas em direto")
# A app Olyvia (localhost:8080 em desenvolvimento, Vercel em produção) chama este servidor local.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/saida", StaticFiles(directory=str(SAIDA)), name="saida")
EXEMPLO = AQUI / "exemplos" / "chamada-teste-maria-mono.wav"
_gpu = asyncio.Lock()  # uma sessão de cada vez na GPU


@app.get("/", response_class=HTMLResponse)
async def pagina():
    return (AQUI / "pagina.html").read_text(encoding="utf-8")


@app.get("/api/vozes")
async def vozes():
    return JSONResponse([p.stem for p in sorted(VOZES.glob("*.wav"))])


@app.get("/api/chamadas")
async def chamadas():
    itens = []
    for p in sorted(SAIDA.glob("*.transcricao.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:30]:
        nome = p.name.replace(".transcricao.json", "")
        itens.append({"nome": nome, "quando": datetime.fromtimestamp(p.stat().st_mtime).strftime("%d/%m %H:%M"),
                      "ficha": f"/saida/{nome}.revisao.html" if (SAIDA / f"{nome}.revisao.html").exists() else None})
    return JSONResponse(itens)


@app.websocket("/ws")
async def chamada(ws: WebSocket):
    """Protocolo: 1.º texto JSON {nome, comercial, primeiro?, campos?, teste?}; depois binário int16
    16 kHz mono; texto "terminar" fecha. `campos` são os Def da app (k, l, t, op): a extração usa-os
    e devolve-os em `extracao`. `teste: true` ignora o microfone e toca a chamada de exemplo.
    Respostas: {tipo:"pronto"|"fala"|"nivel"|"a_terminar"|"fim"|"erro", ...}."""
    await ws.accept()
    from ao_vivo import Sessao  # carrega os modelos só quando há a primeira chamada
    sessao = None
    try:
        inicio = json.loads(await ws.receive_text())
        nome = inicio.get("nome") or ("direto-" + datetime.now().strftime("%Y-%m-%d-%H%M"))
        nome = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in nome)[:60]
        comercial = inicio.get("comercial") or None
        campos = inicio.get("campos") or None
        teste = bool(inicio.get("teste"))
        async with _gpu:
            sessao = await asyncio.to_thread(Sessao, nome, comercial, inicio.get("primeiro", "cliente"))
            await ws.send_json({"tipo": "pronto", "nome": nome, "comercial": comercial, "teste": teste})
            ultimo_nivel = asyncio.get_event_loop().time()

            async def tratar_pcm(pcm: np.ndarray):
                nonlocal ultimo_nivel
                novas = await asyncio.to_thread(sessao.alimentar, pcm)
                for seg in novas:
                    await ws.send_json({"tipo": "fala", **seg})
                agora = asyncio.get_event_loop().time()
                if agora - ultimo_nivel >= 1:
                    ultimo_nivel = agora
                    await ws.send_json({"tipo": "nivel", **sessao.nivel()})

            if teste:
                import wave
                with wave.open(str(EXEMPLO)) as w:
                    todo = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
                for i in range(0, len(todo), 1600):  # 100 ms de cada vez, sem esperar o tempo real
                    await tratar_pcm(todo[i:i + 1600])
            else:
                while True:
                    msg = await ws.receive()
                    if msg.get("type") == "websocket.disconnect":
                        break
                    if msg.get("text") is not None:
                        if msg["text"] == "terminar":
                            break
                        continue
                    dados = msg.get("bytes")
                    if not dados:
                        continue
                    await tratar_pcm(np.frombuffer(dados, dtype=np.int16).astype(np.float32) / 32768)
            await ws.send_json({"tipo": "a_terminar", "falas": len(sessao.segmentos)})
            r = await asyncio.to_thread(sessao.terminar, True, campos)
            for seg in r["novas"]:
                await ws.send_json({"tipo": "fala", **seg})
            await ws.send_json({"tipo": "fim", "nome": nome, "minutos": r["minutos"], "falas": r["falas"],
                                "latencia_media": r["latencia_media"],
                                "ficha": f"/saida/{nome}.revisao.html" if r["ficha"] else None,
                                "extracao": r["extracao"], "segmentos": sessao.segmentos})
    except WebSocketDisconnect:
        if sessao is not None and sessao.segmentos:
            await asyncio.to_thread(sessao.terminar, False)  # guarda o que há, sem ficha
    except Exception as e:  # noqa: BLE001
        try:
            await ws.send_json({"tipo": "erro", "mensagem": str(e)})
        except Exception:  # noqa: BLE001
            pass
        raise


@app.get("/ficha/{nome}")
async def ficha(nome: str):
    f = SAIDA / f"{nome}.revisao.html"
    return FileResponse(str(f)) if f.exists() else HTMLResponse("Ainda não há ficha.", status_code=404)


if __name__ == "__main__":
    import uvicorn
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    print(f"Abrir http://{a.host}:{a.porta}/  (Ctrl+C para parar)")
    uvicorn.run(app, host=a.host, port=a.porta, log_level="warning")
