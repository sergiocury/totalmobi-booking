import { z } from 'zod';

import { isValidTimezone } from '../time/zone';

/**
 * Blocos de construção reutilizados por todos os schemas.
 *
 * Regra do projeto: os tipos TypeScript são **inferidos** destes schemas
 * (`z.infer`), nunca escritos à mão em paralelo. Duas definições da mesma
 * coisa divergem sempre, e a que diverge é a que não tem testes.
 */

export const uuidSchema = z.uuid({ message: 'Identificador inválido' });

/**
 * Slug de URL público: `clinica-sorriso`.
 * Entre 3 e 50 caracteres, sem hífen no início nem no fim, sem hífens seguidos.
 */
export const slugSchema = z
  .string()
  .min(3, 'Mínimo de 3 caracteres')
  .max(50, 'Máximo de 50 caracteres')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Só letras minúsculas, números e hífenes');

export const emailSchema = z
  .email({ message: 'Email inválido' })
  .max(254)
  .transform((value) => value.trim().toLowerCase());

/** Já normalizado. A normalização faz-se com `normalizePhone`, à entrada. */
export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Telefone tem de estar em formato E.164 (ex.: +351912345678)');

export const timezoneSchema = z
  .string()
  .refine(isValidTimezone, { message: 'Fuso horário IANA desconhecido' });

export const localeSchema = z.enum(['pt-PT', 'pt-BR', 'en']);

export const countryCodeSchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Código de país ISO-3166-1 alfa-2 (ex.: PT)');

export const currencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Código de moeda ISO-4217 (ex.: EUR)');

/** `#RRGGBB`. O contraste é validado à parte, contra o fundo. */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor em formato #RRGGBB');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data em formato YYYY-MM-DD');

export const wallTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora em formato HH:mm');

/** 0 = domingo, para bater certo com `EXTRACT(DOW)` do PostgreSQL. */
export const weekdaySchema = z.number().int().min(0).max(6);

export const positiveMinutesSchema = z.number().int().positive().max(24 * 60);
export const nonNegativeMinutesSchema = z.number().int().min(0).max(24 * 60);

export const moneySchema = z.number().min(0).max(1_000_000).multipleOf(0.01);

/**
 * Chave de idempotência gerada pelo cliente.
 *
 * É o que impede que um duplo toque no botão, ou um retry de webhook, criem
 * duas marcações. Sem isto, a constraint de exclusão não ajuda: as duas
 * tentativas são do mesmo cliente para o mesmo slot, e a segunda seria
 * legítima do ponto de vista da base de dados.
 */
export const idempotencyKeySchema = z.string().min(16).max(128);

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

/** Intervalo de datas para consultas de agenda. Máximo de 92 dias. */
export const dateRangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((v) => v.from <= v.to, { message: 'A data inicial tem de ser anterior à final' })
  .refine(
    (v) => {
      const days = (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000;
      return days <= 92;
    },
    { message: 'Intervalo máximo de 92 dias' },
  );

export type Locale = z.infer<typeof localeSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
