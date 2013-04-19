/*!
 * Jade
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var Parser = require('./parser')
  , Lexer = require('./lexer')
  , Compiler = require('./compiler')
  , runtime = require('./runtime')
// if node
  , fs = require('fs');
// end

/**
 * Library version.
 */

exports.version = '0.28.2';

/**
 * Expose self closing tags.
 */

exports.selfClosing = require('./self-closing');

/**
 * Default supported doctypes.
 */

exports.doctypes = require('./doctypes');

/**
 * Text filters.
 */

exports.filters = require('./filters');

/**
 * Utilities.
 */

exports.utils = require('./utils');

/**
 * Expose `Compiler`.
 */

exports.Compiler = Compiler;

/**
 * Expose `Parser`.
 */

exports.Parser = Parser;

/**
 * Expose `Lexer`.
 */

exports.Lexer = Lexer;

/**
 * Nodes.
 */

exports.nodes = require('./nodes');

/**
 * Jade runtime helpers.
 */

exports.runtime = runtime;

/**
 * Template function cache.
 */

exports.cache = {};

/**
 * Parse the given `str` of jade and return an AST (Abstract Syntax Tree)
 *
 * @param {String} str
 * @param {Object} options
 * @return {Object}
 * @api private
 */

exports.parse = function parseAST(str, options) {
    // Parse
    var parser = new Parser(str, options.filename, options);
    return parser.parse();
}

/**
 * Parse the given `str` of jade and return a function body.
 *
 * @param {String} str
 * @param {Object} options
 * @return {String}
 * @api private
 */

function parse(str, options){
  try {
    // Parse
    var parser = new Parser(str, options.filename, options);
    var ast = parser.parse();
    // Compile
    var compiler = new (options.compiler || Compiler)(ast, options)
      , js = compiler.compile();

    // Debug compiler
    if (options.debug) {
      console.error('\nCompiled Function:\n\n\033[90m%s\033[0m', js.replace(/^/gm, '  '));
    }

    var content = ""
    if (options.coffee) {
      if (options.rawdom) {
        content += "_el0 = document.createDocumentFragment()\n"
      } else {
        content += 'buf = []\n'
      }
      if (options.inline) {
        content += js + "\n";
      } else if (options.self) {
        content += 'self = locals || {}\n' + js + "\n";
      } else {
        content += '`with (locals || {}) {`\n' + js + '\n`}`\n';
      }
      if (options.rawdom) {
        content += "return _el0";
      } else {
        content += "return buf.join('')";
      }
      return content;
    } else {
      return ''
        + 'var buf = [];\n'
        + (options.inline ? js
          : options.self ? 'var self = locals || {};\n' + js
          : 'with (locals || {}) {\n' + js + '\n}')
        + '\n'
        + "return buf.join('');";
    }
  } catch (err) {
    parser = parser.context();
    runtime.rethrow(err, parser.filename, parser.lexer.lineno, str);
  }
}

/**
 * Strip any UTF-8 BOM off of the start of `str`, if it exists.
 *
 * @param {String} str
 * @return {String}
 * @api private
 */

function stripBOM(str){
  return 0xFEFF == str.charCodeAt(0)
    ? str.substring(1)
    : str;
}

/**
 * Compile a `Function` representation of the given jade `str`.
 *
 * Options:
 *
 *   - `compileDebug` when `false` debugging code is stripped from the compiled template
 *   - `client` when `true` the helper functions `escape()` etc will reference `jade.escape()`
 *      for use with the Jade client-side runtime.js
 *
 * @param {String} str
 * @param {Options} options
 * @return {Function}
 * @api public
 */

exports.compile = function(str, options){
  var options = options || {}
    , client = options.client
    , filename = options.filename
      ? JSON.stringify(options.filename)
      : 'undefined'
    , fn;

  str = stripBOM(String(str));

  if (options.compileDebug !== false) {
    if (options.coffee) {
      fn = [
          '__jadectx = [{ lineno: 1, filename: ' + filename + ' }];'
        , 'try'
        , parse(str, options).replace(/^/gm, '  ')
        , 'catch err'
        , '  __jade.rethrow(err, __jadectx[0].filename, __jadectx[0].lineno);'
        , ''
      ].join('\n');
    } else {
      fn = [
          'var __jadectx = [{ lineno: 1, filename: ' + filename + ' }];'
        , 'try {'
        , parse(str, options)
        , '} catch (err) {'
        , '  __jade.rethrow(err, __jadectx[0].filename, __jadectx[0].lineno);'
        , '}'
      ].join('\n');
    }
  } else {
    fn = parse(str, options);
  }

  if (client) {
    if (options.coffee) {
      fn = '__jade ||= window.jade\n' + fn;
    } else {
      fn = '__jade = __jade || window.jade\n' + fn;
    }
  }

  if (options.coffee) {
    if (options.coffee) {
      return [
          '((locals, __jade)->'
        , fn.replace(/^/gm, '  ')
        , ')'
      ].join('\n');
      // Coffee mode can't be run directly, only returned as a string
    }
  } else if (options.source) {
    return fn;
  } else {
    fn = new Function('locals, __jade', fn);
    if (client) return fn;
    return function(locals){
      return fn(locals, runtime);
    };
  }
};

/**
 * Render the given `str` of jade and invoke
 * the callback `fn(err, str)`.
 *
 * Options:
 *
 *   - `cache` enable template caching
 *   - `filename` filename required for `include` / `extends` and caching
 *
 * @param {String} str
 * @param {Object|Function} options or fn
 * @param {Function} fn
 * @api public
 */

exports.render = function(str, options, fn){
  // swap args
  if ('function' == typeof options) {
    fn = options, options = {};
  }

  // cache requires .filename
  if (options.cache && !options.filename) {
    return fn(new Error('the "filename" option is required for caching'));
  }

  try {
    var path = options.filename;
    var tmpl = options.cache
      ? exports.cache[path] || (exports.cache[path] = exports.compile(str, options))
      : exports.compile(str, options);
    fn(null, tmpl(options));
  } catch (err) {
    fn(err);
  }
};

/**
 * Render a Jade file at the given `path` and callback `fn(err, str)`.
 *
 * @param {String} path
 * @param {Object|Function} options or callback
 * @param {Function} fn
 * @api public
 */

exports.renderFile = function(path, options, fn){
  var key = path + ':string';

  if ('function' == typeof options) {
    fn = options, options = {};
  }

  try {
    options.filename = path;
    var str = options.cache
      ? exports.cache[key] || (exports.cache[key] = fs.readFileSync(path, 'utf8'))
      : fs.readFileSync(path, 'utf8');
    exports.render(str, options, fn);
  } catch (err) {
    fn(err);
  }
};

/**
 * Express support.
 */

exports.__express = exports.renderFile;
