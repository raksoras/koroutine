"use strict";

const debug = require('debug')('koroutine');

/* Used to store current coroutine's context. Allows developer to stuff variables
* specific to current executing coroutine like this:
*   koroutine.current.context.myVar = 'foo'
* Akin to therad local variable
*/
const current = {};

/**
 * Wait till all the passed in futures are complete - i.e. done executing
 * @param {Array of futur objects} Futures to wait on
 * @return {Number} number of futures who returned error
 */
function* join(...futures) {
    let errorCount = 0;
    for (const future of futures) {
        while (future.done != true) {
            yield;
        }
        if (future.error) {
            errorCount += 1;
        }
    }
    return errorCount;
}

/**
 * Run passed in generator in a new coroutine
 * @generator {Function} generator funtion to be run in the new coroutine
 * @timeout {Number} Number of milliseconds after which this coroutine 
 *          will be automatically stopped by the scheduler. pass "0" for
 *      infinite (no) timeout
 * @rest {Array} arguments to be passed to the generator function
 * @return coroutine started
 */

function run(generator, timeout, ...rest) {
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
    const resume = function(error, data, ...rest) {
        if (iterator == null) {
            return;
        }

        const it = iterator;
        iterator = null;

        if (error != null) {
            error.cause = error.cause || "exception";
            if (timer != null) {
                clearTimeout(timer);
                timer = null;
            }
            return it.throw(error);
        }

        if (rest && rest.length > 0) {
            rest.unshift(data);
            data = rest;
        }

        try {
            current.context = ctx;
            const state = it.next(data);
            if (state.done) {
                if (timer != null) {
                    clearTimeout(timer);
                    timer = null;
                }
                return state.value;
            } else {
                iterator = it;
            }
        }
        catch(e) {
            if (timer != null) {
                clearTimeout(timer);
                timer = null;
            }
            debug("Coroutine threw error: %s", e);
        }
        finally {
            current.context = null;
        }
    }

    /**
     * Cancels the running coroutine at next chance available. Throws exception 
     * inside the running with the message "Coroutine cancelled"
     */
    const cancel = function() {
        const e = new Error("Coroutine canceled.");
        e.cause = "canceled"; 
        resume(e);
    }

    /**
     * Returns a Future object that can be passed in place of normal node callback. Future
     * objects work with koroutine.join() to facilitate firing multiple async operations
     * from a single coroutine without blocking or yielding and then waiting for all of them
     * to finish at a single "join" point in the code
     * @return {Function} future callback
     */
    const newFuture = function() {
        const future = function(error, data, ...rest) {
            future.done = true;
            if (error) {
                error.cause = "exception";
                future.error = error;
            }
            if (rest && rest.length > 0) {
                rest.unshift(data);
                data = rest;
            }
            future.data = data;
            resume(null, future);
        };
        return future;
    }

    /** 
     * sleep for given number of milliseconds. Doesn't block the node's event loop
     * @ms {Number} Number of milliseconds to sleep
     */
    const sleep = function(ms) {
        setTimeout(resume, ms);
    }

    /**
     * Akin to thread.yield()
     */
    const defer = function() {
        setImmediate(resume);
    }
    
    let coroutine = {
        resume: resume,
        cancel: cancel,
        sleep: sleep,
        defer: defer,
        future: newFuture
    }

    timeout = timeout||0;
    if (timeout > 0) {
        timer = setTimeout(function() {
            timer = null;
            const e = new Error("Coroutine did not finish within "+timeout+" ms.")
            e.cause = "timedout"; 
            resume(e);
        }, timeout);
    }

    iterator = generator.apply(coroutine, rest);
    resume();
    return coroutine;
}

exports.run = run;
exports.join = join;
exports.current = current;
