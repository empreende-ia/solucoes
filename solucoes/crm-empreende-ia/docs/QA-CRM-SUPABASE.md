# Validação do Supabase exclusivo

Data: 06/09/2026. Projeto **CRM Empreende IA**, referência `ldahvopyqkdiecchukwz`, organização administrativa **HG - Aulas** (`jbsjxwtmdhewvpsygrum`), região `sa-east-1`. [Painel do projeto](https://supabase.com/dashboard/project/ldahvopyqkdiecchukwz).

O custo informado na criação foi 0 por mês. A referência da organização Supabase é diferente dos IDs das organizações comerciais armazenadas pelo CRM. Os testes criaram dois espaços comerciais dentro deste único projeto.

## Banco e configuração

- Projeto conferido vazio antes da implantação: nenhuma tabela comercial, perfil ou migração anterior.
- Oito migrações aplicadas; versões locais alinhadas às registradas pelo MCP. Nenhum histórico de migração foi alterado por SQL.
- 19 tabelas públicas, todas com RLS. Sem grants de tabelas para `anon`/`PUBLIC` e sem funções `SECURITY DEFINER` no schema exposto.
- Advisor de segurança: zero apontamentos. Advisor de desempenho: zero avisos/erros; 49 informações sobre índices ainda não utilizados na consulta após implantação. Esses índices foram mantidos para os vínculos e consultas previstos; ausência de uso em um banco recém-criado não demonstra redundância. [Explicação do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- A oitava migração separa INSERT, UPDATE e DELETE nas políticas de seis tabelas de configuração, preservando papéis e grants e eliminando políticas SELECT sobrepostas.
- A cadeia completa passou por 149 verificações em PostgreSQL local descartável: 51 de isolamento/integridade e 98 sobre operações de configuração por papel/organização.
- `.env.local`, ignorado pelo Git, contém somente a URL e a chave pública para o frontend. A credencial administrativa nunca entrou na aplicação, e sua cópia temporária foi removida após os testes.

## Auth e PostgREST reais

Execução `20260906052751-8cff222d`: **105 verificações passaram**. Foram usadas três contas fictícias `example.test`, criadas pela API Auth Admin com confirmação individual. Não houve envio de e-mail nem alteração da confirmação global. [Contrato de criação administrativa](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

As operações comerciais usaram exclusivamente a chave pública e a sessão emitida para cada conta, sujeitas a RLS. A credencial administrativa ficou restrita à preparação e limpeza das contas fictícias e à geração de links de recuperação, sem envio de e-mail.

Cobertura:

- Login por senha, identidade conferida pelo servidor, JWT do projeto correto, perfil criado pelo trigger e renovação da sessão.
- Criação de dois espaços pela RPC pública e concessão de dono pelo banco.
- Empresa, contato, oportunidade e atividade vinculados; autoria, movimentação de etapa e histórico.
- Conclusão da atividade pelo mesmo ID e rejeição de atualização com versão obsoleta.
- Contratos PostgREST: `single`, `maybeSingle`, paginação inclusiva com contagem, e-mail único e repetição de upsert com ID estável.
- Leitura e gravação anônimas recusadas; isolamento de SELECT, INSERT, UPDATE, DELETE e RPC entre organizações; vínculos com responsável de outra organização recusados.
- Convite com e-mail confirmado e validade, aceite da terceira conta, permissões de colaborador e passagem para leitura pela RPC do dono. Mudanças de papel diretamente pela tabela e remoção do último dono recusadas.
- Exclusões comerciais pelo dono, reconsulta e logout das sessões de teste.

O relatório privado de execução registra os checks e os IDs sintéticos; credenciais e tokens não fazem parte da documentação ou do repositório.

## Interface com o banco real

**16 verificações de navegador passaram**, sem interceptações ou fixtures. Login pela interface, criação de contato, oportunidade e tarefa, conclusão em Hoje e consulta da ficha 360 foram conferidos no banco com os mesmos IDs. O papel de leitura pôde consultar, sem ações de edição, criação, exclusão ou reabertura. Não houve erros JavaScript nem respostas inesperadas de erro do backend.

O tour de Contatos percorreu cinco passos com teclado. O contador de mutações comerciais permaneceu em quatro antes e depois do tour: nenhuma gravação foi provocada pela orientação. As capturas de tela desta execução contêm exclusivamente dados fictícios.

## Recuperação de senha

O teste real reproduziu uma falha: depois que o SDK consumia o token do link, recarregar a página enviava a pessoa ao dashboard antes de concluir a troca de senha. A tela agora aguarda a inicialização do Auth e valida a identidade no servidor; uma sessão válida permite continuar após a recarga. Links inválidos e logout fecham o formulário. Falhas de gravação preservam o preenchimento e liberam nova tentativa.

Após a correção, **12 verificações reais passaram**. O navegador abriu diretamente um link gerado pelo Auth Admin, seguiu `/verify` até `http://127.0.0.1:8081/reset-password`, recarregou, salvou a nova senha e confirmou que ela funciona e a anterior é recusada. Um callback inválido não reutilizou a sessão já aberta. A geração administrativa do link não envia e-mail; sua entrega não foi testada e as configurações globais de Auth permaneceram inalteradas.

## Limpeza

As sessões das três contas foram revogadas globalmente. Uma transação removeu somente os dois espaços fictícios, conferindo seus IDs, nomes e membros esperados antes da exclusão. As três contas foram excluídas pela API Auth Admin. A consulta final confirmou zero usuários, perfis, organizações, contatos, oportunidades, atividades e registros de auditoria. Senhas sintéticas, tokens temporários e a cópia local da chave administrativa foram removidos. A estrutura comercial e suas políticas permanecem disponíveis para o primeiro cadastro real.

## Limites para uso compartilhado

Login e operações comerciais não comprovam entrega de e-mail, recuperação por e-mail ou disponibilidade de um frontend publicado. A URL de produção ainda precisa ser definida. O projeto deve permitir os destinos exatos de confirmação e recuperação usados nessa URL. [Configuração de redirecionamentos](https://supabase.com/docs/guides/auth/redirect-urls).

A conexão OAuth atual permite banco e administração do projeto, mas a leitura da configuração de autenticação retornou `403` por falta de `auth_config_read`. Nenhuma configuração de Auth foi alterada por esse caminho. Não foi verificado SMTP personalizado; o serviço padrão do Supabase restringe destinatários e não é adequado ao uso geral em produção. [Configuração de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Os 67 cenários de navegador com fixtures e os testes PostgreSQL locais são camadas adicionais de verificação; não devem ser apresentados como testes de entrega de e-mail ou observação de usuários reais.
