import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CORE_IDENTITY,
  buildPersonalityInstructions,
  getPersonalityProfile,
  resolvePersonality,
} from './index.js';

test('usa balanced como fallback para perfil ausente ou invalido', () => {
  assert.equal(getPersonalityProfile().id, 'balanced');
  assert.equal(getPersonalityProfile('desconhecido').id, 'balanced');

  const resolved = resolvePersonality({ preferredProfile: 'desconhecido' });
  assert.equal(resolved.profileId, 'balanced');
  assert.equal(resolved.isFallback, true);
});

test('perfil direct preserva resposta curta e alta objetividade', () => {
  const resolved = resolvePersonality({ preferredProfile: 'direct' });

  assert.equal(resolved.profileId, 'direct');
  assert.equal(resolved.communication.responseLength, 'short');
  assert.ok(resolved.communication.objectivity >= 0.9);
  assert.ok(resolved.archetypes.elegant > resolved.archetypes.warm);
});

test('perfil warm prioriza acolhimento sem remover objetividade', () => {
  const resolved = resolvePersonality({ preferredProfile: 'warm' });

  assert.equal(resolved.profileId, 'warm');
  assert.ok(resolved.communication.warmth >= 0.9);
  assert.ok(resolved.communication.objectivity >= 0.65);
  assert.ok(resolved.archetypes.warm > resolved.archetypes.strategic);
});

test('perfil strategic prioriza cenarios e leitura financeira', () => {
  const resolved = resolvePersonality({ preferredProfile: 'strategic' });

  assert.equal(resolved.profileId, 'strategic');
  assert.equal(resolved.communication.detailLevel, 'analytical');
  assert.ok(resolved.archetypes.strategic > 0.5);
});

test('contexto empresarial ajusta o tom sem trocar a preferencia', () => {
  const base = resolvePersonality({ preferredProfile: 'balanced' });
  const business = resolvePersonality({
    preferredProfile: 'balanced',
    context: { workspaceType: 'business', situation: 'decision' },
  });

  assert.equal(business.profileId, 'balanced');
  assert.ok(business.archetypes.strategic > base.archetypes.strategic);
  assert.ok(business.communication.objectivity > base.communication.objectivity);
  assert.match(business.temporaryAdjustments.join(' '), /empresarial/);
  assert.equal(business.adaptationIsTemporary, true);
});

test('emergencia aumenta clareza e calma sem gerar alarmismo', () => {
  const resolved = resolvePersonality({
    preferredProfile: 'strategic',
    context: { situation: 'emergency' },
    cognitiveMap: { riskSensitivity: 'high' },
  });

  assert.equal(resolved.profileId, 'strategic');
  assert.equal(resolved.communication.responseLength, 'short');
  assert.ok(resolved.communication.warmth >= 0.58);
  assert.ok(resolved.communication.objectivity >= 0.94);
});

test('regras centrais permanecem em todos os perfis e no prompt', () => {
  for (const profileId of ['balanced', 'direct', 'warm', 'strategic']) {
    const resolved = resolvePersonality({ preferredProfile: profileId });

    assert.equal(resolved.coreIdentity, CORE_IDENTITY);
    assert.ok(resolved.coreIdentity.rules.includes('Nunca gerar ansiedade.'));
    assert.ok(
      resolved.coreIdentity.rules.includes(
        'Recomendar caminhos, nunca decidir pelo usuario.',
      ),
    );
  }

  const instructions = buildPersonalityInstructions({
    preferredProfile: 'warm',
    context: { workspaceType: 'personal' },
  });

  assert.match(instructions, /Nunca gerar ansiedade/);
  assert.match(instructions, /nunca decidir pelo usuario/i);
  assert.match(instructions, /preferencia explicita/i);
});

test('valores contextuais invalidos sao ignorados com seguranca', () => {
  const resolved = resolvePersonality({
    preferredProfile: null,
    context: { workspaceType: 'misturado', situation: 'panico' },
    cognitiveMap: {
      financialKnowledge: 'guru',
      decisionStyle: 'impulsivo',
      riskSensitivity: 'extremo',
      preferredExplanation: 'infinito',
    },
  });
  const archetypeTotal = Object.values(resolved.archetypes).reduce(
    (sum, value) => sum + value,
    0,
  );

  assert.equal(resolved.profileId, 'balanced');
  assert.equal(resolved.isFallback, true);
  assert.deepEqual(resolved.temporaryAdjustments, []);
  assert.ok(Math.abs(archetypeTotal - 1) < 0.01);

  assert.equal(resolvePersonality(null).profileId, 'balanced');
  assert.equal(
    resolvePersonality({ context: null, cognitiveMap: null }).profileId,
    'balanced',
  );
  assert.match(buildPersonalityInstructions(null), /PERFIL BASE: balanced/);
});
