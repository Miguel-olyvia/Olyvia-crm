"""Gera uma chamada de teste em português de Portugal com duas vozes.

Sai um WAV estéreo (16 kHz): comercial no canal esquerdo, cliente no direito,
como numa gravação de central telefónica. Também sai a versão mono.

Uso:  python gerar_chamada_teste.py [nome]   (por defeito: chamada-teste-maria)
Precisa de: edge-tts (pip), ffmpeg no PATH, numpy.
"""
import asyncio
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import edge_tts
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

VOZ_COMERCIAL = "pt-PT-DuarteNeural"
VOZ_CLIENTE = "pt-PT-RaquelNeural"
TAXA = 16000
PAUSA_S = 0.6

# (quem, fala). C = comercial, K = cliente.
GUIAO = [
    ("C", "Bom dia, fala o Tiago da Mudelar. Estou a ligar por causa do pedido que deixou no nosso site para a remodelação. Posso falar consigo dois minutos?"),
    ("K", "Bom dia, sim, pode falar. É a Maria Fernandes."),
    ("C", "Obrigado, dona Maria. Esta chamada é gravada para prepararmos a visita do nosso comercial, está bem?"),
    ("K", "Sim, sem problema."),
    ("C", "Então, conte-me o que gostava de fazer na casa."),
    ("K", "Queria remodelar a casa de banho principal e a cozinha. A casa de banho está muito velha, tem azulejos dos anos setenta. A cozinha também, mas a cozinha é mais trocar o pavimento e a bancada."),
    ("C", "Certo. A casa é um apartamento ou uma moradia?"),
    ("K", "É um apartamento, um T3, no terceiro andar. Tem à volta de noventa e cinco metros quadrados."),
    ("C", "E o prédio tem elevador?"),
    ("K", "Não, não tem elevador. São escadas, o que às vezes complica."),
    ("C", "Compreendo. E o estacionamento na rua, como é?"),
    ("K", "Aqui é tudo pago, zona amarela. Não é fácil estacionar durante o dia."),
    ("C", "Fica registado. Sabe de que ano é o prédio?"),
    ("K", "O prédio é de mil novecentos e setenta e oito."),
    ("C", "E a instalação elétrica, já foi renovada alguma vez?"),
    ("K", "Não, é a original. O quadro é antigo, não tem disjuntor diferencial, acho eu."),
    ("C", "E a canalização, sabe se é de ferro ou de PVC?"),
    ("K", "É de ferro, já tivemos problemas com ferrugem na água."),
    ("C", "E o gás, é canalizado ou de garrafa?"),
    ("K", "É canalizado."),
    ("C", "Muito bem. O pavimento da cozinha atualmente é cerâmico, madeira, flutuante?"),
    ("K", "É cerâmico, mosaico antigo."),
    ("C", "Quantas casas de banho tem a casa no total?"),
    ("K", "Tem duas, mas só quero mexer na principal."),
    ("C", "Durante a obra, pensam continuar a viver na casa?"),
    ("K", "Sim, vamos ficar cá. Temos um cão, um labrador, mas ele fica no quarto."),
    ("C", "E alguma ideia de valor que gostavam de investir?"),
    ("K", "Pensávamos em qualquer coisa à volta dos quinze mil euros, para as duas divisões."),
    ("C", "E prazo, há alguma data que precisem?"),
    ("K", "Gostava que ficasse pronto antes da Páscoa, porque vem cá a família."),
    ("C", "Perfeito. Para a visita do nosso comercial, que dia dá mais jeito?"),
    ("K", "Sábado de manhã é o melhor. Durante a semana só depois das dezanove."),
    ("C", "Fica então sábado de manhã. Confirmo a morada: Rua das Flores, número vinte e três, terceiro esquerdo, no Porto?"),
    ("K", "Isso mesmo, terceiro esquerdo."),
    ("C", "Obrigado, dona Maria. O comercial entra em contacto para confirmar a hora. Bom dia."),
    ("K", "Obrigada, bom dia."),
]


async def _sintetizar(texto: str, voz: str, destino: Path) -> None:
    await edge_tts.Communicate(texto, voz).save(str(destino))


def _mp3_para_pcm(mp3: Path) -> np.ndarray:
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(mp3), "-ac", "1", "-ar", str(TAXA), "-f", "s16le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(out, dtype=np.int16)


def _gravar_wav(destino: Path, canais: list[np.ndarray]) -> None:
    dados = np.stack(canais, axis=1).astype(np.int16) if len(canais) > 1 else canais[0].astype(np.int16)
    with wave.open(str(destino), "wb") as w:
        w.setnchannels(len(canais))
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes(dados.tobytes())


def gerar(nome: str, pasta: Path) -> tuple[Path, Path]:
    pasta.mkdir(parents=True, exist_ok=True)
    esquerdo: list[np.ndarray] = []
    direito: list[np.ndarray] = []
    pausa = np.zeros(int(PAUSA_S * TAXA), dtype=np.int16)
    with tempfile.TemporaryDirectory() as tmp:
        for i, (quem, fala) in enumerate(GUIAO):
            mp3 = Path(tmp) / f"{i:03d}.mp3"
            asyncio.run(_sintetizar(fala, VOZ_COMERCIAL if quem == "C" else VOZ_CLIENTE, mp3))
            pcm = _mp3_para_pcm(mp3)
            silencio = np.zeros_like(pcm)
            if quem == "C":
                esquerdo += [pcm, pausa]
                direito += [silencio, pausa]
            else:
                esquerdo += [silencio, pausa]
                direito += [pcm, pausa]
            print(f"  {i + 1:2d}/{len(GUIAO)} {quem} {len(pcm) / TAXA:5.1f}s")
    l, r = np.concatenate(esquerdo), np.concatenate(direito)
    estereo = pasta / f"{nome}.wav"
    mono = pasta / f"{nome}-mono.wav"
    _gravar_wav(estereo, [l, r])
    _gravar_wav(mono, [((l.astype(np.int32) + r.astype(np.int32)) // 1).clip(-32768, 32767)])
    (pasta / f"{nome}.guiao.txt").write_text(
        "\n".join(f"{'Comercial' if q == 'C' else 'Cliente'}: {f}" for q, f in GUIAO), encoding="utf-8")
    print(f"Duração: {len(l) / TAXA / 60:.1f} min  →  {estereo}  e  {mono}")
    return estereo, mono


if __name__ == "__main__":
    nome = sys.argv[1] if len(sys.argv) > 1 else "chamada-teste-maria"
    gerar(nome, Path(__file__).parent / "exemplos")
