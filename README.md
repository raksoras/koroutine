# koroutine

[![Build Status](https://travis-ci.org/raksoras/koroutine.svg?branch=master)](https://travis-ci.org/raksoras/koroutine)
[![Coverage Status](https://coveralls.io/repos/github/raksoras/koroutine/badge.svg?branch=master)](https://coveralls.io/github/raksoras/koroutine?branch=master)

Small, lightweight, non-blocking coroutine scheduler for node.js using ES6 generators

##Table of Contents

- [Install](#install)
- [Introduction](#introduction)
- [Koroutine Library Object Methods](#koroutine-library-object-methods)
  * [koroutine.run(generatorFn, timeout, ...rest)](#koroutinerungeneratorfn-timeout-rest)
  * [koroutine.join(...futures)](#koroutinejoinfutures)
  * [koroutine.current.context](#koroutinecurrentcontext)
- [Coroutine Context Methods](#coroutine-context-methods)
  * [this.resume](#thisresume)
  * [this.future()](#thisfuture)
  * [this.sleep(ms)](#thissleepms)
  * [this.defer()](#thisdefer)
  * [this.cancel()](#thiscancel)

## Install

```sh
$ npm install koroutine
```

## Introduction

100% javascript implementation of a coroutine scheduler that uses ES6 generators. It can be used 
to replace async callback spaghetti code with simpler, sequential looking code that is still 100% async.

## Koroutine Library Object Methods

###koroutine.run(generatorFn, timeout, ...rest)

Runs supplied generator function as a coroutine. 

  * __this__ is bound to the running coroutine's context object (see [coroutine context methods](#coroutine-context-methods) below) inside the generator function.  
  * __timeout__ is maximum number of milliseconds the coroutine is allowed to run. If it runs beyond that limit, an exception is thrown inside the generator function with e.cause="timedout". timeout=0 means no (infinite) timeout.  
  * __...rest__  are rest of the arguments that are passed to generator function as its function arguments.  

#### Sequential async calls example
Inside generator function `this` is bound to the running coroutine's context. You can pass `this.resume` as a 
callback to any async function you may want to call from inside the generator function. `resume` follows Node's callback 
convention, i.e. first parameter is error followed by results or data parameters. Koroutine automatically resumes your 
function when the callback is called by the async function. If the async function returns an error, it 
is thrown as an exception inside the generator function body as shown below.
```js
const koroutine = require('koroutine');

function dummyAsyncSuccessCall(input, callback, delay) {
    setTimeout(function() {
        const result = input+"-ok";
        callback(null, result);
    }, delay);
}

function dummyAsyncErrorCall(input, callback, delay) {
    setTimeout(function() {
        callback(new Error(input+"-error"));
    }, delay);
}

function* exampleKoroutine(input1, input2) {
    try {
        const result1 = yield dummyAsyncSuccessCall(input1, this.resume, 1000);
        console.log(result1)
        yield dummyAsyncErrorCall(input2, this.resume, 2000);
    } catch (e) {
        console.log(e);
    }
}

koroutine.run(exampleKoroutine, 0, "myinput1", "myinput2");
```

### koroutine.join(...futures)
Non-blocking wait till all the async operations represented by the supplied futures are complete. `future`s are obtained by calling `this.future()` from inside the generator function. On completion each future either has its `future.data` set to the result of the call (in case of success) or its `future.error` set to the error returned by the call. `koroutine.join()` returns total number of errors encountred.

#### Parallel async calls example
You can fire multiple async calls in parallel and then wait for all of them to complete at a single point in your code as shown below:

```js
const koroutine = require('koroutine');

//dummyAsyncSuccessCall() and dummyAsyncErrorCall() as defined in the example above

function* exampleKoroutine(input1, input2) {
    const future1 = this.future();
    dummyAsyncSuccessCall(input1, future1, 1000);
    
    const future2 = this.future();
    dummyAsyncErrorCall(input2, future2, 1000);
    
    const numErrors = yield* koroutine.join(future1, future2);
    console.log(numErrors);
    console.log(future1.data);
    console.log(future2.error);
}

koroutine.run(exampleKoroutine, 0, "myinput1", "myinput2");
```

### koroutine.current.context
Current running coroutine's local variable storage. Similar to thread local variable in Java or pthread. All the typical hard to track and debug issues with the usage of thread local variables apply so use it with caution and sparringly!
koroutine library will switch to the appropriate `current.context` automatically when it swicthes between coroutines. A coroutine can store its local copy of any variable in the context like this:

```js
const koroutine = require('koroutine');

function* coroutineFn() {
    koroutine.current.context.my_var = "my_local_value";
    ...
}
```
variables stored in `koroutine.current.context` are local to the running coroutine and are not shared between two coroutines even if they share the same name.

## Coroutine Context Methods
`this` is bound to current coroutine context inside the generator function.

### this.resume
Callback you can pass to any async calls you want to make from inside the generator function. `resume` follows Node js 
callback convention where first parameter is an error followed by one or more result parameters. Resumes paused coroutine when 
invoked by the async function as a callback.

### this.future()
Returns a `future` function object that can be used as a callback in place of `this.resume` when you want to make multiple 
async calls in paralell. See [Parallel Async Calls Example](#parallel-async-calls-example) above.

### this.sleep(ms)
Non-blocking sleep for `ms` number of milliseconds.

### this.defer()
Gives up CPU voluntarily. The coroutine will be resumed automatically on the next event loop turn. Similar to `setImmediate()` 
or Thread.yield() in pthread library.

### this.cancel()
Allows cancelling the coroutine from outside the running coroutine. Causes an exception to be thrown inside the canceled coroutine with e.cause="canceled"

