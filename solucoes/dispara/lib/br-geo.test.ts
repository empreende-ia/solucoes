import { describe, expect, it } from 'vitest'
import { getBrazilUfFromPhone, isBrazilPhone } from './br-geo'

describe('br-geo', () => {
  describe('isBrazilPhone', () => {
    describe('deve retornar true para telefones brasileiros', () => {
      const validBrazilPhones = [
        { phone: '+5511999999999', description: 'E.164 com +55' },
        { phone: '5511999999999', description: 'sem + mas com 55' },
        { phone: '11999999999', description: 'apenas DDD + numero (BR default)' },
        { phone: '+55 11 99999-9999', description: 'formatado com espacos e hifen' },
        { phone: '(11) 99999-9999', description: 'formato nacional brasileiro' },
        { phone: '+5521987654321', description: 'RJ celular' },
        { phone: '+5531988887777', description: 'MG celular' },
      ]

      it.each(validBrazilPhones)('$description: $phone', ({ phone }) => {
        expect(isBrazilPhone(phone)).toBe(true)
      })
    })

    describe('deve retornar false para telefones nao brasileiros', () => {
      const nonBrazilPhones = [
        { phone: '+14155551234', description: 'EUA' },
        { phone: '+351912345678', description: 'Portugal' },
        { phone: '+5491112345678', description: 'Argentina' },
        { phone: '+442071234567', description: 'Reino Unido' },
        { phone: '+34612345678', description: 'Espanha' },
      ]

      it.each(nonBrazilPhones)('$description: $phone', ({ phone }) => {
        expect(isBrazilPhone(phone)).toBe(false)
      })
    })

    describe('casos de borda', () => {
      it('deve retornar false para string vazia', () => {
        expect(isBrazilPhone('')).toBe(false)
      })

      it('deve retornar false para string com apenas espacos', () => {
        expect(isBrazilPhone('   ')).toBe(false)
      })

      it('deve retornar false para null coercido a string', () => {
        // @ts-expect-error - testando input invalido
        expect(isBrazilPhone(null)).toBe(false)
      })

      it('deve retornar false para undefined coercido a string', () => {
        // @ts-expect-error - testando input invalido
        expect(isBrazilPhone(undefined)).toBe(false)
      })

      it('deve retornar true para numero curto (normalizePhoneNumber adiciona +55)', () => {
        // normalizePhoneNumber fallback adiciona +55 para numeros curtos
        // entao isBrazilPhone retorna true mesmo para numeros incompletos
        expect(isBrazilPhone('+551199')).toBe(true)
      })

      it('deve lidar com caracteres especiais', () => {
        expect(isBrazilPhone('+55 (11) 99999-9999')).toBe(true)
      })
    })
  })

  describe('getBrazilUfFromPhone', () => {
    describe('deve retornar a UF correta para cada DDD', () => {
      // Tabela completa de DDDs por UF
      const dddUfMapping = [
        // Sao Paulo
        { ddd: '11', uf: 'SP', cidade: 'Sao Paulo capital' },
        { ddd: '12', uf: 'SP', cidade: 'Sao Jose dos Campos' },
        { ddd: '13', uf: 'SP', cidade: 'Santos' },
        { ddd: '14', uf: 'SP', cidade: 'Bauru' },
        { ddd: '15', uf: 'SP', cidade: 'Sorocaba' },
        { ddd: '16', uf: 'SP', cidade: 'Ribeirao Preto' },
        { ddd: '17', uf: 'SP', cidade: 'Sao Jose do Rio Preto' },
        { ddd: '18', uf: 'SP', cidade: 'Presidente Prudente' },
        { ddd: '19', uf: 'SP', cidade: 'Campinas' },
        // Rio de Janeiro
        { ddd: '21', uf: 'RJ', cidade: 'Rio capital' },
        { ddd: '22', uf: 'RJ', cidade: 'Campos' },
        { ddd: '24', uf: 'RJ', cidade: 'Petropolis' },
        // Espirito Santo
        { ddd: '27', uf: 'ES', cidade: 'Vitoria' },
        { ddd: '28', uf: 'ES', cidade: 'Cachoeiro de Itapemirim' },
        // Minas Gerais
        { ddd: '31', uf: 'MG', cidade: 'Belo Horizonte' },
        { ddd: '32', uf: 'MG', cidade: 'Juiz de Fora' },
        { ddd: '33', uf: 'MG', cidade: 'Governador Valadares' },
        { ddd: '34', uf: 'MG', cidade: 'Uberlandia' },
        { ddd: '35', uf: 'MG', cidade: 'Pocos de Caldas' },
        { ddd: '37', uf: 'MG', cidade: 'Divinopolis' },
        { ddd: '38', uf: 'MG', cidade: 'Montes Claros' },
        // Parana
        { ddd: '41', uf: 'PR', cidade: 'Curitiba' },
        { ddd: '42', uf: 'PR', cidade: 'Ponta Grossa' },
        { ddd: '43', uf: 'PR', cidade: 'Londrina' },
        { ddd: '44', uf: 'PR', cidade: 'Maringa' },
        { ddd: '45', uf: 'PR', cidade: 'Foz do Iguacu' },
        { ddd: '46', uf: 'PR', cidade: 'Francisco Beltrao' },
        // Santa Catarina
        { ddd: '47', uf: 'SC', cidade: 'Joinville' },
        { ddd: '48', uf: 'SC', cidade: 'Florianopolis' },
        { ddd: '49', uf: 'SC', cidade: 'Chapeco' },
        // Rio Grande do Sul
        { ddd: '51', uf: 'RS', cidade: 'Porto Alegre' },
        { ddd: '53', uf: 'RS', cidade: 'Pelotas' },
        { ddd: '54', uf: 'RS', cidade: 'Caxias do Sul' },
        { ddd: '55', uf: 'RS', cidade: 'Santa Maria' },
        // Distrito Federal e Goias
        { ddd: '61', uf: 'DF', cidade: 'Brasilia' },
        { ddd: '62', uf: 'GO', cidade: 'Goiania' },
        { ddd: '64', uf: 'GO', cidade: 'Rio Verde' },
        // Tocantins
        { ddd: '63', uf: 'TO', cidade: 'Palmas' },
        // Mato Grosso
        { ddd: '65', uf: 'MT', cidade: 'Cuiaba' },
        { ddd: '66', uf: 'MT', cidade: 'Rondonopolis' },
        // Mato Grosso do Sul
        { ddd: '67', uf: 'MS', cidade: 'Campo Grande' },
        // Acre
        { ddd: '68', uf: 'AC', cidade: 'Rio Branco' },
        // Rondonia
        { ddd: '69', uf: 'RO', cidade: 'Porto Velho' },
        // Bahia
        { ddd: '71', uf: 'BA', cidade: 'Salvador' },
        { ddd: '73', uf: 'BA', cidade: 'Ilheus' },
        { ddd: '74', uf: 'BA', cidade: 'Juazeiro' },
        { ddd: '75', uf: 'BA', cidade: 'Feira de Santana' },
        { ddd: '77', uf: 'BA', cidade: 'Vitoria da Conquista' },
        // Sergipe
        { ddd: '79', uf: 'SE', cidade: 'Aracaju' },
        // Pernambuco
        { ddd: '81', uf: 'PE', cidade: 'Recife' },
        { ddd: '87', uf: 'PE', cidade: 'Petrolina' },
        // Alagoas
        { ddd: '82', uf: 'AL', cidade: 'Maceio' },
        // Paraiba
        { ddd: '83', uf: 'PB', cidade: 'Joao Pessoa' },
        // Rio Grande do Norte
        { ddd: '84', uf: 'RN', cidade: 'Natal' },
        // Ceara
        { ddd: '85', uf: 'CE', cidade: 'Fortaleza' },
        { ddd: '88', uf: 'CE', cidade: 'Juazeiro do Norte' },
        // Piaui
        { ddd: '86', uf: 'PI', cidade: 'Teresina' },
        { ddd: '89', uf: 'PI', cidade: 'Picos' },
        // Para
        { ddd: '91', uf: 'PA', cidade: 'Belem' },
        { ddd: '93', uf: 'PA', cidade: 'Santarem' },
        { ddd: '94', uf: 'PA', cidade: 'Maraba' },
        // Amazonas
        { ddd: '92', uf: 'AM', cidade: 'Manaus' },
        { ddd: '97', uf: 'AM', cidade: 'interior AM' },
        // Roraima
        { ddd: '95', uf: 'RR', cidade: 'Boa Vista' },
        // Amapa
        { ddd: '96', uf: 'AP', cidade: 'Macapa' },
        // Maranhao
        { ddd: '98', uf: 'MA', cidade: 'Sao Luis' },
        { ddd: '99', uf: 'MA', cidade: 'Imperatriz' },
      ]

      it.each(dddUfMapping)(
        'DDD $ddd ($cidade) deve retornar $uf',
        ({ ddd, uf }) => {
          const phone = `+55${ddd}999999999`
          expect(getBrazilUfFromPhone(phone)).toBe(uf)
        }
      )
    })

    describe('deve funcionar com diferentes formatos de telefone', () => {
      const formatVariations = [
        { phone: '+5511999999999', expected: 'SP', format: 'E.164 padrao' },
        { phone: '5511999999999', expected: 'SP', format: 'sem +' },
        { phone: '11999999999', expected: 'SP', format: 'apenas DDD + numero' },
        { phone: '+55 11 99999-9999', expected: 'SP', format: 'formatado' },
        { phone: '(11) 99999-9999', expected: 'SP', format: 'nacional' },
        { phone: '+55 (21) 98888-7777', expected: 'RJ', format: 'misto' },
      ]

      it.each(formatVariations)(
        'formato $format: $phone deve retornar $expected',
        ({ phone, expected }) => {
          expect(getBrazilUfFromPhone(phone)).toBe(expected)
        }
      )
    })

    describe('deve retornar null para DDDs invalidos', () => {
      const invalidDdds = [
        { ddd: '00', description: 'DDD 00 nao existe' },
        { ddd: '10', description: 'DDD 10 nao existe' },
        { ddd: '20', description: 'DDD 20 nao existe' },
        { ddd: '23', description: 'DDD 23 nao existe' },
        { ddd: '25', description: 'DDD 25 nao existe' },
        { ddd: '26', description: 'DDD 26 nao existe' },
        { ddd: '29', description: 'DDD 29 nao existe' },
        { ddd: '30', description: 'DDD 30 nao existe' },
        { ddd: '36', description: 'DDD 36 nao existe' },
        { ddd: '39', description: 'DDD 39 nao existe' },
        { ddd: '40', description: 'DDD 40 nao existe' },
        { ddd: '50', description: 'DDD 50 nao existe' },
        { ddd: '52', description: 'DDD 52 nao existe' },
        { ddd: '56', description: 'DDD 56 nao existe' },
        { ddd: '57', description: 'DDD 57 nao existe' },
        { ddd: '58', description: 'DDD 58 nao existe' },
        { ddd: '59', description: 'DDD 59 nao existe' },
        { ddd: '60', description: 'DDD 60 nao existe' },
        { ddd: '70', description: 'DDD 70 nao existe' },
        { ddd: '72', description: 'DDD 72 nao existe' },
        { ddd: '76', description: 'DDD 76 nao existe' },
        { ddd: '78', description: 'DDD 78 nao existe' },
        { ddd: '80', description: 'DDD 80 nao existe' },
        { ddd: '90', description: 'DDD 90 nao existe' },
      ]

      it.each(invalidDdds)('$description: +55$ddd', ({ ddd }) => {
        const phone = `+55${ddd}999999999`
        expect(getBrazilUfFromPhone(phone)).toBeNull()
      })
    })

    describe('deve retornar null para telefones nao brasileiros', () => {
      const foreignPhones = [
        { phone: '+14155551234', country: 'EUA' },
        { phone: '+351912345678', country: 'Portugal' },
        { phone: '+5491112345678', country: 'Argentina' },
        { phone: '+442071234567', country: 'Reino Unido' },
        { phone: '+34612345678', country: 'Espanha' },
        { phone: '+33612345678', country: 'Franca' },
        { phone: '+49151123456789', country: 'Alemanha' },
      ]

      it.each(foreignPhones)('$country: $phone', ({ phone }) => {
        expect(getBrazilUfFromPhone(phone)).toBeNull()
      })
    })

    describe('casos de borda', () => {
      it('deve retornar null para string vazia', () => {
        expect(getBrazilUfFromPhone('')).toBeNull()
      })

      it('deve retornar null para string com apenas espacos', () => {
        expect(getBrazilUfFromPhone('   ')).toBeNull()
      })

      it('deve retornar null para null coercido a string', () => {
        // @ts-expect-error - testando input invalido
        expect(getBrazilUfFromPhone(null)).toBeNull()
      })

      it('deve retornar null para undefined coercido a string', () => {
        // @ts-expect-error - testando input invalido
        expect(getBrazilUfFromPhone(undefined)).toBeNull()
      })

      it('deve retornar null para numero brasileiro muito curto (< 12 digitos)', () => {
        // 55 + DDD(2) + numero deve ter pelo menos 12 digitos
        expect(getBrazilUfFromPhone('+551199999')).toBeNull()
        expect(getBrazilUfFromPhone('+5511999')).toBeNull()
      })

      it('deve funcionar com numero no limite minimo (12 digitos)', () => {
        // 55 + 11 + 99999999 (8 digitos - fixo antigo)
        expect(getBrazilUfFromPhone('+551199999999')).toBe('SP')
      })

      it('deve funcionar com numeros de celular (13 digitos)', () => {
        // 55 + 11 + 999999999 (9 digitos - celular)
        expect(getBrazilUfFromPhone('+5511999999999')).toBe('SP')
      })

      it('deve lidar com caracteres nao numericos', () => {
        expect(getBrazilUfFromPhone('+55 (11) 99999-9999')).toBe('SP')
        expect(getBrazilUfFromPhone('55.11.99999.9999')).toBe('SP')
      })

      it('deve retornar null para texto aleatorio', () => {
        expect(getBrazilUfFromPhone('abc')).toBeNull()
        expect(getBrazilUfFromPhone('telefone')).toBeNull()
      })

      it('deve retornar null para apenas codigo do pais', () => {
        expect(getBrazilUfFromPhone('+55')).toBeNull()
      })

      it('deve retornar null para codigo do pais + DDD sem numero', () => {
        expect(getBrazilUfFromPhone('+5511')).toBeNull()
      })
    })
  })
})
