
/*!
 * Jade - Compiler
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var nodes = require('./nodes')
  , filters = require('./filters')
  , doctypes = require('./doctypes')
  , selfClosing = require('./self-closing')
  , runtime = require('./runtime')
  , utils = require('./utils')
  , parseJSExpression = require('character-parser').parseMax;


  var INDENT = 78;
  var OUTDENT = -78;
// if browser
//
// if (!Object.keys) {
//   Object.keys = function(obj){
//     var arr = [];
//     for (var key in obj) {
//       if (obj.hasOwnProperty(key)) {
//         arr.push(key);
//       }
//     }
//     return arr;
//   }
// }
//
// if (!String.prototype.trimLeft) {
//   String.prototype.trimLeft = function(){
//     return this.replace(/^\s+/, '');
//   }
// }
//
// end


/**
 * Initialize `Compiler` with the given `node`.
 *
 * @param {Node} node
 * @param {Object} options
 * @api public
 */

var Compiler = module.exports = function Compiler(node, options) {
  this.options = options || {};
  this.node = node;
};

/**
 * Compiler prototype.
 */

Compiler.prototype = {

  /**
   * Compile parse tree to JavaScript.
   *
   * @api public
   */

  visitHeader: function () {
    // with(locals) {
    if (this.options.self) {
      this.buf_push_var('self', 'locals || {}');
    } else if (!this.options.inline) {
      this.buf_push_rawjs('with (locals || {}) {');
    }

    // try/catch
    if (this.options.compileDebug !== false) {
      this.buf_push(this.options.coffee ? 'try' : 'try {');
      this.buf_push(INDENT);
      this.buf_push_var('__jadectx', '[{ lineno: 1, filename: ' + JSON.stringify(this.options.filename) + ' }]');
    }

    // local variables
    this.buf_push_var('interp');
    if (this.options.rawdom) {
      this.buf_push_var(this.elRef(0), 'document.createDocumentFragment()');
    } else {
      this.buf_push_var('__buf', '""');
    }
    if (this.options.client) this.buf_push_var('__jade', 'window.jade');
  },

  visitFooter: function () {
    // return
    if (this.options.inline) {
      var retStr = '';
    } else {
      var retStr = 'return ';
    }
    if (this.options.rawdom) {
      this.buf_push_stmt(retStr + this.elRef(0));
    } else {
      this.buf_push_stmt(retStr + '__buf');
    }

    // try/catch
    if (this.options.compileDebug !== false) {
      this.buf_push(OUTDENT);
      this.buf_push(this.options.coffee ? 'catch ex' : '} catch (ex) {');
      this.buf_push(INDENT);
      this.buf_push_stmt('__jade.rethrow(ex, __jadectx[0].filename, __jadectx[0].lineno)')
      this.buf_push(OUTDENT);
      if (!this.options.coffee) this.buf_push('}');
    }

    // with(locals) {
    if (!this.options.inline && !this.options.self) {
      this.buf_push_rawjs('}');
    }
  },

  compile: function(){
    this.lastBuffered = "";
    this.mixin_depth = 0;
    this.html_depth = 0;
    this.html_depth_max = 0;
    this.buf = [];
    this.pp = this.options.pretty || false;
    this.debug = false !== this.options.compileDebug;
    this.hasCompiledDoctype = false;
    this.hasCompiledTag = false;
    if (this.options.doctype) this.setDoctype(this.options.doctype);

    this.visitHeader();
    this.visit(this.node);
    this.visitFooter();
    this.flushBuffer();

    var content = '';
    var indent = 0;

    for(var i=0,l=this.buf.length; i < l; i++) {
      var el = this.buf[i];
      if (el === INDENT) {
        indent++;
      } else if (el === OUTDENT) {
        indent--;
      } else {
        content += runtime.indent(indent) + el;
      }
    }
    return content;
  },

  /**
   * Sets the default doctype `name`. Sets terse mode to `true` when
   * html 5 is used, causing self-closing tags to end with ">" vs "/>",
   * and boolean attributes are not mirrored.
   *
   * @param {string} name
   * @api public
   */

  setDoctype: function(name){
    name = (name && name.toLowerCase()) || 'default';
    this.doctype = doctypes[name] || '<!DOCTYPE ' + name + '>';
    this.terse = this.doctype.toLowerCase() == '<!doctype html>';
    this.xml = 0 == this.doctype.indexOf('<?xml') || this.options.xml;
  },

  buf_push: function(content){
    if (this.options.coffee && typeof content == 'string' && content.match(/__jadectx.(un)?shift/)) {
      // we don't support the jadectx stuff in coffee mode yet
      return;
    }

    this.flushBuffer();
    this.buf.push(content);
  },

  buf_push_stmt: function(code) {
    this.buf_push(code + (this.options.coffee ? '' : ';'));
  },

  buf_push_deferred_var_line: function() {
    this.buf_push('');
    var idx = this.buf.length - 1;
    var self = this;
    return {
      finish: function() {
        var vars = [];
        for(var i = 0; i <= self.html_depth_max; i++) {
          vars.push(self.elRef(i));
        }
        self.buf[idx] = '`var ' + vars.join(', ') + '`';
      }
    };
  },

  buf_push_rawjs: function(code) {
    if (this.options.coffee) {
      code = '`' + code + '`';
    }
    this.buf_push(code);
  },

  buf_push_forof: function(key, val, obj) {
    if (this.options.coffee) {
      this.buf_push('for ' + key + ', ' + val + ' of ' + obj);
      this.indent_code();
    } else {
      this.buf_push('for (var ' + key + ' in ' + obj + ') {');
      this.indent_code();
      this.buf_push_var(val, obj + '[' + key + ']')
    }
  },

  buf_push_forin: function(key, val, arr) {
    if (this.options.coffee) {
      this.buf_push('for ' + key + ', ' + val + ' in ' + arr);
      this.indent_code();
    } else {
      this.buf_push('for (var ' + key + ' = 0, $$l = ' + arr + '.length; ' + key + ' < $$l; ' + key + '++) {');
      this.indent_code();
      this.buf_push_var(val, arr + '[' + key + ']')
    }
  },

  buf_push_var: function(key, val) {
    if (typeof val != 'undefined') {
      if (this.options.coffee) {
        this.buf_push(key + ' = ' + val)
      } else {
        this.buf_push('var ' + key + ' = ' + val + ';');
      }
    } else {
      if (!this.options.coffee) {
        this.buf_push('var ' + key + ';');
      }
    }
  },

  buf_push_if: function(condition) {
    if (this.options.coffee) {
      this.buf_push('if ' + condition)
    } else {
      this.buf_push('if (' + condition + ') {');
    }
    this.indent_code();
  },

  buf_push_else: function() {
    this.outdent_code();
    if (this.options.coffee) {
      this.buf_push('else')
    } else {
      this.buf_push('} else {');
    }
    this.indent_code();
  },

  buf_push_end: function() {
    this.outdent_code();
    if (!this.options.coffee) this.buf_push('}');
  },

  indent_code: function() {
    this .buf_push(INDENT);
  },

  outdent_code: function() {
    this .buf_push(OUTDENT);
  },

  newline_code: function() {
  },

  indent_html: function(){
    this.html_depth++;
    if (this.html_depth > this.html_depth_max) {
      this.html_depth_max = this.html_depth;
    }
  },

  outdent_html: function(){
    this.html_depth--;
  },

  debuglog: function(msg) {
    if (this.options.coffee) {
      // this writes direct to buf to avoid the call to flushBuffer
      this.buf.push('# ' + msg);
    } else {
      this.buf.push('// ' + msg);
    }
  },

  indent_string: function (offset) {
    offset = offset || 0;
    var html_depth = this.html_depth + offset;
    if (this.mixin_depth > 0) {
      return (html_depth > 0 ? '__indent + ' + html_depth : '__indent')
    } else {
      return '' + html_depth;
    }
  },

  /**
   * Buffer an indent based on the current `indent`
   * property and an additional `offset`.
   *
   * @param {Number} offset
   * @api public
   */

  newline_html: function(offset){
    offset = offset || 0;
    var html_depth = this.html_depth + offset;
    if (!this.pp) return;

    if (this.mixin_depth) {
      var indentStr = this.indent_string(offset);
      if (this.options.rawdom) {
        this.buf_push('__jade.domAppendText(' + this.elParentRef() + ', __jade.indent(' + indentStr + '))');
      } else {
        this.bufferExpression("__jade.indent(" + indentStr + ")");
      }
    } else {
      this.bufferText(runtime.indent(html_depth));
    }
  },

  flushBuffer: function() {
    if (this.lastBuffered === "") return;
    var str = "'" + this.lastBuffered + "'";
    if (this.options.rawdom) {
      this.buf.push("__jade.domAppendText(" + this.lastBufferedElRef + ", " + str + ")")
    } else {
      this.buf.push('__buf += ' + str);
    }
    this.lastBuffered  = "";
  },

  /**
   * Buffer the given `str` exactly as is or with interpolation
   *
   * @param {String} str
   * @param {Boolean} interpolate
   * @api public
   */

  escapeSingleQuote: function (str) {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\\\'')
      .replace(/\n/g, '\\n')
  },

  bufferText: function(str, interpolate){
    var self = this;
    var match;
    if (interpolate && (match = /(\\)?([#!]){((?:.|\n)*)$/.exec(str))) {
      var backslash = match[1];
      var flag = match[2];
      var code = match[3];
      this.bufferText(str.substr(0, match.index), false);
      if (!backslash) {
        try {
          var range = parseJSExpression(code);
          var content = "";
          if (self.options.coffee) {
            content += "(" + range.src + ") ? ''";
          } else {
            content += "(interp = " + range.src + ") == null ? '' : interp";
          }

          this.bufferExpression(content, flag != '!');

          // recurse to process the text after the end of the interpolation
          this.bufferText(code.substr(range.end + 1), true);
          return content;
        } catch (ex) {
          //didn't match, just return as if escaped
          self.debuglog('interpolation threw error: ' + JSON.stringify(ex.message));
        }
      }
      this.bufferText(flag + '{', false);
      this.bufferText(code, true);
      return;
    }

    if (this.lastBuffered !== "" && this.html_depth != this.lastBufferedIndent) {
      // If we popped up a level, flush the buffer so the new text shows up after the close tag
      this.flushBuffer();
    }

    // safely escape any quotes in the string
    str = this.escapeSingleQuote(str)

    this.lastBuffered += str;
    if (this.options.rawdom) {
      this.lastBufferedElRef = this.elParentRef();
    }
    this.lastBufferedIndent = this.html_depth;
  },

  bufferExpression: function(content, needs_escape) {
    if (this.options.rawdom) {
      if (needs_escape) {
        // Escaped text just becomes text, so we can insert it directly as a TextNode
        this.buf_push_stmt('__jade.domAppendText(' + this.elParentRef() + ', (' + content + '))')
      } else {
        // Unescaped text: Might have HTML elements inside and must be parsed
        this.buf_push_stmt('__jade.domAppendContent(' + this.elParentRef() + ', (' + content + '))')
      }
    } else {
      if (this.lastBuffered !== "" && this.html_depth != this.lastBufferedIndent) {
        // If we popped up a level, flush the buffer so the new text shows up after the close tag
        this.flushBuffer();
      }

      if (needs_escape) {
        content = '__jade.escape(' + content + ')';
      }
      this.buf_push_stmt('__buf += ' + content);
    }
  },

  /**
  * Get a reference to the current 'parent' element (the node we will append new content to)
  * This is a helper for the RawDOM scenario
  */
  elRef: function(depth) {
      if (typeof depth == 'undefined') depth = this.html_depth+1;
      return '__el' + depth;
  },

  /**
  * Get a reference to the 'current' element (the node we are operating on)
  * This is a helper for the RawDOM scenario
  */
  elParentRef: function () {
      return '__el' + (this.html_depth);
  },


  /**
   * Visit `node`.
   *
   * @param {Node} node
   * @api public
   */

  visit: function(node){
    var debug = this.debug;

    if (debug) {
      this.buf_push('__jadectx.unshift({lineno: ' + node.line
        + ', filename: ' + (node.filename
          ? JSON.stringify(node.filename)
          : '__jadectx[0].filename')
        + ' });');
    }

    // Massive hack to fix our context
    // stack for - else[ if] etc
    if (false === node.debug && this.debug && !this.options.coffee) {
      this.buf.pop();
      this.buf.pop();
    }

    this.visitNode(node);

    if (debug) this.buf_push('__jadectx.shift();');
  },

  /**
   * Visit `node`.
   *
   * @param {Node} node
   * @api public
   */

  visitNode: function(node){
    var name = node.getType();
    return this['visit' + name](node);
  },

  /**
   * Visit case `node`.
   *
   * @param {Literal} node
   * @api public
   */

  visitCase: function(node){
    var _ = this.withinCase;
    this.withinCase = true;
    if (this.options.coffee) {
      this.buf_push('switch (' + node.expr + ')');
      this.indent_code();
      this.visit(node.block);
      this.outdent_code();
    } else {
      this.buf_push('switch (' + node.expr + '){');
      this.visit(node.block);
      this.buf_push('}');
    }
    this.withinCase = _;
   },

  /**
   * Visit when `node`.
   *
   * @param {Literal} node
   * @api public
   */

  visitWhen: function(node){
    if (this.options.coffee) {
      if ('default' == node.expr) {
        this.buf_push('else');
      } else {
        this.buf_push('when ' + node.expr);
      }
      this.indent_code();
      this.visit(node.block);
      this.outdent_code();
    } else {
      if ('default' == node.expr) {
        this.buf_push('default:');
      } else {
        this.buf_push('case ' + node.expr + ':');
      }
      this.visit(node.block);
      this.buf_push('  break;');
    }
  },

  /**
   * Visit literal `node`.
   *
   * @param {Literal} node
   * @api public
   */

  visitLiteral: function(node){
    if (this.options.rawdom) {
      // We are thinking in Elements and we have textual HTML.  Let's fix that
      this.buf_push_stmt(this.elParentRef() + ".innerHTML += '" + this.escapeSingleQuote(node.str) + "'")
    } else {
      this.bufferText(node.str);
    }
  },

  /**
   * Visit all nodes in `block`.
   *
   * @param {Block} block
   * @api public
   */

  visitBlock: function(block){
    var len = block.nodes.length
      , pp = this.pp

    // Block keyword has a special meaning in mixins
    if (this.mixin_depth && block.mode) {
      var block_args = [];
      if (this.options.rawdom) block_args.push(this.elParentRef());
      if (this.pp) block_args.push(this.indent_string());
      block_args = block_args.join(', ');
      this.buf_push_stmt('block && block(' + block_args + ')');
      return;
    }

    // Pretty print multi-line text
    if (len > 1 && !this.inside_pre && block.nodes[0].isText && block.nodes[1].isText)
      this.newline_html();

    for (var i = 0; i < len; ++i) {
      if (i > 0 && block.nodes[i].isText && block.nodes[i-1].isText) {
        if (pp && !this.inside_pre) {
          this.newline_html();
        } else {
          this.bufferText('\n');
        }
      }

      this.visit(block.nodes[i]);
    }
  },

  /**
   * Visit `doctype`. Sets terse mode to `true` when html 5
   * is used, causing self-closing tags to end with ">" vs "/>",
   * and boolean attributes are not mirrored.
   *
   * @param {Doctype} doctype
   * @api public
   */

  visitDoctype: function(doctype){
    if (doctype && (doctype.val || !this.doctype)) {
      this.setDoctype(doctype.val || 'default');
    }

    if (this.doctype) {
      this.bufferText(this.doctype);
    }
    this.hasCompiledDoctype = true;
  },

  /**
   * Visit `mixin`, generating a function that
   * may be called within the template.
   *
   * @param {Mixin} mixin
   * @api public
   */

  visitMixin: function(mixin){
    var name = mixin.name.replace(/-/g, '_') + '_mixin'
      , args = mixin.args || ''
      var comma_args = (args ? ', ' + args : '')
      , block = mixin.block
      , attrs = mixin.attrs

    if (mixin.call) {
      if (block || attrs.length || this.pp) {

        if (this.options.coffee) {
          this.buf_push(name + '({')
        } else {
          this.buf_push(name + '({');
        }
        this.indent_code();

        if (this.pp) {
          var comma = ((block || attrs.length) ? ',' : '');
          this.buf_push('indent: ' + this.indent_string() + comma);
        }

        if (block) {
          var block_args = [];
          if (this.options.rawdom) block_args.push(this.elRef(0));
          if (this.pp) block_args.push('__indent');
          block_args = block_args.join(', ');
          if (this.options.coffee) {
            this.buf_push('block: ((' + block_args + ') ->')
          } else {
            this.buf_push('block: function(' + block_args + '){');
          }
          this.indent_code();
          if (this.options.rawdom) {
            var _deferred = this.buf_push_deferred_var_line();
          }

          // Render block with no indents, dynamically added when rendered
          this.mixin_depth++;
          var _html_depth = this.html_depth;
          var _html_depth_max = this.html_depth_max;
          this.html_depth = 0;
          this.visit(mixin.block);
          if (this.options.rawdom) {
            _deferred.finish();
          }
          this.html_depth = _html_depth;
          this.html_depth_max = _html_depth_max;
          this.mixin_depth--;

          this.outdent_code();
          this.buf_push( (this.options.coffee ? ')' : '}') + (attrs.length ? ',' : '') );
        }

        if (attrs.length) {
          var val = this.attrs(attrs);
          if (val.inherits) {
            this.buf_push('attributes: __jade.merge(' + val.json + ', attributes),');
            this.buf_push('escaped: __jade.merge(' + JSON.stringify(val.escaped) + ', escaped, true)');
          } else {
            this.buf_push('attributes: ' + val.json + ',');
            this.buf_push('escaped: ' + JSON.stringify(val.escaped));
          }
        }

        this.outdent_code();
        if (this.options.rawdom) {
          comma_args = ', ' + this.elParentRef() + comma_args;
        }

        this.buf_push('}' + comma_args + (this.coffee ? ')' : ');'));

      } else {
        this.buf_push_stmt(name + '({}' + comma_args + ')');
      }
    } else {
      if (this.options.rawdom) {
        comma_args = ', ' + this.elRef(0) + comma_args;
      }
      if (this.options.coffee) {
        this.buf_push(name + ' = ((__mixin_context' + comma_args + ') ->');
      } else {
        this.buf_push('var ' + name + ' = function(__mixin_context' + comma_args + ') {');
      }
      this.indent_code();

      if (this.options.rawdom) {
        var _deferred = this.buf_push_deferred_var_line();
      }

      this.buf_push_var('block', '__mixin_context.block');
      this.buf_push_var('attributes', '__mixin_context.attributes || {}');
      this.buf_push_var('escaped', '__mixin_context.escaped || {}');
      if (this.pp) {
        this.buf_push_var('__indent', '__mixin_context.indent');
      }
      this.mixin_depth++;
      this.visit(block);
      if (this.options.rawdom) {
        _deferred.finish();
      }
      this.mixin_depth--;
      this.outdent_code();
      if (this.options.coffee) {
        this.buf_push(').bind(@)');
      } else {
        this.buf_push('};');
      }
    }
  },

  /**
   * Visit `tag` buffering tag markup, generating
   * attributes, visiting the `tag`'s code and block.
   *
   * @param {Tag} tag
   * @api public
   */

  visitTag: function(tag){
    var name = tag.name
      , pp = this.pp
      , self = this

    if(
      (tag.name == 'for')
      && (tag.attrs.length == 0)
      && (tag.block && tag.block.nodes && tag.block.nodes[0] && tag.block.nodes[0].val))
    {
      // Hack to support 'for val,key of obj' in CoffeeScript w/o changing the lexer+parser
      this.buf_push('for ' + tag.block.nodes[0].val)
      this.indent_code();
      block = tag.block.clone();
      block.nodes.shift();
      this.visit(block);
      this.outdent_code();
      return;
    }

    if (!this.hasCompiledTag) {
      if (!this.hasCompiledDoctype && 'html' == name) {
        this.visitDoctype();
      }
      this.hasCompiledTag = true;
    }

    // pretty print
    if (!tag.isInline()) {
      this.newline_html();
    }

    if (this.options.rawdom) {
      var nameStr = (tag.buffer) ? "(" + name + ")" :  JSON.stringify(name);
      this.buf_push(this.elRef() + ' = ' + this.elParentRef() + '.appendChild(document.createElement(' + nameStr + '))')
    } else {
      if (tag.buffer) {
        this.bufferText('<');
        this.bufferExpression(name);
      } else {
        this.bufferText('<' + name);
      }
    }

    if (tag.attrs.length) this.visitAttributes(tag.attrs);

    if ((~selfClosing.indexOf(name) || tag.selfClosing) && !this.xml) {
      // This block is stupid.  self-closing tags are stupid.
      if (this.options.rawdom) {
        // Self closingness isn't represented in the DOM
        // To enable character-perfect test ouput, we need to wire the extra entropy through
        if (this.options.testHooks) {
          this.buf_push(this.elRef() + '.testHookSelfClosing()');
        }
      } else {
        this.bufferText(this.terse ? '>' : '/>')
      }
    } else {
      if (!this.options.rawdom) this.bufferText('>');

      this.indent_html();

      // visit Code (eg "div.class= code)
      if (tag.code) this.visitCode(tag.code);

      // visit Block
      this.inside_pre = ('pre' == name);
      if(this.options.rawdom && name == 'script') {
        this.buf_push_stmt('__buf = ""');
        this.options.rawdom = false;
        this.visit(tag.block);
        this.flushBuffer(); // need to flush any textual stuff before returning to rawDom mode
        this.options.rawdom = true;
        this.buf_push('__jade.domAppendText(' + this.elParentRef() + ', __buf)');
      } else {
        this.visit(tag.block);
      }
      this.inside_pre = false;

      // pretty print
      if (!tag.isInline() && 'pre' != name && !tag.canInline())
        this.newline_html(-1);

      this.outdent_html();

      if (!this.options.rawdom) {
        if (tag.buffer) {
          this.bufferText('</');
          this.bufferExpression(name);
          this.bufferText('>');
        } else {
          this.bufferText('</' + name + '>');
        }
      }
    }
  },


  /**
   * Visit `filter`, throwing when the filter does not exist.
   *
   * @param {Filter} filter
   * @api public
   */

  visitFilter: function(filter){
    var text = filter.block.nodes.map(
      function(node){ return node.val; }
    ).join('\n');
    filter.attrs = filter.attrs || {};
    filter.attrs.filename = this.options.filename;
    this.bufferText(filters(filter.name, text, filter.attrs), true);
  },

  /**
   * Visit `text` node.
   *
   * @param {Text} text
   * @api public
   */


  visitText: function(text){
    this.bufferText(text.val, true);
  },

  /**
   * Visit a `comment`, only buffering when the buffer flag is set.
   *
   * @param {Comment} comment
   * @api public
   */

  visitComment: function(comment){
    if (!comment.buffer) return;
    if (this.options.rawdom) {
      this.newline_html();
      this.buf_push('__jade.domAppendComment(' + this.elParentRef() + ", " + JSON.stringify(comment.val) + ")");
    } else {
      this.newline_html();
      this.bufferText('<!--' + comment.val + '-->');
    }
  },

  /**
   * Visit a `BlockComment`.
   *
   * @param {Comment} comment
   * @api public
   */

  visitBlockComment: function(comment){
    if (!comment.buffer) return;
    if (this.options.rawdom) {
      //this.buf_push('__jade.domAppendComment(' + this.elParentRef() + ", '" + comment.val + "')");
      // holy crap, this totally won't work
      this.buf_push('document.fail()');
    } else if (0 == comment.val.trim().indexOf('if')) {
      this.bufferText('<!--[' + comment.val.trim() + ']>');
      this.visit(comment.block);
      this.bufferText('<![endif]-->');
    } else {
      this.bufferText('<!--' + comment.val);
      this.visit(comment.block);
      this.bufferText('-->');
    }
  },

  /**
   * Visit `code`, respecting buffer / escape flags.
   * If the code is followed by a block, wrap it in
   * a self-calling function.
   *
   * @param {Code} code
   * @api public
   */

  visitCode: function(code){
    // Wrap code blocks with {}.
    // we only wrap unbuffered code blocks ATM
    // since they are usually flow control
    // Buffer code
    if (code.buffer) {
      if (this.options.rawdom) {
        if (code.escape) {
          // Escaped text: Since it's being 'escaped', the text won't turn into any HTML elements
          // we can insert it directly (w/o html parsing) as a DOM TextNode
          this.buf_push('__jade.domAppendText(' + this.elParentRef() + ', (' + code.val.trimLeft() + '))')
        } else {
          // Unescaped text: Might have HTML elements inside and must be parsed
          this.buf_push('__jade.domAppendContent(' + this.elParentRef() + ', (' + code.val.trimLeft() + '))')
        }
      } else {
        var val;
        if (this.options.coffee) {
          this.buf_push('__val__ = (' + code.val.trimLeft() + ") ? ''");
          val = '__val__';
        } else {
          this.buf_push('var __val__ = ' + code.val.trimLeft());
          val = 'null == __val__ ? "" : __val__';
        }
        this.bufferExpression(val, code.escape);
      }
    } else {
      this.buf_push(code.val.trimLeft());
    }

    // Block support
    if (code.block) {
      if (!this.options.coffee && !code.buffer) this.buf_push('{');
      this.indent_code();
      this.visit(code.block);
      this.outdent_code();
      if (!this.options.coffee && !code.buffer) this.buf_push('}');
    }
  },

  /**
   * Visit `each` block.
   *
   * @param {Each} each
   * @api public
   */

  visitEach: function(each){
    if (this.options.coffee) {
      if (each.alternative) {
        this.buf_push('$$_alt = true')
      }
      this.buf_push('if typeof ' + each.obj + ".length == 'number'");
      this.indent_code();
      this.buf_push('for ' + each.val + ',' + each.key + ' in ' + each.obj)
      this.indent_code();
      if (each.alternative) {
        this.buf_push('$$_alt = false')
      }
      this.visit(each.block);
      this.outdent_code();
      this.outdent_code();
      this.buf_push('else');
      this.indent_code();
      this.buf_push('for ' + each.key + ',' + each.val + ' of ' + each.obj)
      this.indent_code();
      if (each.alternative) {
        this.buf_push('$$_alt = false')
      }
      this.visit(each.block);
      this.outdent_code();
      this.outdent_code();

      if (each.alternative) {
        this.buf_push('if $$_alt')
        this.indent_code();
        this.visit(each.alternative);
        this.outdent_code();
      }
    } else {
      this.buf_push('// iterate ' + each.obj);
      this.buf_push(';(function(){');
      this.indent_code();

      this.buf_push_if("'number' == typeof " + each.obj + '.length');

      if (each.alternative) {
        this.buf_push_if(each.obj + '.length');
      }

      this.buf_push_forin(each.key, each.val, each.obj);
      this.visit(each.block);
      this.buf_push_end();

      if (each.alternative) {
        this.buf_push_else()
        this.visit(each.alternative);
        this.buf_push_end();
      }

      this.buf_push_else();
      this.buf_push_var('$$l', '0');

      this.buf_push_forof(each.key, each.val, each.obj);
      this.buf_push('$$l++;');

      this.visit(each.block);

      this.buf_push_end();
      if (each.alternative) {
        this.buf_push_if('$$l === 0');
        this.visit(each.alternative);
        this.buf_push_end();
      }
      this.buf_push('  }\n}).call(this);\n');
    }
  },


  /**
   * Visit `attrs`.
   *
   * @param {Array} attrs
   * @api public
   */

  visitAttributes: function(attrs){
    // e.g. attrs=[{"name":"class","val":"'foo'"},{"name":"class","val":"'bar'","escaped":true},{"name":"name","val":"'end'","escaped":true}]
    if (this.options.rawdom) {
      var classes = [];
      for (var i=0, l=attrs.length; i < l; i++) {
        var attr = attrs[i];
        if (attr.name == 'class') {
          if (isConstant(attr.val)) {
            var classes = getConstantClassListValues(attr.val);
            this.buf_push(this.elRef() + ".classList.add(" + arrayParamsSplat(classes) + ")");
          } else {
            // We can't assume that a computed value is a single class name.  It might be an array, so we call a helper
            this.buf_push('__jade.domSetClass(' + this.elRef() + ", (" + attr.val + "))");
          }
        } else if (attr.name == 'attributes') {
          var val = ((attr.val === true) ? 'attributes' : '(' + attr.val + ')');
          this.buf_push("__jade.domSetAttributes(" + this.elRef() + ", " + val + ")");
        } else if (attr.name.indexOf('data') == 0) {
          this.buf_push("__jade.domSetDataAttribute(" + this.elRef() + ", '" + attr.name + "', (" + attr.val + "))");
        } else {
          this.buf_push("__jade.domSetAttribute(" + this.elRef() + ", '" + attr.name + "', (" + attr.val + "))");
        }
      }
    } else {
      var val = this.attrs(attrs);
      if (val.inherits) {
        this.bufferExpression(
          "__jade.attrs(__jade.merge(" + val.json + ", attributes), __jade.merge("
            + JSON.stringify(val.escaped)
            + ", escaped, true))"
        );
      } else if (val.constant) {
        eval('var buf=' + val.json + ';');
        this.bufferText(runtime.attrs(buf, val.escaped));
      } else {
        this.bufferExpression("__jade.attrs(" + val.json + ", " + JSON.stringify(val.escaped) + ")");
      }
    }
  },

  /**
   * Compile attributes.
   */

  attrs: function(attrs){
    var buf = []
      , classes = []
      , escaped = {}
      , constant = attrs.every(function(attr){ return isConstant(attr.val) })
      , inherits = false;

    if (this.terse) buf.push('terse: true');

    attrs.forEach(function(attr){
      if (attr.name == 'attributes') return inherits = true;
      escaped[attr.name] = attr.escaped;
      if (attr.name == 'class') {
        classes.push('(' + attr.val + ')');
      } else {
        var pair = "'" + attr.name + "':(" + attr.val + ')';
        buf.push(pair);
      }
    });

    if (classes.length) {
      classes = classes.join(" + ' ' + ");
      buf.push('"class": ' + classes);
    }

    return {
      json: '{' + buf.join(', ') + '}',
      escaped: escaped,
      inherits: inherits,
      constant: constant
    };
  }
};

/**
 * Check if expression can be evaluated to a constant
 *
 * @param {String} expression
 * @return {Boolean}
 * @api private
 */

function isConstant(val){
  // Check strings/literals
  if (/^ *("([^"\\]*(\\.[^"\\]*)*)"|'([^'\\]*(\\.[^'\\]*)*)'|true|false|null|undefined) *$/i.test(val))
    return true;

  // Check numbers
  if (!isNaN(Number(val)))
    return true;

  // Check arrays
  var matches;
  if (matches = /^ *\[(.*)\] *$/.exec(val))
    return matches[1].split(',').every(isConstant);

  return false;
}

function getConstant(val){
  try {
  val = val.match(/^ *(.*?) *$/)[1];
  // Check strings/literals
  if (val.match(/^'([^'\\]*(\\.[^'\\]*)*)'$/)) {
    val = val.replace(/['"]/g, function (q) { return q == '"' ? "'" : '"'; });
    val = JSON.parse(val)
    val = val.replace(/['"]/g, function (q) { return q == '"' ? "'" : '"'; });
    return val;
  }
  if (val.match(/^"([^"\\]*(\\.[^"\\]*)*)"$/)) {
    return JSON.parse(val)
  }
  if (val == 'true') return true;
  if (val == 'false') return false;
  if (val == 'null') return null;
  if (val == 'undefined') return undefined;


  // Check numbers
  if (!isNaN(Number(val)))
    return Number(val);

  // Check arrays
  var matches;
  if (matches = /^\[(.*)\]$/.exec(val))
    return matches[1].split(',').map(getConstant);
  } catch (e) {
    if (e instanceof SyntaxError)
      throw new Error("Failed to parse string " + JSON.stringify(val));
    throw e
  }

  throw new Error("Don't call this for a non-constant value");
}

function getConstantClassListValues(val) {
  val = getConstant(val);
  var classes = [];
  (function recurse(val) {
    var type = typeof val;
    if (val == null) {
      // add nothing
    } else if (type == 'number') {
      classes.push ('' + val);
    } else if (type == 'string') {
      var toks = val.split(' ')
      for (var i=0,l=toks.length; i<l; i++) {
        var tok = toks[i];
        if (tok != '') {
          classes.push(tok);
        }
      }
    } else if (Array.isArray(val)) {
      for (var i=0,l=val.length; i<l; i++) {
        recurse(val[i]);
      }
    } else {
      throw new Error('unexpected type');
    }
  })(val);
  return classes;
}

function arrayParamsSplat(arr) {
  var json = JSON.stringify(arr)
  var ret = json.slice(1, json.length-1);
  return ret;
}

/**
 * Escape the given string of `html`.
 *
 * @param {String} html
 * @return {String}
 * @api private
 */

function escape_html(html){
  return String(html)
    .replace(/&(?!\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
