/* eslint-env mocha */
/* eslint-disable func-names, prefer-arrow-callback */
import times from 'lodash/times';

import Simulation from '/imports/modules/simulation.js';
import bot from '/imports/domain/server/bot.js';

describe('botScenario', function () {
  it('init', function () {
    const simulation = new Simulation(bot);
    simulation.inject('100010', { botId: '100010' });
    simulation.inject('100011', { botId: '100011' });
    simulation.inject('100012', { botId: '100012' });
  });
});
