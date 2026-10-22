# Consultas ao Eticadata (só leitura)

Para responder a perguntas como «esta fatura já foi paga?» lendo diretamente o SQL Server do ERP, sem escrever nada.

## Ficheiros

| Ficheiro | O que faz |
|---|---|
| `consultar.ps1` | Corre um `.sql` e grava cada resultado em `<nome>.resultado-N.csv`, ao lado do `.sql`. |
| `1-descobrir-tabelas.sql` | 1.º passo: lista as tabelas e as vistas de vendas, recibos, pendentes, contas correntes e clientes, com o número de linhas e as colunas. |
| `1b-explorar-vendas.sql`, `1c-validar-pendente.sql` | Exploração de 22/10: tipos de documento, recibos e a validação do valor pendente. |
| `2-fatura-paga.sql` | **Feito (22/10).** Dado o número da fatura (ex.: `FAT 15200126/538`), diz o estado (paga, paga em parte, vencida, por pagar, anulada), o total, o pago, o que falta e os recibos, com a data e o meio. |

## Regras

- **Só leitura.** O `consultar.ps1` recusa qualquer `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`, `EXEC`, `GRANT`, `BACKUP`, `DBCC`, `sp_…` e `xp_…`. Abre a ligação com `ApplicationIntent=ReadOnly` e lê com `READ UNCOMMITTED`, para não bloquear o ERP.
- **Primeiro na BD de testes.** A BD por omissão é a `Emp_Z004` (testes da Mudelar). A real da Mudelar é a `Emp_B004` e só se usa quando o Rúben disser.
- **A ligação não vai para o git.** Fica em `D:\Olyvia\.eticadata`, fora do repositório, numa linha:
  ```
  Server=192.168.1.252,64864;User ID=<utilizador>;Password=<password>
  ```
  O ideal é um utilizador SQL **só de leitura**, que foi pedido ao revendedor. Enquanto não existir, usa-se o `sa`, com cuidado.
- **Os CSV não vão para o git** (`.gitignore`), porque têm dados reais de clientes.

## Como correr

No terminal do Claude Code, com `!` (o bash come as `\`, por isso escrevem-se os caminhos com `/`):
```
! powershell -ExecutionPolicy Bypass -File D:/Olyvia/wt-negocios-proto/docs/integracao-eticadata/consultas/consultar.ps1 D:/Olyvia/wt-negocios-proto/docs/integracao-eticadata/consultas/1-descobrir-tabelas.sql
```
Para outra BD, acrescenta-se `-Bd Emp_B004`.

## O que se sabe da rede (21/10/2026)

- Este PC está no Wi-Fi da BMInvest e o nome `BMINVESTE-SRV` resolve.
- O ping e as portas 1433 e 445 não respondem. A instância tem nome (`\ETICADATA`) e pode estar numa porta dinâmica, o que exige o SQL Browser (UDP 1434).
- Se a ligação falhar, corre-se o mesmo script **no próprio servidor**, por Ambiente de Trabalho Remoto, ou pede-se para abrirem o acesso ao SQL a partir da rede.

**22/10/2026: a ligação funciona.** A instância `ETICADATA` não está na 1433, mas sim na **porta 64864** (foi o SQL Browser, UDP 1434, que o disse). Da rede da BMInvest, `192.168.1.252,64864` responde.

## O que se sabe das tabelas (Emp_Z004, 22/10/2026)

- **Faturas:** `Mov_Venda_Cab`. Na Mudelar, o tipo é `FAT` e o número tem o formato `FAT 15200126/538` (`strNumero`). A chave é composta por `strCodSeccao`, `strAbrevTpDoc`, `strCodExercicio` e `intNumero`. Tem também `strATCUD`, `fltTotal`, `fltValorPendente`, `dtmDataVencimento` e `bitAnulado`.
- **Estado do pagamento:** `fltValorPendente` dá o que falta pagar. Bate com o total menos os recibos em 3785 das 3786 faturas `FAT`.
- **Recibos:** `Mov_Liquidacao_Cab` (tipo `REC`) com `Mov_Liquidacao_Lin`. Cada linha aponta para a fatura pelas colunas `*Pend` e o valor está em `fltAtribuido`. O meio de pagamento está em `Mov_Liquidacao_CabPagamento.strAbrevTpMovPagTes`, com a descrição em `Tbl_Gce_Tipos_MovPag`.
- **Atenção:** há faturas com cêntimos de arredondamento por liquidar (por exemplo 0,50 € em 18 109 €). Falta decidir a tolerância para as considerar «pagas».
