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

function* singleCallSuccess(kr, input, delay) {
    return yield asyncCallSuccess(input, kr.resume, delay);
}

function* singleCallError(kr, input, delay) {
    return yield asyncCallError(input, kr.resume, delay);
}

function* testSingleCall(test) {
	test.expect(7);

	let [r1, r2, r3] = yield* singleCallSuccess(this, "input-1", 200);
	test.equal(r1, "input-1");
	test.equal(r2, "arg-1");
	test.equal(r3, "arg-2");

	[r1, r2, r3] = yield* singleCallSuccess(this, "input-2", 100);
	test.equal(r1, "input-2");
	test.equal(r2, "arg-1");
	test.equal(r3, "arg-2");

	try {
        yield* singleCallError(this, "error-1", 150);
    } catch (e) {
		test.equal(e.message, "error-1");
    }

	test.done();
}

exports['Test single async calls'] = function(test) {
	koroutine.run(testSingleCall, 2000, test);
}

function* testParallelCalls(test) {
	test.expect(3);

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
	test.done()
}

exports['Test parallel async calls'] = function(test) {
	koroutine.run(testParallelCalls, 1000, test);
}

function* testSingleCallTimeout(test) {
	test.expect(1);
	try {
		yield* singleCallSuccess(this, "input-1", 2000);
	} catch (e) {
		test.equal(e.message, "Coroutine did not finish within 10 ms.");
	}
	test.done();
}

exports['Test single call timeout'] = function(test) {
	koroutine.run(testSingleCallTimeout, 10, test);
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
		test.equal(e.message, "Coroutine did not finish within 400 ms.");
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
		yield* singleCallSuccess(this, "input-1", 2000);
	} catch (e) {
		test.equal(e.message, "Coroutine cancelled.");
	}
	test.done();
}

exports['Test corountine cancel'] = function(test) {
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


exports['Test corountine sleep'] = function(test) {
	koroutine.run(testSleep, 1000, test);
}
