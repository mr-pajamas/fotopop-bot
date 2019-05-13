import { Meteor } from 'meteor/meteor';
import axios from 'axios';

const { private: { internalServiceEndpoint } = {} } = Meteor.settings;

if (!internalServiceEndpoint) throw new Error('未找到内调接口服务配置信息');

const agent = axios.create({
  baseURL: internalServiceEndpoint,
});

export default agent;
