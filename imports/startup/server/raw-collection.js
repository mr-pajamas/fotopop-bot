import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

Mongo.Collection.prototype.rawUpdateOne = function (filter, update, options) {
  const rawCollection = this.rawCollection();
  return Meteor.wrapAsync(rawCollection.updateOne, rawCollection)(filter, update, options);
};

Mongo.Collection.prototype.rawFindOneAndDelete = function (filter, options) {
  const rawCollection = this.rawCollection();
  return Meteor.wrapAsync(rawCollection.findOneAndDelete, rawCollection)(filter, options);
};

Mongo.Collection.prototype.rawFindOneAndUpdate = function (filter, update, options) {
  const rawCollection = this.rawCollection();
  return Meteor.wrapAsync(rawCollection.findOneAndUpdate, rawCollection)(filter, update, options);
};

Mongo.Collection.prototype.rawCreateIndexes = function (specs, options) {
  const rawCollection = this.rawCollection();
  return Meteor.wrapAsync(rawCollection.createIndexes(specs, options));
};
