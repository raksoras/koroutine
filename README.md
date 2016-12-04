# koroutine
Small, lightweight coroutine scheduler for node.js based on ES6 generators

##Table of Contents

- [Install](#install)
- [Introduction](#introduction)
- [Sequential async calls example](#sequential-async-calls-example)
- [Parallel async calls example](#parallel-async-calls-example)

## Install

```sh
$ npm install mysql
```

## Introduction

This is a 100% javascript implementation of coroutine scheduler based on ES6 generators. It can be used 
to replace callback spaghetti async code with simpler sequential looking code that is still 100% async.

## Sequential async calls example

```js
const ko = require('koroutine');

function dummyAsyncCall(input, callback, delay) {
    setTimeout(function() {
        const result = input+"-ok";
        callback(null, result);
    }, delay);
}

function* exampleKoroutine(input1, input2) {
    const result1 = yield dummyAsyncCall(input1, this.resume, 1000);
    console.log(result1)
    const result2 = yield dummyAsyncCall(input2, this.resume, 2000);
    console.log(result2)
}

ko.run(exampleKoroutine, 0, "myinput1", "myinput2");
```

## Parallel async calls example

```js
const ko = require('koroutine');

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
    const future1 = this.future();
    dummyAsyncSuccessCall(input1, future1, 1000);
    const future2 = this.future();
    dummyAsyncErrorCall(input2, future2, 1000);
    const numErrors = yield* ko.join(future1, future2);
    console.log(future1.data);
    console.log(future2.error);
}

ko.run(exampleKoroutine, 0, "myinput1", "myinput2");
```
