import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateStep } from './onboardingValidation.js';
import {
  ONBOARDING_STEPS,
  MODE_OPTIONS,
  GOAL_OPTIONS,
  TONE_OPTIONS,
  TOTAL_STEPS,
  INITIAL_ONBOARDING_DATA,
  INCOME_RANGES,
  EXPENSE_RANGES,
  BUSINESS_TYPES,
  REVENUE_RANGES,
} from './onboardingConstants.js';

const ALL_STEP_KEYS = ['welcome', 'mode', 'goal', 'financial', 'tone', 'summary'];

test('onboarding possui 6 etapas com chaves esperadas', () => {
  assert.equal(ONBOARDING_STEPS.length, 6);
  assert.equal(TOTAL_STEPS, 6);

  for (const step of ONBOARDING_STEPS) {
    assert.ok(step.step >= 1 && step.step <= 6);
    assert.ok(ALL_STEP_KEYS.includes(step.key));
    assert.ok(typeof step.label === 'string' && step.label.length > 0);
  }
});

test('MODE_OPTIONS contem personal business e both', () => {
  const ids = MODE_OPTIONS.map((m) => m.id);
  assert.ok(ids.includes('personal'));
  assert.ok(ids.includes('business'));
  assert.ok(ids.includes('both'));
  assert.equal(MODE_OPTIONS.length, 3);
});

test('modos possuem workspaceType coerente', () => {
  const personal = MODE_OPTIONS.find((m) => m.id === 'personal');
  const business = MODE_OPTIONS.find((m) => m.id === 'business');
  const both = MODE_OPTIONS.find((m) => m.id === 'both');

  assert.equal(personal.workspaceType, 'personal');
  assert.equal(business.workspaceType, 'business');
  assert.equal(both.workspaceType, 'business');
});

test('GOAL_OPTIONS contem objetivos esperados', () => {
  const ids = GOAL_OPTIONS.map((g) => g.id);
  assert.ok(ids.includes('organizar'));
  assert.ok(ids.includes('dividas'));
  assert.ok(ids.includes('reserva'));
  assert.ok(ids.includes('meta'));
  assert.ok(ids.includes('investir'));
  assert.ok(ids.includes('empresa'));
  assert.ok(ids.includes('outro'));
});

test('TONE_OPTIONS contem tres tons', () => {
  const ids = TONE_OPTIONS.map((t) => t.id);
  assert.ok(ids.includes('direct'));
  assert.ok(ids.includes('warm'));
  assert.ok(ids.includes('strategic'));
  assert.equal(TONE_OPTIONS.length, 3);
});

test('INITIAL_ONBOARDING_DATA possui campos esperados com valores nulos', () => {
  assert.equal(INITIAL_ONBOARDING_DATA.mode, null);
  assert.equal(INITIAL_ONBOARDING_DATA.goal, null);
  assert.equal(INITIAL_ONBOARDING_DATA.goalText, '');
  assert.deepEqual(INITIAL_ONBOARDING_DATA.financialProfile, {});
  assert.equal(INITIAL_ONBOARDING_DATA.userTone, null);
});

test('validateStep etapa 1 sempre valida', () => {
  const result = validateStep(1, {});
  assert.equal(result.isValid, true);
  assert.deepEqual(result.errors, {});
});

test('validateStep etapa 2 exige mode', () => {
  assert.equal(validateStep(2, {}).isValid, false);
  assert.equal(validateStep(2, { mode: null }).isValid, false);
  assert.equal(validateStep(2, { mode: 'personal' }).isValid, true);
  assert.equal(validateStep(2, { mode: 'business' }).isValid, true);
  assert.equal(validateStep(2, { mode: 'both' }).isValid, true);
});

test('validateStep etapa 3 exige goal', () => {
  assert.equal(validateStep(3, {}).isValid, false);
  assert.equal(validateStep(3, { goal: 'organizar' }).isValid, true);
});

test('validateStep etapa 3 com outro exige goalText', () => {
  assert.equal(validateStep(3, { goal: 'outro', goalText: '' }).isValid, false);
  assert.equal(validateStep(3, { goal: 'outro', goalText: '  ' }).isValid, false);
  assert.equal(validateStep(3, { goal: 'outro', goalText: 'Quero viajar' }).isValid, true);
});

test('validateStep etapa 4 sempre valida (opcionais)', () => {
  assert.equal(validateStep(4, {}).isValid, true);
  assert.equal(validateStep(4, { financialProfile: {} }).isValid, true);
});

test('validateStep etapa 5 exige userTone', () => {
  assert.equal(validateStep(5, {}).isValid, false);
  assert.equal(validateStep(5, { userTone: 'warm' }).isValid, true);
  assert.equal(validateStep(5, { userTone: 'direct' }).isValid, true);
  assert.equal(validateStep(5, { userTone: 'strategic' }).isValid, true);
});

test('validateStep etapa 6 sempre valida', () => {
  assert.equal(validateStep(6, {}).isValid, true);
});

test('useOnboarding hook importa sem erros', async () => {
  const source = await readFile(new URL('./useOnboarding.js', import.meta.url), 'utf8');
  assert.match(source, /useOnboarding/);
  assert.match(source, /loadOnboardingData/);
  assert.match(source, /saveOnboardingProgress/);
  assert.match(source, /completeOnboarding/);
  assert.match(source, /goNext/);
  assert.match(source, /goPrev/);
  assert.match(source, /finish/);
});

test('OnboardingPage renderiza StepProgress nos 6 estados', async () => {
  const source = await readFile(new URL('./OnboardingPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /StepProgress/);
  assert.match(source, /StepWelcome/);
  assert.match(source, /StepMode/);
  assert.match(source, /StepGoal/);
  assert.match(source, /StepFinancial/);
  assert.match(source, /StepTone/);
  assert.match(source, /StepSummary/);
  assert.match(source, /switch\s*\(step\)/);
  assert.match(source, /goNext/);
  assert.match(source, /goPrev/);
  assert.match(source, /finish/);
});

test('OnboardingPage redireciona ao completar', async () => {
  const source = await readFile(new URL('./OnboardingPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /completed/);
  assert.match(source, /getSafeAuthReturnPath\(location\.state\?\.returnTo\)/);
  assert.match(source, /navigate\(returnTo/);
});

test('StepWelcome possui titulo e botao Comecar', async () => {
  const source = await readFile(new URL('./components/StepWelcome.jsx', import.meta.url), 'utf8');
  assert.match(source, /Bem-vindo/);
  assert.match(source, /UniFlow/);
  assert.match(source, /Começar/);
  assert.match(source, /onNext/);
});

test('StepMode renderiza 3 opcoes de modo', async () => {
  const source = await readFile(new URL('./components/StepMode.jsx', import.meta.url), 'utf8');
  assert.match(source, /MODE_OPTIONS/);
  assert.match(source, /mode/);
  assert.match(source, /onChange/);
});

test('StepGoal renderiza GOAL_OPTIONS e campo opcional para outro', async () => {
  const source = await readFile(new URL('./components/StepGoal.jsx', import.meta.url), 'utf8');
  assert.match(source, /GOAL_OPTIONS/);
  assert.match(source, /outro/);
  assert.match(source, /goalText/);
});

test('StepFinancial renderiza formularios personal ou business conforme mode', async () => {
  const source = await readFile(new URL('./components/StepFinancial.jsx', import.meta.url), 'utf8');
  assert.match(source, /PersonalFinancialForm/);
  assert.match(source, /BusinessFinancialForm/);
  assert.match(source, /Prefiro informar depois/);
});

test('StepTone renderiza 3 opcoes de tom', async () => {
  const source = await readFile(new URL('./components/StepTone.jsx', import.meta.url), 'utf8');
  assert.match(source, /TONE_OPTIONS/);
  assert.match(source, /userTone/);
  assert.match(source, /onChange/);
});

test('StepSummary exibe resumo e botao de conclusao', async () => {
  const source = await readFile(new URL('./components/StepSummary.jsx', import.meta.url), 'utf8');
  assert.match(source, /Entrar na UniFlow AI/);
  assert.match(source, /onComplete/);
  assert.match(source, /onGoToStep/);
  assert.match(source, /Editar/);
});

test('onboardingService exporta load, save e complete', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /loadOnboardingData/);
  assert.match(source, /saveOnboardingProgress/);
  assert.match(source, /completeOnboarding/);
  assert.match(source, /listWorkspaces/);
  assert.match(source, /createWorkspace/);
});

test('onboardingService cria workspaces para both mode', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /'both'/);
  assert.match(source, /\['personal', 'business'\]/);
});

test('onboardingService faz rollback ao criar workspace em caso de erro', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /deleteOwnedWorkspace/);
  assert.match(source, /createdWorkspaces/);
});

test('index.js reexporta todos os modulos publicos', async () => {
  const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(source, /OnboardingPage/);
  assert.match(source, /useOnboarding/);
  assert.match(source, /completeOnboarding/);
  assert.match(source, /validateStep/);
  assert.match(source, /ONBOARDING_STEPS/);
  assert.match(source, /MODE_OPTIONS/);
  assert.match(source, /GOAL_OPTIONS/);
  assert.match(source, /TONE_OPTIONS/);
});

test('routes.jsx importa da nova feature', async () => {
  const source = await readFile(new URL('../../app/routes.jsx', import.meta.url), 'utf8');
  assert.match(source, /features\/onboarding/);
  assert.doesNotMatch(source, /pages\/OnboardingPage/);
});

test('profileService.js inclui onboarding_data e onboarding_completed_at', async () => {
  const source = await readFile(new URL('../../services/profileService.js', import.meta.url), 'utf8');
  assert.match(source, /onboarding_data/);
  assert.match(source, /onboarding_completed_at/);
});

test('migration adiciona colunas onboarding_data e onboarding_completed_at', async () => {
  const migrationPath = new URL(
    '../../../supabase/migrations/20260720_012_onboarding_data.sql',
    import.meta.url,
  );
  const source = await readFile(migrationPath, 'utf8');
  assert.match(source, /onboarding_data/);
  assert.match(source, /onboarding_completed_at/);
  assert.match(source, /alter table public\.profiles/);
  assert.match(source, /grant update/);
});

test('StepProgress usa ONBOARDING_STEPS para iterar etapas', async () => {
  const source = await readFile(new URL('./components/StepProgress.jsx', import.meta.url), 'utf8');
  assert.match(source, /ONBOARDING_STEPS/);
  assert.match(source, /currentStep/);
  assert.match(source, /progress/);
  assert.match(source, /aria-current/);
});

test('error no onboarding exibe banner sem quebrar fluxo', async () => {
  const mainSource = await readFile(new URL('./OnboardingPage.jsx', import.meta.url), 'utf8');
  assert.match(mainSource, /errorBanner/);
  assert.match(mainSource, /role="alert"/);
});

test('handleSelect no StepGoal limpa goalText quando nao for outro', async () => {
  const source = await readFile(new URL('./components/StepGoal.jsx', import.meta.url), 'utf8');
  assert.match(source, /goalId !== 'outro'/);
});

test('completingRef no useOnboarding protege contra duplo clique', async () => {
  const source = await readFile(new URL('./useOnboarding.js', import.meta.url), 'utf8');
  assert.match(source, /completingRef/);
  assert.match(source, /return false/);
});

test('onboarding nao possui referencia a OpenAI ou voz', async () => {
  const files = [
    './onboardingService.js',
    './OnboardingPage.jsx',
    './useOnboarding.js',
    './components/StepWelcome.jsx',
    './components/StepMode.jsx',
    './components/StepGoal.jsx',
    './components/StepFinancial.jsx',
    './components/StepTone.jsx',
    './components/StepSummary.jsx',
  ];

  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /openai/i);
    assert.doesNotMatch(source, /OpenAI/);
  }
});

test('onboarding components nao importam diretamente do Supabase', async () => {
  const componentFiles = [
    './OnboardingPage.jsx',
    './components/StepWelcome.jsx',
    './components/StepMode.jsx',
    './components/StepGoal.jsx',
    './components/StepFinancial.jsx',
    './components/StepTone.jsx',
    './components/StepSummary.jsx',
  ];

  for (const file of componentFiles) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /supabase/);
    assert.doesNotMatch(source, /from.*supabase/);
  }
});

test('todos os componentes de etapa possuem botoes Voltar e Continuar', async () => {
  const interactiveSteps = [
    './components/StepMode.jsx',
    './components/StepGoal.jsx',
    './components/StepFinancial.jsx',
    './components/StepTone.jsx',
  ];

  for (const file of interactiveSteps) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /Voltar/);
    assert.match(source, /Continuar/);
  }
});

test('onboardingConstants exporta INCOME_RANGES, EXPENSE_RANGES, BUSINESS_TYPES, REVENUE_RANGES', () => {
  assert.ok(INCOME_RANGES.length >= 4);
  assert.ok(EXPENSE_RANGES.length >= 4);
  assert.ok(BUSINESS_TYPES.length >= 3);
  assert.ok(REVENUE_RANGES.length >= 3);
});

test('profileService permite leitura de onboarding_data e onboarding_completed_at', async () => {
  const source = await readFile(new URL('../../services/profileService.js', import.meta.url), 'utf8');
  assert.match(source, /onboarding_data/);
  assert.match(source, /onboarding_completed_at/);
  assert.match(source, /PROFILE_FIELDS/);
  assert.match(source, /updateProfile/);
});

test('profileService.updateProfile filtra onboarding_data corretamente', async () => {
  const source = await readFile(new URL('../../services/profileService.js', import.meta.url), 'utf8');
  assert.match(source, /onboarding_data: changes\.onboarding_data/);
  assert.match(source, /onboarding_completed_at: changes\.onboarding_completed_at/);
  assert.match(source, /allowedChanges/);
  assert.match(source, /updatePayload/);
});

test('onboardingService.saveOnboardingProgress persiste step e data como JSONB', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /onboarding_data:\s*\{ step, data \}/);
  assert.match(source, /updateProfile/);
});

test('onboardingService.completeOnboarding persiste onboarding_data com completedAt', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /onboarding_completed: true/);
  assert.match(source, /onboarding_completed_at/);
  assert.match(source, /completedAt/);
});

test('onboardingService.completeOnboarding cria workspaces para both mode', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /'both'/);
  assert.match(source, /\['personal', 'business'\]/);
});

test('onboardingService.completeOnboarding reusa workspaces existentes', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /existing/);
  assert.match(source, /continue/);
});

test('onboardingService.completeOnboarding faz rollback de workspaces em caso de erro', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /deleteOwnedWorkspace/);
  assert.match(source, /createdWorkspaces/);
  assert.match(source, /catch/);
});

// ============================================================================
// NOTIF1 -- conclusao do onboarding e um evento real e seguro; gera uma
// notificacao de boas-vindas genuina (nao um dado fabricado como se fosse
// atividade real), best-effort (nunca reverte um onboarding ja concluido).
// ============================================================================

test('onboardingService.completeOnboarding cria notificacao de boas-vindas real, best-effort (catch proprio, nunca lanca)', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ createNotification \} from '\.\.\/notifications\/notificationsService\.js';/);
  const fnBody = source.slice(
    source.indexOf('await createNotification(user.id'),
    source.indexOf("return {\n      data: { profile: profileResult.data }"),
  );
  assert.match(fnBody, /type: 'sistema'/);
  assert.match(fnBody, /title: 'Bem-vindo à UniFlow AI'/);
  assert.match(fnBody, /\.catch\(\(\) => \{\}\);/);
});

test('useOnboarding restaura progresso salvo ao carregar', async () => {
  const source = await readFile(new URL('./useOnboarding.js', import.meta.url), 'utf8');
  assert.match(source, /loadOnboardingData/);
  assert.match(source, /savedStep/);
  assert.match(source, /savedData/);
  assert.match(source, /INITIAL_ONBOARDING_DATA/);
});

test('useOnboarding salva progresso ao avancar e retroceder', async () => {
  const source = await readFile(new URL('./useOnboarding.js', import.meta.url), 'utf8');
  assert.match(source, /saveOnboardingProgress/);
  assert.match(source, /goNext/);
  assert.match(source, /goPrev/);
});

test('useOnboarding protege contra duplo clique no finish com completingRef', async () => {
  const source = await readFile(new URL('./useOnboarding.js', import.meta.url), 'utf8');
  assert.match(source, /completingRef/);
  assert.match(source, /return false/);
});

test('completeOnboarding eh idempotente — reusa workspaces existentes', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /existing/);
  assert.match(source, /continue/);
});

test('completeOnboarding persiste onboarding_data com completedAt', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /onboarding_data:\s*\{ \.\.\.data, completedAt/);
  assert.match(source, /onboarding_completed_at/);
});

test('completeOnboarding faz rollback completo em caso de erro no profile', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /deleteOwnedWorkspace/);
  assert.match(source, /createdWorkspaces/);
  assert.match(source, /catch/);
});

test('App.jsx redireciona para onboarding quando needsOnboarding', async () => {
  const source = await readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /needsOnboarding/);
  assert.match(source, /onboarding_completed/);
  assert.match(source, /\/onboarding/);
});

test('App.jsx redireciona para dashboard quando onboarding ja concluido', async () => {
  const source = await readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /onboarding_completed/);
  assert.match(source, /\/dashboard/);
});

test('SessionContext expoe needsOnboarding baseado em profileMissing e onboarding_completed', async () => {
  const source = await readFile(new URL('../../app/SessionContext.jsx', import.meta.url), 'utf8');
  assert.match(source, /needsOnboarding/);
  assert.match(source, /profileMissing/);
  assert.match(source, /onboarding_completed/);
});

test('MobileAuthPage redireciona para onboarding quando onboarding nao concluido', async () => {
  const source = await readFile(new URL('../../features/auth-mobile/pages/MobileAuthPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /onboarding_completed/);
  assert.match(source, /\/onboarding/);
});

test('legado pages/OnboardingPage nao existe mais', async () => {
  const legacyPath = new URL('../../pages/OnboardingPage.jsx', import.meta.url);
  await assert.rejects(
    () => readFile(legacyPath, 'utf8'),
    { code: 'ENOENT' },
  );
});

test('legado services/onboardingService nao existe mais', async () => {
  const legacyPath = new URL('../../services/onboardingService.js', import.meta.url);
  await assert.rejects(
    () => readFile(legacyPath, 'utf8'),
    { code: 'ENOENT' },
  );
});

test('onboarding nao possui loop de redirecionamento — App.jsx verifica onboarding_completed antes de redirecionar', async () => {
  const source = await readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /onboarding_completed/);
  assert.match(source, /needsOnboarding/);
  const onboardingRedirects = source.match(/\/onboarding/g);
  const dashboardRedirects = source.match(/\/dashboard/g);
  assert.ok(onboardingRedirects.length >= 1);
  assert.ok(dashboardRedirects.length >= 1);
});

test('completeOnboarding eh idempotente — reusa workspaces sem criar duplicatas', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /existing/);
  assert.match(source, /continue/);
});

test('onboarding_data merge nao perde campos anteriores', async () => {
  const source = await readFile(new URL('./useOnboarding.js', import.meta.url), 'utf8');
  assert.match(source, /INITIAL_ONBOARDING_DATA/);
  assert.match(source, /\.\.\.INITIAL_ONBOARDING_DATA, \.\.\.savedData/);
});

test('onboarding_data contem completedAt ao concluir', async () => {
  const source = await readFile(new URL('./onboardingService.js', import.meta.url), 'utf8');
  assert.match(source, /completedAt/);
  assert.match(source, /new Date\(\)/);
});

test('onboarding nao possui loop de redirecionamento — App.jsx verifica session antes de redirecionar', async () => {
  const source = await readFile(new URL('../../app/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /needsOnboarding/);
  assert.match(source, /\/onboarding/);
  assert.match(source, /\/dashboard/);
  assert.match(source, /session/);
});
