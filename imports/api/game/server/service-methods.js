import { Meteor } from 'meteor/meteor';
import map from 'lodash/map';

import agent from '../../../modules/server/service-agent.js';

const typeNames = ['music', 'movie'];

export const getCategories = async function (gameType) {
  if (Meteor.isDevelopment) {
    return [{
      id: '1',
      name: '华语专场',
      coverUrl: '/images/cat1.png',
    }, {
      id: '2',
      name: '李健专场',
      coverUrl: '/images/cat2.png',
    }, {
      id: '3',
      name: '周杰伦专场',
      coverUrl: '/images/cat3.png',
    }];
  }

  const { data: { data: { list = [] } = {} } = {} } = await agent.get(`/ws/game/list/${typeNames[gameType]}/cats`);
  return map(list, ({ id, name, coverUrl }) => ({ id: `${id}`, name, coverUrl }));
};
