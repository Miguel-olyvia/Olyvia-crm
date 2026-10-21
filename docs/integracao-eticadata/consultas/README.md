# Consultas ao Eticadata (só leitura)

Para responder a perguntas como «esta fatura já foi paga?» lendo diretamente o SQL Server do ERP, sem escrever nada.

## Ficheiros

| Ficheiro | O que faz |
|---|---|
| `consultar.ps1` | Corre um `.sql` e grava cada resultado em `<nome>.resultado-N.csv`, ao lado do `.sql`. |
| `1-descobrir-tabelas.sql` | 1.º passo: lista as tabelas e as vistas de vendas, recibos, pendentes, contas correntes e clientes, com o número de linhas e as colunas. |
| `2-fatura-paga.sql` | **Por escrever.** Escreve-se depois de ver o resultado do 1.º passo (dado o número da fatura, o cliente ou o NIF, diz se está paga, quando, com que recibo e quanto falta). |

## Regras

- **Só leitura.** O `consultar.ps1` recusa qualquer `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`, `EXEC`, `GRANT`, `BACKUP`, `DBCC`, `sp_…` e `xp_…`. Abre a ligação com `ApplicationIntent=ReadOnly` e lê com `READ UNCOMMITTED`, para não bloquear o ERP.
- **Primeiro na BD de testes.** A BD por omissão é a `Emp_Z004` (testes da Mudelar). A real da Mudelar é a `Emp_B004` e só se usa quando o Rúben disser.
- **A ligação não vai para o git.** Fica em `D:\Olyvia\.eticadata`, fora do repositório, numa linha:
  ```
  Server=BMINVESTE-SRV\ETICADATA;User ID=<utilizador>;Password=<password>
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
