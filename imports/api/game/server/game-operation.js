// 终局检查观察什么？
// 用户离线
// 用户告知时间
import { Meteor } from 'meteor/meteor';
import times from 'lodash/times';
import map from 'lodash/map';
import reduce from 'lodash/reduce';
import filter from 'lodash/filter';

import { Rooms } from '../collections.js';
// import { report, fetchQuestions } from './service-methods.js';
import { UserAccounts } from '../../account/collections.js';

function findAndJoin(userId, botLevel, type, categoryId, prepend = false) {
  const user = UserAccounts.findOne(userId);
  const { value: affected } = Rooms.rawFindOneAndUpdate({
    type,
    categoryId,
    searchId: { $exists: true, $ne: null },
    pvt: false,
    userCount: { $lt: 6 },
    users: { $not: { $elemMatch: { id: userId } } }, // 自己与自己竞争概率不高
    rounds: null,
  }, {
    $inc: { userCount: 1 },
    $push: {
      users: Object.assign({ id: userId, ready: true, offline: false }, botLevel && { botLevel }),
      /*
      users: {
        id: userId,
        ready: true,
        offline: false,
      },
      */
      messages: {
        type: 1,
        text: `${user.name || '足记用户'}进入了房间`,
      },
    },
  }, {
    sort: { fastMatching: -1, userCount: -1 },
  });

  // 若无，则加入等待队列
  if (!affected) {
    Rooms.upsert({
      type,
      categoryId,
      searchId: { $exists: false },
      users: { $not: { $elemMatch: { id: userId } } },
    }, {
      $push: {
        users: prepend
          ? { $each: [Object.assign({ id: userId }, botLevel && { botLevel })], $position: 0 }
          : Object.assign({ id: userId }, botLevel && { botLevel }),
      },
    }, {
      bypassCollection2: true,
    });
  }
}

function fillRoom(roomId) {
  // 当房间存在，而且没开始，没满，而且队列里还有人时，循环
  while (true) {
    const room = Rooms.findOne({
      _id: roomId,
      rounds: null,
      users: { $not: { $size: 6 } },
    });
    if (!room) break;

    const { type, categoryId } = room;

    // 先拉人
    const { value: queue } = Rooms.rawFindOneAndUpdate({
      type,
      categoryId,
      searchId: null,
      users: { $not: { $size: 0 } },
    }, {
      $pop: { users: -1 },
    });

    if (!queue) break;

    const { id: userId, botLevel } = queue.users[0];

    const user = UserAccounts.findOne(userId);
    try {
      const affected = Rooms.update({
        _id: roomId,
        // $nor: [{ users: { $size: 6 } }, { users: { $elemMatch: { id: user.id } } }],
        users: { $not: { $size: 6 } },
        rounds: null,
      }, {
        $push: {
          users: Object.assign(
            { id: userId, ready: true, offline: false },
            botLevel && { botLevel },
          ),
          messages: {
            type: 1,
            text: `${user.name || '足记用户'}进入了房间`,
          },
        },
        $inc: { userCount: 1 },
      });

      // 没有affected有可能是因为用户已经在里面，也有可能该房间已经不满足条件（满员或者已经开始）
      // 如果是因为用户已经在里面，则不能归还（当时的情况已经不知道了），不太可能的情况
      // 如果是因为房间满员，则需要归还（当时的情况已经不知道了）
      // 如果是因为房间已经开始，则需要归还（当时开没开始不清楚，现在没开始那么当时肯定没开始，现在开始了当时未必开始）

      if (!affected) {
        // 重新等待加入房间
        findAndJoin(userId, botLevel, type, categoryId, true);
      }
    } catch (e) {
      // 失败原因可能是这个人在此期间加到其他地方去了
      // 重新进队列
      // 或者开房间
      console.log(e);
    }
  }
}

// 用户掉线时
// 影响游戏终局检查[done]
// 影响机器人答题[done]
// 影响礼物检查[done]

// 用户告知礼物时间时
// 影响礼物检查，仅当用户宣称礼物结束

// 用户离开时
// 影响礼物检查

// 用户告知时间时
// 影响游戏终局检查，但仅当用户宣称终局时[done]
// 不影响机器人答题

// 用户答题时/用户宣称机器人答题时
// 影响终局检查
// 影响机器人答题（当宣称机器人答题时）
export {
  fillRoom,
  findAndJoin,
};
