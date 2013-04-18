
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
  var UNINDENT = -78;
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
  this.indents = 0;
  this.parentIndents = 0;
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
    if (this.options.coffee) {
      this.buf = [];
      if (this.pp) this.buf_push("__indent = [];");
    } else {
      this.buf = ['var interp;'];
      if (this.pp) this.buf_push("var __indent = [];");
    }

    this.visit(this.node);
    this.flushBuffer();

    if (this.options.coffee) {
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
        } else if (el === UNINDENT) {
          indent--;
        } else {
          if (i > 0) {
            content += "\n";
          }
          content += indents[indent] + el;
        }
      }
      return content;
    } else {
      return this.buf.join('\n');
    }
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

  pp_push: function(){
    if (this.options.coffee) {
      this.buf_push("__indent.push '" + Array(this.indents + 1).join('  ') + "'")
    } else {
      this.buf_push("__indent.push('" + Array(this.indents + 1).join('  ') + "');")
    }
  },

  pp_pop: function(){
    if (this.options.coffee) {
      this.buf_push("__indent.pop()");
    } else {
      this.buf_push("__indent.pop();");
    }
  },

  flushBuffer: function() {
    if (this.lastBuffered === "") return;
    if (this.options.rawdom) {
      this.buf.push("__jade.domAppendText(" + this.lastBufferedElRef + ", '" + this.lastBuffered + "')")
    } else {
      if (this.options.coffee) {
        this.buf.push("buf.push('" + this.lastBuffered + "')");
      } else {
        this.buf.push("buf.push('" + this.lastBuffered + "');");
      }
    }
    this.lastBuffered  = "";
  },

  buffer: function(str, esc){
    if (esc) str = utils.escape(str);
    if (this.lastBuffered !== "" && this.indents != this.lastBufferedIndent) {
      // If we popped up a level, flush the buffer so the new text shows up after the close tag
      this.flushBuffer();
    }

    this.lastBuffered += str;
    if(this.options.coffee) this.buf.push('# buffer: ' + JSON.stringify(str));
    this.lastBufferedElRef = this.elRef();
    this.lastBufferedIndent = this.indents;
  },

  /**
  * Get a reference to the current 'parent' element (the node we will append new content to)
  * This is a helper for the RawDOM scenario
  */
  elParentRef: function() {
      return '_el' + (this.indents-1);
  },

  /**
  * Get a reference to the 'current' element (the node we are operating on)
  * This is a helper for the RawDOM scenario
  */
  elRef: function () {
      return '_el' + (this.indents);
  },

  /**
   * Buffer an indent based on the current `indent`
   * property and an additional `offset`.
   *
   * @param {Number} offset
   * @param {Boolean} newline
   * @api public
   */

  prettyIndent: function(offset, newline){
    offset = offset || 0;
    newline = newline ? '\\n' : '';
    this.buffer(newline + Array(this.indents + offset).join('  '));
    if (this.parentIndents)
      this.buf_push("buf.push.apply(buf, __indent);");
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
      this.buf_push(INDENT);
      this.visit(node.block);
      this.buf_push(UNINDENT);
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
      this.buf_push(INDENT)
      this.visit(node.block);
      this.buf_push(UNINDENT);
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
      this.buf_push(this.elRef() + ".innerHTML += '" + str + "'")
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
      , escape = this.escape
      , pp = this.pp

    // Block keyword has a special meaning in mixins
    if (this.parentIndents && block.mode) {
      if (pp) this.pp_push();
      this.buf_push('block && block();');
      if (pp) this.pp_pop();
      return;
    }

    // Pretty print multi-line text
    if (pp && len > 1 && !escape && block.nodes[0].isText && block.nodes[1].isText)
      this.prettyIndent(1, true);

    for (var i = 0; i < len; ++i) {
      if (i > 0 && block.nodes[i].isText && block.nodes[i-1].isText) {
        this.buffer('\\n');
        if (pp && !escape) {
          this.prettyIndent(1, false);
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

    if (this.doctype) this.buffer(this.doctype);
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
      , block = mixin.block
      , attrs = mixin.attrs
      , pp = this.pp;

    if (mixin.call) {
      if (pp) this.pp_push();
      if (block || attrs.length) {

        if (this.options.coffee) {
          this.buf_push(name + '({')
          this.buf_push(INDENT)
        } else {
          this.buf_push(name + '.call({');
        }


        if (block) {
          if (this.options.coffee) {
            this.buf_push('block: (() ->')
            this.buf_push(INDENT)
          } else {
            this.buf_push('block: function(){');
          }

          // Render block with no indents, dynamically added when rendered
          this.parentIndents++;
          var _indents = this.indents;
          this.indents = 0;
          this.visit(mixin.block);
          this.indents = _indents;
          this.parentIndents--;

          if (this.options.coffee) {
            this.buf_push(UNINDENT)
            if (attrs.length) {
              this.buf_push('),');
            } else {
              this.buf_push(')');
            }
          } else {
            if (attrs.length) {
              this.buf_push('},');
            } else {
              this.buf_push('}');
            }
          }
        }

        if (attrs.length) {
          var val = this.attrs(attrs);
          if (this.options.coffee) {
            if (val.inherits) {
              this.buf_push('attributes: __jade.merge({' + val.buf + '}, attributes), escaped: __jade.merge(' + JSON.stringify(val.escaped) + ', escaped, true)');
            } else {
              this.buf_push('attributes: {' + val.buf + '}, escaped: ' + JSON.stringify(val.escaped));
            }
          } else {
            if (val.inherits) {
              this.buf_push('attributes: merge({' + val.buf + '}, attributes), escaped: merge(' + JSON.stringify(val.escaped) + ', escaped, true)');
            } else {
              this.buf_push('attributes: {' + val.buf + '}, escaped: ' + JSON.stringify(val.escaped));
            }
          }
        }

        if (this.options.coffee) {
          this.buf_push(UNINDENT);
          if (args) {
            this.buf_push('}, ' + args + ')');
          } else {
            this.buf_push('})');
          }
        } else {
          if (args) {
            this.buf_push('}, ' + args + ');');
          } else {
            this.buf_push('});');
          }
        }

      } else {
        if (this.options.coffee) {
          if (args) {
            this.buf_push(name + '({}, ' + args + ')');
          } else {
            this.buf_push(name + '({})');
          }
        } else {
          this.buf_push(name + '(' + args + ');');
        }
      }
      if (pp) this.pp_pop();
    } else {
      if (this.options.coffee) {
        if (args) {
          this.buf_push(name + ' = ((mixin_context, ' + args + ') ->');
        } else {
          this.buf_push(name + ' = ((mixin_context) ->');
        }
        this.buf_push(INDENT)
        this.buf_push('block = mixin_context.block; attributes = mixin_context.attributes || {}; escaped = mixin_context.escaped || {}');
      } else {
        this.buf_push('var ' + name + ' = function(' + args + '){');
        this.buf_push('var block = this.block, attributes = this.attributes || {}, escaped = this.escaped || {};');
      }
      this.parentIndents++;
      this.visit(block);
      this.parentIndents--;
      if (this.options.coffee) {
        this.buf_push(UNINDENT)
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
    this.indents++;
    var name = tag.name
      , pp = this.pp;

    // Hack to support 'for val,key of obj' in CoffeeScript w/o changing the lexer+parser
    if(
      (tag.name == 'for')
      && (tag.attrs.length == 0)
      && (tag.block && tag.block.nodes && tag.block.nodes[0] && tag.block.nodes[0].val))
    {
      this.buf_push('for ' + tag.block.nodes[0].val)
      this.buf_push(INDENT);
      block = tag.block.clone();
      block.nodes.shift();
      this.visit(block);
      this.buf_push(UNINDENT);
      return;
    }

    if (tag.buffer) name = "' + (" + name + ") + '";

    if (!this.hasCompiledTag) {
      if (!this.hasCompiledDoctype && 'html' == name) {
        this.visitDoctype();
      }
      this.hasCompiledTag = true;
    }

    // pretty print
    if (pp && !tag.isInline()) {
      this.indents--;
      this.prettyIndent(1, true);
      this.indents++;
    }

    if (this.options.rawdom) {
      this.buf_push(this.elRef() + ' = ' + this.elParentRef() + '.appendChild(document.createElement("' + name + '"))')
      if (tag.attrs.length) this.visitAttributes(tag.attrs);
      if (tag.code) this.visitCode(tag.code);
      this.escape = ('pre' == tag.name);
      if(name == 'script') {
        this.buf_push('buf = []');
        this.options.rawdom = false;
        this.visit(tag.block);
        this.flushBuffer(); // need to flush any textual stuff before returning to rawDom mode
        this.options.rawdom = true;
        this.buf_push('__jade.domAppendText(' + this.elRef() + ', buf.join(\'\'))');
      } else {
        this.visit(tag.block);
      }
      this.elidx--;
      // pretty print
      if (pp && !tag.isInline() && 'pre' != tag.name && !tag.canInline())
        this.prettyIndent(0, true);
    } else if ((~selfClosing.indexOf(name) || tag.selfClosing) && !this.xml) {
      // This block is stupid.  self-closing tags are stupid.
      this.buffer('<' + name);
      this.visitAttributes(tag.attrs);
      this.terse
        ? this.buffer('>')
        : this.buffer('/>');
    } else {
      // Optimize attributes buffering
      if (tag.attrs.length) {
        this.buffer('<' + name);
        if (tag.attrs.length) this.visitAttributes(tag.attrs);
        this.buffer('>');
      } else {
        this.buffer('<' + name + '>');
      }
      if (tag.code) this.visitCode(tag.code);
      this.escape = ('pre' == tag.name);
      this.visit(tag.block);

      // pretty print
      if (pp && !tag.isInline() && 'pre' != tag.name && !tag.canInline())
        this.prettyIndent(0, true);

      this.buffer('</' + name + '>');
    }
    this.indents--;
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
    text = text.val.replace(/\\/g, '__BACKSLASH__')
    text = utils.text(text, this.options.coffee);
    if (this.escape) {
      text = escape(text);
    }
    text = text.replace(/__BACKSLASH__/g, '\\\\');
    this.buffer(text);
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
      if (this.pp) this.prettyIndent(1, true);
      this.buf_push('__jade.domAppendComment(' + this.elRef() + ", '" + comment.val + "')");
    } else {
      if (this.pp) this.prettyIndent(1, true);
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
      //this.buf_push('__jade.domAppendComment(' + this.elRef() + ", '" + comment.val + "')");
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
    if (this.options.coffee) {
      // Buffer code
      if (code.buffer) {
        if (this.options.rawdom) {
          if (code.escape) {
            // Escaped text: Since it's being 'escaped', the text won't turn into any HTML elements and we can insert it directly as text
            this.buf_push('__jade.domAppendText(' + this.elRef() + ', (' + code.val.trimLeft() + '))')
          } else {
            // Unescaped text: Might have HTML elements inside and must be parsed
            this.buf_push('__jade.domAppendContent(' + this.elRef() + ', (' + code.val.trimLeft() + '))')
          }
        } else {
          this.buf_push('__val__ = (' + code.val.trimLeft() + ") ? ''");
          var val = '__val__';
          if (code.escape) {
            val = '__jade.escape(' + val + ')';
          }
          this.buf_push("buf.push(" + val + ")");
        }
      } else {
        this.buf_push(code.val.trimLeft());
      }

      // Block support
      if (code.block) {
        this.buf_push(INDENT);
        this.visit(code.block);
        this.buf_push(UNINDENT);
      }
    } else {
      // Buffer code
      if (code.buffer) {
        if (this.options.rawdom) {
          if (code.escape) {
            // Escaped text: Since it's being 'escaped', the text won't turn into any HTML elements and we can insert it directly as text
            this.buf_push('__jade.domAppendText(' + this.elRef() + ', (' + code.val.trimLeft() + '))')
          } else {
            // Unescaped text: Might have HTML elements inside and must be parsed
            this.buf_push('__jade.domAppendContent(' + this.elRef() + ', (' + code.val.trimLeft() + '))')
          }
        } else {
          this.buf_push('var __val__ = ' + code.val.trimLeft());
          var val = 'null == __val__ ? "" : __val__';
          if (code.escape) val = 'escape(' + val + ')';
          this.buf_push("buf.push(" + val + ");");
        }
      } else {
        this.buf_push(code.val.trimLeft());
      }

      // Block support
      if (code.block) {
        if (!code.buffer) this.buf_push('{');
        this.visit(code.block);
        if (!code.buffer) this.buf_push('}');
      }
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
      this.buf_push(INDENT);
      this.buf_push('for ' + each.val + ',' + each.key + ' in ' + each.obj)
      this.buf_push(INDENT);
      if (each.alternative) {
        this.buf_push('$$_alt = false')
      }
      this.visit(each.block);
      this.buf_push(UNINDENT);
      this.buf_push(UNINDENT);
      this.buf_push('else');
      this.buf_push(INDENT);
      this.buf_push('for ' + each.key + ',' + each.val + ' of ' + each.obj)
      this.buf_push(INDENT);
      if (each.alternative) {
        this.buf_push('$$_alt = false')
      }
      this.visit(each.block);
      this.buf_push(UNINDENT);
      this.buf_push(UNINDENT);

      if (each.alternative) {
        this.buf_push('if $$_alt')
        this.buf_push(INDENT);
        this.visit(each.alternative);
        this.buf_push(UNINDENT);
      }
    } else {
      this.buf_push(''
        + '// iterate ' + each.obj + '\n'
        + ';(function(){\n'
        + '  if (\'number\' == typeof ' + each.obj + '.length) {\n');

      if (each.alternative) {
        this.buf_push('  if (' + each.obj + '.length) {');
      }

      this.buf_push(''
        + '    for (var ' + each.key + ' = 0, $$l = ' + each.obj + '.length; ' + each.key + ' < $$l; ' + each.key + '++) {\n'
        + '      var ' + each.val + ' = ' + each.obj + '[' + each.key + '];\n');

      this.visit(each.block);

      this.buf_push('    }\n');

      if (each.alternative) {
        this.buf_push('  } else {');
        this.visit(each.alternative);
        this.buf_push('  }');
      }

      this.buf_push(''
        + '  } else {\n'
        + '    var $$l = 0;\n'
        + '    for (var ' + each.key + ' in ' + each.obj + ') {\n'
        + '      $$l++;'
        // if browser
        // + '      if (' + each.obj + '.hasOwnProperty(' + each.key + ')){'
        // end
        + '      var ' + each.val + ' = ' + each.obj + '[' + each.key + '];\n');

      this.visit(each.block);

      // if browser
      // this.buf_push('      }\n');
      // end

      this.buf_push('    }\n');
      if (each.alternative) {
        this.buf_push('    if ($$l === 0) {');
        this.visit(each.alternative);
        this.buf_push('    }');
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
          this.buf_push("__jade.domSetAttributes(" + this.elRef() + ", (" + attr.val + "))");
        } else if (attr.name.indexOf('data') == 0) {
          this.buf_push("__jade.domSetDataAttribute(" + this.elRef() + ", '" + attr.name + "', (" + attr.val + "))");
        } else {
          this.buf_push("__jade.domSetAttribute(" + this.elRef() + ", '" + attr.name + "', (" + attr.val + "))");
        }
      }
    } else {
      var val = this.attrs(attrs);
      if (val.inherits) {
        if (this.options.coffee) {
          this.buf_push("buf.push __jade.attrs(__jade.merge({ " + val.buf + " }, attributes), __jade.merge(" + JSON.stringify(val.escaped) + ", escaped, true))");
        } else {
          this.buf_push("buf.push(attrs(merge({ " + val.buf + " }, attributes), merge(" + JSON.stringify(val.escaped) + ", escaped, true)));");
        }
      } else if (val.constant) {
        eval('var buf={' + val.buf + '};');
        this.buffer(runtime.attrs(buf, val.escaped), true);
      } else {
        if (this.options.coffee) {
          this.buf_push("buf.push __jade.attrs(" + val.json + ", " + JSON.stringify(val.escaped) + ")");
        } else {
          this.buf_push("buf.push(attrs(" + val.json + ", " + JSON.stringify(val.escaped) + "));");
        }
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

function escape(html){
  return String(html)
    .replace(/&(?!\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
