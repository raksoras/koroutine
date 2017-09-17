# Koroutine - A small, lightweight coroutine scheduler for Node.js

Justifiably or not, Node.js is much maligned for it's [callback hell](http://callbackhell.com/) problem. [Koroutine](https://github.com/raksoras/koroutine) is a small, 100% Javascript library that lets you write simple, sequential looking code that's still 100% async. 

## How koroutine works

*Koroutine* uses Javascript generators introduced in ES6 to run your code in a [coroutine](https://en.wikipedia.org/wiki/Coroutine). [Generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators)
is an exciting addition to Javascript that lets you suspend code execution at any point inside a special type of Javascript function called [generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*) and resume the execution at the same point sometime later, at will. This special "run..stop..run" capability of ES6 generators compared to the normal "run to completion" nature of normal functions is what makes them a perfect building block for async programming in Javascript. It provides a powerful alternative to the Node.js default callback passing style for writing async code. Your code just yields after making an async call and *Koroutine's* scheduler takes care of automatically resuming your code when the async operation completes. In case of a successful completion, result(s) are returned as return value(s) of `yield`. In case of an error, error returned is thrown as an exception that you can catch and deal with. Best of all, Koroutine provides functions like *resume* and *future* that follow normal Node.js callback convention of `function(error, data)` out of the box so you can use any existing Node.js module based on callbacks transparently with *koroutine* without having to write any glue code like function "thunks" or promises.

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

*Koroutine* library provides a function `create()` that takes in user supplied [generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*) and returns a coroutine that can then be run by using its `run()` method.

```Javascript
const koroutine = require('koroutine');

function* exampleCoroutine (input) {
    try {
        const result = yield dummyAsyncSuccessCall (input, koroutine.resume);
        console.log(result);
        yield dummyAsyncErrorCall (result, koroutine.resume);
    } catch (e) {
        console.log(e);
    }
}

const kr = koroutine.create(exampleCoroutine, 0, "my-input");
kr.run();
```

The first argument to `koroutine.create()` - exampleCoroutine - is your code to be run wrapped in a generator function.

Second argument specifies run time limit in milliseconds. If your code runs beyond that limit it is terminated and an exception is thrown 
inside the generator function with `e.cause` set to "timedout". This feature is useful in cases where you want to impose maximum upper limit on how long your code can take to finish. For example, to limit processing time of any HTTP request received to 500 milliseconds at max. You can pass in timeout as zero to specify no upper limit (infinite timeout).

Any arguments after the second timeout argument are interpreted as arguments to your generator function and are passed to the function as is. 

Inside a running coroutine you can pass `koroutine.resume` as a callback to any function that expects Node.js style callback. When the receiving function invokes the callback  to signal async operation's completion, koroutine automatically resumes your code at the point of last `yield`.

In the example above `exampleCoroutine()` first stops executing at `yield dummyAsyncSuccessCall()`. It is resumed when the async call returns with the value. Next the function is again suspended at `yield dummyAsyncErrorCall()` which eventually returns an error that gets thrown as exception `e` inside the function body. Notice, there are no nested callbacks needed to feed result of `dummyAsyncSuccessCall()` to the `dummyAsyncErrorCall()`. Code looks pretty much sequential.

## Making multiple async calls in parallel

In the example above we made two async calls one after the other, sequentially. Although the code itself is non-blocking, the coroutine is suspended and the second call to dummyAsyncErrorCall() is not made till the first dummyAsyncSuccessCall() returns. Sometimes you want this behavior - for example, when you want to pass in result of the first call to second call as an argument. But sometimes you have bunch of async calls that are not dependent on each other and you can speed things up by making them in parallel. for example, calling multiple back-end REST services in parallel. koroutine can facilitate this with `future`s

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

const kr = koroutine.create(exampleKoroutine, 0, "my-input1", "my-input2");
kr.run();
```

To fire multiple async calls in parallel, you create one future per async call by calling `koroutine.future()` and pass these futures as callbacks to the async calls instead of `koroutine.resume` **without** yielding after each call. You can then wait - in a non-blocking manner - for all the calls to complete by calling `yield* koroutine.join()` on all futures. Upon `koroutine.join()` return, each future either has its future.data set to the result of the call (in case of success) or its future.error set to the error returned by the call. `koroutine.join()` returns total number of errors encountered.

`koroutine.future()` can optionally take timeout parameter. If provided, it specifies number of milliseconds after which the future will time out and the call will return with `future.error.cause` set to "timedout".

Finally, you can interrupt a running coroutine (only if it is waiting for an async call to finish) by calling `interrupt()` method on the coroutine object returned by `koroutine.create()` call

## Other useful koroutine library methods

**koroutine.sleep(ms)** : Non-blocking sleep for ms number of milliseconds.

**koroutine.defer()** : Gives up CPU voluntarily. The coroutine will be resumed automatically on the next event loop turn. Similar to Node.js setImmediate().

## Thread local storage

koroutine also supports thread local variables similar to Java's `ThreadLocal` class. To use it, you store your variables specific to your running coroutine instance inside the object `koroutine.state` like this,

```Javascript
const koroutine = require('koroutine');

function* testCoroutineThreadLocalStorage (input) {
  koroutine.state.my_var = input;
  yield koroutine.sleep(100);
  console.log(koroutine.state.my_var, input);
};

koroutine.create(testCoroutineThreadLocalStorage, 1000, 'first').run();
koroutine.create(testCoroutineThreadLocalStorage, 1000, 'second').run();
```

Variables stored in `koroutine.state` are local to each running coroutine instance and are not shared between two coroutines even if they share the same variable name. koroutine library will switch to the appropriate `koroutine.state` automatically when it switches between coroutines. All the typical hard to track race conditions with the usage of thread local variables apply so use it with caution and sparingly! 

## In summary

*koroutine* allows you to harness all the power and performance of Node.js async programming model with the ease and simplicity of sequential looking code.

Any [comments, suggestions  and bug reports](https://github.com/raksoras/koroutine/issues) are greatly welcome.


