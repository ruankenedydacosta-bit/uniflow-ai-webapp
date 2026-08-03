# Inventário de funcionalidades "Em breve" — UniFlow AI

Data: 2026-07-30. Levantamento por busca textual + navegação funcional do código (não visual em navegador, ver limitação no relatório final).

Achado geral: quase todas as ocorrências de "Em breve" são honestas — texto real, `disabled` genuíno, cobertas por teste que garante que o rótulo continua lá. As exceções (onde a experiência real diverge do texto, ou onde falta um "Em breve" que deveria existir) estão marcadas em **negrito** na coluna "Observação".

| # | Texto exibido | Tela | Componente | Função planejada | Estado técnico | Código parcial? | Backend existe? | Concluir agora? | Continuar "Em breve"? | Ocultar no MVP? | Complexidade |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | "A assinatura será disponibilizada em breve." | Plano Pessoal | `PersonalPlanPage.jsx` | Cobrança real via Asaas | Botão real chama `startSubscription()` (stub) | Sim — stub isolado, pronto para plugar | Não (tabelas existem, provedor não) | **Sim — é a prioridade #1 do MVP** | Não | Não | **Muito alto** |
| 2 | "Os documentos legais serão disponibilizados em breve." | Cadastro (checkbox de consentimento) | `AuthLegalNotice.jsx` / `MobileAuthPage.jsx` | Termos de Uso / Política de Privacidade reais | Só o toast existe | Não | Não | **Sim — bloqueador de conformidade** | Não | Não | Médio |
| 3 | (nenhum texto — recurso ausente) | Conta → Privacidade e dados | `SimplifiedAccountSubpagePlaceholder.jsx` | Exclusão de conta (LGPD) | Placeholder genérico "em breve você verá aqui..." | Não | Não | **Sim — bloqueador de conformidade** | Não | Não | Alto |
| 4 | "A gestão completa da assinatura ... ainda não está disponível." | Seu Plano → Gerenciar assinatura | `SimplifiedPlanPage.jsx` | Trocar forma de pagamento, ver faturas | Modal informativo | Não | Não (depende de Asaas) | Sim, junto com Asaas | Até lá, sim | Não | Alto (depende de #1) |
| 5 | "O cancelamento automático ainda não está disponível nesta versão." | Pagamento e assinatura → Cancelar | `SimplifiedPaymentsPage.jsx` | Cancelamento de assinatura | Modal informativo, redireciona ao suporte | Não | Não | Sim, junto com Asaas | Até lá, sim | Não | Médio (depende de #1) |
| 6 | "Forma de pagamento ainda não configurada." / "Nenhum pagamento disponível." | Pagamento e assinatura | `SimplifiedPaymentsPage.jsx` | Exibir cartão/Pix/boleto e histórico real | Estado vazio honesto | Não | Não | Sim, junto com Asaas | Até lá, sim | Não | Alto (depende de #1) |
| 7 | "Login com Google/Apple estará disponível em breve." | — | `authMobileSchema.js` (`getSocialUnavailableResult`) | Apple Sign-In | **Código morto — função nunca chamada; nem existe botão Apple na tela** | Não (helper existe mas não é usado) | N/A | Decidir: implementar Apple ou remover o helper morto | Se não implementar, remover o código morto | Não | Médio |
| 8 | "Verificação em duas etapas... estará disponível em uma futura versão." | Segurança | `SimplifiedSecurityPage.jsx` | 2FA | Rótulo honesto, `disabled` real | Não | Não | Não — pós-MVP | Sim | Não | Alto |
| 9 | "Trocar foto" → "O envio de novas fotos ainda não está disponível." | Editar perfil | `SimplifiedEditProfilePage.jsx` | Upload de avatar | Remoção de foto é real; upload é stub | Não | Parcial (Storage existe, sem endpoint de upload aqui) | Não — pode esperar | Sim | Não | Médio |
| 10 | "Como deseja ser chamado", "Forma de tratamento", "Tamanho do texto" | Editar perfil | `SimplifiedEditProfilePage.jsx` | Preferências extras de perfil | Rótulo honesto — colunas não existem em `profiles` | Não | Não | Não | Sim | Não | Baixo |
| 11 | "Estará disponível em breve" (diversos botões "Perguntar à Uni") | Clientes, Agenda, Projetos, Relatórios, CRM, Financeiro (desktop) | `ClientesPage.jsx`, `AgendaPage.jsx`, `ProjectsPage.jsx`, `ReportsPage.jsx`, `CRMPage.jsx`, `FinanceiroPage.jsx` | Assistente contextual da Uni dentro de cada módulo | `disabled` real, com `title` explicando, testado | Não | N/A | Não — fora do escopo do MVP pessoal | Sim | Não (são PJ, fora do MVP de lançamento pessoal, ver Parte 9) | Alto |
| 12 | Conexão bancária automática (Open Finance) | Financeiro | `OpenFinanceConnectionAnimation.jsx` | Sincronizar contas automaticamente | Schema/tabelas prontos (migration 004), zero provedor real | Parcial (infra de banco pronta) | Sim (tabelas), não (provedor externo) | Não | Sim | Não | Muito alto |
| 13 | "Disponível em breve" (Configurações desktop, itens variados) | `SettingsPage.jsx` | — | Diversos | `disabled` real, testado | Não | — | Não | Sim | Não | Variável |

## Separação por horizonte

**Essencial para o lançamento (P0/P1 do roadmap):**
- #1 (Asaas / assinatura real)
- #2 (Termos/Privacidade)
- #3 (Exclusão de conta)
- #4, #5, #6 (dependem diretamente de #1)
- #7 (decisão binária: implementar ou remover o código morto do Apple Sign-In)

**Importante, mas adiável (P2):**
- #9 (upload de avatar)
- #10 (preferências extras de perfil)

**Diferencial pós-MVP (P3):**
- #8 (2FA)
- #12 (Open Finance)

**Enterprise/PJ (fora do escopo do MVP pessoal):**
- #11 (assistente contextual da Uni em CRM/Clientes/Projetos/Agenda/Relatórios)

**Recurso futuro sem data (P3):**
- #13 (itens variados de Configurações desktop)

## Nota sobre o levantamento

Esta auditoria combinou busca textual e leitura funcional do código (handlers, testes, migrations). Não foi feita navegação visual real em navegador página a página — ver a limitação declarada no relatório final. Onde a leitura de código já revelou com certeza o comportamento (ex.: `disabled` + teste que trava o texto), isso foi tratado como equivalente à confirmação visual.
