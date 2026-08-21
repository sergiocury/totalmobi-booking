'use client';

import { useCallback, useEffect, useState } from 'react';

import { cn } from './cn';

/**
 * Tema: sistema, claro ou escuro.
 *
 * O UTILIZADOR ESCOLHE, MAS O SISTEMA É O PONTO DE PARTIDA
 *
 * `preference` é o que a pessoa escolheu — incluindo "sistema", que não é um
 * tema mas uma delegação. `resolved` é o tema efetivamente aplicado. São coisas
 * diferentes e confundi-las dá um seletor que não sabe mostrar o seu próprio
 * estado: com "sistema" ativo e o Windows em escuro, o botão tem de mostrar
 * "sistema" selecionado e o ecrã em escuro ao mesmo tempo.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'totalmobi-theme';

/**
 * Script injetado no `<head>`, antes de qualquer pintura.
 *
 * Tem de correr **antes** do primeiro frame, senão a página aparece clara e
 * salta para escura — o "flash do tema errado", que é dos defeitos mais
 * visíveis que um produto pode ter. Por isso é uma string de JavaScript e não
 * um `useEffect`: os efeitos do React só correm depois da hidratação, muito
 * tarde para isto.
 *
 * Escrito à mão e minúsculo de propósito — vai inline em todas as páginas.
 */
export const themeScript = `(function(){try{
var p=localStorage.getItem('${THEME_STORAGE_KEY}');
var d=window.matchMedia('(prefers-color-scheme: dark)').matches;
var t=(p==='light'||p==='dark')?p:(d?'dark':'light');
document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`;

function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(preference: ThemePreference): ResolvedTheme {
  const resolved: ResolvedTheme = preference === 'system' ? systemTheme() : preference;
  document.documentElement.setAttribute('data-theme', resolved);
  return resolved;
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // Ler no primeiro efeito, não no `useState`: o servidor não tem
  // `localStorage`, e ler lá daria erro de hidratação.
  useEffect(() => {
    const initial = readPreference();
    setPreferenceState(initial);
    setResolved(apply(initial));
  }, []);

  // Com "sistema" ativo, seguir o sistema quando ele mudar — sem recarregar.
  useEffect(() => {
    if (preference !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(apply('system'));

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    if (next === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
    setResolved(apply(next));
  }, []);

  return { preference, resolved, setPreference };
}

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Claro', icon: '☀' },
  { value: 'dark', label: 'Escuro', icon: '☾' },
  { value: 'system', label: 'Sistema', icon: '⌂' },
];

/**
 * Seletor de tema.
 *
 * `role="radiogroup"` e não três botões soltos: são opções mutuamente
 * exclusivas, e é assim que um leitor de ecrã anuncia "2 de 3, selecionado".
 * As setas do teclado funcionam por omissão nos `radio` nativos.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <fieldset
      className={cn(
        'inline-flex items-center gap-0.5 rounded-(--radius-full) border border-(--line) bg-(--surface-sunken) p-0.5',
        className,
      )}
    >
      <legend className="sr-only">Tema da interface</legend>

      {OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-(--radius-full) px-3 py-1.5',
              'text-(length:--text-sm) font-medium whitespace-nowrap',
              'transition-colors duration-(--duration-fast)',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus-ring)',
              active
                ? 'bg-(--surface) text-(--ink) shadow-(--shadow-sm)'
                : 'text-(--ink-muted) hover:text-(--ink)',
            )}
          >
            <input
              type="radio"
              name="tema"
              value={option.value}
              checked={active}
              onChange={() => setPreference(option.value)}
              className="sr-only"
            />
            <span aria-hidden="true">{option.icon}</span>
            {option.label}
            {option.value === 'system' && preference === 'system' ? (
              <span className="sr-only">(atualmente {resolved === 'dark' ? 'escuro' : 'claro'})</span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}
