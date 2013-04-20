
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
  , utils = require('./utils');


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
  this.options = options = options || {};
  this.node = node;
  this.hasCompiledDoctype = false;
  this.hasCompiledTag = false;
  this.pp = options.pretty || false;
  this.debug = false !== options.compileDebug;
  if (options.doctype) this.setDoctype(options.doctype);
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

  compile: function(){
    this.lastBuffered = "";
    this.mixin_depth = 0;
    this.html_depth = 0;
    this.html_depth_max = 0;

    if (this.options.coffee) {
      this.buf = [];
    } else {
      this.buf = ['var interp;'];
    }

    this.visit(this.node);
    this.flushBuffer();

    var content = '';
    var indent = 0;
    var indents = [''];

    for(var i=0,l=this.buf.length; i < l; i++) {
      var el = this.buf[i];
      if (el === INDENT) {
        indent++;
        if (indent == indents.length) {
          indents[indent] = indents[indent - 1] + '  ';
        }
      } else if (el === OUTDENT) {
        indent--;
      } else {
        if (i > 0) {
          content += "\n";
        }
        content += indents[indent] + el;
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

  /**
   * Buffer the given `str` optionally escaped.
   *
   * @param {String} str
   * @param {Boolean} esc
   * @api public
   */

  buf_push: function(content){
    if (this.options.coffee && typeof content == 'string' && content.match(/__jadectx.(un)?shift/)) {
      // we don't support the jadectx stuff in coffee mode yet
      return;
    }

    this.flushBuffer();
    this.buf.push(content);
  },

  buf_push_squared: function(content) {
    if (this.options.coffee) {
      this.buf_push('buf.push ' + content);
    } else {
      this.buf_push('buf.push(' + content + ');');
    }
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
    if (this.options.coffee) {
      this.buf_push(key + ' = ' + val)
    } else {
      this.buf_push('var ' + key + ' = ' + val + ';');
    }
  },

  buf_push_var: function(key, val) {
    if (this.options.coffee) {
      this.buf_push(key + ' = ' + val)
    } else {
      this.buf_push('var ' + key + ' = ' + val + ';');
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

  debug: function(msg) {
    if (this.options.coffee) {
      // this writes direct to buf to avoid the call to flushBuffer
      this.buf.push('# ' + msg);
    } else {
      this.buf.push('// ' + msg);
    }
  },

  /**
   * Buffer an indent based on the current `indent`
   * property and an additional `offset`.
   *
   * @param {Number} offset
   * @param {Boolean} newline
   * @api public
   */

  indent_string: function (offset) {
    offset = offset || 0;
    var html_depth = this.html_depth + offset;
    if (this.mixin_depth > 0) {
      return (html_depth > 0 ? '__indent + ' + html_depth : '__indent')
    } else {
      return '' + html_depth;
    }
  },

  newline_html: function(offset){
    offset = offset || 0;
    var html_depth = this.html_depth + offset;
    if (!this.pp) return;

    if (this.mixin_depth) {
      var indentStr = this.indent_string(offset);
      if (this.options.rawdom) {
        this.buf_push('__jade.domAppendText(' + this.elParentRef() + ', __jade.indent(' + indentStr + '))');
      } else {
        this.buf_push_squared("__jade.indent(" + indentStr + ")");
      }
    } else {
      this.buffer(runtime.indent(html_depth).replace('\n', '\\n'));
    }
  },

  flushBuffer: function() {
    if (this.lastBuffered === "") return;
    if (this.options.rawdom) {
      this.buf.push("__jade.domAppendText(" + this.lastBufferedElRef + ", '" + this.lastBuffered + "')")
    } else {
      if (this.options.coffee) {
        this.buf.push("buf.push '" + this.lastBuffered + "'");
      } else {
        this.buf.push("buf.push('" + this.lastBuffered + "');");
      }
    }
    this.lastBuffered  = "";
  },

  buffer: function(str, esc, hack){

    if (esc) str = utils.escape(str);
    if (this.lastBuffered !== "" && this.html_depth != this.lastBufferedIndent) {
      // If we popped up a level, flush the buffer so the new text shows up after the close tag
      this.flushBuffer();
    }
    this.lastBuffered += str;
    this.lastBufferedElRef = this.elParentRef();
    this.lastBufferedIndent = this.html_depth;
    this.flushBuffer();
  },

  /**
  * Get a reference to the current 'parent' element (the node we will append new content to)
  * This is a helper for the RawDOM scenario
  */
  elRef: function(depth) {
      if (typeof depth == 'undefined') depth = this.html_depth+1;
      return '_el' + depth;
  },

  /**
  * Get a reference to the 'current' element (the node we are operating on)
  * This is a helper for the RawDOM scenario
  */
  elParentRef: function () {
      return '_el' + (this.html_depth);
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
    var str = node.str.replace(/\n/g, '\\\\n');
    if (this.options.rawdom) {
      // We are thinking in Elements and we have textual HTML.  Let's fix that
      this.buf_push(this.elParentRef() + ".innerHTML += '" + str + "'")
    } else {
      this.buffer(str);
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
          this.buffer('\\n');
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
      this.buffer(this.doctype);
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
            this.buf_push('attributes: __jade.merge({' + val.buf + '}, attributes),');
            this.buf_push('escaped: __jade.merge(' + JSON.stringify(val.escaped) + ', escaped, true)');
          } else {
            this.buf_push('attributes: {' + val.buf + '},');
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
      , pp = this.pp;

    // Hack to support 'for val,key of obj' in CoffeeScript w/o changing the lexer+parser
    if(
      (tag.name == 'for')
      && (tag.attrs.length == 0)
      && (tag.block && tag.block.nodes && tag.block.nodes[0] && tag.block.nodes[0].val))
    {
      this.buf_push('for ' + tag.block.nodes[0].val)
      this.indent_code();
      block = tag.block.clone();
      block.nodes.shift();
      this.visit(block);
      this.outdent_code();
      return;
    }

    if (tag.buffer && !this.options.rawdom) {
      name = "' + (" + name + ") + '";
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
      var nameStr = (tag.buffer) ? "(" + name + ")" :  "'" + name + "'";
      this.buf_push(this.elRef() + ' = ' + this.elParentRef() + '.appendChild(document.createElement(' + nameStr + '))')
    } else {
      this.buffer('<' + name);
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
        this.buffer(this.terse ? '>' : '/>')
      }
    } else {
      if (!this.options.rawdom) this.buffer('>');

      this.indent_html();

      // visit Code (eg "div.class= code)
      if (tag.code) this.visitCode(tag.code);

      // visit Block
      this.inside_pre = ('pre' == tag.name);
      if(this.options.rawdom && name == 'script') {
        this.buf_push('buf = []');
        this.options.rawdom = false;
        this.visit(tag.block);
        this.flushBuffer(); // need to flush any textual stuff before returning to rawDom mode
        this.options.rawdom = true;
        this.buf_push('__jade.domAppendText(' + this.elParentRef() + ', buf.join(\'\'))');
      } else {
        this.visit(tag.block);
      }
      this.inside_pre = false;

      // pretty print
      if (!tag.isInline() && 'pre' != tag.name && !tag.canInline())
        this.newline_html(-1);

      this.outdent_html();

      if (!this.options.rawdom) this.buffer('</' + name + '>');
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
    this.buffer(utils.text(filters(filter.name, text, filter.attrs).replace(/\\/g, '\\\\'), this.options.coffee));
  },

  /**
   * Visit `text` node.
   *
   * @param {Text} text
   * @api public
   */

  visitText: function(text){
    var self = this;
    text = text.val
      .replace(/\\/g, '__BACKSLASH__')
      .replace(/'/g, "\\'")
      .replace(/(__BACKSLASH__)?([#!]){(.*?)}/g, function(str, backslash, flag, code) {
        if (backslash) {
          return str.slice("__BACKSLASH__".length);
        } else {
          code = code
            .replace(/\\'/g, "'")
            .replace(/__BACKSLASH__/, '\\');

          var content = "";
          // Transition text-2-code
          if ('!' == flag) {
            // Raw html
            if (self.options.rawdom) {
              // May contain HTML tags and needs to be parsed
              content += "__HTML_BOUNDARY__";
            } else {
              content += "' + (";
            }
          } else {
            // Pure text, needs to be escaped
            if (self.options.rawdom) {
              // RowDom can insert text directly so no need for escaping
              content += "' + (";
            } else {
              content += "' + __jade.escape(";
            }
          }

          // Wrap code in NULL handling
          if (self.options.coffee) {
            content += "(" + code + ") ? ''";
          } else {
            content += "(interp = " + code + ") == null ? '' : interp";
          }

          // Transition code-2-text
          if ('!' == flag && self.options.rawdom) {
            content += "__HTML_BOUNDARY__";
          } else {
            content += ") + '";
          }
          return content;
        }
      })
      .replace(/\n/g, '\\n')

    if (this.inside_pre) {
      text = escape_html(text);
    }
    text = text.replace(/__BACKSLASH__/g, '\\\\');

    var toks = text.split(/__HTML_BOUNDARY__/g);
    for (var i = 0,l=toks.length; i < l; i++) {
      var tok = toks[i];
      if(i % 2 == 0) {
        this.buffer(tok);
      } else {
        // Unescaped text: Might have HTML elements inside and must be parsed
        this.buf_push_stmt('__jade.domAppendContent(' + this.elParentRef() + ', (' + tok + '))')
      }
    }
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
      this.buf_push('__jade.domAppendComment(' + this.elParentRef() + ", '" + comment.val + "')");
    } else {
      this.newline_html();
      this.buffer('<!--' + utils.escape(comment.val) + '-->');
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
      this.buffer('<!--[' + comment.val.trim() + ']>');
      this.visit(comment.block);
      this.buffer('<![endif]-->');
    } else {
      this.buffer('<!--' + comment.val);
      this.visit(comment.block);
      this.buffer('-->');
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
        if (code.escape) val = '__jade.escape(' + val + ')';
        this.buf_push_squared("(" + val + ")");
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
        this.buf_push_squared(
          "__jade.attrs(__jade.merge({ " + val.buf + " }, attributes), __jade.merge("
            + JSON.stringify(val.escaped)
            + ", escaped, true))"
        );
      } else if (val.constant) {
        eval('var buf={' + val.buf + '};');
        this.buffer(runtime.attrs(buf, val.escaped), true);
      } else {
        this.buf_push_squared("__jade.attrs(" + val.json + ", " + JSON.stringify(val.escaped) + ")");
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
      buf: buf.join(', '),
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
