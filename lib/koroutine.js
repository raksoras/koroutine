'use strict';

/* Current executing Koroutine */
let _resume = false;

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

/**
 * Set error handle function. Koroutine library passes uncaught exceptions thrown from Koroutine into this function
 * @param {Function} error_handler_function(errorObject)
 */
exports.setErrorHandler = function (errHandler) {
  if (errHandler) {
    _errorHandler = errHandler;
  }
};

function stitchBreadcrumbs (error, breadcrumbs) {
  if (breadcrumbs && breadcrumbs.length > 0) {
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
 * Starts execution of the coroutine. Called on Koroutine object.
 */
function run () {
  const resume = this;
  const timeout = resume.timeout;
  // This is the global timeout that limits duration of whole Koroutine execution
  if (timeout && timeout > 0) {
    const globalTimer = setTimeout(function () {
      if (resume.globalTimer === globalTimer) {
        const timedOutErr = new Error('Coroutine ' + resume.koroutineName + ' did not finish within ' + timeout + ' ms.');
        timedOutErr.cause = 'TimedOut';
        resume(timedOutErr);
      }
    }, timeout);
    resume.globalTimer = globalTimer;
  }

  const result = resume();
  if (result && result.done) {
    resume.globalTimer = null;
    return result;
  }
}

/**
 * Interrupts the waiting/suspended koroutine at next chance available. Called on Koroutine object.
 * Throws exception inside the running koroutine with the message 'Koroutine interrupted'
 */
function interrupt () {
  const e = new Error('Koroutine interrupted.');
  e.cause = 'Interrupted';
  this(e);
};

/**
 * Used to run coroutine for the first time after it is created
 * @param iter {Iterator} Iterator received by calling generator function
 * @param options {Object} Optional options object. It can include following properties
 *        - name: Name of the Koroutine
 *        - timeout: Maximum time in milliseconds up to which this Koroutine is allowed to run
 *        - enableStackTrace: Enable clean stack trace across yields
 *        - stackDepth: Max number of lines to print in case of clean stack traces enabled exceptions
 */
exports.create = function (iter, options) {
  if (_resume) {
    throw new Error('Cannot spawn new koroutine from within another koroutine.');
  }

  if (!iter || typeof iter[Symbol.iterator] !== 'function') {
    throw new Error('First parameter to koroutine.create() must be iterator returned by generator function.');
  }

  const o = options || null;
  const name = o ? o.name || '' : '';
  const errorHandlerFn = o ? o.errorHandler || _errorHandler : _errorHandler;
  let state = {};
  let breadcrumbs = null;
  if ((o && o.enableBreadcrumbs) || _enableBreadcrumbs) {
    breadcrumbs = [];
  }

  const resume = function (error, ...rest) {
    if (!iter) {
      return; // koroutine already finished
    }

    try {
      if (error) {
        error.cause = error.cause || 'Exception';
        stitchBreadcrumbs(error, breadcrumbs);
        error.koroutine = name;
      }

      // Resume suspended koroutine
      resume.cbInProgress = false;
      resume.timer = null;
      exports.context = state;
      _resume = resume;
      const result = error ? iter.throw(error) : iter.next(rest);

      if (result.done) {
        resume.globalTimer = iter = options = breadcrumbs = state = null;
        return result.value;
      }
    } catch (e) {
      e.message = 'Unhandled exception in koroutine ' + (name || '') + ' : ' + e.message;
      e.koroutine = name;
      stitchBreadcrumbs(e, breadcrumbs);
      resume.globalTimer = iter = options = breadcrumbs = state = null;
      errorHandlerFn(e);
    } finally {
      // we are outside running coroutine, clear "current coroutine" variables
      exports.context = null;
      _resume = null;
    }
  };

  resume.koroutineName = name;
  resume.breadcrumbs = breadcrumbs;
  resume.timeout = o ? o.timeout : null;
  resume.run = run;
  resume.interrupt = interrupt;
  resume.errorHandlerFn = errorHandlerFn;
  return resume;
};

function captureStack (resume) {
  const breadcrumbs = resume.breadcrumbs;
  if (breadcrumbs) {
    const name = resume.koroutineName;
    const errMessage = name ? name + ' suspended at' : 'suspended at';
    breadcrumbs.push(new Error(errMessage));
  }
}

function prepareKoroutineCB () {
  const resume = _resume;
  if (!resume) {
    throw new Error('koroutine.callback() must be invoked from within an active koroutine');
  }
  if (resume.cbInProgress) {
    throw new Error('koroutine.callback() called when there is already another callback in progress');
  }
  captureStack(resume);
  return resume;
}

/**
 * Returns NodeJs style callback function - callback(err, data) - which resumes suspended coroutine when called
 * @param timeout {Number} in milliseconds. optional. set to null or 0 for infinite time out.
 * @param name suspension (yield) point name
 * @return {Function} callback function
 */
exports.callback = function (timeout, name) {
  const resume = prepareKoroutineCB();
  resume.cbInProgress = true;

  if (timeout && timeout > 0) {
    const timer = setTimeout(function () {
      if (resume.timer === timer) {
        const timedOutErr = new Error('callback ' + (name || '') + 'timed out after ' + timeout + ' ms.');
        timedOutErr.cause = 'TimedOut';
        timedOutErr.callbackName = name;
        resume(timedOutErr);
      }
    }, timeout);
    resume.timer = timer;
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
  const resume = prepareKoroutineCB();

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
