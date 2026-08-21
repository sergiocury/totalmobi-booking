import { describe, expect, it } from 'vitest';

import { escalar, extrair, type CatalogoDoTenant } from './extractor';
import type { Intencao } from './intent';

/**
 * O corpus.
 *
 * Frases como as pessoas escrevem mesmo: minúsculas, sem acentos, com erros,
 * com emojis, em pt-PT e em pt-BR. Um corpus de frases bem escritas mede a
 * capacidade de perceber português correto, que não é o problema.
 *
 * O critério de aceite pede ≥ 90 % de acerto. O teste **mede** e falha abaixo
 * disso — não há aqui nenhuma afirmação sobre qualidade que não seja um número.
 */

const CATALOGO: CatalogoDoTenant = {
  servicos: ['Limpeza dentária', 'Consulta de avaliação', 'Branqueamento', 'Destartarização'],
  profissionais: ['Dra. Ana Martins', 'Dr. Pedro Sousa'],
};

// Uma quarta-feira, para as datas relativas serem previsíveis.
const AGORA = new Date('2026-08-19T10:00:00Z');

interface Caso {
  frase: string;
  esperado: Intencao;
  variante?: 'pt-PT' | 'pt-BR';
}

const CORPUS: Caso[] = [
  // --- marcar ---------------------------------------------------------------
  { frase: 'bom dia, queria marcar uma limpeza dentária', esperado: 'marcar' },
  { frase: 'queria marcar uma consulta', esperado: 'marcar' },
  { frase: 'gostava de marcar para sexta de manhã', esperado: 'marcar' },
  { frase: 'tem vaga para amanhã?', esperado: 'marcar' },
  { frase: 'ha alguma hora disponivel esta semana', esperado: 'marcar' },
  { frase: 'precisava de uma consulta de avaliação', esperado: 'marcar' },
  { frase: 'da para marcar dia 27 a tarde?', esperado: 'marcar' },
  { frase: 'quero agendar um branqueamento', esperado: 'marcar', variante: 'pt-BR' },
  { frase: 'gostaria de agendar com a Dra. Ana', esperado: 'marcar', variante: 'pt-BR' },
  { frase: 'tem horário disponível na quinta?', esperado: 'marcar', variante: 'pt-BR' },
  { frase: 'boa tarde, queria marcar com o dr pedro', esperado: 'marcar' },
  { frase: 'limpeza dentária na sexta', esperado: 'marcar' },
  { frase: 'marcar consulta o mais cedo possivel', esperado: 'marcar' },
  { frase: 'queria uma hora depois das 17h', esperado: 'marcar' },
  { frase: 'qualquer dia de manhã serve', esperado: 'marcar' },
  { frase: 'precisa marcar destartarização', esperado: 'marcar', variante: 'pt-BR' },
  { frase: 'posso marcar para segunda?', esperado: 'marcar' },
  { frase: 'quero o primeiro horário disponível', esperado: 'marcar', variante: 'pt-BR' },

  // --- cancelar -------------------------------------------------------------
  { frase: 'preciso de cancelar a minha marcação', esperado: 'cancelar' },
  { frase: 'quero cancelar', esperado: 'cancelar' },
  { frase: 'já não posso ir amanhã, cancela por favor', esperado: 'cancelar' },
  { frase: 'desmarcar a consulta de quinta', esperado: 'cancelar' },
  { frase: 'vou ter que cancelar o agendamento', esperado: 'cancelar', variante: 'pt-BR' },
  { frase: 'nao vou poder ir', esperado: 'cancelar' },
  { frase: 'desisto da consulta', esperado: 'cancelar' },

  // --- remarcar -------------------------------------------------------------
  { frase: 'queria remarcar a minha consulta', esperado: 'remarcar' },
  { frase: 'posso mudar a hora da marcação?', esperado: 'remarcar' },
  { frase: 'da para adiar a consulta para a semana que vem', esperado: 'remarcar' },
  { frase: 'gostaria de reagendar meu horário', esperado: 'remarcar', variante: 'pt-BR' },
  { frase: 'quero trocar o dia da minha marcação', esperado: 'remarcar' },
  { frase: 'preciso alterar a hora da consulta', esperado: 'remarcar' },

  // --- confirmar ------------------------------------------------------------
  { frase: 'sim', esperado: 'confirmar' },
  { frase: 'ok', esperado: 'confirmar' },
  { frase: 'perfeito', esperado: 'confirmar' },
  { frase: 'pode ser', esperado: 'confirmar' },
  { frase: 'confirmo', esperado: 'confirmar' },
  { frase: 'combinado', esperado: 'confirmar' },
  { frase: '👍', esperado: 'confirmar' },
  { frase: 'isso mesmo, pode marcar', esperado: 'confirmar' },

  // --- falar com humano -----------------------------------------------------
  { frase: 'quero falar com uma pessoa', esperado: 'falar_humano' },
  { frase: 'posso falar com alguém?', esperado: 'falar_humano' },
  { frase: 'nao quero falar com robo', esperado: 'falar_humano' },
  { frase: 'passa para a receção por favor', esperado: 'falar_humano' },
  { frase: 'quero um atendente', esperado: 'falar_humano', variante: 'pt-BR' },
  // O caso difícil: pede marcação **e** pessoa. Ganha a pessoa.
  { frase: 'queria marcar mas prefiro falar com alguem', esperado: 'falar_humano' },

  // --- perguntas ------------------------------------------------------------
  { frase: 'quanto custa uma limpeza?', esperado: 'precos' },
  { frase: 'qual é o preço da consulta', esperado: 'precos' },
  { frase: 'voces tem tabela de precos?', esperado: 'precos', variante: 'pt-BR' },
  { frase: 'a que horas abrem?', esperado: 'horarios' },
  { frase: 'estão abertos ao sábado?', esperado: 'horarios' },
  { frase: 'onde ficam?', esperado: 'morada' },
  { frase: 'qual é a morada da clínica', esperado: 'morada' },
  { frase: 'tem estacionamento?', esperado: 'morada' },
  { frase: 'quando é a minha consulta?', esperado: 'consultar_marcacao' },
  { frase: 'queria ver a minha marcação', esperado: 'consultar_marcacao' },

  // --- cortesia -------------------------------------------------------------
  { frase: 'bom dia', esperado: 'saudacao' },
  { frase: 'olá', esperado: 'saudacao' },
  { frase: 'oi', esperado: 'saudacao', variante: 'pt-BR' },
  { frase: 'obrigada', esperado: 'agradecimento' },
  { frase: 'muito obrigado', esperado: 'agradecimento' },
  { frase: 'valeu', esperado: 'agradecimento', variante: 'pt-BR' },

  // --- o que ninguém percebe ------------------------------------------------
  { frase: 'asdkjhasd', esperado: 'desconhecido' },
  { frase: '?', esperado: 'desconhecido' },
];

describe('corpus de intenções', () => {
  it(`tem pelo menos 50 frases (tem ${CORPUS.length})`, () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(50);
  });

  it('cobre pt-PT e pt-BR', () => {
    expect(CORPUS.filter((c) => c.variante === 'pt-BR').length).toBeGreaterThanOrEqual(10);
  });

  it('acerta em pelo menos 90% das frases', () => {
    const falhas: { frase: string; esperado: string; obtido: string }[] = [];

    for (const caso of CORPUS) {
      const r = extrair(caso.frase, CATALOGO, AGORA);
      if (r.intent !== caso.esperado) {
        falhas.push({ frase: caso.frase, esperado: caso.esperado, obtido: r.intent });
      }
    }

    const acerto = (CORPUS.length - falhas.length) / CORPUS.length;

    console.log(
      `[intenção] ${CORPUS.length - falhas.length}/${CORPUS.length} = ${(acerto * 100).toFixed(1)}%`,
    );
    if (falhas.length > 0) console.log('falhas:', JSON.stringify(falhas, null, 1));

    expect(acerto).toBeGreaterThanOrEqual(0.9);
  });
});

describe('o que se extrai além da intenção', () => {
  it('resolve datas relativas', () => {
    expect(extrair('marcar para hoje', CATALOGO, AGORA).data).toBe('2026-08-19');
    expect(extrair('marcar para amanhã', CATALOGO, AGORA).data).toBe('2026-08-20');
    expect(extrair('marcar depois de amanhã', CATALOGO, AGORA).data).toBe('2026-08-21');
  });

  it('"sexta" é a próxima sexta, não a de ontem', () => {
    // 2026-08-19 é quarta. A sexta seguinte é 21.
    expect(extrair('queria marcar na sexta', CATALOGO, AGORA).data).toBe('2026-08-21');
  });

  it('o dia da semana de hoje refere-se ao da semana seguinte', () => {
    // Quem diz "quarta" numa quarta está a falar da próxima.
    expect(extrair('marcar na quarta', CATALOGO, AGORA).data).toBe('2026-08-26');
  });

  it('percebe "dia 27" e salta para o mês seguinte quando já passou', () => {
    expect(extrair('marcar dia 27', CATALOGO, AGORA).data).toBe('2026-08-27');
    expect(extrair('marcar dia 3', CATALOGO, AGORA).data).toBe('2026-09-03');
  });

  it('percebe períodos do dia', () => {
    expect(extrair('marcar de manhã', CATALOGO, AGORA).periodo).toBe('manha');
    expect(extrair('marcar à tarde', CATALOGO, AGORA).periodo).toBe('tarde');
    expect(extrair('marcar ao fim do dia', CATALOGO, AGORA).periodo).toBe('noite');
  });

  it('percebe "depois das 15" e "antes das 12"', () => {
    expect(extrair('queria hora depois das 15', CATALOGO, AGORA).horaMinima).toBe('15:00');
    expect(extrair('a partir das 14h30', CATALOGO, AGORA).horaMinima).toBe('14:30');
    expect(extrair('marcar antes das 12', CATALOGO, AGORA).horaMaxima).toBe('12:00');
    expect(extrair('marcar às 15h30', CATALOGO, AGORA).horaMinima).toBe('15:30');
  });

  it('reconhece "o primeiro disponível"', () => {
    expect(extrair('quero o primeiro horário disponível', CATALOGO, AGORA).primeiroDisponivel).toBe(
      true,
    );
    expect(extrair('marcar o mais cedo possível', CATALOGO, AGORA).primeiroDisponivel).toBe(true);
    expect(extrair('marcar na sexta', CATALOGO, AGORA).primeiroDisponivel).toBe(false);
  });

  it('resolve nomes contra o catálogo do tenant', () => {
    const r = extrair('queria uma limpeza dentária com a Dra. Ana', CATALOGO, AGORA);

    expect(r.servico).toBe('Limpeza dentária');
    expect(r.profissional).toBe('Dra. Ana Martins');
  });

  it('um nome que a empresa não tem não resolve para nada', () => {
    const r = extrair('queria marcar com a Dra. Beatriz Silva', CATALOGO, AGORA);

    expect(r.profissional).toBeNull();
    expect(r.intent).toBe('marcar');
  });

  it('uma frase completa numa só mensagem extrai tudo', () => {
    const r = extrair(
      'boa tarde, queria marcar uma limpeza dentária com a Dra. Ana na sexta depois das 15',
      CATALOGO,
      AGORA,
    );

    expect(r.intent).toBe('marcar');
    expect(r.servico).toBe('Limpeza dentária');
    expect(r.profissional).toBe('Dra. Ana Martins');
    expect(r.data).toBe('2026-08-21');
    expect(r.horaMinima).toBe('15:00');
    expect(r.confianca).toBeGreaterThan(0.9);
  });
});

describe('quando vale a pena chamar o modelo', () => {
  it('não escala o que já se percebeu', () => {
    const r = extrair('queria marcar uma limpeza', CATALOGO, AGORA);
    expect(escalar(r, 'queria marcar uma limpeza')).toBe(false);
  });

  it('não escala ruído curto', () => {
    const r = extrair('asdkjh', CATALOGO, AGORA);
    expect(escalar(r, 'asdkjh')).toBe(false);
  });

  it('escala uma frase longa que não se percebeu', () => {
    const frase = 'olhe eu estive a pensar naquilo que falamos e não sei bem o que fazer agora';
    const r = extrair(frase, CATALOGO, AGORA);

    expect(r.intent).toBe('desconhecido');
    expect(escalar(r, frase)).toBe(true);
  });
});
