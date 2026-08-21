import { parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js';

import { DomainErrorCode, domainError, type DomainError } from './errors';
import { err, ok, type Result } from './result';

/**
 * Normalização de telefones para E.164.
 *
 * O telefone é a identidade do cliente final neste produto — é por ele que o
 * WhatsApp encontra a marcação e é ele que impede clientes duplicados. Se
 * `+351912345678`, `912345678` e `00351 912 345 678` ficarem guardados como
 * três strings diferentes, ficam três clientes diferentes, e o bot deixa de
 * encontrar a marcação de quem escreve.
 *
 * Por isso: guarda-se **sempre** em E.164 e nunca se guarda o que o utilizador
 * escreveu.
 */

export function normalizePhone(
  input: string,
  defaultCountry?: string,
): Result<string, DomainError> {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return err(
      domainError(DomainErrorCode.INVALID_PHONE, 'Telefone vazio', { field: 'phone' }),
    );
  }

  try {
    const parsed = parsePhoneNumberWithError(
      trimmed,
      defaultCountry ? (defaultCountry.toUpperCase() as CountryCode) : undefined,
    );

    if (!parsed.isValid()) {
      return err(
        domainError(DomainErrorCode.INVALID_PHONE, `Número inválido: ${trimmed}`, {
          field: 'phone',
        }),
      );
    }

    return ok(parsed.number);
  } catch (cause) {
    return err(
      domainError(DomainErrorCode.INVALID_PHONE, `Não foi possível interpretar: ${trimmed}`, {
        field: 'phone',
        cause,
      }),
    );
  }
}

/** Formatação legível, para mostrar na UI. Nunca para guardar. */
export function formatPhoneForDisplay(e164: string): string {
  try {
    return parsePhoneNumberWithError(e164).formatInternational();
  } catch {
    return e164;
  }
}

/**
 * Converte o `wa_id` que a Meta envia (dígitos sem `+`) para E.164.
 *
 * Nota conhecida: números do Brasil aparecem no `wa_id` sem o nono dígito em
 * alguns casos históricos. Confirmar o comportamento atual da Cloud API no
 * Milestone 13 antes de tratar isto como resolvido — não assumir.
 */
export function waIdToE164(waId: string): Result<string, DomainError> {
  const digits = waId.replace(/\D/g, '');
  if (digits.length === 0) {
    return err(domainError(DomainErrorCode.INVALID_PHONE, 'wa_id vazio', { field: 'wa_id' }));
  }
  return normalizePhone(`+${digits}`);
}

/** E.164 para `wa_id`: só os dígitos. */
export function e164ToWaId(e164: string): string {
  return e164.replace(/\D/g, '');
}

/** Últimos quatro dígitos, para logs e para a UI sem expor o número todo. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  return digits.length <= 4 ? '****' : `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}
