import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import moment from 'moment/moment';
import filter from 'lodash/filter';
import forEach from 'lodash/forEach';
import map from 'lodash/map';

import '../../../modules/string-hashcode.js';
import { BotOperators } from '../collections.js';
import { UserAccounts } from '../../account/collections.js';
import { Rooms } from '../../game/collections.js';

import Simulation from '../../../modules/simulation.js';
import bot from '../../../domain/server/bot.js';

// import nodeId from '../../../modules/server/node-id.js';

const checkInInterval = moment.duration(1, 'm');

let tid;
let operatorId;
let otherOperators = new Map();
// const simulation = new Simulation(bot);
let simulation;

function unschedule() {
  if (tid) {
    Meteor.clearTimeout(tid);
    tid = undefined;
  }
}

function setTimeoutGuaranteed(callback, due) {
  const delay = moment(due).diff(moment());
  tid = Meteor.setTimeout(() => {
    if (moment().isSameOrAfter(due)) {
      callback();
    } else {
      setTimeoutGuaranteed(callback, due);
    }
  }, delay);
}

function reschedule(callback, delay) {
  unschedule();
  // tid = Meteor.setTimeout(callback, Math.max(delay, 0) + 50);
  setTimeoutGuaranteed(callback, moment().add(Math.max(delay, 1), 'ms'));
}

function loop(callback, interval) {
  try {
    callback();
  } catch (e) {
    console.log(e);
  }
  // callback();
  reschedule(() => {
    // callback();
    loop(callback, interval);
  }, interval);
}

function checkIn() {
  console.log('Checking in..................................');
  if (!simulation) simulation = new Simulation(bot);

  if (!operatorId) {
    operatorId = BotOperators.insert({ checkInStatus: Random.id() });
    console.log(`New operatorId = '${operatorId}'`);
  } else {
    console.log('Refreshing checkInStatus...');
    const affected = BotOperators.update(operatorId, { $set: { checkInStatus: Random.id() } });
    !!affected && console.log('Refresh complete');

    if (!affected) {
      operatorId = BotOperators.insert({ checkInStatus: Random.id() });
    }
  }

  console.log('Observing other operators...');

  const newOtherOperators = new Map();

  BotOperators.find({ _id: { $ne: operatorId } }).forEach((operator) => {
    const recorded = otherOperators.get(operator._id);
    if (recorded) {
      if (recorded.checkInStatus === operator.checkInStatus) {
        if (recorded.absences) {
          // 1、删除记录
          try {
            UserAccounts.update({ operator: operator._id }, { $unset: { operator: '' } }, { multi: true });
            BotOperators.remove(operator._id);
          } catch (e) {
            console.log(e);
          }
        } else {
          newOtherOperators.set(operator._id, Object.assign(recorded, { absences: 1 }));
        }
      } else {
        newOtherOperators.set(operator._id, Object.assign(recorded, operator, { absences: 0 }));
      }
    } else {
      newOtherOperators.set(operator._id, Object.assign({}, operator, { absences: 0 }));
    }
  });

  otherOperators = newOtherOperators;

  console.log('Other operators are: ');
  console.log(otherOperators);

  const operators = [operatorId, ...otherOperators.keys()].sort();
  const operatorIndex = operators.indexOf(operatorId);


  const oldBotIds = UserAccounts.find({ operator: operatorId }).map(b => b._id);

  const oldNonOperableBotIds = filter(oldBotIds,
    id => ((id.hashCode() >>> 0) % operators.length) !== operatorIndex);

  const newBotIds = UserAccounts.find({ bot: true, operator: null }).map(b => b._id);

  const newOperableBotIds = filter(newBotIds,
    id => ((id.hashCode() >>> 0) % operators.length) === operatorIndex);

  if (oldNonOperableBotIds.length) {
    // abandon
    forEach(oldNonOperableBotIds, id => simulation.eject(id));

    // TODO: CHUNK THIS
    UserAccounts.update({
      _id: { $in: oldNonOperableBotIds },
    }, {
      $unset: { operator: '' },
    }, {
      multi: true,
    });
  }

  if (newOperableBotIds.length) {
    UserAccounts.update({
      _id: { $in: newOperableBotIds },
      operator: null,
    }, {
      $set: { operator: operatorId },
    }, {
      multi: true,
    });

    // pickup
    /*
    UserAccounts.find({
      _id: { $in: newOperableBotIds },
      operator: operatorId,
    }).forEach(({ _id }) => simulation.inject(_id));
    */

    const newOperatingBotIds = UserAccounts.find({
      _id: { $in: newOperableBotIds },
      operator: operatorId,
    }).map(({ _id }) => _id);

    const botRoomMap = new Map(map(newOperatingBotIds, id => [id, undefined]));

    Rooms.find({ 'users.id': { $in: newOperatingBotIds } }).forEach((room) => {
      forEach(room.botIds(), (id) => {
        if (botRoomMap.has(id)) {
          botRoomMap.set(id, room);
        }
      });
    });

    botRoomMap.forEach((room, botId) => {
      simulation.inject(botId, { room });
    });
  }
}

Meteor.startup(() => {
  loop(checkIn, checkInInterval.asMilliseconds());
});
