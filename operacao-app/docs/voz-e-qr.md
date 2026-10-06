# Ditar no terreno e QR da porta da obra (06/10/2026)

Duas formas de tirar escrita e passos de cima de quem está na obra.

## 1. "O técnico fala, o sistema regista"

**Onde:** "As minhas tarefas" → abrir uma tarefa → **Ditar (atraso, nota,
terminei)**; e na ficha da tarefa (supervisor/gestor) → **Ditar atraso**, ao lado
de "Registar atraso".

**Como funciona:**

1. Carrega-se no microfone; o browser transcreve em pt-PT (Web Speech API —
   Chrome/Edge no Android e no computador, Safari recente; o Firefox não tem).
   Sem suporte, o botão aparece desligado e o tooltip diz porquê. **O áudio não
   é guardado** — só o texto chega à app.
2. Regras simples e à vista (`src/domain/voz.ts`) passam da frase a uma
   proposta, e mostram as palavras que a decidiram:

   | Diz-se | Proposta |
   |---|---|
   | "falta…", "não chegou", "só chega amanhã", "material" | Atraso · Material em falta |
   | "húmido", "não secou", "secagem", "cura" | Atraso · Secagem / cura |
   | "o cliente não estava", "sem acesso", "sem chave" | Atraso · Acesso / cliente |
   | "chuva", "vento" | Atraso · Meteorologia |
   | "elevador avariado", "sem luz/água" | Atraso · Condições do edifício |
   | "imprevisto", "descobri", "infiltração" | Atraso · Trabalho imprevisto |
   | "o colega faltou", "doente" | Atraso · Equipa |
   | "vai demorar mais", "não dá", "mais tempo" | Atraso · Outro |
   | "terminei", "está feito", "acabei" | Dar a tarefa por feita |
   | qualquer outra coisa | Nota → legenda da próxima foto |

   Datas ditas ("amanhã", "depois de amanhã", "sexta", "dia 14", "14 de
   outubro", "15/10", "daqui a 3 dias", "para a semana") e durações ("mais 2
   horas", "mais um dia", "meio dia") preenchem o "quanto". Uma data depois do
   fim previsto vira **nova data de fim**; antes dele, não mexe no fim.
3. A pessoa **confirma ou corrige** (texto, intenção, motivo). Só então:
   - **atraso** → abre a folha "Vai atrasar" já preenchida, com o impacto
     calculado pela base (simulação); gravar é o botão "Registar atraso" de
     sempre (`rpc_ops_obra_registar_atraso`: empurra o plano e avisa);
   - **feita** → o mesmo caminho do botão Terminar (medida real, justificação
     se passar o previsto); o texto vai como nota;
   - **nota** → fica à espera da próxima foto e vai como legenda
     (`rpc_ops_obra_registar_foto`, `p_legenda`, que já existia).

Sem SQL novo.

## 2. QR da porta da obra

**Onde:** ficha da obra → **Imprimir QR da obra** (gestor, supervisor, admin).
Abre a pré-visualização da folha (A6: código, título, morada, QR) com
"Imprimir" e "Copiar link". O QR é gerado no browser (`qrcode-generator`, MIT,
sem dependências) e desenhado em SVG.

**O que o QR abre:** `/operacao/obras/<código>?chegada=1`.

- Sem sessão → login → volta ao mesmo link (`state.de`, só caminhos internos).
- Com sessão, quem está numa tarefa da obra vê as tarefas de hoje dessa obra e
  **Registar chegada**:
  - guarda a hora (`rpc_ops_obra_registar_chegada`);
  - a localização **só** se a pessoa ligar "Guardar a minha localização" (e o
    browser deixar); a equipa vê só que houve localização, nunca onde
    (`ops_v_obra_chegada` não tem coordenadas; a tabela está fechada);
  - começa o relógio da primeira tarefa do dia (`rpc_ops_obra_iniciar_tarefa`):
    a em curso, senão a para refazer, senão a por fazer mais cedo no plano
    cuja dependência já está feita (`src/domain/chegada.ts`). Com outro relógio
    a correr, não começa nenhuma e diz porquê.
- Quem não tem tarefas na obra vê "Não tens tarefas nesta obra" (e, se for
  coordenador, "Abrir a ficha da obra").
- Na ficha da obra, coordenadores veem **Chegaram hoje: Nuno 08:12 · …**.

### SQL

`db/chegadas.sql` — **depois** de `db/obras.sql`, idempotente:
tabela `ops_obra_chegada` (fechada a `authenticated`), RPC
`rpc_ops_obra_registar_chegada`, vista `ops_v_obra_chegada` (sem coordenadas,
filtrada por `ops_pode_ver_obra`). Validado com
`node tools/validar-chegadas.mjs`.

**Sem o SQL aplicado a app funciona:** a chegada fica só como início do
relógio, e "Chegaram hoje" não aparece.
