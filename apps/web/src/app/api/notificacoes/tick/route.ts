import 'server-only';

import { createServiceClient } from '@totalmobi/database/server';
import {
  ConsoleEmailProvider,
  ResendEmailProvider,
  comporEmail,
  type EmailProvider,
} from '@totalmobi/notifications';

/**
 * O trabalhador da fila de notificações.
 *
 * PORQUE É QUE ISTO É UMA ROTA E NÃO UMA EDGE FUNCTION
 *
 * O plano previa uma Edge Function do Supabase, agendada por `pg_cron`. O
 * `pg_cron` **está** instalado neste projeto (verificado), mas para chamar HTTP
 * a partir do PostgreSQL faltava o `pg_net` — e instalar uma extensão num
 * projeto **partilhado com o CMS** é uma decisão maior do que este milestone
 * justifica.
 *
 * Além disso, publicar Edge Functions exige o Docker, que não arranca nesta
 * máquina. Uma rota do Next faz o mesmo trabalho, corre no mesmo sítio que o
 * resto, e é agendável por Vercel Cron.
 *
 * Se um dia a fila crescer ao ponto de valer a pena tirá-la do caminho da
 * aplicação, o `pg_net` continua disponível — e nada aqui muda além de quem
 * chama.
 *
 * O QUE PROTEGE ESTA ROTA
 *
 * Um segredo em cabeçalho, comparado em tempo constante. Sem ele, qualquer
 * pessoa podia forçar o envio de toda a fila, repetidamente — e cada chamada
 * gasta dinheiro real no provedor.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Comparação em tempo constante. Um `===` num segredo é uma fuga por timing. */
function segredoValido(recebido: string | null, esperado: string): boolean {
  if (!recebido || recebido.length !== esperado.length) return false;

  let diferenca = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}

function escolherProvider(): EmailProvider {
  const chave = process.env.RESEND_API_KEY;
  const remetente = process.env.EMAIL_FROM;

  if (chave && remetente) {
    return new ResendEmailProvider(chave, remetente);
  }

  // Sem chave configurada, escreve na consola em vez de enviar. **Nunca**
  // silenciosamente: um provider mudo em produção seria um desastre calado.
  console.warn(
    '[notificações] RESEND_API_KEY ou EMAIL_FROM em falta — os emails vão para a consola, não para o destinatário.',
  );
  return new ConsoleEmailProvider();
}

interface JobDaFila {
  jobId: string;
  channel: string;
  type: string;
  attempts: number;
  locale: string;
  to: string | null;
  customerName: string | null;
  tenantName: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  serviceName: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  staffName: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationPhone: string | null;
  manageToken: string | null;
  template: { subject: string | null; body: string } | null;
}

export async function POST(request: Request): Promise<Response> {
  const esperado = process.env.NOTIFICATIONS_CRON_SECRET;

  if (!esperado) {
    return Response.json({ erro: 'NOTIFICATIONS_CRON_SECRET não configurado' }, { status: 503 });
  }

  const recebido =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer /, '') ??
    null;

  if (!segredoValido(recebido, esperado)) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 });
  }

  const client = createServiceClient();
  const worker = `web-${process.env.VERCEL_REGION ?? 'local'}-${Date.now() % 100000}`;

  const { data, error } = await client.rpc('claim_notification_jobs', {
    p_worker: worker,
    p_limit: 25,
  });

  if (error) {
    return Response.json({ erro: error.message }, { status: 500 });
  }

  const jobs = (data ?? []) as unknown as JobDaFila[];

  if (jobs.length === 0) {
    return Response.json({ reclamados: 0, enviados: 0, falhados: 0 });
  }

  const provider = escolherProvider();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  let enviados = 0;
  let falhados = 0;

  for (const job of jobs) {
    // Por agora só email. O WhatsApp é o M13 — e um job de um canal que ainda
    // não existe fica pendente em vez de falhar cinco vezes.
    if (job.channel !== 'email') continue;

    if (!job.to || !job.template || !job.startAt) {
      await client.rpc('fail_notification_job', {
        p_job_id: job.jobId,
        p_error: 'faltam dados para compor a mensagem',
      });
      falhados += 1;
      continue;
    }

    const mensagem = comporEmail(
      job.template,
      {
        customerName: job.customerName ?? 'Cliente',
        tenantName: job.tenantName ?? 'Totalmobi Booking',
        brandColor: job.brandColor,
        logoUrl: job.logoUrl,
        serviceName: job.serviceName ?? 'Marcação',
        startAt: job.startAt,
        endAt: job.endAt ?? job.startAt,
        timezone: job.timezone ?? 'Europe/Lisbon',
        staffName: job.staffName,
        locationName: job.locationName,
        locationAddress: job.locationAddress,
        locationPhone: job.locationPhone,
        // Token novo, emitido pela `claim_notification_jobs` só para esta
        // mensagem. Nunca fica guardado em lado nenhum — ver a migration 0026.
        manageUrl: job.manageToken ? `${base}/m/${job.manageToken}` : null,
        locale: job.locale,
      },
      job.to,
    );

    // A chave de idempotência é o job, não a tentativa. É o que impede um envio
    // duplicado quando o email sai bem e a escrita do estado falha a seguir.
    const resultado = await provider.send(mensagem, `job-${job.jobId}`);

    if (resultado.ok) {
      await client.rpc('complete_notification_job', {
        p_job_id: job.jobId,
        p_provider_message_id: resultado.value.providerMessageId,
      });
      enviados += 1;
    } else {
      await client.rpc('fail_notification_job', {
        p_job_id: job.jobId,
        p_error: resultado.error.message.slice(0, 500),
      });
      falhados += 1;
    }
  }

  return Response.json({ reclamados: jobs.length, enviados, falhados, worker });
}
