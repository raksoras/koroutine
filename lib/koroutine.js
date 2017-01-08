'use strict';

const debug = require('debug')('koroutine');

/* Used to store current coroutine's context. Allows developer to stuff variables
* specific to current executing coroutine like this:
* koroutine.current.context.myVar = 'foo'
* Akin to therad local variable
*/
const current = {};

/**
 * Wait till all the passed in futures are complete - i.e. done executing
 * @param {Array of futur objects} Futures to wait on
 * @return {Number} number of futures who returned error
 */
function* join (...futures) {
  let errorCount = 0;
  for (const future of futures) {
    while (future.done !== true) {
      yield;
    }
    if (future.error) {
      errorCount += 1;
    }
  }
  return errorCount;
}

/**
 * Interrupts the waiting/paused coroutine at next chance available. Throws exception
 * inside the running with the message 'Coroutine interrupted'
 */
function interrupt () {
  const e = new Error('Coroutine interrupted.');
  e.cause = 'interrupted';
  this.resume(e);
}

/**
 * Returns a Future object that can be passed in place of normal node callback. Future
 * objects work with koroutine.join() to facilitate firing multiple async operations
 * from a single coroutine without blocking or yielding and then waiting for all of them
 * to finish at a single 'join' point in the code
 * @param timeout {Number} Number of milliseconds after which this future will timeout wih error.cause = 'timedout'
 * @return {Function} future callback
 */
function newFuture (timeout) {
  const that = this;
  let timer = null;

  const future = function (error, data, ...rest) {
    if (future.done === true) {
      return;
    }
    future.done = true;

    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    if (error) {
      error.cause = error.cause || 'exception';
      future.error = error;
    } else {
      if ((rest) && (rest.length > 0)) {
        rest.unshift(data);
        data = rest;
      }
      future.data = data;
    }

    that.resume(null, future);
  };

  const tout = timeout || 0;
  if (tout > 0) {
    timer = setTimeout(function () {
      timer = null;
      const e = new Error('Future timed out after ' + tout + ' milliseconds');
      e.cause = 'timedout';
      future(e);
    }, tout);
  }

  return future;
}

/**
 * sleep for given number of milliseconds. Doesn't block the node's event loop
 * @param ms {Number} Number of milliseconds to sleep
 */
function sleep (ms) {
  setTimeout(this.resume, ms);
}

/**
 * Akin to thread.yield()
 */
function defer () {
  setImmediate(this.resume);
}

/**
 * Run passed in generator in a new coroutine
 * @param generator {Function} generator funtion to be run in the new coroutine
 * @param timeout {Number} Number of milliseconds after which this coroutine
 *      will be automatically stopped by the scheduler. pass '0' for
 *    infinite (no) timeout
 * @param rest {Array} arguments to be passed to the generator function
 * @return coroutine started
 */

function run (generator, timeout, ...rest) {
  const ctx = {};
  let iterator = null;
  let timer = null;

  /**
   * Resumes the yielded coroutine. Pass it in in place of normal node callback
   * - callback(error, resulti, ...) - to resume the coroutine automatically when
   * async call is completed.
   * @error {Error} errro object if async call returns an error, null if no error
   * @data  result if async call was a success
   * @rest {Array} variable number of arguments passed to the callback
   */
  const resume = function (error, data, ...rest) {
    if (iterator == null) {
      return;
    }

    let finished = false;
    try {
      if (error) {
        error.cause = error.cause || 'exception';
      } else {
        if ((rest) && (rest.length > 0)) {
          rest.unshift(data);
          data = rest;
        }
      }

      current.context = ctx;
      const state = (error) ? iterator.throw(error) : iterator.next(data);
      if (state.done) {
        finished = true;
        return state.value;
      }
    } catch (e) {
      finished = true;
      debug('Coroutine threw error: %s', e);
      throw e;
    } finally {
      current.context = null;
      if (finished) {
        iterator = null;
        if (timer != null) {
          clearTimeout(timer);
          timer = null;
        }
      }
    }
  };

  let coroutine = {
    resume: resume,
    interrupt: interrupt,
    sleep: sleep,
    defer: defer,
    future: newFuture
  };

  const tout = timeout || 0;
  if (tout > 0) {
    timer = setTimeout(function () {
      timer = null;
      const e = new Error('Coroutine did not finish within ' + timeout + ' ms.');
      e.cause = 'timedout';
      resume(e);
    }, tout);
  }

  iterator = generator.apply(coroutine, rest);
  resume();
  return coroutine;
}

exports.run = run;
exports.join = join;
exports.current = current;
