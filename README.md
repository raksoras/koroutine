# Koroutine 
[![Build Status](https://travis-ci.org/raksoras/koroutine.svg?branch=master)](https://travis-ci.org/raksoras/koroutine)
[![Coverage Status](https://coveralls.io/repos/github/raksoras/koroutine/badge.svg?branch=master)](https://coveralls.io/github/raksoras/koroutine?branch=master)

## A small, lightweight coroutine scheduler for Node.js

Justifiably or not, Node.js is much maligned for it's [callback hell](http://callbackhell.com/) problem. [Koroutine](https://github.com/raksoras/koroutine) is a small, 100% Javascript library that helps you write simple, sequential looking code that's still 100% async. 

## How koroutine works

*Koroutine* uses Javascript generators introduced in ES6 to run your code in a [coroutine](https://en.wikipedia.org/wiki/Coroutine). [Generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators)
is an exciting addition to Javascript that lets you suspend code execution at any point inside a special type of Javascript function called [generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*) and resume the execution at the same point sometime later, at will. This special "run..stop..run" capability of ES6 generators compared to the normal "run to completion" nature of normal functions is what makes them a perfect building block for async programming in Javascript. It provides a powerful alternative to the Node.js default callback passing style for writing async code. Your code just yields after making an async call and *Koroutine's* scheduler takes care of automatically resuming your code when the async operation completes. In case of a successful completion, result(s) are returned as return value(s) of `yield`. In case of an error, error returned is thrown as an exception that you can catch and deal with. Best of all, Koroutine provides functions like *callback* and *future* that follow normal Node.js callback convention of `function(error, data)` out of the box so you can use any existing Node.js module based on callbacks transparently with *koroutine* without having to write any glue code like function "thunks" or promises.

[Here](https://davidwalsh.name/es6-generators) is a good introduction to Javascript generators if you wish to familiarize yourself with the basics of Javascript generators.

## Installation  

```sh
npm install koroutine
```

## Show me the code

We will use following two functions to simulate asynchronous calls that either return a result or an error after some delay. Note that these functions take typical Node.js style callback `function(error, data, ...)` as their last arguments and know nothing about the *koroutine* library to demonstrate how *koroutine* can integrate transparently with thousands of existing callback based Node.js modules.

```Javascript
function dummyAsyncSuccessCall(input, callback) {
    setTimeout(function() {
        const result = input+"-ok";
        callback(null, result);
    }, 1000);
}

function dummyAsyncErrorCall(input, callback) {
    setTimeout(function() {
        callback(new Error(input+"-error"));
    }, 1000);
}
```

## The basics - running your async code using *koroutine*

*Koroutine* library provides a function `run()` that takes in user supplied [generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*) and executes it in a coroutine.

```Javascript
const koroutine = require('koroutine');

function* exampleCoroutine (input) {
    try {
        const result = yield dummyAsyncSuccessCall (input, koroutine.callback());
        console.log(result);
        yield dummyAsyncErrorCall (result, koroutine.callback());
    } catch (e) {
        console.log(e);
    }
}

koroutine.run(exampleCoroutine("my-input"));
```

You can call `koroutine.callback()` anywhere inside a running coroutine - at any level of nested function calls - to get a callback function that follows Node.js style callback convention. This function can then be passed anywhere Node.js expects a callback. When the receiving async function invokes the callback, Koroutine automatically resumes your code at the point of the last `yield`.

In the example above `exampleCoroutine()` first stops executing at `yield dummyAsyncSuccessCall()`. It is resumed when the async call returns with the value. Next the function is again suspended at `yield dummyAsyncErrorCall()` which eventually returns an error that gets thrown as exception `e` inside the function body. Notice, there are no nested callbacks needed to feed result of `dummyAsyncSuccessCall()` to the `dummyAsyncErrorCall()`. Code looks pretty much sequential.

`koroutine.run()` optionally take `options` object as a second parameter which can be used to configure coroutine. Following options are available

**options.timeout** : Maximum amount of time in milliseconds this coroutine will be allowed to run. If your code runs beyond this limit, it is terminated and an exception is thrown inside the generator function with e.cause set to "TimedOut". This feature is useful in cases where you want to impose maximum upper limit on how long your code can take to finish. For example, to limit processing time of a HTTP request to 500 milliseconds.

**options.breadcrumbs**: Because of the way generators work, exceptions thrown inside generator functions do not have full stack trace. Instead the stack trace starts at the point of last `yield`. This makes debugging harder. You can set `options.breadcrumbs` to true to tell koroutine to "stitch" together stack traces across multiple yield/resume points. Since capturing stack traces across multiple yields incurs performance cost, this option is turned off by default

**options.name**: Name of the koroutine. Used in generating breadcrumbs stack trace. Also any uncaught exception has its field `koroutine` set to this name.

**errorHandler**: Function that takes error object as its only parameter. Any uncaught errors thrown from the generator function are passed to the `errorHandler` function if one is set.


`koroutin.callback()` takes two optional parameters

**timeout** Timeout for the callback after which exception with cause == 'TimedOut' is thrown.

**name** If the async function times out, `error.callback` is set to the name provided. Aids in debugging.

## Making multiple async calls in parallel

In the example above we made two async calls one after the other, sequentially. Although the code itself is non-blocking, the coroutine is suspended and the second call to dummyAsyncErrorCall() is not made till the first dummyAsyncSuccessCall() returns. Sometimes you want this behavior - for example, when you want to pass the result returned by the first call to the second call as an argument. But sometimes you have bunch of async calls that are not dependent on each other and you can speed things up by making them in parallel. for example, calling multiple back-end REST services in parallel. koroutine can facilitate this with `future`s

```Javascript
const koroutine = require('koroutine');

function* exampleKoroutine(input1, input2) {
    const future1 = koroutine.future();
    dummyAsyncSuccessCall(input1, future1);

    const future2 = koroutine.future(1000);
    dummyAsyncErrorCall(input2, future2);

    const numErrors = yield* koroutine.join(future1, future2);
    console.log(numErrors);
    console.log(future1.data);
    console.log(future2.error);
}

const kr = koroutine.run(exampleKoroutine("my-input1", "my-input2"));
```

To fire multiple async calls in parallel, you create one future per async call by calling `koroutine.future()` and pass these futures as callbacks to the async calls instead of `koroutine.callback()` **without** yielding after each call. You can then wait - without blocking the event loop - for all the calls to complete by calling `yield* koroutine.join()` on all futures. When `koroutine.join()` returns, each future either has its future.data set to the result returned by the call (in case of success) or its future.error set to the error. `koroutine.join()` returns total number of errors encountered.

`koroutine.future()` can optionally take timeout parameter. If provided, it specifies number of milliseconds after which the future will time out and the call will return with `future.error.cause` set to "TimedOut".

## Other useful koroutine library methods

**koroutine.sleep(ms)** : Non-blocking sleep for ms number of milliseconds.

**koroutine.defer()** : Gives up CPU voluntarily. The coroutine will be resumed automatically on the next event loop turn. Similar to Node.js setImmediate().

**koroutine.enableBreadcrumbs()** : Enable breadcrumb stack traces (described above) globally, for all coroutines. Since it has run time performance cost this option should be used cautiously. Alternatively, you can enable it for a particular, selected koroutine by passing an `options` object as a second parameter to `koroutine.run()` with `options.enableBreadcrumbs` set to true.

**koroutine.setErrorHandler()** : Set global error handler for all coroutines to use in case of an uncaught exception. Alternatively you may set error handler for a particular, selected koroutine by passing an `options` object as a second parameter to `koroutine.run()` with `options.errorHandler` set to your error handler function.

## Thread local storage

koroutine also supports thread local variables similar to Java's `ThreadLocal` class. To use it, you store your variables specific to your running coroutine instance inside the object `koroutine.state` like this,

```Javascript
const koroutine = require('koroutine');

function* testCoroutineThreadLocalStorage (input) {
  koroutine.state.my_var = input;
  yield koroutine.sleep(100);
  console.log(koroutine.state.my_var, input);
};

koroutine.run(testCoroutineThreadLocalStorage('first'));
koroutine.run(testCoroutineThreadLocalStorage('second'));
```

Variables stored in `koroutine.state` are local to each running coroutine instance and are not shared between two coroutines even if they share the same variable name. koroutine library will switch to the appropriate `koroutine.state` automatically when it switches between coroutines. All the typical hard to track race conditions with the usage of thread local variables apply so use it with caution and sparingly! 

## In summary

*koroutine* allows you to harness all the power and performance of Node.js async programming model with the ease and simplicity of sequential looking code.

Any [comments, suggestions  and bug reports](https://github.com/raksoras/koroutine/issues) are greatly welcome.


