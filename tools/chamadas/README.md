# Chamadas → ficha da visita (protótipo, 4 de novembro de 2026)

Transcreve as chamadas aos leads e preenche automaticamente a ficha que prepara a
visita do comercial. Tudo corre em casa: o áudio nunca sai do servidor.

```
gravação  →  transcrever.py  →  extrair.py  →  rever.py
(wav/mp3)    whisper.cpp GPU     LLM local       ficha HTML que o comercial
             um canal por        (qwen3:8b       confirma antes de entrar
             falante             no Ollama)      na lead
```

## O que faz cada peça

| Ficheiro | Faz | Sai |
|---|---|---|
| `gerar_chamada_teste.py` | Cria uma chamada fictícia em português de Portugal com duas vozes (edge-tts). Comercial no canal esquerdo, cliente no direito. | `exemplos/<nome>.wav` (estéreo), `-mono.wav`, `.guiao.txt` |
| `transcrever.py` | Converte para WAV 16 kHz. Se for estéreo, transcreve cada canal à parte e junta pelos tempos. Corta os silêncios longos de cada canal antes do whisper (senão perde-se nos tempos) e devolve-os ao tempo original. | `saida/<nome>.transcricao.json` e `.txt` |
| `campos.json` | Definição dos campos a preencher: ficha "chamada" (preparação da visita) e ficha "local" (cópia dos campos de sistema do catálogo de campos configuráveis). | |
| `extrair.py` | Dá a transcrição e a definição dos campos ao LLM, com esquema JSON obrigatório. Cada campo sai com valor, confiança e excerto da chamada. Normaliza por tipo e valida as escolhas contra as opções. | `saida/<nome>.extracao.json` |
| `rever.py` | Ficha HTML pré-preenchida com o excerto ao lado de cada campo, estados Preenchido, A rever, Não falado, e a transcrição em baixo. "Guardar revisão" descarrega o JSON revisto. | `saida/<nome>.revisao.html` |
| `pipeline.py` | Encadeia tudo. `--vigiar` fica a ver a pasta `entrada/`. | |

## Correr

```
cd tools/chamadas
python gerar_chamada_teste.py                      # só para testes
python pipeline.py exemplos/chamada-teste-maria.wav
python pipeline.py --vigiar                        # trata o que cair em entrada/
```

Variáveis (todas opcionais):

| Variável | Por defeito | Para quê |
|---|---|---|
| `CHAMADAS_WHISPER` | `D:\tools\whisper\cuda\Release\whisper-cli.exe` | binário do whisper.cpp |
| `CHAMADAS_WHISPER_MODELO` | `D:\tools\whisper\ggml-large-v3.bin` | modelo |
| `CHAMADAS_LLM` | `ollama` | `ollama` (local) ou `anthropic` |
| `CHAMADAS_MODELO_OLLAMA` | `qwen3:8b` | modelo local (cabe em 8 GB de VRAM) |
| `CHAMADAS_MODELO_ANTHROPIC` | `claude-opus-5-5` | `claude-haiku-5-5` é a opção barata; precisa de `ANTHROPIC_API_KEY` e `pip install anthropic`. Motor escrito mas não testado (não há chave neste PC). |

Precisa de: ffmpeg no PATH, Python 3.12 com `numpy`, `requests`, `edge-tts` (só para gerar testes),
whisper.cpp com CUDA, Ollama com o modelo puxado (`ollama pull qwen3:8b`).

## Decisões

- **Separação de falantes pelo canal, não por diarização.** As centrais gravam normalmente
  um canal por lado. É separação perfeita e grátis. Para gravações mono (telemóvel) esta
  versão transcreve sem falantes; a diarização (pyannote ou WhisperX) fica para depois.
- **Extração por LLM com esquema, não por keywords.** "Tem duas casas de banho mas só quero
  mexer na principal" preenche `n_casas_banho=2` e `divisoes=casa de banho`. Keywords não fazem isto.
- **A definição dos campos é dados, não código.** `campos.json` tem a mesma forma do
  `cfg_campos` da app. Na integração, lê-se a definição da empresa e a extração passa a
  preencher os campos que o admin configurou.
- **Nada entra na lead sem revisão humana.** A ficha HTML é o passo obrigatório. O JSON
  revisto é o que se grava.
- **Confiança por campo.** Abaixo de 0,75 fica "A rever" e aparece destacado.

## O que falta para produção

1. Origem das gravações: webhook ou pasta partilhada da central telefónica (depende de qual é).
2. Diarização para gravações mono.
3. Gravar o JSON revisto na lead e na ficha do local (edge function com sessão, como o
   levantamento por conversa).
4. Ler `campos.json` da configuração da empresa em vez do ficheiro.
5. Aviso de gravação e consentimento: o campo `consentimento_gravacao` só é "sim" se o cliente
   o disser depois de avisado. Convém que a central toque o aviso automaticamente.
6. Fila com vários trabalhadores se o volume subir (hoje é sequencial: 3,5 min de chamada
   demoram cerca de 20 s a transcrever na RTX 5070).
