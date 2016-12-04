const koroutine = require('..');

function asyncCallSuccess(input, callback, delay) {
    setTimeout(function() {
        callback(null, input, "arg-1", "arg-2");
    }, delay);
}

function asyncCallError(input, callback, delay) {
    setTimeout(function() {
        callback(new Error(input));
    }, delay);
}

function* sequentialCallSuccess(kr, input, delay) {
    return yield asyncCallSuccess(input, kr.resume, delay);
}

function* sequentialCallError(kr, input, delay) {
    return yield asyncCallError(input, kr.resume, delay);
}

function* testSequentialCalls(test) {
    test.expect(4);

    let result = yield* sequentialCallSuccess(this, "input-1", 200);
    test.deepEqual(result, ['input-1', 'arg-1', 'arg-2']);

    result = yield* sequentialCallSuccess(this, "input-2", 100);
    test.deepEqual(result, ['input-2', 'arg-1', 'arg-2']);

    try {
            yield* sequentialCallError(this, "error-1", 150);
    } catch (e) {
        test.equal(e.message, "error-1");
        test.equal(e.cause, "exception");
    }

    test.done();
}

exports['Test sequential async calls'] = function(test) {
    koroutine.run(testSequentialCalls, 2000, test);
}

function* testParallelCalls(test) {
    test.expect(4);

    const f1 = this.future();
    asyncCallSuccess("input-1", f1, 200);

    const f2 = this.future();
    asyncCallSuccess("input-2", f2, 300);

    const f3 = this.future();
    asyncCallError("error-1", f3, 100);

    const numErrors = yield* koroutine.join(f1, f2, f3);
    
    test.deepEqual(f1.data, ['input-1', 'arg-1', 'arg-2']);
    test.deepEqual(f2.data, ['input-2', 'arg-1', 'arg-2']);
    test.equal(f3.error.message, 'error-1');
    test.equal(f3.error.cause, "exception");
    test.done()
}

exports['Test parallel async calls'] = function(test) {
    koroutine.run(testParallelCalls, 1000, test);
}

function* testSequentialCallTimeout(test) {
    test.expect(1);
    try {
        yield* sequentialCallSuccess(this, "input-1", 2000);
    } catch (e) {
        test.equal(e.cause, "timedout");
    }
    test.done();
}

exports['Test sequential call timeout'] = function(test) {
    koroutine.run(testSequentialCallTimeout, 10, test);
}

function* testParallelCallsTimeout(test) {
    test.expect(2);

    const f1 = this.future();
    asyncCallSuccess("input-1", f1, 200);

    const f2 = this.future();
    asyncCallSuccess("input-2", f2, 600);

    try {
        yield* koroutine.join(f1, f2);
    } catch (e) {
        test.equal(e.cause, "timedout");
        test.deepEqual(f1.data, ['input-1', 'arg-1', 'arg-2']);
    }

    test.done();
}

exports['Test parallel calls timeout'] = function(test) {
    koroutine.run(testParallelCallsTimeout, 400, test);
}

function* testCancelCoroutine(test) {
    test.expect(1);
    try {
        yield* sequentialCallSuccess(this, "input-1", 2000);
    } catch (e) {
        test.equal(e.cause, "canceled");
    }
    test.done();
}

exports['Test cancel'] = function(test) {
    const kr = koroutine.run(testCancelCoroutine, 0, test);
    kr.cancel();
}

function* testSleep(test) {
    test.expect(1);
    const start = Date.now()
    yield this.sleep(100);
    const end = Date.now()
    test.ok((end-start) >= 100);
    test.done();
}


exports['Test sleep'] = function(test) {
    koroutine.run(testSleep, 1000, test);
}

function* testDefer(test) {
    test.expect(1);
    yield this.defer();
    test.equal(1,1);
    test.done();
}

exports['Test defer (yield)'] = function(test) {
    koroutine.run(testDefer, 100, test);
}

function testDoneLatch(test, limit) {
    let count = 0;
    const origDone = test.done;
    return function() {
        count += 1;
        if (count >= limit) {
            origDone();
        }
    }
}

function testExpectAccumulator(test) {
    let accCount = 0;
    const origExpect = test.expect;
    return function(count) {
        accCount += count;
        origExpect(accCount);
    }
}

exports['Test sequential async calls in multiple simultaneous coroutines'] = function(test) {
    test.expect = testExpectAccumulator(test);
    test.done = testDoneLatch(test, 3);
    koroutine.run(testSequentialCalls, 2000, test);
    koroutine.run(testSequentialCalls, 2000, test);
    koroutine.run(testSequentialCalls, 2000, test);
}

exports['Test parallel async calls in multiple simultaneous coroutines'] = function(test) {
    test.expect = testExpectAccumulator(test);
    test.done = testDoneLatch(test, 3);
    koroutine.run(testParallelCalls, 1000, test);
    koroutine.run(testParallelCalls, 1000, test);
    koroutine.run(testParallelCalls, 1000, test);
}

exports['Test mixed calls in multiple simultaneous coroutines'] = function(test) {
    test.expect = testExpectAccumulator(test);
    test.done = testDoneLatch(test, 6);
    koroutine.run(testSequentialCalls, 2000, test);
    koroutine.run(testParallelCalls, 1000, test);
    koroutine.run(testSequentialCalls, 2000, test);
    koroutine.run(testParallelCalls, 1000, test);
    koroutine.run(testParallelCalls, 1000, test);
    koroutine.run(testSequentialCalls, 2000, test);
}

