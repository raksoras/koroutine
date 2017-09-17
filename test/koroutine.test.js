'use strict';

const koroutine = require('..');

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
  return yield asyncCallSuccess(input, koroutine.resume, delay);
}

function* sequentialCallError (input, delay) {
  return yield asyncCallError(input, koroutine.resume, delay);
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
    test.equal(e.cause, 'exception');
  }
  test.done();
}

exports['Test sequential async calls'] = function (test) {
  koroutine.create(testSequentialCalls, 2000, test).run();
};

function* testParallelCalls (test) {
  test.expect(5);

  const f1 = koroutine.future();
  asyncCallSuccess('input-1', f1, 200);

  const f2 = koroutine.future();
  asyncCallSuccess('input-2', f2, 300);

  const f3 = koroutine.future();
  asyncCallError('error-1', f3, 100);

  const numErrors = yield* koroutine.join(f1, f2, f3);

  test.deepEqual(f1.data, ['input-1', 'arg-1', 'arg-2']);
  test.deepEqual(f2.data, ['input-2', 'arg-1', 'arg-2']);
  test.equal(f3.error.message, 'error-1');
  test.equal(f3.error.cause, 'exception');
  test.equal(numErrors, 1);
  test.done();
}

exports['Test parallel async calls'] = function (test) {
  koroutine.create(testParallelCalls, 1000, test).run();
};

function* testMixedCalls (test) {
  test.expect(8);

  const f1 = koroutine.future();
  asyncCallSuccess('input-1', f1, 10);

  const f2 = koroutine.future();
  asyncCallSuccess('input-2', f2, 100);

  const f3 = koroutine.future();
  asyncCallSuccess('input-3', f3, 200);

  const f4 = koroutine.future();
  asyncCallSuccess('input-4', f4, 300);

  const f5 = koroutine.future();
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
  koroutine.create(testMixedCalls, 2000, test).run();
};

exports['Test future timeout'] = function (test) {
  koroutine.create(function* (test) {
    test.expect(4);

    const f1 = koroutine.future(100);
    asyncCallSuccess('input-1', f1, 8000);

    const f2 = koroutine.future(2000);
    asyncCallSuccess('input-2', f2, 300);

    const f3 = koroutine.future(200);
    asyncCallError('error-1', f3, 8000);

    const numErrors = yield* koroutine.join(f1, f2, f3);
    test.equal(numErrors, 2);
    test.equal(f1.error.cause, 'timedout');
    test.deepEqual(f2.data, ['input-2', 'arg-1', 'arg-2']);
    test.equal(f3.error.cause, 'timedout');
    test.done();
  }, 1000, test).run();
};

exports['Test koroutine timeout with future'] = function (test) {
  koroutine.create(function* (test) {
    test.expect(1);
    try {
      const ft = koroutine.future(100);
      asyncCallSuccess('input-2', ft, 300);
      yield* koroutine.join(ft);
      test.ok(false);
    } catch (e) {
      test.equal(e.cause, 'timedout');
      test.done();
    }
  }, 10, test).run();
};

function* testSequentialCallTimeout (test) {
  test.expect(1);
  try {
    yield* sequentialCallSuccess('input-1', 2000);
  } catch (e) {
    test.equal(e.cause, 'timedout');
  }
  test.done();
}

exports['Test sequential call timeout'] = function (test) {
  koroutine.create(testSequentialCallTimeout, 10, test).run();
};

function* testParallelCallsTimeout (test) {
  test.expect(2);

  const f1 = koroutine.future();
  asyncCallSuccess('input-1', f1, 200);

  const f2 = koroutine.future();
  asyncCallSuccess('input-2', f2, 600);

  try {
    yield* koroutine.join(f1, f2);
  } catch (e) {
    test.equal(e.cause, 'timedout');
    test.deepEqual(f1.data, ['input-1', 'arg-1', 'arg-2']);
  }

  test.done();
}

exports['Test parallel calls timeout'] = function (test) {
  koroutine.create(testParallelCallsTimeout, 400, test).run();
};

function* testInterruptCoroutine (test) {
  test.expect(1);
  try {
    yield* sequentialCallSuccess('input-1', 2000);
  } catch (e) {
    test.equal(e.cause, 'interrupted');
    test.done();
  }
}

exports['Test interrupt'] = function (test) {
  const kr = koroutine.create(testInterruptCoroutine, 0, test);
  kr.run();
  kr.interrupt();
};

function* testContinueAfterInterrupt (test) {
  test.expect(2);
  try {
    yield* sequentialCallSuccess('input-1', 1000);
    test.ok(false);
  } catch (e) {
    test.equal(e.cause, 'interrupted');
  }

  let result = yield* sequentialCallSuccess('input-2', 100);
  test.deepEqual(result, ['input-2', 'arg-1', 'arg-2']);
  test.done();
}

exports['Test continue after interrupt'] = function (test) {
  const kr = koroutine.create(testContinueAfterInterrupt, 0, test);
  kr.run();
  kr.interrupt();
};

exports['Test continue after error'] = function (test) {
  koroutine.create(function* (test) {
    test.expect(3);
    try {
      yield* sequentialCallError('error-1', 150);
      test.ok(false);
    } catch (e) {
      test.equal(e.message, 'error-1');
      test.equal(e.cause, 'exception');
    }

    let result = yield* sequentialCallSuccess('input-2', 100);
    test.deepEqual(result, ['input-2', 'arg-1', 'arg-2']);
    test.done();
  }, 0, test).run();
};

function* testSleep (test) {
  test.expect(1);
  const start = Date.now();
  yield koroutine.sleep(100);
  const end = Date.now();
  test.ok((end - start) >= 100);
  test.done();
};

exports['Test sleep'] = function (test) {
  koroutine.create(testSleep, 1000, test).run();
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
  koroutine.create(testDefer, 0, test).run();
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
  koroutine.create(testSequentialCalls, 2000, test).run();
  koroutine.create(testSequentialCalls, 2000, test).run();
  koroutine.create(testSequentialCalls, 2000, test).run();
};

exports['Test parallel async calls in multiple simultaneous coroutines'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 3);
  koroutine.create(testParallelCalls, 8000, test).run();
  koroutine.create(testParallelCalls, 8000, test).run();
  koroutine.create(testParallelCalls, 8000, test).run();
};

exports['Test mixed calls in multiple simultaneous coroutines'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 6);
  koroutine.create(testSequentialCalls, 2000, test).run();
  koroutine.create(testParallelCalls, 1000, test).run();
  koroutine.create(testSequentialCalls, 2000, test).run();
  koroutine.create(testParallelCalls, 1000, test).run();
  koroutine.create(testParallelCalls, 1000, test).run();
  koroutine.create(testSequentialCalls, 2000, test).run();
};

function* testCoroutineCurrentCtx (test, delay, input) {
  test.expect(1);
  koroutine.state.my_var = input;
  yield koroutine.sleep(delay);
  test.equal(koroutine.state.my_var, input);
  test.done();
};

exports['Test koroutine current context'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 3);
  koroutine.create(testCoroutineCurrentCtx, 1000, test, 100, 'first').run();
  koroutine.create(testCoroutineCurrentCtx, 1000, test, 200, 'second').run();
  koroutine.create(testCoroutineCurrentCtx, 1000, test, 150, 'third').run();
};

function* testExceptionThrower (test) {
  throw new Error('Uncaught Exception!');
}

exports['Test coroutine throwing uncaught exception'] = function (test) {
  try {
    koroutine.create(testExceptionThrower, 0, test).run();
  } catch (e) {
    test.done();
  }
};

exports['Test coroutine throwing error with timeout'] = function (test) {
  try {
    koroutine.create(testExceptionThrower, 10).run();
  } catch (e) {
    test.done();
  }
};

function resetFuture (ft) {
  ft.done = false;
  ft.data = null;
  ft.error = null;
}

function* testFutureReset (test) {
  test.expect(7);

  const ft = koroutine.future();
  asyncCallSuccess('input-1', ft, 200);
  let numErrors = yield* koroutine.join(ft);
  test.equal(numErrors, 0);
  test.deepEqual(ft.data, ['input-1', 'arg-1', 'arg-2']);

  resetFuture(ft);
  asyncCallError('error-1', ft, 100);
  numErrors = yield* koroutine.join(ft);
  test.equal(numErrors, 1);
  test.equal(ft.error.message, 'error-1');
  test.equal(ft.error.cause, 'exception');

  resetFuture(ft);
  asyncCallSuccess('input-2', ft, 300);
  numErrors = yield* koroutine.join(ft);
  test.equal(numErrors, 0);
  test.deepEqual(ft.data, ['input-2', 'arg-1', 'arg-2']);

  test.done();
}

exports['Test future reset'] = function (test) {
  koroutine.create(testFutureReset, 2000, test).run();
};
