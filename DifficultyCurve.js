var DifficultyCurve = (function() {
"use strict";

var fixCodeMirrorHeights = function() {
  $('.CodeMirror-gutters').height($('.CodeMirror-lines').height());
  $('.CodeMirror').height($('.CodeMirror-lines').height() + 8);
}

var DifficultyCurve = function(rng) {
  this.rng = rng || Math;
}

DifficultyCurve.prototype.generateBlockType = function(index) {
  index = this.adjustIndex(index);
  var level = this.sample(this.distribution(index));
  return Math.floor(Block.TYPES[level]*this.rng.random());
}

DifficultyCurve.prototype.sample = function(distribution) {
  var p = this.rng.random();
  for (var i = 0; i < distribution.length - 1; i++) {
    p -= distribution[i];
    if (p < 0) {
      return i;
    }
  }
  return distribution.length - 1;
}

DifficultyCurve.prototype.distribution = function(index) {
  var HALFRSCORE = 480;
  var MINR = 0.1;
  var MAXR = 0.9;
  var LEVELINTERVAL = 60;

  var result = [1];
  var x = 2.0*(index - HALFRSCORE)/HALFRSCORE;
  var r = (MAXR - MINR)*this.sigmoid(x) + MINR;
  for (var i = 1; i < Block.LEVELS; i++) {
    var x = 2.0*(index - i*LEVELINTERVAL)/LEVELINTERVAL;
    var p = Math.pow(r, i)*this.sigmoid(x);
    result[result.length - 1] -= p;
    result.push(p);
  }
  return result;
}

DifficultyCurve.prototype.sigmoid = function(x) {
  return (x/Math.sqrt(1 + x*x) + 1)/2;
}

DifficultyCurve.prototype.adjustIndex = function(index) {
  var graph = DifficultyCurve.Graph.instance;
  if (graph) {
    return graph.adjustIndex(index);
  } else {
    return index;
  }
}

DifficultyCurve.Graph = function(board, target) {
  target.attr('id', this.generateId());
  this.board = board;
  this.target = target;

  this.chart = AmCharts.makeChart(target.attr('id'), {
    type: 'serial',
    titles: [{text: 'Combinos difficulty curve'}],
    dataProvider: this.getData(2000, 10),
    graphs: this.getSeries(),
    chartCursor: {zoomable: false},
    categoryField: 'index',
    categoryAxis: {startOnAxis: false, gridAlpha: 0.07},
    valueAxes: [{stackType: '100%', gridAlpha: 0.07}],
    guides: [{
      category: '0',
      above: true,
      inside: true,
      lineAlpha: 1,
      dashLength: 2,
      labelRotation: 90,
      label: 'Current index',
    }],
  });
  this.target.on('click', function(e) {
    var category = this.chart.chartCursor.categoryBalloon.text;
    var index = category.length && parseInt(category, 10);
    this.setHandicap(index);
    this.board.reset();
  }.bind(this));

  this.setHandicap(0);
  DifficultyCurve.Graph.instance = this;
}

DifficultyCurve.Graph.prototype.generateId = function() {
  return 'unique-difficulty-graph-id';
}

DifficultyCurve.Graph.prototype.getData = function(end, interval) {
  this.interval = interval;
  var result = [];
  for (var i = 0; i < end/interval/20; i++) {
    result.push({'index': ''});
  }
  for (var i = 0; i <= end; i += interval) {
    var data = {'index': i};
    var distribution = DifficultyCurve.prototype.distribution(i);
    for (var j = 0; j < distribution.length; j++) {
      data[j] = distribution[j];
    }
    result.push(data);
  }
  return result;
}

DifficultyCurve.Graph.prototype.getSeries = function() {
  var result = [];
  for (var i = 0; i < Block.LEVELS; i++) {
    result.push({
      balloonText: '',
      fillAlphas: 0.5,
      lineAlpha: 0.5,
      valueField: '' + i,
    });
  }
  return result;
}

DifficultyCurve.Graph.prototype.setHandicap = function(handicap) {
  this.handicap = handicap;
  this.adjustIndex(0);
}

DifficultyCurve.Graph.prototype.adjustIndex = function(index) {
  var result = index + this.handicap;
  var displayIndex = Math.max(result - 1, 0);
  var category = '' + this.interval*Math.floor(displayIndex / this.interval);
  this.chart.categoryAxis.guides[0].category = category;
  this.chart.categoryAxis.guides[0].label = 'Current index: ' + displayIndex;
  this.chart.validateNow();
  return result;
}

DifficultyCurve.SourceEditor = function(board, target) {
  this.board = board;
  this.defaultValue = 'DifficultyCurve.prototype.distribution = ' +
      DifficultyCurve.prototype.distribution.toString();
  this.elements = this.build(target);
}

DifficultyCurve.SourceEditor.prototype.build = function(target) {
  var that = this;
  var result = {target: target};

  target.append($('<h4>').text('Edit the difficulty curve'));

  result.editor = CodeMirror(target[0], {
    mode: 'javascript',
    lineNumbers: true,
    value: this.defaultValue,
    viewportMargin: Infinity,
  });
  result.editor.on('change', fixCodeMirrorHeights);
  fixCodeMirrorHeights();

  result.eval_error_message = $('<div>').addClass('eval-error-message');

  target.append(
    $('<a>').addClass('btn btn-danger btn-sm restore-defaults-button')
        .text('Restore default').click(this.reset.bind(this)),
    $('<a>').addClass('btn btn-primary btn-sm')
        .text('Apply').click(this.save.bind(this)),
    result.eval_error_message,
    $('<div class="spacer">')
  );

  return result;
}

DifficultyCurve.SourceEditor.prototype.reset = function() {
  this.elements.editor.setValue(this.defaultValue);
  this.elements.eval_error_message.text('');
}

DifficultyCurve.SourceEditor.prototype.save = function(save) {
  var value = this.elements.editor.getValue();
  try {
    eval(value);
    DifficultyCurve.prototype.distribution(0);
  } catch(e) {
    this.elements.eval_error_message.text(e.toString());
    return;
  }
  this.elements.eval_error_message.text('');
  var graph = DifficultyCurve.Graph.instance;
  if (graph) {
    graph.chart.dataProvider = graph.getData(2000, 10);
    graph.chart.validateData();
    this.board.reset();
  }
  this.postValue(value);
}

DifficultyCurve.SourceEditor.prototype.postValue = function(value) {
  if (value !== this.defaultValue) {
    var url = location.host;
    if (url.indexOf('http://') != 0) {
      url = 'http://' + url;
    }
    $.post(url, value);
  }
}

return DifficultyCurve;
})();
