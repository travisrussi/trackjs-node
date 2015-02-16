var parsers = require('./parsers');
var querystring = require('querystring');
var zlib = require('zlib');
var utils = require('./utils');
var parseUrl = require('url').parse;
var uuid = require('node-uuid');
var transports = require('./transports');
var node_util = require('util'); // node_util to avoid confusion with "utils"
var events = require('events');

module.exports.version = require('../package.json').version;

var Client = function Client(dsn, options) {
    if(arguments.length === 0) {
        // no arguments, use default from environment
        dsn = process.env.TRACKJS_DSN;
        options = {};
    }
    if(typeof dsn === 'object') {
        // They must only be passing through options
        options = dsn;
        dsn = process.env.TRACKJS_DSN;
    }
    options = options || {};

    this.raw_dsn = dsn;
    this.dsn = utils.parseDSN(dsn);
    this.name = options.name || process.env.TRACKJS_DSN || require('os').hostname();
    this.root = options.root || process.cwd();
    this.transport = options.transport || transports[this.dsn.protocol];

    this.loggerName = options.logger || '';
    this.dataCallback = options.dataCallback;

    // enabled if a dsn is set
    this._enabled = !!this.dsn;


    this.on('error', function(e) {});  // noop
};
node_util.inherits(Client, events.EventEmitter);
var _ = Client.prototype;

module.exports.Client = Client;

_.getIdent =
_.get_ident = function getIdent(result) {
    return result.id;
};

_.process = function process(kwargs) {
    kwargs.version = "node-trackjs-0.1.0";
    kwargs.visitor = [];
    kwargs.console = [];
    kwargs.entry = "direct";
    kwargs.network = [];
    kwargs.url = kwargs['url'] || 'node-js';
    // Customer Object
    kwargs.customer = kwargs['customer'] || {};
    kwargs['customer'].sessionId = kwargs['sessionId'] || "";
    kwargs['customer'].userId = kwargs['userId'] || "";
    kwargs['customer'].correlationId = uuid(); //.replace(/-/g, '');
    kwargs['customer'].token = this.dsn.token;
    kwargs['customer'].application = this.dsn.application;
    kwargs['customer'].version = kwargs['version'] || "";

    // Environment Object
    kwargs['environment'] = kwargs['environment'] || {};
    kwargs['environment'].dependencies = utils.getModules();
    kwargs['environment'].userAgent = this.name;
    kwargs['environment'].age = 1;
    kwargs['timestamp'] = new Date().toISOString();//.split('.')[0];

    var ident = {'id': kwargs['customer'].correlationId};

    if (this.dataCallback) {
        kwargs = this.dataCallback(kwargs);
    }

    // this will happen asynchronously. We don't care about it's response.
    this._enabled && this.send(kwargs, ident);

    return ident;
};

_.send = function send(kwargs, ident) {
    var self = this;

    // stringify, but don't choke on circular references, see: http://stackoverflow.com/questions/11616630/json-stringify-avoid-typeerror-converting-circular-structure-to-json
    var cache = [];
    var skwargs = JSON.stringify(kwargs, function(k, v) {
        if (typeof v === 'object' && v !== null) {
            if (cache.indexOf(v) !== -1) return;
            cache.push(v);
        }
        return v;
    });

    var timestamp = new Date().getTime(),
        headers = {
          'X-TrackJs-Auth': utils.getAuthHeader(timestamp, self.dsn.public_key, self.dsn.private_key),
          'Content-Type': 'text/plain',
          'Content-Length': skwargs.length
        };
    self.transport.send(self, skwargs, headers, ident);
};

_.captureMessage = function captureMessage(message, kwargs, cb) {
    if(!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }
    var result = this.process(parsers.parseText(message, kwargs));
    cb && cb(result);
    return result;
};

_.captureError =
_.captureException = function captureError(err, kwargs, cb) {
    if(!(err instanceof Error)) {
        // This handles when someone does:
        //   throw "something awesome";
        // We synthesize an Error here so we can extract a (rough) stack trace.
        var err = new Error(err);
    }

    var self = this;
    if(!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }
    parsers.parseError(err, kwargs, function(kw) {
        var result = self.process(kw);
        cb && cb(result);
    });
};

_.captureQuery = function captureQuery(query, engine, kwargs, cb) {
    if(!cb && typeof kwargs === 'function') {
        cb = kwargs;
        kwargs = {};
    } else {
        kwargs = kwargs || {};
    }
    var result = this.process(parsers.parseQuery(query, engine, kwargs));
    cb && cb(result);
    return result;
};

_.patchGlobal = function patchGlobal(cb) {
    module.exports.patchGlobal(this, cb);
};

module.exports.patchGlobal = function patchGlobal(client, cb) {
    // handle when the first argument is the callback, with no client specified
    if(typeof client === 'function') {
        cb = client;
        client = new Client();
    // first argument is a string DSN
    } else if(typeof client === 'string') {
        client = new Client(client);
    }
    // at the end, if we still don't have a Client, let's make one!
    !(client instanceof Client) && (client = new Client());

    var called = false;
    process.on('uncaughtException', function(err) {
        if(cb) {  // bind event listeners only if a callback was supplied
            var onLogged = function onLogged() {
                called = false;
                cb(true, err);
            };

            var onError = function onError() {
                called = false;
                cb(false, err);
            };

            if(called) {
                client.removeListener('logged', onLogged);
                client.removeListener('error', onError);
                return cb(false, err);
            }

            client.once('logged', onLogged);
            client.once('error', onError);
        }

        called = true;

        client.captureError(err, function(result) {
            node_util.log('uncaughtException: '+client.getIdent(result));
        });
    });
};
