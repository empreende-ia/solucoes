# Publicação do CRM

Configuração preparada para uma futura publicação na Vercel, ainda **sem projeto de hospedagem criado ou URL publicada**. Publicação e domínio não bloqueiam o aceite técnico local definido pelo usuário. O Supabase já está provisionado e validado; este documento cobre a etapa posterior de acesso compartilhado.

## Artefato preparado

`vercel.json` define Vite, instalação com `bun install --frozen-lockfile`, build `bun run build:deploy` e saída `dist`. O lockfile validado é `bun.lock`. A regra de SPA direciona as rotas internas para `index.html`, permitindo que o React Router abra fichas, convites e recuperação de senha por link direto. É a configuração indicada pela [documentação oficial de Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas).

`.vercelignore` exclui arquivos de ambiente, documentação, legado, banco e testes do envio pelo CLI. As variáveis de ambiente devem ser configuradas no projeto de hospedagem. Os arquivos locais da conexão Vercel ficam ignorados pelo Git. [Contrato do arquivo de exclusão](https://vercel.com/docs/deployments/vercel-ignore).

O comando de publicação usa o modo `deployment`: falha antes de gerar o frontend se a configuração do Supabase estiver ausente ou inválida. A instalação com lockfile congelado e o build configurado foram conferidos localmente. Essa verificação não comprova execução na infraestrutura da Vercel.

## Configuração do projeto de hospedagem

| Campo | Valor |
| --- | --- |
| Repositório | `henriquegabriel-ia/crm-empreende-ia` |
| Diretório raiz | Raiz do repositório |
| Framework | Vite |
| Instalação / build / saída | Definidos em `vercel.json` |
| `VITE_CRM_ENVIRONMENT` | `dedicated` |
| `VITE_SUPABASE_URL` | `https://ldahvopyqkdiecchukwz.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública do projeto exclusivo, configurada pelo canal de ambiente |
| `VITE_SUPPORT_EMAIL` | Opcional, após definir o destino de suporte |

Essas variáveis entram no bundle do navegador. Credenciais administrativas, SMTP e provedores de IA não pertencem a esse frontend. Mudanças nas variáveis requerem um novo build. A configuração da hospedagem deve apontar ao projeto exclusivo do CRM.

## Acesso e e-mails

Depois de existir uma URL estável, configurar o Site URL do Supabase e os destinos de confirmação e recuperação dessa origem. O CRM usa a raiz para confirmação/login e `/reset-password` para recuperação; convites preservam o parâmetro `invite`. Conferir o retorno do parâmetro no fluxo completo do convite. [Destinos permitidos pelo Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

Conferir o serviço de entrega e o remetente antes de liberar cadastro geral. A confirmação global de e-mail foi preservada; somente as contas fictícias de QA receberam confirmação administrativa. Entrega de e-mail não foi testada. A configuração Auth por Management API exige permissões que a conexão OAuth atual não recebeu; usar a configuração autorizada do painel ou ampliar o escopo de Auth quando esse passo for executado. [SMTP no Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Aceite na URL escolhida

1. Conferir que JS, CSS, fontes e marca carregam e que abrir/recarregar `/contacts`, `/pipeline`, `/invite` e `/reset-password` não resulta em erro da hospedagem.
2. Confirmar que o navegador chama somente o Supabase exclusivo. Validar login, recarga de sessão, criação do espaço e os papéis esperados.
3. Repetir contato → oportunidade → próxima ação → conclusão → 360; comparar os mesmos IDs e estados. As contas de QA anteriores foram removidas.
4. Com os destinatários de teste definidos, verificar confirmação, convite e recuperação de senha, incluindo expiração e recarga. Envio de mensagens de teste depende dessa autorização específica.
5. Executar `PILOTO-CRM.md` com participantes reais e registrar as dificuldades que motivarão a revisão de tours e ajuda.

O retorno à versão anterior do frontend deve usar uma implantação já validada. Não reverter o banco por inferência nem apontar ao backend legado. As migrações comerciais atuais foram implantadas em um banco novo e não transformaram dados de outro sistema.
