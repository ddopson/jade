# Coffee Flavored Jade - Your favorite template engine, now with more pep

 Jade is a high performance template engine heavily influenced by [Haml](http://haml-lang.com)
 and implemented with JavaScript for [node](http://nodejs.org). For discussion join the [Google Group](http://groups.google.com/group/jadejs).

 Jade-CoffeeScript is a fork of TJ's Jade project that adds the following features:
  * CoffeeScript Jade Dialect - when the rest of your client code is Coffee flavored, it's tedious and annoying to hit JavaScript quirks inside Jade templates.
  * Inline Templates - an elegant way to keep templates and code in the same file
  * Ruby on Rails Integration

## The Jade Language

To understand what Jade is, see [jade-lang.com](http://jade-lang.com/) or the [syntax docs](http://naltatis.github.io/jade-syntax-docs/).  This document will avoid general descriptions of the Jade language and focus on deltas to the original project.

<a name="a1"/>
## Installation / Usage

via npm:

```bash
$ npm install jade
```

<a name="a5"/>
## Public API

```js
var jade = require('jade');

// Compile a function
var fn = jade.compile('string of jade', options);
fn(locals);
```

### Options

 - `self`      Use a `self` namespace to hold the locals _(false by default)_
 - `locals`    Local variable object
 - `filename`  Used in exceptions, and required when using includes
 - `debug`     Outputs tokens and function body generated
 - `compiler`  Compiler to replace jade's default
 - `compileDebug`  When `false` no debug instrumentation is compiled
 - `pretty`    Add pretty-indentation whitespace to output _(false by default)_

<a name="a17"/>
## jade(1)

```

Usage: jade [options] [dir|file ...]

Options:

  -h, --help         output usage information
  -V, --version      output the version number
  -o, --obj <str>    javascript options object
  -O, --out <dir>    output the compiled html to <dir>
  -p, --path <path>  filename used to resolve includes
  -P, --pretty       compile pretty html output
  -c, --client       compile function for client-side runtime.js
  -D, --no-debug     compile without debugging (smaller functions)
  -w, --watch        watch files for changes and automatically re-render

Examples:

  # translate jade the templates dir
  $ jade templates

  # create {foo,bar}.html
  $ jade {foo,bar}.jade

  # jade over stdio
  $ jade < my.jade > my.html

  # jade over stdio
  $ echo "h1 Jade!" | jade

  # foo, bar dirs rendering to /tmp
  $ jade foo bar --out /tmp 

```

<a name="a19"/>
## License

(The MIT License)

Copyright (c) 2009-2010 TJ Holowaychuk &lt;tj@vision-media.ca&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
