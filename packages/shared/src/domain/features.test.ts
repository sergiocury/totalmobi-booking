import { describe, expect, it } from 'vitest';

import { describeFeatures, featureLabel, resolveFeatures } from './features';

const PLANO_PRO = ['widget', 'whatsapp', 'multi_location', 'waitlist', 'custom_domain'];

describe('resolveFeatures', () => {
  it('sem sobreposições, vale o plano', () => {
    expect([...resolveFeatures(PLANO_PRO, [])].sort()).toEqual([...PLANO_PRO].sort());
  });

  it('a sobreposição LIGA o que o plano não inclui', () => {
    // O caso do Studio Bella no seed: plano professional, chatbot_ai ligado à
    // mão como piloto comercial.
    const resolved = resolveFeatures(PLANO_PRO, [{ featureKey: 'chatbot_ai', enabled: true }]);
    expect(resolved.has('chatbot_ai')).toBe(true);
  });

  it('a sobreposição DESLIGA o que o plano incluiria', () => {
    // É a metade que se esquece. Um `enabled: false` é uma decisão explícita de
    // tirar, não a ausência de decisão — e o produto não a pode ignorar.
    const resolved = resolveFeatures(PLANO_PRO, [{ featureKey: 'whatsapp', enabled: false }]);
    expect(resolved.has('whatsapp')).toBe(false);
  });

  it('a última sobreposição da lista ganha', () => {
    const resolved = resolveFeatures(PLANO_PRO, [
      { featureKey: 'whatsapp', enabled: false },
      { featureKey: 'whatsapp', enabled: true },
    ]);
    expect(resolved.has('whatsapp')).toBe(true);
  });

  it('não inventa funcionalidades', () => {
    const resolved = resolveFeatures([], []);
    expect(resolved.size).toBe(0);
  });
});

describe('describeFeatures — a consola tem de explicar porquê', () => {
  const TODAS = ['widget', 'whatsapp', 'chatbot_ai', 'voice'];

  it('distingue as três origens possíveis', () => {
    const estados = describeFeatures(TODAS, ['widget', 'whatsapp'], [
      { featureKey: 'chatbot_ai', enabled: true },
      { featureKey: 'whatsapp', enabled: false },
    ]);

    const porChave = Object.fromEntries(estados.map((e) => [e.key, e]));

    // Vem do plano, sem ninguém ter mexido.
    expect(porChave['widget']).toMatchObject({ enabled: true, source: 'plan', inPlan: true });

    // Estava no plano e alguém desligou.
    expect(porChave['whatsapp']).toMatchObject({
      enabled: false,
      source: 'override_off',
      inPlan: true,
    });

    // Não estava no plano e alguém ligou.
    expect(porChave['chatbot_ai']).toMatchObject({
      enabled: true,
      source: 'override_on',
      inPlan: false,
    });

    // Não está no plano nem ninguém mexeu.
    expect(porChave['voice']).toMatchObject({ enabled: false, source: 'plan', inPlan: false });
  });

  it('devolve uma linha por funcionalidade conhecida, sem saltar nenhuma', () => {
    const estados = describeFeatures(TODAS, [], []);
    expect(estados).toHaveLength(TODAS.length);
    expect(estados.every((e) => !e.enabled)).toBe(true);
  });

  it('`inPlan` não mente sobre o plano quando há sobreposição', () => {
    // Serve para a consola poder dizer "isto vinha no plano e foi desligado à
    // mão" em vez de deixar a pessoa a adivinhar.
    const [estado] = describeFeatures(['whatsapp'], ['whatsapp'], [
      { featureKey: 'whatsapp', enabled: false },
    ]);
    expect(estado!.inPlan).toBe(true);
    expect(estado!.enabled).toBe(false);
  });
});

describe('featureLabel', () => {
  it('traduz as chaves conhecidas', () => {
    expect(featureLabel('whatsapp')).toBe('WhatsApp');
    expect(featureLabel('multi_location')).toBe('Múltiplas unidades');
  });

  it('devolve a chave quando não conhece', () => {
    expect(featureLabel('coisa_nova')).toBe('coisa_nova');
  });
});
