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

function* sequentialCallSuccess (kr, input, delay) {
  return yield asyncCallSuccess(input, kr.resume, delay);
}

function* sequentialCallError (kr, input, delay) {
  return yield asyncCallError(input, kr.resume, delay);
}

function* testSequentialCalls (test) {
  test.expect(4);

  let result = yield* sequentialCallSuccess(this, 'input-1', 200);
  test.deepEqual(result, ['input-1', 'arg-1', 'arg-2']);

  result = yield* sequentialCallSuccess(this, 'input-2', 100);
  test.deepEqual(result, ['input-2', 'arg-1', 'arg-2']);

  try {
    yield* sequentialCallError(this, 'error-1', 150);
  } catch (e) {
    test.equal(e.message, 'error-1');
    test.equal(e.cause, 'exception');
  }
  test.done();
}

exports['Test sequential async calls'] = function (test) {
  koroutine.run(testSequentialCalls, 2000, test);
};

function* testParallelCalls (test) {
  test.expect(5);

  const f1 = this.future();
  asyncCallSuccess('input-1', f1, 200);

  const f2 = this.future();
  asyncCallSuccess('input-2', f2, 300);

  const f3 = this.future();
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
  koroutine.run(testParallelCalls, 1000, test);
};

exports['Test future timeout'] = function (test) {
  koroutine.run(function* (test) {
    test.expect(4);

    const f1 = this.future(100);
    asyncCallSuccess('input-1', f1, 8000);

    const f2 = this.future(2000);
    asyncCallSuccess('input-2', f2, 300);

    const f3 = this.future(200);
    asyncCallError('error-1', f3, 8000);

    const numErrors = yield* koroutine.join(f1, f2, f3);
    test.equal(numErrors, 2);
    test.equal(f1.error.cause, 'timedout');
    test.deepEqual(f2.data, ['input-2', 'arg-1', 'arg-2']);
    test.equal(f3.error.cause, 'timedout');
    test.done();
  }, 1000, test);
};

exports['Test koroutine timeout with future'] = function (test) {
  koroutine.run(function* (test) {
    test.expect(1);
    try {
      const ft = this.future(100);
      asyncCallSuccess('input-2', ft, 300);
      yield* koroutine.join(ft);
      test.ok(false);
    } catch (e) {
      test.equal(e.cause, 'timedout');
      test.done();
    }
  }, 10, test);
};

function* testSequentialCallTimeout (test) {
  test.expect(1);
  try {
    yield* sequentialCallSuccess(this, 'input-1', 2000);
  } catch (e) {
    test.equal(e.cause, 'timedout');
  }
  test.done();
}

exports['Test sequential call timeout'] = function (test) {
  koroutine.run(testSequentialCallTimeout, 10, test);
};

function* testParallelCallsTimeout (test) {
  test.expect(2);

  const f1 = this.future();
  asyncCallSuccess('input-1', f1, 200);

  const f2 = this.future();
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
  koroutine.run(testParallelCallsTimeout, 400, test);
};

function* testInterruptCoroutine (test) {
  test.expect(1);
  try {
    yield* sequentialCallSuccess(this, 'input-1', 2000);
  } catch (e) {
    test.equal(e.cause, 'interrupted');
    test.done();
  }
}

exports['Test interrupt'] = function (test) {
  const kr = koroutine.run(testInterruptCoroutine, 0, test);
  kr.interrupt();
};

function* testContinueAfterInterrupt (test) {
  test.expect(2);
  try {
    yield* sequentialCallSuccess(this, 'input-1', 1000);
    test.ok(false);
  } catch (e) {
    test.equal(e.cause, 'interrupted');
  }

  let result = yield* sequentialCallSuccess(this, 'input-2', 100);
  test.deepEqual(result, ['input-2', 'arg-1', 'arg-2']);
  test.done();
}

exports['Test continue after interrupt'] = function (test) {
  const kr = koroutine.run(testContinueAfterInterrupt, 0, test);
  kr.interrupt();
};

exports['Test continue after error'] = function (test) {
  koroutine.run(function* (test) {
    test.expect(3);
    try {
      yield* sequentialCallError(this, 'error-1', 150);
      test.ok(false);
    } catch (e) {
      test.equal(e.message, 'error-1');
      test.equal(e.cause, 'exception');
    }

    let result = yield* sequentialCallSuccess(this, 'input-2', 100);
    test.deepEqual(result, ['input-2', 'arg-1', 'arg-2']);
    test.done();
  }, 0, test);
};

function* testSleep (test) {
  test.expect(1);
  const start = Date.now();
  yield this.sleep(100);
  const end = Date.now();
  test.ok((end - start) >= 100);
  test.done();
};

exports['Test sleep'] = function (test) {
  koroutine.run(testSleep, 1000, test);
};

function* testDefer (test) {
  test.expect(3);
  let count = 0;

  yield this.defer();
  test.equal(count, 0);

  setImmediate(function () {
    count++;
  });
  setImmediate(function () {
    count++;
  });
  test.equal(count, 0);

  yield this.defer();
  test.equal(count, 2);

  test.done();
}

exports['Test defer'] = function (test) {
  koroutine.run(testDefer, 0, test);
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
  koroutine.run(testSequentialCalls, 2000, test);
  koroutine.run(testSequentialCalls, 2000, test);
  koroutine.run(testSequentialCalls, 2000, test);
};

exports['Test parallel async calls in multiple simultaneous coroutines'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 3);
  koroutine.run(testParallelCalls, 8000, test);
  koroutine.run(testParallelCalls, 8000, test);
  koroutine.run(testParallelCalls, 8000, test);
};

exports['Test mixed calls in multiple simultaneous coroutines'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 6);
  koroutine.run(testSequentialCalls, 2000, test);
  koroutine.run(testParallelCalls, 1000, test);
  koroutine.run(testSequentialCalls, 2000, test);
  koroutine.run(testParallelCalls, 1000, test);
  koroutine.run(testParallelCalls, 1000, test);
  koroutine.run(testSequentialCalls, 2000, test);
};

function* testCoroutineCurrentCtx (test, input) {
  test.expect(1);
  koroutine.current.context.my_var = input;
  yield this.sleep(200);
  test.equal(koroutine.current.context.my_var, input);
  test.done();
};

exports['Test koroutine current context'] = function (test) {
  test.expect = testExpectAccumulator(test);
  test.done = testDoneLatch(test, 3);
  koroutine.run(testCoroutineCurrentCtx, 1000, test, 'first');
  koroutine.run(testCoroutineCurrentCtx, 1000, test, 'second');
  koroutine.run(testCoroutineCurrentCtx, 1000, test, 'third');
};

function * testExceptionThrower (test) {
  throw new Error('Uncaught Exception!');
}

exports['Test coroutine throwing uncaught exception'] = function (test) {
  try {
    koroutine.run(testExceptionThrower, 0, test);
  } catch (e) {
    test.done();
  }
};

exports['Test coroutine throwing error with timeout'] = function (test) {
  try {
    koroutine.run(testExceptionThrower, 10);
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

  const ft = this.future();
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
  koroutine.run(testFutureReset, 2000, test);
};
