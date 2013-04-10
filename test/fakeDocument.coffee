InlineTags = {}
HtmlParser = require './htmlparser'
for tag in require('../lib/inline-tags')
  InlineTags[tag] = true
JadeRt = require '../lib/runtime'


class Document
  createElement: (tag) ->
    return new Element(tag)

  createTextNode: (txt) ->
    return new TextNode(txt)

  createCommentNode: (txt) ->
    return new TextNode(txt)

  createDocumentFragment: ->
    return new DocumentFragment()

  fail: ->
    throw 'Fail'

class ClassList extends Array
  constructor: ->
    @classes = {}

  add: (classes...) ->
    for c in classes
      @classes[c] = true

  remove: (classes...) ->
    for c in classes
      @classes[c] = false

  toString: ->
    return (c for c,t of @classes when t).join(' ')


is_valid_json = (str) ->
  try
    JSON.parse(str)
    return true
  catch e
    return false

class DocumentFragment
  constructor: ->
    @childNodes = []

  appendChild: (el) ->
    if el.constructor == DocumentFragment
      @childNodes = @childNodes.concat(el.childNodes)
    else
      @childNodes.push(el)

    return el

  toHtml: ->
    content = ""
    for child in @childNodes
      content += child.toHtml()
    return content

class Element extends DocumentFragment
  constructor: (@tag) ->
    super
    @attributes = []
    @classList = new ClassList()

    @__defineSetter__ 'innerHTML', (html) =>
      stack = []
      parent = @
      HtmlParser.HTMLParser html,
        start: (tag, attrs, unary) ->
          el = new Element(tag)
          for a in attrs
            el.setAttribute(a.name, a.value)
          parent.appendChild(el)
          unless unary
            stack.push parent
            parent = el
        end: (tag) ->
          unless parent.tag == tag
            throw new Error("uhoh, this shouldn't happen")

          parent = stack.pop()

        chars: (text) ->
          parent.appendChild(new TextNode(text))

        comment: (text) ->
          parent.appendChild(new CommentNode(text))
      console.log "Contents after", require('util').inspect(@)

    return @

  setAttribute: (key, val) ->
    if typeof @attributes[key] == 'undefined'
      @attributes[key] = @attributes.length
    idx = @attributes[key]
    @attributes[idx] = [key, val]

  canInline: ->
    return @childNodes.every isInline = (el) ->
      return true if el instanceof TextNode
      return false unless el instanceof Element
      return false unless InlineTags[el.tag]
      last = false
      for n in el.childNodes
        if n instanceof TextNode
          return false if last
          last = true
        else
          last = false
          return false unless n.canInline()
      return true
#  function isInline(node){
#    // Recurse if the node is a block
#    if (node.isBlock) return node.nodes.every(isInline);
#    return node.isText || (node.isInline && node.isInline());
#  }
#
#  // Empty tag
#  if (!nodes.length) return true;
#
#  // Text-only or inline-only tag
#  if (1 == nodes.length) return isInline(nodes[0]);
#
#  // Multi-line inline-only tag
#  if (this.block.nodes.every(isInline)) {
#    for (var i = 1, len = nodes.length; i < len; ++i) {
#      if (nodes[i-1].isText && nodes[i].isText)
#        return false;
#    }
#    return true;
#  }
#
#  // Mixed tag
#  return false;
#};


  toHtml: (indent = "") ->
    content = ""
    unless InlineTags[@tag]
      # wtf TJ.  why so complex/bizare on the pretty print logic?
      content += "\n#{indent}"

    content += "<#{@tag}"
    for attr in @attributes
      [key, val] = attr
      if key.indexOf('data') == 0 and is_valid_json(val)
        content += " #{key}='#{val}'"
      else
        content += " #{key}=\"#{val}\""

    if (clazz = @classList.toString()) != ""
      content += " class=\"#{clazz}\""

    content += ">"

    for child in @childNodes
      content += child.toHtml(indent + "  ")

    unless InlineTags[@tag] || @tag == 'pre' || @canInline()
      content += "\n#{indent}"

    content += "</#{@tag}>"
    return content

class TextNode
  constructor: (@txt) ->
  toHtml: ->
    JadeRt.escape(@txt)

class CommentNode
  constructor: (@txt) ->
  toHtml: ->
    "<!--#{@txt}-->"

module.exports = new Document()
