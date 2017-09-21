'use strict';

const koroutine = require('..');

// koroutine.enableGlobalStackTracing(true);
koroutine.setErrorHandler(() => {});

function asyncCallSuccess (input, callback, delay) {
  setTimeout(function () {
    callback(null, input, 'arg-1', 'arg-2');
  }, delay);
}

function asyncCallError (input, callback, delay) {
  setTimeout(function () {
    callback(new Error(input));
  }, delay);
}

function* sequentialCallSuccess (input, delay) {
  return yield asyncCallSuccess(input, koroutine.newCallback(), delay);
}

function* sequentialCallError (input, delay) {
  return yield asyncCallError(input, koroutine.newCallback(), delay);
}

function* testSequentialCalls (test) {
  test.expect(4);

  let result = yield* sequentialCallSuccess('input-1', 200);
  test.deepEqual(result, ['input-1', 'arg-1', 'arg-2']);

  result = yield* sequentialCallSuccess('input-2', 100);
  test.deepEqual(result, ['input-2', 'arg-1', 'arg-2']);

  try {
    yield* sequentialCallError('error-1', 150);
  } catch (e) {
    test.equal(e.message, 'error-1');
    test.equal(e.cause, 'Exception');
  }
  test.done();
}

exports['Test sequential async calls'] = function (test) {
  koroutine.run(testSequentialCalls(test));
};

function* testParallelCalls (test) {
  test.expect(5);

  const f1 = koroutine.newFuture();
  asyncCallSuccess('input-1', f1, 200);

  const f2 = koroutine.newFuture();
  asyncCallSuccess('input-2', f2, 300);

  const f3 = koroutine.newFuture();
  asyncCallError('error-1', f3, 100);

  const numErrors = yield* koroutine.join(f1, f2, f3);

  test.deepEqual(f1.data, ['input-1', 'arg-1', 'arg-2']);
  test.deepEqual(f2.data, ['input-2', 'arg-1', 'arg-2']);
  test.equal(f3.error.message, 'error-1');
  test.equal(f3.error.cause, 'Exception');
  test.equal(numErrors, 1);
  test.done();
}

exports['Test parallel async calls'] = function (test) {
  koroutine.run(testParallelCalls(test));
};

function* testMixedCalls (test) {
  test.expect(8);

  const f1 = koroutine.newFuture();
  asyncCallSuccess('input-1', f1, 10);

  const f2 = koroutine.newFuture();
  asyncCallSuccess('input-2', f2, 100);

  const f3 = koroutine.newFuture();
  asyncCallSuccess('input-3', f3, 200);

  const f4 = koroutine.newFuture();
  asyncCallSuccess('input-4', f4, 300);

  const f5 = koroutine.newFuture();
  asyncCallSuccess('input-5', f5, 800);

  let numErrors = yield* koroutine.join(f1, f2);
  test.equal(numErrors, 0);
  test.deepEqual(f1.data, ['input-1', 'arg-1', 'arg-2']);
  test.deepEqual(f2.data, ['input-2', 'arg-1', 'arg-2']);

  let result = yield* sequentialCallSuccess('input-4', 400);
  test.deepEqual(result, ['input-4', 'arg-1', 'arg-2']);

  numErrors = yield* koroutine.join(f3, f4, f5);
  test.equal(numErrors, 0);
  test.deepEqual(f3.data, ['input-3', 'arg-1', 'arg-2']);
  test.deepEqual(f4.data, ['input-4', 'arg-1', 'arg-2']);
  test.deepEqual(f5.data, ['input-5', 'arg-1', 'arg-2']);

  test.done();
}

exports['Test futures mixed with yield'] = function (test) {
  koroutine.run(testMixedCalls(test));
};

exports['Test future timeout'] = function (test) {
  koroutine.run((function* (test) {
    test.expect(4);

    const f1 = koroutine.newFuture(100);
    asyncCallSuccess('input-1', f1, 8000);

    const f2 = koroutine.newFuture(2000);
    asyncCallSuccess('input-2', f2, 300);

    const f3 = koroutine.newFuture(200);
    asyncCallError('error-1', f3, 8000);

    const numErrors = yield* koroutine.join(f1, f2, f3);
    test.equal(numErrors, 2);
    test.equal(f1.error.cause, 'TimedOut');
    test.deepEqual(f2.data, ['input-2', 'arg-1', 'arg-2']);
    test.equal(f3.error.cause, 'TimedOut');
    test.done();
  })(test));
};

exports['Test koroutine timeout with future'] = function (test) {
  koroutine.run((function* (test) {
    test.expect(1);
    try {
      const ft = koroutine.newFuture(100);
      asyncCallSuccess('input-2', ft, 300);
      yield* koroutine.join(ft);
      test.ok(false);
    } catch (e) {
      test.equal(e.cause, 'TimedOut');
      test.done();
    }
  })(test), {timeout: 10});
};

function* testSequentialCallTimeout (test) {
  test.expect(1);
  try {
    yield* sequentialCallSuccess('input-1', 2000);
  } catch (e) {
    test.equal(e.cause, 'TimedOut');
  }
  test.done();
}

exports['Test sequential call timeout'] = function (test) {
  koroutine.run(testSequentialCallTimeout(test), {timeout: 10});
};

function* testParallelCallsTimeout (test) {
  test.expect(2);

  const f1 = koroutine.newFuture();
  asyncCallSuccess('input-1', f1, 200);

  const f2 = koroutine.newFuture();
  asyncCallSuccess('input-2', f2, 600);

  try {
    yield* koroutine.join(f1, f2);
  } catch (e) {
    test.equal(e.cause, 'TimedOut');
    test.deepEqual(f1.data, ['input-1', 'arg-1', 'arg-2']);
  }

  test.done();
}

exports['Test parallel calls timeout'] = function (test) {
  koroutine.run(testParallelCallsTimeout(test), {timeout: 400});
};

function* testInterruptCoroutine (test) {
  test.expect(1);
  try {
    yield* sequentialCallSuccess('input-1', 2000);
  } catch (e) {
    test.equal(e.cause, 'Interrupted');
    test.done();
  }
}

exports['Test interrupt'] = function (test) {
  const kr = testInterruptCoroutine(test);
  koroutine.run(kr);
  koroutine.interrupt(kr);
};

function* testContinueAfterInterrupt (test) {
  test.expect(2);
  try {
    yield* sequentialCallSuccess('input-1', 1000);
    test.ok(false);
  } catch (e) {
    test.equal(e.cause, 'Interrupted');
  }

  let result = yield* sequentialCallSuccess('input-2', 100);
  test.deepEqual(result, ['input-2', 'arg-1', 'arg-2']);
  test.done();
}

exports['Test continue after interrupt'] = function (test) {
  const kr = testContinueAfterInterrupt(test);
  koroutine.run(kr);
  koroutine.interrupt(kr);
};

exports['Test continue after error'] = function (test) {
  koroutine.run((function* (test) {
    test.expect(3);
    try {
      yield* sequentialCallError('error-1', 150);
      test.ok(false);
    } catch (e) {
      test.equal(e.message, 'error-1');
      test.equal(e.cause, 'Exception');
    }

    let result = yield* sequentialCallSuccess('input-2', 100);
    test.deepEqual(result, ['input-2', 'arg-1', 'arg-2']);
    test.done();
  })(test));
};

function* testSleep (test) {
  test.expect(1);
  const start = Date.now();
  yield koroutine.sleep(100);
  const end = Date.now();
  test.ok((end - start) >= 100, (end - start));
  test.done();
};

exports['Test sleep'] = function (test) {
  koroutine.run(testSleep(test));
};

function* testDefer (test) {
  test.expect(3);
  let count = 0;

  yield koroutine.defer();
  test.equal(count, 0);

  setImmediate(function () {
    count++;
  });
  setImmediate(function () {
    count++;
  });
  test.equal(count, 0);

  yield koroutine.defer();
  test.equal(count, 2);

  test.done();
}

exports['Test defer'] = function (test) {
  koroutine.run(testDefer(test));
};

function testDoneLatch (test, limit) {
  let count = 0;
  const origDone = test.done;
  return function () {
    count += 1;
    if (count >= limit) {
      origDone();
    }
  };
}

function testExpectAccumulator (test) {
  let accCount = 0;
  const origExpect = test.expect;
  return function (count) {
    accCount += count;
    origExpect(accCount);
  };
}

exports['Test sequential async calls in multiple simultaneous coroutines'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 3);
  koroutine.run(testSequentialCalls(test));
  koroutine.run(testSequentialCalls(test));
  koroutine.run(testSequentialCalls(test));
};

exports['Test parallel async calls in multiple simultaneous coroutines'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 3);
  koroutine.run(testParallelCalls(test), 8000);
  koroutine.run(testParallelCalls(test), 8000);
  koroutine.run(testParallelCalls(test), 8000);
};

exports['Test mixed calls in multiple simultaneous coroutines'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 6);
  koroutine.run(testSequentialCalls(test), 2000);
  koroutine.run(testParallelCalls(test), 1000);
  koroutine.run(testSequentialCalls(test), 2000);
  koroutine.run(testParallelCalls(test), 1000);
  koroutine.run(testParallelCalls(test), 1000);
  koroutine.run(testSequentialCalls(test), 2000);
};

function* testCoroutineCurrentCtx (test, delay, input) {
  test.expect(1);
  koroutine.getKoroutineContext().my_var = input;
  yield koroutine.sleep(delay);
  test.equal(koroutine.getKoroutineContext().my_var, input);
  test.done();
};

exports['Test koroutine current context'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 3);
  koroutine.run(testCoroutineCurrentCtx(test, 100, 'first'));
  koroutine.run(testCoroutineCurrentCtx(test, 200, 'second'));
  koroutine.run(testCoroutineCurrentCtx(test, 150, 'third'));
};

function* testExceptionThrower (test) {
  throw new Error('Uncaught Exception!');
}

exports['Test coroutine throwing uncaught exception'] = function (test) {
  try {
    koroutine.run(testExceptionThrower(test));
    test.done();
  } catch (e) {
    test.done();
  }
};

exports['Test coroutine throwing error with timeout'] = function (test) {
  try {
    koroutine.run(testExceptionThrower(test), {timeout: 10});
  } catch (e) {
    test.done();
  }
};

exports['Test future() fail without active koroutine'] = function (test) {
  try {
    koroutine.newFuture();
    test.ok(false);
  } catch (e) {
    test.done();
  }
};

exports['Test sleep() fail without active koroutine'] = function (test) {
  try {
    koroutine.sleep(10);
    test.ok(false);
  } catch (e) {
    test.done();
  }
};

exports['Test defer() fail without active koroutine'] = function (test) {
  try {
    koroutine.defer();
    test.ok(false);
  } catch (e) {
    test.done();
  }
};

function* testStackTracing (mesg) {
  yield* sequentialCallSuccess('input-1', 100);
  yield* sequentialCallSuccess('input-2', 100);
  throw new Error(mesg);
}

exports['Test with stack tracing disabled'] = function (test) {
  const errHandlerFn = function (mesg, err) {
    const log = err.stack;
    test.expect(5);
    test.equal(mesg, 'Unhandled exception in koroutine');
    test.ok(log.includes('next (native)'));
    test.equal((log.match(/testStackTracing/g) || []).length, 1);
    test.ok(!log.includes('Resumed'));
    test.ok(log.split('\n').length > 5);
    test.done();
  };
  koroutine.setErrorHandler(errHandlerFn);
  koroutine.run(testStackTracing('test stack tracing disabled'));
};

exports['Test with stack tracing enabled'] = function (test) {
  const errHandlerFn = function (mesg, err) {
    const log = err.stack;
    test.expect(5);
    test.equal(mesg, 'Unhandled exception in koroutine');
    test.ok(!log.includes('next (native)'));
    test.equal((log.match(/testStackTracing/g) || []).length, 3);
    test.ok(log.includes('Resumed test-stack-tracing'));
    test.ok(log.split('\n').length > 5);
    test.done();
  };
  koroutine.setErrorHandler(errHandlerFn);
  koroutine.run(testStackTracing('test stack tracing enabled'), {enableStackTrace: true, name: 'test-stack-tracing'});
};

exports['Test with limit stack depth'] = function (test) {
  const errHandlerFn = function (mesg, err) {
    const log = err.stack;
    test.expect(2);
    test.equal(mesg, 'Unhandled exception in koroutine');
    test.ok(log.split('\n').length < 5);
    test.done();
  };
  koroutine.setErrorHandler(errHandlerFn);
  koroutine.run(testStackTracing('limit stack depth'), {enableStackTrace: true, stackDepth: 4});
};

function* multileLiveCallback () {
  koroutine.setErrorHandler(() => {});
  koroutine.newCallback();
  yield* sequentialCallSuccess('input-1', 100);
}

exports['Test multiple live callback fail'] = function (test) {
  try {
    koroutine.run(multileLiveCallback());
    test.ok(false);
  } catch (e) {
    test.done();
  }
};
