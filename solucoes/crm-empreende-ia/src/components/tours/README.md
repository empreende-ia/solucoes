# Tours do CRM Empreende IA

Engine adaptada dos componentes locais de orientação da Lara. O catálogo descreve oito fluxos comerciais. Nenhum passo dispara a ação destacada, consulta dados pessoais ou marca onboarding como concluído.

## Integração

No layout autenticado, dentro do Router, envolva o shell **uma única vez**. `scope` usa os IDs canônicos da pessoa e da organização (não e-mail ou nome). Use `null` durante saída da conta e até a organização estar disponível.

```tsx
import { ProductTourProvider, TourLauncher, TourHelpCatalog } from '@/components/tours';

<ProductTourProvider
  scope={user && orgId ? { userId: user.id, orgId } : null}
  blocked={onboardingOpen}
>
  {/* shell e páginas */}
  <TourLauncher />
</ProductTourProvider>
```

`TourLauncher` deve ficar no cabeçalho/ajuda persistente; não colocar dentro de um modal. A primeira visita elegível mostra “Conhecer esta tela”, sem capturar foco. Depois de pausa mostra “Continuar tour” e “Recomeçar”. O botão permanece disponível para replay após conclusão/dispensa. Em telas sem alvos disponíveis, o botão desabilitado informa o motivo por `title` e nome acessível.

Na página Ajuda renderize `<TourHelpCatalog />` **dentro do provider**. O catálogo oferece os oito destinos e preferências separadas de convite e orientação automática. “Abrir tela” navega; a pessoa começa pelo disparador da tela de destino.

Os formulários Radix/HTML já bloqueiam os tours pela detecção de diálogos visíveis. `blocked` cobre também onboarding ou outros fluxos que não sejam diálogos. Troca de rota, query string, hash, organização, conta ou abertura de formulário encerra o overlay preservando o último passo. Nenhum pedido fica aguardando para abrir em uma rota diferente.

Se o shell tiver um destino estável de foco, marque seu botão/título com `data-tour-focus-fallback`. Quando o disparador não existir mais, o fechamento usa esse destino ou `main`. Um formulário aberto e um campo que a pessoa já focou têm prioridade sobre a restauração.

## Contrato de âncoras

Marque a região da página com `data-product-tour`. Cada alvo usa `data-tour`; não depende de classes CSS nem IDs de registros. Pode haver a mesma âncora em versões desktop/mobile: a engine escolhe a primeira visível. Ações sem permissão devem ficar ausentes conforme as regras da própria página.

| Roteiro (`data-product-tour`) | Caminho do catálogo | Âncoras `data-tour`, na ordem |
| --- | --- | --- |
| `dashboard` (aceita `today`) | `/dashboard` | `today-summary`, `today-attention`, `today-activities`, `shell-quick-actions` |
| `contacts` | `/contacts` | `contacts-search`, `contacts-filters`, `contacts-views`, `contacts-list`, `contacts-create` |
| `pipeline` | `/pipeline` | `pipeline-selector`, `pipeline-summary`, `pipeline-board`, `pipeline-move`, `pipeline-create` |
| `agenda` | `/agenda` | `agenda-view`, `agenda-date`, `agenda-filters`, `agenda-calendar`, `agenda-create` |
| `tasks` | `/tasks` | `tasks-filters`, `tasks-list`, `tasks-create`, `tasks-status` |
| `financeiro` | `/financeiro` | `finance-summary`, `finance-filters`, `finance-list`, `finance-create` |
| `automations` | `/automations` | `automations-list`, `automations-trigger`, `automations-create`, `automations-status` |
| `integrations` | `/settings/integrations` | `integrations-catalog`, `integrations-status`, `integrations-configure`, `integrations-help` |

Alvo ausente antes do início é omitido. Se desaparecer durante um passo, o cartão explica a ausência e permite avançar ou pausar. Uma tela sem alvos não abre máscara. O catálogo deve ser revisto quando mudar o comportamento ensinado. Alterar apenas texto não exige nova versão; mudanças incompatíveis nos passos exigem incrementá-la.

## Estado e verificação

Chave: `empreende-crm:tours:v1:<orgId codificado>:<userId codificado>`. Guarda apenas preferências, IDs/versões do roteiro e IDs dos passos pausados. `automatic=false` por padrão. Posição é salva a cada passo para resistir a recarga. JSON inválido volta ao padrão; storage bloqueado usa memória isolada por escopo. Não há sincronização entre dispositivos ou telemetria remota.

Os testes usam o diálogo Radix real, simulação de geometria no JSDOM, persistência real do ambiente de teste e stubs apenas para APIs de layout. Verificam opt-in, pause/replay, Esc, retorno de foco, bloqueios, ausência de alvos, recarga, versão, escopo, dados inválidos, fallback de storage e posicionamento em 320 px/teclado/zoom. A verificação visual no navegador continua necessária após integrar as âncoras reais, sobretudo Tab, light/dark, scroll em containers e viewport móvel.

```sh
npm test -- src/components/tours
npx tsc --noEmit -p tsconfig.app.json
npx eslint src/components/tours
```
