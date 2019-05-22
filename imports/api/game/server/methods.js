import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import SimpleSchema from 'simpl-schema';
import Cache from 'js-cache';

import find from 'lodash/find';
// join
// abort
// leave
// startGame
import { Rooms } from '../collections.js';
import { UserAccounts } from '../../account/collections.js';
import { getCategories } from './service-methods.js';

import { fillRoom, findAndJoin } from './game-operation.js';

const cache = new Cache();

export const joinRoom = new ValidatedMethod({
  name: 'game.joinRoom',
  validate: new SimpleSchema({
    botId: String,
  }).validator({ clean: true }),
  async run({ botId }) {
    const currentRoom = Rooms.findOne({
      searchId: { $exists: true, $ne: null },
      'users.id': botId,
    });

    if (currentRoom) throw new Meteor.Error(409, `机器人已经在房间（${currentRoom.searchId}）中`);

    Rooms.update({
      searchId: null,
      'users.id': botId,
    }, {
      $pull: { users: { id: botId } },
    });

    const type = Random.choice([0, 1]);
    // const type = 0; // TODO
    let categories = cache.get(type);
    if (!categories) {
      categories = await getCategories(type);
      if (!categories.length) throw new Meteor.Error(500, `获取分类信息失败（type=${type}）`);
      cache.set(type, categories, 600000);
    }
    const categoryId = Random.choice(categories).id;
    // const categoryId = categories[0].id; // TODO

    findAndJoin(botId, 1, type, categoryId);
  },
});

export const abortFindingRoom = new ValidatedMethod({
  name: 'game.abortFindingRoom',
  validate: new SimpleSchema({
    botId: String,
  }).validator({ clean: true }),
  run({ botId }) {
    const affected = Rooms.update({
      searchId: null,
      'users.id': botId,
    }, {
      $pull: { users: { id: botId } },
    });

    if (!affected) throw new Meteor.Error(409, '机器人不在任何队列中');
  },
});

export const leaveRoom = new ValidatedMethod({
  name: 'game.leaveRoom',
  validate: new SimpleSchema({
    botId: String,
  }).validator({ clean: true }),
  run({ botId }) {
    const currentRoom = Rooms.findOne({
      searchId: { $exists: true, $ne: null },
      'users.id': botId,
    });

    if (!currentRoom) throw new Meteor.Error(409, '机器人不在任何房间中');

    if (currentRoom.inGame()) throw new Meteor.Error(409, '当前房间正在游戏中，无法退出');

    const bot = UserAccounts.findOne(botId);

    Rooms.update({
      _id: currentRoom._id,
      'users.id': botId,
      rounds: null,
    }, Object.assign(
      {
        $pull: { users: { id: botId } },
        $inc: { userCount: -1 },
        $push: {
          messages: {
            type: 1,
            text: `${bot.name || '足记用户'}离开了房间`,
          },
        },
      },
      (currentRoom.lastWinner === botId) && { $unset: { lastWinner: '' } },
    ));

    Meteor.defer(() => {
      fillRoom(currentRoom._id);
    });
  },
});

export const startGame = new ValidatedMethod({
  name: 'game.startGame',
  validate: new SimpleSchema({
    botId: String,
  }).validator({ clean: true }),
  run({ botId }) {
    const currentRoom = Rooms.findOne({
      searchId: { $exists: true, $ne: null },
      'users.id': botId,
    });

    if (!currentRoom) throw new Meteor.Error(409, '机器人不在任何房间中');

    if (currentRoom.inGame()) throw new Meteor.Error(409, '当前房间游戏已经开始');

    if (currentRoom.host().id !== botId) throw new Meteor.Error(403, '机器人不是房主，无权开始游戏');

    if (!currentRoom.questions || currentRoom.questions.length === 0) throw new Meteor.Error(409, '当前房间题目尚未准备好');

    if (currentRoom.users.length <= 1) throw new Meteor.Error(409, '当前房间人数不够，无法开始游戏');

    if (find(currentRoom.users, user => !user.ready)) throw new Meteor.Error(409, '当前房间有人未准备好，无法开始游戏');

    Rooms.rawUpdateOne({
      _id: currentRoom._id,
      $or: [
        { rounds: null },
        { rounds: { $size: 0 } },
      ],
    }, {
      $push: { rounds: { winners: [] } },
      // $inc: { roundCount: 1 },
      $set: {
        'users.$[].elapsedTime': 0,
        // 'users.$[].score': 0,
        // roundCount: 1,
        'users.$[u].ready': false,
        fastMatching: false,
      },
      $unset: { 'users.$[].supporters': '' },
    }, {
      arrayFilters: [{ 'u.botLevel': null }],
    });
  },
});
