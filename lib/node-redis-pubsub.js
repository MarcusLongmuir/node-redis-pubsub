var redis = require('redis');


/**
 * Create a new NodeRedisPubsub instance that can subscribe to channels and publish messages
 * @param {Object} options Options for the client creations:
 *                 port - Optional, the port on which the Redis server is launched.
 *                 scope - Optional, two NodeRedisPubsubs with different scopes will not share messages
 */
function NodeRedisPubsub(options){
  if (!(this instanceof NodeRedisPubsub)){ return new NodeRedisPubsub(options); }
  options || (options = {});
  var port = options && options.port || 6379;   // 6379 is Redis' default
  var host = options && options.host || '127.0.0.1';
  var auth = options && options.auth

  // Need to create two Redis clients as one cannot be both in receiver and emitter mode
  // I wonder why that is, by the way ...
  this.emitter  = redis.createClient(port, host);
  this.receiver = redis.createClient(port, host);

  if (auth) {
    this.emitter.auth(auth)
    this.receiver.auth(auth)
  }

  this.receiver.setMaxListeners(0);
  this.prefix = options.scope ? options.scope + ':' : '';

  this.channels = {};
}

/**
 * Return the emitter object to be used as a regular redis client to save resources.
 */
NodeRedisPubsub.prototype.getRedisClient = function(){
  return this.emitter;
};

/**
 * Subscribe to a channel
 * @param {String} channel The channel to subscribe to, can be a pattern e.g. 'user.*'
 * @param {Function} handler Function to call with the received message.
 * @param {Function} cb Optional callback to call once the handler is registered.
 *
 */
NodeRedisPubsub.prototype.on = NodeRedisPubsub.prototype.subscribe = function(channel, handler, callback){
  callback || (callback = function(){});
  var self = this;

  var existing_handlers = self.channels[channel];
  if(!existing_handlers){
    existing_handlers = [];
    self.channels[channel] = existing_handlers;
  }

  existing_handlers.push(handler);

  this.receiver.on('message', function (_channel, message) {
    if(self.prefix + channel === _channel){ handler(JSON.parse(message), _channel); }
  });

  this.receiver.subscribe(this.prefix + channel, callback);
};

/**
 * Unsubscribe to a channel
 * @param {String} channel The channel to unsubscribe to, can be a pattern e.g. 'user.*'
 * @param {Function} callback Optional callback to call once the handler is unregistered.
 *
 */
NodeRedisPubsub.prototype.off = NodeRedisPubsub.prototype.unsubscribe = function(channel, handler, callback) {
  var self = this;

  var existing_handlers = self.channels[channel];
  var index = existing_handlers.indexOf(handler);
  if(index!==-1){
    existing_handlers.splice(index, 1);
  }

  if(existing_handlers.length===0){
    delete this.channels[channel];

    return this.receiver.unsubscribe(this.prefix + channel, callback);
  } else {
    if(callback){
      return callback();
    }
  }
};

/**
 * Emit an event
 * @param {String} channel Channel on which to emit the message
 * @param {Object} message
 */
NodeRedisPubsub.prototype.emit = NodeRedisPubsub.prototype.publish = function (channel, message) {
  return this.emitter.publish(this.prefix + channel, JSON.stringify(message));
};

/**
 * Safely close the redis connections 'soon'
 */
NodeRedisPubsub.prototype.quit = function() {
  this.emitter.quit();
  this.receiver.quit();
};

/**
 * Dangerously close the redis connections immediately
 */
NodeRedisPubsub.prototype.end = function() {
  this.emitter.end();
  this.receiver.end();
};

module.exports = NodeRedisPubsub;
