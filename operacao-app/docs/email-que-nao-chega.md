# O relatório que diz que foi e não foi

**31 de agosto de 2026.** Investigação fechada, correção **não aplicada**.

> **Resumo em três linhas.** O módulo de Operações põe o relatório na fila de
> saída do CRM corretamente. A função que processa essa fila chama a função que
> envia, **leva com um erro que não sabe ler**, e marca a carta como entregue à
> mesma. Ninguém envia nada e ninguém dá por isso.
>
> A correção são três linhas, e é no CRM — fora do módulo. **Está por aplicar,
> por decisão:** documenta-se primeiro, mexe-se depois.

---

## 1. Como apareceu

Fechou-se e confirmou-se uma ordem numa organização com o relatório automático
ligado, com um cliente cuja ficha tinha email. O email nunca chegou à caixa de
entrada — nem ao spam.

O primeiro instinto foi que o módulo não tinha posto nada na fila. Estava
errado: tinha.

## 2. O que se foi confirmando, por esta ordem

| Pergunta | Resposta |
|---|---|
| O módulo pôs a carta na fila? | **Sim.** Duas linhas em `scheduled_emails`, com o email certo e o conteúdo certo. |
| A fila diz que enviou? | **Sim.** `status = 'sent'`, `sent_at = 17:15:03`. |
| Há SMTP configurado? | **Sim.** 19 contas de utilizador e 3 de organização, todas ativas. |
| O CRM manda emails de todo? | **Sim.** 1238 registos em `email_logs`, o último às **17:11 de hoje** — quatro minutos antes. |
| Há registo do NOSSO envio? | **Não.** Zero. |
| A tarefa automática corre? | **Sim.** `pg_cron`, de minuto a minuto, `succeeded` sempre. |

A consulta que fecha o caso, e que vale a pena guardar:

```sql
select s.created_at, s.status, s.sent_at, s.to_email, s.user_id,
       (select count(*) from email_logs l
         where l.to_email = s.to_email
           and l.created_at > s.created_at - interval '10 minutes') as tem_registo
  from scheduled_emails s
 where s.entity_type = 'ops_ordem'
 order by s.created_at desc
 limit 10;
```

Deu `tem_registo = 0` nas duas linhas. **A fila diz que entregou e não existe
registo nenhum da entrega.** Estas duas coisas não podem ser as duas verdade:
a função de envio escreve em `email_logs` sempre — no caminho de sucesso e no
de falha.

Logo, a função de envio **não chegou a correr**.

## 3. A causa

`supabase/functions/process-scheduled-emails/index.ts`:

```js
const sendResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, { … });

const sendResult = await sendResponse.json();
if (sendResult.error) throw new Error(sendResult.error);

await supabase.from("scheduled_emails")
  .update({ status: "sent", sent_at: new Date().toISOString() })
  .eq("id", email.id);
```

**Nunca se olha para o código de estado da resposta.** A única coisa que se
verifica é se o corpo traz uma caixa chamada `error`.

Um erro da plataforma — a função em erro de arranque, indisponível, ou um
pedido recusado antes de lá chegar — devolve JSON noutro feitio,
tipicamente `{"code": …, "message": …}`. Sem caixa `error`. O código não vê
nada de estranho, salta o `throw`, e escreve **`sent`**.

O carteiro devolveu a carta, e quem a recebeu de volta escreveu "entregue"
no livro.

### Porque é que ninguém tinha dado por isto

Os emails que se veem a funcionar — convites de agenda — **não passam por
aqui**. O `send-schedule-invite` fala com o servidor de SMTP diretamente. O
caminho da fila é usado por poucas coisas, e o módulo de Operações foi a
primeira a depender dele todos os dias.

Um erro que mente sobre o resultado só se descobre quando alguém do outro
lado repara que não recebeu.

## 4. A correção

Três linhas, no mesmo ficheiro:

```js
const sendResult = await sendResponse.json();

if (!sendResponse.ok) {
  throw new Error(
    `send-email devolveu ${sendResponse.status}: ${JSON.stringify(sendResult).slice(0, 200)}`
  );
}
if (sendResult.error) throw new Error(sendResult.error);
if (!sendResult.success) throw new Error("send-email não confirmou o envio");
```

O `catch` que já existe põe a linha em `failed` **com o motivo escrito em
`error_message`**. Da próxima vez sabe-se em dois minutos em vez de duas
semanas.

Não muda nada quando as coisas correm bem. Só deixa de mentir quando correm
mal.

**Está por aplicar.** É código do CRM, e o módulo combinou não lhe tocar —
`docs/onde-estamos.md` e o `README.md` explicam a regra. Fica a decisão para
quem cuida do CRM.

## 5. O que continua por saber

A correção acima faz o erro **aparecer**. Não diz **qual** é.

Falta ver os registos da função `send-email` à volta das **17:15 de 31 de
agosto de 2026**:

> Supabase → Edge Functions → `send-email` → Logs

Três hipóteses, por ordem de probabilidade:

1. **A função estava em erro de arranque** naquele minuto — um deploy a meio,
   ou uma dependência em falha.
2. **O corpo do pedido era grande demais.** O relatório vai em HTML inteiro
   dentro do pedido; os outros emails do CRM são curtos. Se for isto, a
   solução é mandar o relatório por referência e não por valor.
3. **A plataforma recusou a chamada** antes de a função a ver.

A hipótese 2 é a que mais interessa a Operações: seria a única em que o módulo
tem alguma coisa a mudar.

## 6. O que isto NÃO é

Não é um problema do módulo de Operações, e não bloqueia o piloto:

- `ops_agendar_relatorio` e `rpc_ops_enviar_relatorio` fazem o que prometem —
  põem a linha em `scheduled_emails` com destinatário, assunto e HTML certos, e
  deixam evento no histórico da ordem. Isso está testado em
  `tools/validar-relatorio.mjs`.
- O relatório continua a ver-se e a imprimir-se no ecrã, sem passar por email
  nenhum.

O que fica prometido a menos, enquanto isto não estiver resolvido: **o cliente
não recebe o relatório sozinho.** É preciso dizer isso a quem vai ao piloto, em
vez de deixar descobrir.

---

## Ver também

- [`onde-estamos.md`](onde-estamos.md) — o estado do módulo
- `db/relatorio-automatico.sql` — o gatilho que põe a carta na fila
- `db/relatorio-manual.sql` — o botão de mandar à mão (tem o mesmo problema a
  jusante: põe na fila corretamente, e a fila é que falha)
