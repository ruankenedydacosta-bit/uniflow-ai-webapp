# Mobile Auth Foundation V1

## Objetivo

Criar uma entrada mobile-first para a UniFlow AI sem duplicar autenticação nem integrar provedores
sociais. A fundação prioriza clareza, acesso com uma mão, campos mínimos e continuidade com o Auth
Supabase já existente.

## Fluxo

1. `/` redireciona para `/welcome` quando não há sessão aplicável.
2. `/welcome` apresenta três benefícios reais da experiência.
3. `Criar minha conta` abre `/login?mode=signup`.
4. `Já tenho uma conta` abre `/login`.
5. Email e senha usam o `SessionContext` e o `authService` existentes.
6. Cadastro autenticado segue para `/onboarding`; perfil concluído segue para `/dashboard`.

Sessões autenticadas são redirecionadas de `/`, `/welcome` e `/login` para onboarding ou dashboard.
Rotas protegidas preservam os guards atuais. No ambiente sem Supabase, o demo continua disponível.

## Componentes

- `MobileWelcomePage`: entrada pública e identidade da marca.
- `WelcomeCarousel` e `WelcomeSlide`: navegação por botões, indicadores e swipe.
- `MobileAuthPage`: composição dos modos entrar e criar conta.
- `AuthModeSwitch`: alternância acessível na mesma rota.
- `SocialAuthButtons`: contrato visual desacoplado de OAuth.
- `EmailAuthForm`: validação local e envio pelo contexto existente.
- `AuthLegalNotice`: aceite obrigatório no cadastro.

## Estados

Os estados locais cobrem modo, slide ativo, senha visível, envio, validação, erro humano e feedback
informativo. Nenhum estado contém token, sessão ou credencial além dos campos transitórios do
formulário. Os callbacks sociais recebem somente o modo visual atual.

## Responsividade e acessibilidade

O layout é mobile por padrão e suporta 320, 360, 375, 390 e 430 px sem regra específica por aparelho.
Em 480 px amplia o formulário; em 768 px adota composição desktop. Safe areas, `100svh`, rolagem,
labels reais, foco visível, mensagens associadas e alvos de toque são preservados. Swipe horizontal
é complementar aos botões e indicadores, nunca obrigatório.

## Google e Apple

Os botões chamam callbacks isolados `onGoogleAuth` e `onAppleAuth`. Sem callback integrado, retornam
somente mensagens de disponibilidade futura. A página não conhece Supabase OAuth, endpoint, SDK,
client ID ou segredo. Uma integração futura poderá substituir apenas esses callbacks.

## Limites desta etapa

- Google e Apple não autenticam.
- Recuperação de senha exibe feedback local e não envia email.
- Termos e Política ainda não possuem páginas públicas.
- Não há persistência local do carrossel.
- Não foram adicionadas credenciais, migrations, providers, HTTP ou dependências.
- O onboarding funcional e os módulos internos do produto não foram alterados.

## Próxima etapa

Validar textos legais e recuperação de senha, medir a experiência em dispositivos físicos e somente
depois planejar OAuth em ambiente DEV com redirects, PKCE e configuração segura no backend.
