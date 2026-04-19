'use strict';

const STATES = ['RO', 'AM', 'PA', 'MT', 'SP', 'MG', 'PR', 'SC'];
const CITIES_BY_STATE = {
  RO: ['Cujubim', 'Porto Velho', 'Ji-Parana', 'Ariquemes'],
  AM: ['Manaus', 'Parintins', 'Itacoatiara'],
  PA: ['Belem', 'Santarem', 'Maraba'],
  MT: ['Cuiaba', 'Rondonopolis', 'Sinop'],
  SP: ['Sao Paulo', 'Campinas', 'Ribeirao Preto'],
  MG: ['Belo Horizonte', 'Uberlandia', 'Montes Claros'],
  PR: ['Curitiba', 'Londrina', 'Maringa'],
  SC: ['Florianopolis', 'Joinville', 'Chapeco'],
};

const SEGMENTS = [
  'Licitacoes',
  'Saude',
  'Educacao',
  'Agronegocio',
  'Construcao',
  'Contabilidade',
  'Tecnologia',
  'Juridico',
  'Turismo',
  'Capacitacao',
];

const NAME_PREFIX = 'Seed Sponsor';
const IMAGE_BASE = 'https://images.unsplash.com';

function buildSponsorName(index, segment) {
  return `${NAME_PREFIX} ${String(index).padStart(3, '0')} ${segment}`;
}

function buildDescription(segment, state, city, index) {
  const scope = city ? `${city}/${state}` : state ? `todo o estado de ${state}` : 'todo o Brasil';
  return `Campanha de ${segment.toLowerCase()} criada para testar rotacao, slots e relevancia na busca. Lote ${index} com cobertura em ${scope}.`;
}

function buildImages(index) {
  const imageIds = [
    `photo-150${String(1000000 + index).slice(-7)}?auto=format&fit=crop&w=640&q=80`,
    `photo-151${String(1000000 + index).slice(-7)}?auto=format&fit=crop&w=640&q=80`,
  ];

  return imageIds.map((path) => `${IMAGE_BASE}/${path}`);
}

function buildRecords() {
  const today = new Date('2026-04-18T12:00:00.000Z');
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 10);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 120);

  const records = [];

  for (let index = 1; index <= 60; index += 1) {
    const segment = SEGMENTS[(index - 1) % SEGMENTS.length];
    const state = STATES[(index - 1) % STATES.length];
    const cities = CITIES_BY_STATE[state];
    const city = cities[(index - 1) % cities.length];
    const scopeMode = index % 3;

    const normalizedState = scopeMode === 0 ? null : state;
    const normalizedCity = scopeMode === 2 ? city : null;

    records.push({
      name: buildSponsorName(index, segment),
      url: `https://parceiro${String(index).padStart(3, '0')}.example.com/${segment.toLowerCase()}`,
      description: buildDescription(segment, normalizedState, normalizedCity, index),
      state: normalizedState,
      city: normalizedCity,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      is_active: true,
      click_count: Math.floor((index * 13) % 41),
      images: JSON.stringify(buildImages(index)),
      created_at: new Date(today.getTime() - index * 3600 * 1000),
      updated_at: today,
    });
  }

  return records;
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('sponsors', buildRecords(), {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('sponsors', {
      name: {
        [Sequelize.Op.like]: `${NAME_PREFIX}%`,
      },
    }, {});
  },
};
