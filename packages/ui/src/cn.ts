import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Junta classes e resolve conflitos do Tailwind.
 *
 * O `twMerge` é o que faz `cn('px-4', 'px-6')` dar `px-6` em vez de deixar as
 * duas e depender da ordem no ficheiro CSS. Sem ele, passar `className` a um
 * componente para o ajustar num sítio específico funciona umas vezes e outras
 * não, conforme a ordem em que o Tailwind gerou as regras — o pior tipo de bug
 * de estilos, porque parece aleatório.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
