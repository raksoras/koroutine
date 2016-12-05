# koroutine

[![Build Status](https://travis-ci.org/raksoras/koroutine.svg?branch=master)](https://travis-ci.org/raksoras/koroutine)
[![Coverage Status](https://coveralls.io/repos/github/raksoras/koroutine/badge.svg?branch=master)](https://coveralls.io/github/raksoras/koroutine?branch=master)

Small, lightweight non-blocking coroutine scheduler for node.js based on ES6 generators

##Table of Contents

- [Install](#install)
- [Introduction](#introduction)
- [Sequential Async Calls Example](#sequential-async-calls-example)
- [Parallel Async Calls Example](#parallel-async-calls-example)
- [Koroutine Library Object Methods](#koroutine-library-object-methods)
- [Coroutine Context Methods](#coroutine-context-methods)

## Install

```sh
$ npm install koroutine
```

## Introduction

This is a 100% javascript implementation of a coroutine scheduler that uses ES6 generators. It can be used 
to replace async callback spaghetti code with simpler, sequential looking code that is still 100% async.

## koroutine.run(generatorFn, timeout, ...rest)
Runs supplied generator function as a coroutine. 

  * __this__ is bound to the running coroutine's context object (see "Coroutine Context Methods" below) inside the generator function.  
  * __timeout__ is maximum number of milliseconds coroutine is allowed to run. If it runs for more than that exception is thrown inside generator function with e.cause="timedout".   
  * __...rest__  are rest of the arguments that are passed in to generator function as its function arguments.  

### Sequential async calls example

Inside generator function `this` is bound to the running coroutine's context. You can pass `this.resume` as a 
callback to any async function you may want to call from inside the generator function. `resume` follows Node's callback 
convention - i.e. first parameter is error followed by results or data parameters. If the async function returns an error, it 
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
Waits till all the async operations represented by the futures passed are complete, in a non-blocking manner. On completion each future either has its `future.data` set to the result of the call (in case of success) or its `future.error` set to the error returned by the call.

### Parallel async calls example

You fire multiple async calls in parallel using Koroutine and then wait for all of them to complete. To do this, get 
`future` function objects by calling `this.future()` for each of the async calls and pass them as callbacks to the async calls 
in place of `this.resume`. You can then wait for all of them to complete by calling `yield* koroutine.join(future1, future2, 
...)`.

```js
const ko = require('koroutine');

//dummyAsyncSuccessCall() and dummyAsyncErrorCall() as defined in the example above

function* exampleKoroutine(input1, input2) {
    const future1 = this.future();
    dummyAsyncSuccessCall(input1, future1, 1000);
    
    const future2 = this.future();
    dummyAsyncErrorCall(input2, future2, 1000);
    
    const numErrors = yield* ko.join(future1, future2);
    console.log(numErrors);
    console.log(future1.data);
    console.log(future2.error);
}
```


## koroutine.current.context
Current running coroutine's variable storage. Similar to thread local variable in Java or pthread. All the typical issues with usage of thread local variables apply so use it with caution!

koroutine library will swap the appropriate `current.context` automatically when it swicthes between coroutines. A coroutine can store its local copy of any variable in the context like this
```js
const ko = require('koroutine');

function* coroutineFn() {
    ko.current.context.my_var = "my_local_value";
    ...
}
```
variables stored in `koroutine.current.context` are local to the running coroutine and are not shared between two coroutines even if they share the same name.

## Coroutine Context Methods

### this.resume
Callback you can pass to any async calls you want to make from inside the generator function. `this` is bound to current coroutine inside the generator function. Resume follows Node js callback convention where first parameter is an error followed by one or more result parameters.

### this.future()
Returns a future function object which can be passed as a callback to any async call you wish to make. Futures can be used as callbacks in place of `this.resume` when you want to make multiple async calls in paralell and then wait for all of them to finish at a single join point inside your code. See [Parallel Async Calls Example](#parallel-async-calls-example) above.

### this.sleep(ms)
Non-blocking sleep for `ms` number of milliseconds.

### this.defer()
Gives up CPU voluntarily. The coroutine will be resumed on the next event loop turn. Similar to `setImmediate()` or Thread.yield() in pthread library.

### this.cancel()
Cancel the coroutine from outside the running coroutine. Causes an exception to be thrown inside the canceled coroutine with e.cause="canceled"

