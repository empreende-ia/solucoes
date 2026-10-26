# Visão geral do CRM Empreende IA

Atualizado em 26/10/2026.

## O que é

CRM comercial para equipes de qualquer segmento. Organiza pessoas, empresas, oportunidades e atividades em torno de uma pergunta: **qual é o próximo passo de cada relacionamento, quem é responsável e quando vence?**

O produto é multiorganização. Cada empresa cliente trabalha em um espaço isolado, com papéis próprios e dados protegidos por RLS no banco.

## Para quem

- Equipes comerciais pequenas e médias que hoje acompanham clientes em planilhas, WhatsApp e memória.
- Operações de serviço com ciclo consultivo: agências, consultorias, escolas, clínicas, software, prestadores B2B.
- Gestores que precisam ver a carteira da equipe sem depender de relatórios manuais.

## Módulos

| Módulo | Rota | O que resolve |
| --- | --- | --- |
| Hoje | `/dashboard` | Tarefas e compromissos do dia, vencidos, sem prazo e fila de atenção com motivo explícito |
| Contatos | `/contacts` | Lista com busca, filtros, visões salvas e ficha 360 (dados, próxima ação, histórico, oportunidades) |
| Empresas | `/companies` | Organizações relacionadas aos contatos, com ficha e vínculos |
| Pipeline | `/pipeline` | Funis e etapas configuráveis, arrastar ou mover por menu, ganho/perda com regras, previsão ponderada |
| Agenda | `/agenda` | Visões diária e semanal das reuniões e compromissos |
| Atividades e Tarefas | `/activities`, `/tasks` | Tarefas, reuniões, ligações, e-mails registrados e notas, com responsável e prazo |
| Financeiro | `/financeiro` | Recebimentos pendentes, pagos e cancelados, separados do valor das oportunidades |
| Relatórios | `/reports` | Funil, valor em aberto, ganho, previsão ponderada e exportação |
| Automações | `/automations` | Criação de tarefas a partir de eventos de oportunidade, com revisão antes de ativar e log |
| Templates | `/templates` | Modelos de rascunho de mensagens |
| Equipe | `/team` | Convites por link, papéis e auditoria |
| Configurações | `/settings` | Organização, funis, regras de atenção, integrações (CSV, ICS) e segurança |
| Copiloto | botão no cabeçalho | Análise da rotina com fontes, lacunas explícitas e sugestões revisáveis |

## Papéis

| Papel | Pode |
| --- | --- |
| Dono / Administrador | Configurar organização, funis, regras, automações, equipe; excluir registros |
| Colaborador | Criar e alterar contatos, empresas, oportunidades e atividades |
| Leitura | Consultar todos os dados comerciais da organização, sem gravar |

## Diferenciais de produto

- **Próxima ação sempre visível.** Cada contato e oportunidade mostra a atividade pendente de menor prazo. Sem prazo, aparece como lacuna, não com data inventada.
- **Fila de atenção explicável.** Atrasos, falta de responsável, falta de próxima ação e oportunidades paradas, com regras configuráveis e sem score opaco.
- **Previsão honesta.** Valor em aberto, previsão ponderada e recebimento são números separados.
- **Copiloto com evidências.** Cada afirmação aponta para o registro de origem e declara o que não está confirmado. Nada é gravado sem revisão.
- **Orientação embutida.** Oito tours guiados com pausa e retomada, além de checklist de configuração baseado nos dados reais.
- **Segurança por padrão.** Isolamento por organização no banco, papéis verificados no servidor, auditoria e convites de uso único.
- **Design System Empreende.IA V2.** Manrope, temas claro e escuro, desktop e celular (a partir de 320 px).

## Limites atuais

- O Copiloto usa regras determinísticas; nenhum modelo de IA externo está conectado.
- Não há envio de e-mail ou WhatsApp pelo CRM nem sincronização contínua com Google/Outlook (apenas exportação ICS).
- Importação por CSV até 500 contatos / 2 MB por arquivo.

Status detalhado e próximos passos: [STATUS-E-ROADMAP.md](STATUS-E-ROADMAP.md).
