var d3 = require('@wsb/d3api');
var fs = require('fs');
var path = require('path');
var async = require('async');

var imageDataPath = path.resolve(__dirname, '../static/dogbreeder_data.js');

var data = { images: [] };

d3.categories(function(err, cats) {
  data.cats = cats.filter(function(c) { return c.str_id === 'dogbreeder' });

  var jobs = [];

  jobs.push(getImagesJob({ str_id: 'dogbreeder' }));
  jobs.push(getImagesJob({ str_id: 'petbreeders' }));

  async.series(jobs, function() {

    var json = JSON.stringify(data, null, '\t');
    fs.writeFileSync(imageDataPath, 'window.data = ' + json + ';', 'utf8');

  });
});

function getImagesJob(cat) {
  return function(cb) {
    d3.stockPhotosByCategory(cat.str_id, function(err, images) {
      console.log('cat:', cat.str_id, err, images && images.results && images.results.length);
      if (images && images.results) {
        images.results.forEach(function(img) {
          data.images.push(img);
        });
      }

      cb();
    });
  }
}