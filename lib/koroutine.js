'use strict';

let _enableStackTraceGlobal = false;
let _errorHandler = console.log;

// Current executing koroutine
let _iter = false;

/**
 * Enable/disable full stack traces for all coroutines
 * @param flag {Boolean}
 */
exports.enableGlobalStackTracing = function (flag) {
  _enableStackTraceGlobal = flag;
};

/**
 *@return {Object} Current executing coroutine's thread local context.
 */
exports.getKoroutineContext = function () {
  assertLiveCoroutine(_iter, 'getKoroutineContext');
  const state = _iter.state;
  if (!state) {
    throw new Error('Koroutine state context not established');
  }
  return state;
};

exports.setErrorHandler = function (errHandlerFn) {
  _errorHandler = errHandlerFn;
};

function assertLiveCoroutine (iter, method) {
  if (!iter) {
    throw new Error('koroutine ' + (method || 'method') + ' called without active koroutine');
  }
}

function prettyPrintStack (iter) {
  const stacks = iter.stacks;
  if (!stacks) {
    return '';
  }

  const prettyStackFrames = [];
  const stackDepth = iter.stackDepth || 64;
  for (let i = stacks.length - 1; i >= 0; i--) {
    const stack = stacks[i].stack;
    if (stack) {
      const frames = stack.split('\n');
      for (let frame of frames) {
        if (!frame.includes('koroutine.js') && !frame.includes('next (native)')) {
          prettyStackFrames.push(frame);
        }
        if (prettyStackFrames.length >= stackDepth) {
          return prettyStackFrames.join('\n');
        }
      }
    }
  }

  return prettyStackFrames.join('\n');
}

function captureStack (iter) {
  const stacks = iter.stacks;
  if (stacks) {
    const mesg = (iter.name) ? 'Resumed ' + iter.name : 'Resumed';
    stacks.push(new Error(mesg));
  }
}

function augmentStack (iter, error) {
  const stacks = iter.stacks;
  if (stacks) {
    stacks.push(error);
    error.stack = prettyPrintStack(iter);
  }
}

// Cancel "outermost", whole coroutine timer, if present
function clearKoroutineTimer (iter) {
  const timer = iter.timer;
  if (timer) {
    clearTimeout(timer);
    iter.timer = null;
  }
}

function handleException (iter, error) {
  clearKoroutineTimer(iter);
  augmentStack(iter, error);
  iter.state = null;
  iter.stacks = null;
  _errorHandler('Unhandled exception in koroutine', error);
}

function resume (iter, error, ...rest) {
  assertLiveCoroutine(iter, 'resume');

  iter.liveCallback = null;
  _iter = iter;

  try {
    if (error) {
      error.cause = error.cause || 'Exception';
      augmentStack(iter, error);
    }

    const result = (error) ? iter.throw(error) : iter.next(...rest);

    if (result.done) {
      clearKoroutineTimer(iter);
      iter.stacks = null;
      iter.state = null;
      return result.value;
    }
  } catch (e) {
    handleException(iter, e);
  } finally {
    // we are outside running coroutine, clear coroutine specific state
    _iter = null;
  }
};

function startTimer (iter, timeout) {
  if ((!timeout) || (timeout === 0)) {
    return null;
  }
  return setTimeout(function () {
    const timeoutErr = new Error('Timed out after ' + timeout + ' milliseconds');
    timeoutErr.cause = 'TimedOut';
    resume(iter, timeoutErr, null);
  }, timeout);
}

/* TODO: options object {name:, timeout:, enableStackTrace:, stackeTraceDepth: }
*/
/**
 * Used to run coroutine for the first time after it is created
 * @param iter {Iterator} received by calling generator function
 * @param options {Number} options object
 * maximum time in milliseconds this coroutine is allowed to run. optional. set to null or 0 for infinite time out 
 * @param enableStacktrace {Boolean} set to true if you want full stack-traces on exceptions. optional. false by default.
 */
exports.run = function (iter, options) {
  assertLiveCoroutine(iter, 'run');

  try {
    _iter = iter;
    iter.state = {};

    if (options) {
      // This is the "outermost" timer imposing maximum time limit of the entire run of the coroutine.
      if (options.timeout && options.timeout > 0) {
        iter.timer = startTimer(iter, options.timeout);
      }
      iter.stacks = (options.enableStackTrace || _enableStackTraceGlobal) ? [] : null;
      iter.stackDepth = options.stackDepth;
      iter.name = options.name;
    }

    // Starts execution of the coroutine
    const result = iter.next();
    if (result.done) {
      clearKoroutineTimer(iter);
      iter.stacks = null;
      iter.state = null;
    }
    return result;
  } catch (e) {
    handleException(iter, e);
    throw e;
  } finally {
    // we are outside running coroutine, clear coroutine specific state
    _iter = null;
  }
};

/**
 * Returns NodeJs style callback function - callback(err, data) - which resumes suspended coroutine when called
 * @param timeout {Number} in milliseconds. optional. set to null or 0 for infinite time out.
 * @return {Function} future callback
 */
exports.newCallback = function (timeout) {
  assertLiveCoroutine(_iter, 'callback');
  const iter = _iter;

  if (iter.liveCallback) {
    throw new Error('koroutine.newCallback() when there is already another live callback in progress');
  }
  iter.liveCallback = true;

  const timer = startTimer(iter, timeout);
  captureStack(iter);
  return function (error, ...rest) {
    if (timer != null) {
      clearTimeout(timer);
    }
    resume(iter, error, rest);
  };
};

/**
 * Returns a Future object that can be passed in place of normal node callback. Future
 * objects work with koroutine.join() to facilitate firing multiple async operations
 * from a single coroutine without blocking or yielding and then waiting for all of them
 * to finish at a single 'join' point in the code
 * @param timeout {Number} Number of milliseconds after which this future will timeout wih error.cause = 'timedout'
 * @return {Function} future callback
 */
exports.newFuture = function (timeout) {
  assertLiveCoroutine(_iter, 'future');

  const iter = _iter;
  captureStack(iter);
  let timer = null;

  const future = function (error, ...rest) {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    if (future.done === true) {
      return;
    }
    future.done = true;

    if (error) {
      error.cause = error.cause || 'Exception';
      augmentStack(error);
      future.error = error;
    } else {
      future.data = rest;
    }

    if (future.isJoined) {
      resume(iter, null, future);
    }
  };

  if ((timeout) && (timeout > 0)) {
    timer = setTimeout(function () {
      timer = null;
      const timeoutErr = new Error('Timed out after ' + timeout + ' milliseconds');
      timeoutErr.cause = 'TimedOut';
      future(timeoutErr);
    }, timeout);
  }

  return future;
};

/**
 * Wait till all the passed in futures are complete - i.e. done executing
 * @param {Array of futur objects} Futures to wait on
 * @return {Number} number of futures who returned error
 */
exports.join = function* (...futures) {
  let errorCount = 0;
  for (const future of futures) {
    while (future.done !== true) {
      future.isJoined = true;
      yield;
    }
    // future.isJoined = null;
    if (future.error) {
      errorCount += 1;
    }
  }
  return errorCount;
};

/**
 * Interrupts the waiting/suspended coroutine at next chance available. Throws exception
 * inside the running with the message 'Coroutine interrupted'
 */
exports.interrupt = function (iter) {
  const e = new Error('Coroutine interrupted.');
  e.cause = 'Interrupted';
  resume(iter, e, null);
};

/**
 * sleep for given number of milliseconds. Doesn't block the node's event loop
 * @param ms {Number} Number of milliseconds to sleep
 */
exports.sleep = function (ms) {
  assertLiveCoroutine(_iter, 'sleep');
  const iter = _iter;
  setTimeout(function () {
    resume(iter, null, null);
  }, ms);
};

/**
 * Akin to thread.yield()
 */
exports.defer = function () {
  assertLiveCoroutine(_iter, 'defer');
  const iter = _iter;
  setImmediate(function () {
    resume(iter, null, null);
  });
};
