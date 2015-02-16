# trackjs-node
TrackJS.com library for NodeJS environments

Based largely on the getsentry/raven-node library @ https://github.com/getsentry/raven-node

This library allows users to log errors to TrackJS (https://www.trackjs.com/) from their Node
environments.

## TrackJS DSN
TRACKJS_DSN listed below refers to the TrackJS endpoint for your account.

Example: https://capture.trackjs.com/capture?token=YOUR-TOKEN

## TrackJS Applications
You can segment your TrackJS error messages by 'Applications'. You may consider segmenting
between your client side error messages, and your server side error messages.

If you'd like to take advantage of this, pass in an applications parameter within your TRACKJS_DSN.

Example: https://capture.trackjs.com/capture?token=YOUR-TOKEN&application=APPLICATION-ID


## Installation
```
$ npm install trackjs-node
```

## Methods
```javascript
new raven.Client(String dsn[, Object options])
client.captureMessage(String message[[, Object options], Function callback])
client.captureError(Error error[[, Object options], Function callback])
client.captureQuery(String query[[, String type], Function callback])
```

## Basic Usage
```javascript
var raven = require('raven');
var client = new raven.Client('{{ TRACKJS_DSN }}');

client.captureMessage('Hello, world!');
```

## Logging an error
```javascript
client.captureError(new Error('Broke!'));
```

## Logging a query
```javascript
client.captureQuery('SELECT * FROM `awesome`', 'mysql');
```

## TrackJS Identifier
```javascript
client.captureMessage('Hello, world!', function(result) {
    console.log(client.getIdent(result));
});
```

```javascript
client.captureError(new Error('Broke!'), function(result) {
  console.log(client.getIdent(result));
});
```

__Note__: `client.captureMessage` will also return the result directly without the need for a callback, such as: `var result = client.captureMessage('Hello, world!');`

## Events
If you really care if the event was logged or errored out, Client emits two events, `logged` and `error`:

```javascript
client.on('logged', function(){
  console.log('Yay, it worked!');
});
client.on('error', function(e){
  console.log('oh well, TrackJS is broken.');
})
client.captureMessage('Boom');
```

### Error Event
The event error is augmented with the original TrackJS response object as well as the response body and statusCode for easier debugging.

```javascript
client.on('error', function(e){
  console.log(e.reason);  // raw response body, usually contains a message explaining the failure
  console.log(e.statusCode);  // status code of the http request
  console.log(e.response);  // entire raw http response object
});
```

## Environment variables
### TRACKJS_DSN
Optionally declare the DSN to use for the client through the environment. Initializing the client in your app won't require setting the DSN.

## Catching global errors
For those times when you don't catch all errors in your application. ;)

```javascript
client.patchGlobal();
// or
raven.patchGlobal(client);
// or
raven.patchGlobal('{{ TRACKJS_DSN }}');
```

It is recommended that you don't leave the process running after receiving an `uncaughtException` (http://nodejs.org/api/process.html#process_event_uncaughtexception), so an optional callback is provided to allow you to hook in something like:

```javascript
client.patchGlobal(function() {
  console.log('Bye, bye, world.');
  process.exit(1);
});
```

The callback is called **after** the event has been sent to the TrackJS server.

## Integrations
### Connect/Express middleware
The Raven middleware can be used as-is with either Connect or Express in the same way. Take note that in your middlewares, Raven must appear _after_ your main handler to pick up any errors that may result from handling a request.

#### Connect
```javascript
var connect = require('connect');
function mainHandler(req, res) {
  throw new Error('Broke!');
}
function onError(err, req, res, next) {
  // The error id is attached to `res.trackjs` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.trackjs+'\n');
}
connect(
  connect.bodyParser(),
  connect.cookieParser(),
  mainHandler,
  raven.middleware.connect('{{ TRACKJS_DSN }}'),
  onError, // optional error handler if you want to display the error id to a user
).listen(3000);
```

#### Express
```javascript
var app = require('express')();
app.get('/', function mainHandler(req, res) {
  throw new Error('Broke!');
});
app.use(raven.middleware.express('{{ TRACKJS_DSN }}'));
app.use(onError); // optional error handler if you want to display the error id to a user
app.listen(3000);
```

__Note__: `raven.middleware.express` or `raven.middleware.connect` *must* be added to the middleware stack *before* any other error handling middlewares or there's a chance that the error will never get to Sentry.


## Pre-processing data
Pass the `dataCallback` configuration value:

```javascript
client = new raven.Client('{{ TRACKJS_DSN }}', {
  dataCallback: function(data) {
    delete data.request.env;
    return data;
  }
});
```

## Disable Raven
Pass `false` as the DSN (or any falsey value).

```javascript
client = new raven.Client(process.env.NODE_ENV === 'production' && '{{ TRACKJS_DSN }}')
```

__Note__: We don't infer this from `NODE_ENV` automatically anymore. It's up to you to implement whatever logic you'd like.
