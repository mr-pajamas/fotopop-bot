/* eslint-disable import/prefer-default-export */
import { Mongo } from 'meteor/mongo';
import SimpleSchema from 'simpl-schema';

const BotOperators = new Mongo.Collection('bot-operators');

BotOperators.attachSchema(new SimpleSchema({
  checkInStatus: {
    type: String,
  },
}));

export { BotOperators };
