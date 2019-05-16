/* eslint-disable no-underscore-dangle */
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import forEach from 'lodash/forEach';

import map from 'lodash/map';
import reduce from 'lodash/reduce';
import constant from 'lodash/constant';

import moment from 'moment/moment';

const DEFAULT_THINK_TIME = 2000;

function getRandom(min = 0, max = 1) {
  return Math.random() * (max - min) + min;
}

function cal(expectedTime, random) {
  return Math.ceil(-(Math.log(1 - random) / (1 / expectedTime)));
}

function parseDuration(str) {
  if (!str) return 0;

  const regex = /(\d+)(y|M|w|d|h|m|s|ms)/;
  const found = str.match(regex);
  if (!found) return 0;
  const [, number, unit] = found;
  return moment.duration(+number, unit).asMilliseconds();
}

class State {
  key;

  name;

  _scenario;

  _tid;

  _choices;

  constructor(scenario, key, options) {
    this._scenario = scenario;
    this.key = key;
    const { name, thinkTime, choices = {} } = options;
    this.name = name || key;
    this._choices = map(
      choices,
      ({ name: choiceName, weight = constant(0), action }, choiceKey) => ({
        key: choiceKey,
        name: choiceName || choiceKey,
        weight: weight.call(this, this._scenario),
        action,
      }),
    );
    // console.log(`====== State ${key} has been created ======`);
    if (this._choices.length) {
      const expectedTimeout = ((thinkTime && typeof thinkTime === 'function')
        && parseDuration(thinkTime.call(this, this._scenario)))
        || DEFAULT_THINK_TIME;

      const timeout = cal(expectedTimeout, getRandom(0.1, 0.9));

      // console.log(`Expected think time is: ${expectedTimeout}`);
      // console.log(`Actual Think time is: ${timeout}`);
      // console.log('Choices are: ');
      // console.log(this._choices);

      this._tid = Meteor.setTimeout(this._makeChoice.bind(this), timeout);
    } else {
      // console.log('This is a dead end');
    }
  }

  _makeChoice() {
    // console.log('Making choice...');
    const totalWeight = reduce(this._choices, (sum, { weight }) => sum + weight, 0);
    // console.log(`totalWeight is: ${totalWeight}`);
    const random = getRandom(0, totalWeight);
    // console.log(`random is: ${random}`);

    let weightAccumulated = 0;
    for (const choice of this._choices) {
      weightAccumulated += choice.weight;
      if (random < weightAccumulated) {
        // choice taken
        // console.log(`Made choice: ${choice.name}`);
        if (choice.action && typeof choice.action === 'function') {
          try {
            const stateKey = choice.action.call(this, this._scenario);
            if (stateKey) {
              this._scenario._goto(stateKey);
            } else {
              this._scenario._goto(this.key);
            }
          } catch (e) {
            console.log(e);
            // console.log('Restoring state...');
            this._scenario.restore();
          }
        } else {
          this._scenario._goto(this.key);
        }
        break;
      }
    }
  }

  _destroy() {
    if (this._tid) {
      Meteor.clearTimeout(this._tid);
      this._tid = undefined;
    }
  }
}

class Scenario {
  key;

  _state;

  _options;

  data;

  constructor(key, options, data = {}) {
    this.key = key;
    this._options = options;
    this.data = data;

    this.restore();
  }

  _goto(stateKey) {
    const { states: { [stateKey]: stateOptions } } = this._options;
    if (stateOptions) {
      this._destroyState();
      this._state = new State(this, stateKey, stateOptions);
    }
  }

  _destroy() {
    this._destroyState();
  }

  _destroyState() {
    this._state && this._state._destroy();
  }

  restore() {
    const { restore } = this._options;
    const stateKey = restore && restore.call(this);
    if (stateKey) {
      this._goto(stateKey);
    }
    if (!this._state) {
      this._goto(Object.keys(this._options.states)[0]);
    }
  }
}

export default class Simulation {
  name;

  _options;

  _scenarios = new Map();

  constructor(options) {
    this._options = options;
    const { name = `Simulation ${Random.id()}`, init, states } = this._options;
    if (!states || !Object.keys(states).length) throw new Error('模型中未定义任何状态');
    this.name = name;
    init && init.call(this, this);
  }

  inject(key, data) {
    if (this._scenarios.get(key)) return;
    const scenario = new Scenario(key, this._options, data);
    this._scenarios.set(key, scenario);
  }

  eject(key) {
    const scenario = this._scenarios.get(key);
    if (!scenario) return;
    scenario._destroy();
    this._scenarios.delete(key);
  }

  update(keys) {
    forEach(keys, (key) => {
      const scenario = this._scenarios.get(key);
      scenario && Meteor.defer(scenario.restore.bind(scenario));
    });
  }

  get(key) {
    return this._scenarios.get(key);
  }
}
