import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import constant from 'lodash/constant';
import map from 'lodash/map';
// import xorBy from 'lodash/xorBy';
import differenceBy from 'lodash/differenceBy';
// import throttle from 'lodash/throttle';
import debounce from 'lodash/debounce';
import forEach from 'lodash/forEach';
import { Rooms } from '../../api/game/collections.js';

import * as GameMethods from '../../api/game/server/methods.js';

const debouncedRestore = Symbol('debouncedRestore');

const bot = {
  name: 'bot',
  init(simulation) { // simulation level
    // const dirtyKeys = Symbol('dirtyKeys');
    // simulation[dirtyKeys] = [];
    /*
    const throttledUpdate = throttle(Meteor.bindEnvironment(() => {
      if (simulation[dirtyKeys].length) {
        simulation.update(Array.from(new Set(simulation[dirtyKeys])));
        simulation[dirtyKeys] = [];
      }
    }), 300, { leading: false, trailing: true });
    */
    Rooms.find({ users: { $elemMatch: { botLevel: { $exists: true, $ne: null } } } },
      { fields: { messages: 0 } }).observe({
    // Rooms.find({}).observe({
      // 房间中开始有了机器人
      // 队列中开始有了机器人
      added(room) {
        // 找到相关机器人
        // 更新这些机器人状态
        // simulation[dirtyKeys].push(...room.botIds());
        // throttledUpdate();
        // simulation.update(room.botIds());

        forEach(room.botIds(), (id) => {
          const scenario = simulation.get(id);
          if (scenario) {
            scenario.data.room = room;
            scenario[debouncedRestore]();
          }
        });
      },
      // 机器人所在的房间/队列发生变动：
      // 【】所在队列中，真人加入/离开队列（不关心）
      // 【】所在队列中，机器人加入/离开队列【关心】
      // 所在房间中（准备状态），真人通过搜索/匹配加入了房间（不关心？这里需要展开讨论canStartGame条件）
      // 所在房间中（准备状态），真人（断线/主动）离开（不关心？这里需要展开讨论canStartGame条件），因此成为房主【关心】，因此被系统踢走（不关心，removed会处理）
      // 【】所在房间中（准备状态），真人准备（【当机器人是房主时关心】）
      // 【】所在房间中，被真人踢走
      // 【】房间开始/结束游戏（【关心】）
      // 【】房间内发消息（不关心）
      // 【】房间有题目（【关心】）
      // 【】房间进入下一回合（不关心）
      // 【】游戏中真人断线/重连（不关心）

      changed(newRoom, oldRoom) {
        // const botIds = [];

        const outBots = differenceBy(oldRoom.bots(), newRoom.bots(), 'id');
        forEach(outBots, ({ id }) => {
          const scenario = simulation.get(id);
          if (scenario) {
            scenario.data.room = undefined;
            scenario[debouncedRestore]();
          }
        });

        const botIds = [];

        const inBots = differenceBy(newRoom.bots(), oldRoom.bots(), 'id');
        botIds.push(...map(inBots, 'id'));

        if (!newRoom.queue()) {
          if (newRoom.inGame() !== oldRoom.inGame()) { // 房间开始/结束游戏
            botIds.push(...newRoom.botIds());
          } else if (!newRoom.inGame()) {
            const newRoomHost = newRoom.host();
            if (newRoomHost.botLevel) {
              if (newRoomHost.id !== oldRoom.host().id) { // 机器人成为房主
                botIds.push(newRoomHost.id);
              } else if (newRoom.canStartGame() !== oldRoom.canStartGame()) {
                botIds.push(newRoomHost.id);
              } else if (newRoom.canStartGame()
                && (newRoom.users.length >= 4) !== (oldRoom.users.length >= 4)) {
                botIds.push(newRoomHost.id);
              }
            }
          }
        }

        forEach(Array.from(new Set(botIds)), (id) => {
          const scenario = simulation.get(id);
          if (scenario) {
            scenario.data.room = newRoom;
            scenario[debouncedRestore]();
          }
        });

        /*
        const inOutBots = xorBy(newRoom.bots(), oldRoom.bots(), 'id');
        simulation[dirtyKeys].push(...map(inOutBots, 'id'));

        if (!newRoom.queue()) {
          if (newRoom.inGame() !== oldRoom.inGame()) { // 房间开始/结束游戏
            simulation[dirtyKeys].push(...newRoom.botIds());
          } else if (!newRoom.inGame()) {
            const newRoomHost = newRoom.host();
            if (newRoomHost.botLevel) {
              if (newRoomHost.id !== oldRoom.host().id) { // 机器人成为房主
                simulation[dirtyKeys].push(newRoomHost.id);
              } else if (newRoom.canStartGame() !== oldRoom.canStartGame()) {
                simulation[dirtyKeys].push(newRoomHost.id);
              } else if (newRoom.canStartGame()
                && (newRoom.users.length >= 4) !== (oldRoom.users.length >= 4)) {
                simulation[dirtyKeys].push(newRoomHost.id);
              }
            }
          }
        }

        throttledUpdate();
        */
        // simulation.update(Array.from(new Set(botIds)));
      },
      // 房间被删除
      // 房间中没有了机器人
      // 队列中没有了机器人
      removed(room) {
        // simulation[dirtyKeys].push(...room.botIds());
        // throttledUpdate();
        // simulation.update(room.botIds());
        forEach(room.botIds(), (id) => {
          const scenario = simulation.get(id);
          if (scenario) {
            scenario.data.room = undefined;
            scenario[debouncedRestore]();
          }
        });
      },
    });
  },

  // MAY return a state name
  restore() { // scenario level
    // 不在房间中，不在队列里：online，有概率offline
    // 在队列里：matching
    // const { botId } = this.data;
    if (!this[debouncedRestore]) {
      this[debouncedRestore] = debounce(Meteor.bindEnvironment(this.restore.bind(this)), 300);
    }

    const botId = this.key;

    const { room } = this.data;

    // const room = Rooms.findOne({ 'users.id': botId });
    if (!room) {
      return Random.fraction() < 0.3 ? 'online' : 'offline';
      // return 'online'; // TODO
    }
    if (room.queue()) {
      return 'matching';
    }
    if (room.inGame()) {
      return 'inGame';
    }
    if (room.host().id !== botId) {
      return 'inRoom';
    }
    if (room.canStartGame()) {
      if (room.users.length >= 4) {
        return 'canStartGameWithManyUsers';
      }
      return 'canStartGameWithFewUsers';
    }
    return 'inRoomAsHost';
  },

  states: {
    offline: {
      name: '离线',
      thinkTime: constant('30m'),
      choices: {
        backOnline: {
          weight: constant(95), // default: 0
          action() { // optional
            return 'online';
          },
        },
        noop: {
          weight: constant(5),
        },
      },
    },

    online: {
      name: '在线',
      thinkTime: constant('2m'),
      choices: {
        rest: {
          weight: constant(5),
          // weight: constant(0), // TODO
          action() {
            return 'offline';
          },
        },
        join: {
          weight: constant(80),
          action(scenario) {
            // call join method
            const { key: botId } = scenario;
            try {
              GameMethods.joinRoom.call({ botId });
            } catch (e) {
              scenario.data.room = Rooms.findOne({ 'users.id': botId });
              throw e;
            }
          },
        },
        noop: {
          weight: constant(15),
        },
      },
    },

    matching: {
      // pseudo dead end
      // no think time
      // no choices
      name: '寻找房间中',
      thinkTime: constant('3m'),
      choices: {
        abort: {
          weight: constant(80),
          action(scenario) {
            // call abort method
            const { key: botId } = scenario;
            try {
              GameMethods.abortFindingRoom.call({ botId });
            } catch (e) {
              scenario.data.room = Rooms.findOne({ 'users.id': botId });
              throw e;
            }
          },
        },
        noop: {
          weight: constant(20),
        },
      },
    },

    inRoom: {
      name: '房间准备（非房主）',
      thinkTime: constant('10s'),
      choices: {
        leave: {
          weight: constant(10),
          action(scenario) {
            // call leave method
            const { key: botId } = scenario;
            try {
              GameMethods.leaveRoom.call({ botId });
            } catch (e) {
              scenario.data.room = Rooms.findOne({ 'users.id': botId });
              throw e;
            }
          },
        },
        noop: {
          weight: constant(90),
        },
      },
    },

    inRoomAsHost: {
      name: '房间准备中（房主身份）',
      thinkTime: constant('5s'),
      choices: {
        leave: {
          weight: constant(5),
          action(scenario) {
            // call leave method
            const { key: botId } = scenario;
            try {
              GameMethods.leaveRoom.call({ botId });
            } catch (e) {
              scenario.data.room = Rooms.findOne({ 'users.id': botId });
              throw e;
            }
          },
        },
        noop: {
          weight: constant(95),
        },
      },
    },

    canStartGameWithFewUsers: {
      name: '少数人房间准备完毕（房主身份）',
      thinkTime: constant('3s'),
      choices: {
        startGame: {
          weight: constant(29),
          action(scenario) {
            // call start game
            const { key: botId } = scenario;
            try {
              GameMethods.startGame.call({ botId });
            } catch (e) {
              scenario.data.room = Rooms.findOne({ 'users.id': botId });
              throw e;
            }
          },
        },
        noop: {
          weight: constant(69),
        },
        leave: {
          weight: constant(2),
          action(scenario) {
            // call leave method
            const { key: botId } = scenario;
            try {
              GameMethods.leaveRoom.call({ botId });
            } catch (e) {
              scenario.data.room = Rooms.findOne({ 'users.id': botId });
              throw e;
            }
          },
        },
      },
    },

    canStartGameWithManyUsers: {
      name: '多数人房间准备完毕（房主身份）',
      thinkTime: constant('3s'),
      choices: {
        startGame: {
          weight: constant(90),
          action(scenario) {
            // call start game
            const { key: botId } = scenario;
            try {
              GameMethods.startGame.call({ botId });
            } catch (e) {
              scenario.data.room = Rooms.findOne({ 'users.id': botId });
              throw e;
            }
          },
        },
        noop: {
          weight: constant(9),
        },
        leave: {
          weight: constant(1),
          action(scenario) {
            // call leave method
            const { key: botId } = scenario;
            try {
              GameMethods.leaveRoom.call({ botId });
            } catch (e) {
              scenario.data.room = Rooms.findOne({ 'users.id': botId });
              throw e;
            }
          },
        },
      },
    },

    inGame: {
      name: '游戏中',
    },
  },
};

export default bot;
