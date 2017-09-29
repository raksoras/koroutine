'use strict';

/* Koroutine library configuration */
let _enableBreadcrumbs = false;
let _errorHandler = console.log;

/**
 * Enable/disable full stack traces for all coroutines
 * @param flag {Boolean}
 */
exports.enableBreadcrumbs = function (flag) {
  _enableBreadcrumbs = flag;
};

/* Current executing Koroutine */
let _resume = false;

/**
 * Set error handle function. Koroutine library passes uncaught exceptions thrown from Koroutine into this function
 * @param {Function} error_handler_function(errorObject)
 */
exports.setErrorHandler = function (errHandler) {
  _errorHandler = errHandler;
};

function stitchBreadcrumbs (error, breadcrumbs) {
  if (breadcrumbs) {
    breadcrumbs.push(error);
    const filteredLines = [];
    for (let i = breadcrumbs.length - 1; i >= 0; i--) {
      const stack = breadcrumbs[i].stack;
      if (stack) {
        const lines = stack.split('\n');
        for (let line of lines) {
          if (!line.includes('koroutine.js') && !line.includes('next (native)')) {
            filteredLines.push(line);
          }
        }
      }
      error.stack = filteredLines.join('\n');
    }
  }
}

/**
 * Used to run coroutine for the first time after it is created
 * @param iter {Iterator} Iterator received by calling generator function
 * @param options {Object} Optional options object. It can include following properties
 *        - name: Name of the Koroutine
 *        - timeout: Maximum time in milliseconds up to which this Koroutine is allowed to run
 *        - enableStackTrace: Enable clean stack trace across yields
 *        - stackDepth: Max number of lines to print in case of clean stack traces enabled exceptions
 */
exports.run = function (iter, options) {
  if (_resume) {
    throw new Error('Cannot spawn new koroutine from within another koroutine.');
  }

  if (!iter || typeof iter[Symbol.iterator] !== 'function') {
    throw new Error('First parameter to koroutine.create() must be iterator returned by a generator function.');
  }

  // const o = options || null;
  const name = (options && options.name) || '';
  const errorHandlerFn = (options && options.errorHandler) || _errorHandler;
  let breadcrumbs = ((options && options.enableBreadcrumbs) || _enableBreadcrumbs) ? [] : null;
  let state = new Map();

  const resume = function (error, ...rest) {
    if (!iter) {
      return; // koroutine already finished
    }

    // Callback was invoked so cancel callback timer is any
    resume.callbackTimer = null;

    try {
      if (error) {
        error.cause = error.cause || 'Exception';
        stitchBreadcrumbs(error, breadcrumbs);
        error.koroutine = name;
      }

      // Resume suspended koroutine
      resume.cbInProgress = false;
      resume.timer = null;
      exports.state = state;
      _resume = resume;
      const result = error ? iter.throw(error) : iter.next(rest);

      if (result.done) {
        iter = breadcrumbs = state = null;
        return result.value;
      }
    } catch (e) {
      e.message = 'Unhandled exception in koroutine ' + (name || '') + ' : ' + e.message;
      e.koroutine = name;
      stitchBreadcrumbs(e, breadcrumbs);
      iter = breadcrumbs = state = null;
      errorHandlerFn(e);
    } finally {
      // we are outside running coroutine, clear "current coroutine" variables
      exports.state = null;
      _resume = null;
    }
  };

  // This is the global timeout that limits duration of the entire Koroutine execution
  const timeout = (options && options.timeout) || null;
  if (timeout && timeout > 0) {
    setTimeout(function () {
      const timedOutErr = new Error('Coroutine ' + name + ' did not finish within ' + timeout + ' ms.');
      timedOutErr.cause = 'TimedOut';
      resume(timedOutErr);
    }, timeout);
  }

  resume.krName = name;
  resume.breadcrumbs = breadcrumbs;
  // Start coroutine execution
  resume();
};

function prepareKoroutineCB (resume) {
  if (!resume) {
    throw new Error('koroutine.callback() must be invoked from within an active koroutine');
  }

  if (resume.cbInProgress) {
    throw new Error('koroutine.callback() called when there is already another callback in progress');
  }

  const breadcrumbs = resume.breadcrumbs;
  if (breadcrumbs) {
    const name = resume.krName;
    const errMessage = name ? name + ' suspended at' : 'suspended at';
    breadcrumbs.push(new Error(errMessage));
  }
}

/**
 * Returns NodeJs style callback function - callback(err, data) - which resumes suspended coroutine when called
 * @param timeout {Number} in milliseconds. optional. set to null or 0 for infinite time out.
 * @param name suspension (yield) point name
 * @return {Function} callback function
 */
exports.callback = function (timeout, name) {
  const resume = _resume;
  prepareKoroutineCB(resume);
  resume.cbInProgress = true;

  if (timeout && timeout > 0) {
    const timer = setTimeout(function () {
      if (resume.callbackTimer === timer) {
        const timedOutErr = new Error('callback ' + (name || '') + 'timed out after ' + timeout + ' ms.');
        timedOutErr.cause = 'TimedOut';
        timedOutErr.callback = name;
        resume(timedOutErr);
      }
    }, timeout);
    resume.callbackTimer = timer;
  }

  return resume;
};

/**
 * Returns a Future object that can be passed in place of normal node callback. Future
 * objects work with koroutine.join() to facilitate firing multiple async operations
 * from a single coroutine without blocking or yielding and then waiting for all of them
 * to finish at a single 'join' point in the code
 * @param timeout {Number} Number of milliseconds after which this future will timeout wih error.cause = 'timedout'
 * @return {Function} future callback
 */
exports.future = function (timeout) {
  const resume = _resume;
  prepareKoroutineCB(resume);

  const future = function (error, ...rest) {
    if (future.done === true) {
      return;
    }
    future.done = true;

    if (error) {
      error.cause = error.cause || 'Exception';
      future.error = error;
    } else {
      future.data = rest;
    }

    if (future.isJoined) {
      resume(null, future);
    }
  };

  if ((timeout) && (timeout > 0)) {
    setTimeout(function () {
      const timeoutErr = new Error('Future timed out after ' + timeout + ' milliseconds');
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

function assertCalledFromKoroutine () {
  const resume = _resume;
  if (!resume) {
    throw new Error('This call must be called from within a running koroutine');
  }
  return resume;
}

/**
 * Sleep for given number of milliseconds. Doesn't block the node's event loop
 * @param ms {Number} Number of milliseconds to sleep
 */
exports.sleep = function (timeout) {
  const resume = assertCalledFromKoroutine();
  setTimeout(function () {
    resume();
  }, timeout);
};

/**
 * Akin to thread.yield()
 */
exports.defer = function () {
  const resume = assertCalledFromKoroutine();
  setImmediate(function () {
    resume();
  });
};
