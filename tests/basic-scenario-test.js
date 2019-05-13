/* eslint-env mocha */
/* eslint-disable func-names, prefer-arrow-callback */
import constant from 'lodash/constant';
import times from 'lodash/times';

import Simulation from '/imports/modules/simulation.js';

const basic = {
  name: 'basic',

  states: {
    state1: {
      thinkTime: constant('1s'),
      choices: {
        toS2: {
          weight: constant(20),
          action() {
            console.log('Going to State 2');
            return 'state2';
          },
        },
        noop: {
          weight: constant(80),
          action() {
            console.log('Stay at State 1');
          },
        },
        die: {
          weight: constant(80),
          action() {
            console.log('Going to die');
            return 'state3';
          },
        },
      },
    },
    state2: {
      thinkTime: constant('15s'),
      choices: {
        toS1: {
          weight: constant(80),
          action() {
            console.log('Going to State 1');
            return 'state1';
          },
        },
        noop: {
          weight: constant(20),
          action() {
            console.log('Stay at State 2');
          },
        },
      },
    },
    state3: {

    },
  },
};

describe('basicScenario', function () {
  it.skip('run one instance', function () {
    const simulation = new Simulation(basic);
    times(10, i => simulation.inject(`${i + 1}`));
  });
});
