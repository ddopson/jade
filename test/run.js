
/**
 * Module dependencies.
 */

var jade = require('../')
  , fs = require('fs')
  , Coffee = require('coffee-script')
  , vm = require('vm');

// test cases

function casesForExt(ext) {
  return fs.readdirSync('test/cases').filter(function(file){
    return file.match(ext)
  }).map(function(file){
    return file.replace(ext, '')
  });
}

casesForExt(/[.]jade$/).forEach(function(test){
  var name = test.replace(/[-.]/g, ' ');
  it(name, function(){
    var path = 'test/cases/' + test + '.jade';
    var str = fs.readFileSync(path, 'utf8');
    var html = fs.readFileSync('test/cases/' + test + '.html', 'utf8').trim().replace(/\r/g, '');
    var fn = jade.compile(str, { filename: path, pretty: true });
    var actual = fn({ title: 'Jade' });
    actual.trim().should.equal(html);
  })
});


function lineify(str) {
  var n = 0;
  if (!(typeof str == 'string')) return str
  return str.replace(/^/mg, function () { return "" + ++n + "  "});
}

casesForExt(/[.]jadec$/).forEach(function(test){
  var name = test.replace(/[-.]/g, ' ');
  it(name, function(){
    var path = 'test/cases/' + test + '.jadec';
    var str = fs.readFileSync(path, 'utf8');
    var html = fs.readFileSync('test/cases/' + test + '.html', 'utf8').trim().replace(/\r/g, '');
    var coffee = jade.compile(str, { filename: path, pretty: true, coffee: true });
    var n = 0;
    var js
    try {
      js = Coffee.compile(coffee, {bare: true})
      var ctx = vm.Script.createContext()
      ctx.runtime = jade.runtime;
      var fn = vm.runInContext(js, ctx)
      var rt = jade.runtime;
      var actual = fn({ title: 'Jade', interpolated: 'blah blah' }, rt.attrs, rt.escape, rt.rethrow, rt.merge);
      actual.trim().should.equal(html);
    } catch (e) {
      console.log("\nCoffeeScript:\n" + lineify(coffee));
      console.log("\nJavaScript:\n" + lineify(js));
      throw e
    }
  })
});
