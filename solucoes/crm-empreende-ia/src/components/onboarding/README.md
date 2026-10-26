# Configuração comercial e orientação

`CrmOnboardingProvider` monta uma fonte compartilhada de evidências e o `ProductTourProvider`. Ele envolve o shell autenticado no `AppLayout`, após os estados de sessão, erro de perfil e criação de organização. O guia é manual e bloqueia tours enquanto estiver aberto.

`CrmSetupChecklist`, na Ajuda, e `CrmSetupGuide` leem os mesmos resultados de `useCrmOnboarding`. Os cinco critérios são:

1. Nome da organização e nome do perfil atual preenchidos.
2. Existência de pipeline e etapa da organização. O esquema comercial garante o vínculo da etapa ao pipeline por chave estrangeira composta.
3. Contato disponível na organização.
4. Oportunidade disponível na organização.
5. Atividade disponível na organização.

As consultas selecionam apenas `name` ou `id`, filtram organização e pessoa quando aplicável e retornam estados `done`, `pending` ou `error`. Falhas parciais ficam visíveis e não contam como conclusão. A Ajuda e a abertura do guia atualizam a verificação; a pessoa também pode usar **Verificar novamente**.

Nenhuma etapa é concluída por avançar no guia ou assistir a um tour. Não há gravação em `profiles.onboarding_completed` nem na antiga estrutura de `onboarding_progress`. Apenas a posição do guia (`version`, `stepId`) fica no navegador, com chave por usuário e organização e fallback em memória. Isso não representa configuração concluída.

O evento `empreende-crm:open-onboarding` abre o guia manualmente em Configurações. O mesmo fluxo é acessível pela Ajuda e pelas ações rápidas. As ações levam aos formulários reais: `/settings?tab=organization`, `/settings?tab=profile`, `/settings?tab=pipelines`, `/contacts`, `/pipeline` e `/tasks`. Esc e fechar preservam a posição; trocar de rota, organização ou conta fecha o guia.

O shell expõe `TourLauncher` no cabeçalho em desktop e celular. Busca usa `ShellContext`; o Copiloto usa `empreende-crm:open-copilot`. Ações rápidas de criação respeitam `useCrmPermissions` e os contratos atuais de rota.

Validação automatizada cobre derivação dos critérios, erros, escopo das consultas, guia manual, Esc/foco/retomada, troca de organização, permissões, navegação real, catálogo na Ajuda, fechamento entre diálogos e bloqueio de tours. As consultas reais e o comportamento visual devem integrar o teste do ambiente comercial.
