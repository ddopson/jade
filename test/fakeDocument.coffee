HtmlParser = require './htmlparser'
JadeRt = require '../lib/runtime'
Jade = require '../lib/jade'


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
      for n in el.childNodes
        n.parent = @
    else
      @childNodes.push(el)
      el.parent = @

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

        end: (tag, explicit) ->
          unless parent.tag == tag
            throw new Error("uhoh, this shouldn't happen")

          parent.html_no_close = true unless explicit
          parent = stack.pop()

        chars: (text) ->
          parent.appendChild(new TextNode(text))

        comment: (text) ->
          parent.appendChild(new CommentNode(text))

    return @

  setAttribute: (key, val) ->
    if typeof @attributes[key] == 'undefined'
      @attributes[key] = @attributes.length
    idx = @attributes[key]
    @attributes[idx] = [key, val]

  toHtml: (indent = "") ->
    content = "<#{@tag}"
    for attr in @attributes
      [key, val] = attr
      if key.indexOf('data') == 0 and is_valid_json(val)
        content += " #{key}='#{val}'"
      else
        content += " #{key}=\"#{val}\""

    if (clazz = @classList.toString()) != ""
      content += " class=\"#{clazz}\""

    if @test_hook_is_self_closing
      content += "/>"
    else
      content += ">"
      for child in @childNodes
        content += child.toHtml(indent + "  ")
      content += "</#{@tag}>" unless @html_no_close

    return content
  testHookSelfClosing: ->
    @test_hook_is_self_closing = true

class TextNode
  constructor: (@txt) ->
  toHtml: ->
    if @parent.tag == 'script'
      # Don't unescape text on script nodes
      @txt
    else
      @txt
        .replace(/&(?!\w+;)/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

class CommentNode
  constructor: (@txt) ->
  toHtml: ->
    "<!--#{@txt}-->"

module.exports = new Document()
