var http = require('http');
var express = require('express');
var request = require('request');
var fs = require('fs');
var path = require('path');
var cv = require('opencv');
var async = require('async');

var withVisionPath = path.resolve('./static/withVision.jpg');
var smartViewPath = path.resolve('./static/smartView.jpg');

var app = express();

app.use(express.static('static'));

app.get('/image/withVision', function(req, res) {
  request({ url: req.query.url, encoding: null }, function(err, imgRes, body) {
    if (err) {
      res.statusCode = 404;
      return void res.end();
    }
    //console.log('request', err, imgRes.statusCode, body.length);

    async.auto({
      image: function(cb) {
        cv.readImage(body, function(err, image) {
          /*if (image) {
            var height = 480;
            var width = Math.round((image.width() / image.height()) * height);
            image.resize(width, height);
          }*/
          cb(err, image);
        });
      },
      newImage: ['image', function(results, cb) {
        cb(null, results.image.copy());
      }],
      face: ['newImage', getFaces([0, 0, 255])],
      //car_side: ['newImage', getObjectDetector('hogcascade_cars_sideview.xml', [55, 55, 155], 5)],
      //car_frontback: ['newImage', getObjectDetector('lbpcascade_cars_frontbackview.xml', [44, 44, 255], 5)],
      features: ['newImage', getFeatures([0, 255, 255], 2, [0, 255, 255])],
      contours: ['newImage', contours([250, 250, 250], 2, [250, 250, 250])],
    }, function(err, results) {
      var newImage = results.newImage.toBuffer();

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', newImage.length);

      res.end(newImage);

      //results.newImage.save(withVisionPath);
      //fs.writeFileSync(testFilePath, newImage);
    });

  });
});

app.get('/image/smartView', function(req, res) {
  request({ url: req.query.url, encoding: null }, function(err, imgRes, body) {
    if (err) {
      res.statusCode = 404;
      return void res.end();
    }

    var width = parseInt(req.query.width);
    var height = parseInt(req.query.height);

    //console.log('request', err, imgRes.statusCode, body.length);

    async.auto({
      image: function(cb) {
        cv.readImage(body, function(err, image) {
          /*if (image) {
            var height = 480;
            var width = Math.round((image.width() / image.height()) * height);
            image.resize(width, height);
          }*/
          cb(err, image);
        });
      },
      newImage: ['image', function(results, cb) {
        cb(null, results.image.copy());
      }],
      faces: ['newImage', getFaces()],
      features: ['newImage', getFeatures()],
      contours: ['newImage', contours()],
      resizeAndCrop: ['newImage', 'features', 'contours', 'faces', resizeAndCrop(width, height)]
    }, function(err, results) {
      var newImage = results.newImage.toBuffer();

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', newImage.length);

      res.end(newImage);

      //results.newImage.save(smartViewPath);
      //fs.writeFileSync(testFilePath, newImage);
    });

  });
});

var detectObjectOpts = {
  scaleFactor: 1.05,
  minNeighbors: 5,
  minSize: [80, 80]
};

function getObjectDetector(filename, color, width) {
  var fullPath = path.resolve(__dirname, 'node_modules/opencv/data/' + filename);
  return function(results, cb) {
    results.image.detectObject(fullPath, detectObjectOpts, function(err, faces) {
      faces.forEach(function (face) {
        if (color) {
          results.newImage.rectangle([face.x, face.y], [face.width, face.height], color, width || 4);
          //im.ellipse(face.x + face.width/2, face.y + face.height/2, face.width/2, face.height/2, [255, 0, 255], 3);
        }
      });

      cb(err, faces);
    });
  }
}

function getFaces(color) {
  return function(results, cb) {
    async.auto({
      image: function(cb) { cb(null, results.image); }, // pull in image
      newImage: ['image', function(res, cb) { cb(null, results.newImage); }], // pull in image
      face: ['newImage', getObjectDetector('haarcascade_frontalface_default.xml', color, 4)],
      face_alt: ['newImage', getObjectDetector('haarcascade_frontalface_alt.xml', color && [155, 0, 255], 3)],
      face_alt2: ['newImage', getObjectDetector('haarcascade_frontalface_alt2.xml', color && [155, 0, 255], 3)],
      face_alt_tree: ['newImage', getObjectDetector('haarcascade_frontalface_alt_tree.xml', color && [55, 0, 255], 2)],
      face_profile: ['newImage', getObjectDetector('haarcascade_profileface.xml', color && [255, 0, 255], 2)],
      full_body: ['newImage', getObjectDetector('haarcascade_fullbody.xml', color && [255, 0, 0], 3)],
      eyes: ['newImage', getObjectDetector('haarcascade_eye.xml', color && [0, 255, 0], 3)],
      nose: ['newImage', getObjectDetector('haarcascade_mcs_nose.xml', color && [55, 255, 0], 2)],
      mouth: ['newImage', getObjectDetector('haarcascade_mcs_mouth.xml', color && [155, 255, 0], 2)]
    }, function(err, results) {
      // determine high confidence region for faces

      // look at faces as one collection, for now, until decided if one algorithm should hold more weight than others
      var faces = results.face.concat(results.face_alt)
        .concat(results.face_alt2)
        .concat(results.face_alt_tree)
        .concat(results.face_profile)
        ;

      // identify intersecting faces
      faces.forEach(function(face) {
        face.likeCount = 0;
        faces.forEach(function(f) {
          if (f === face) return;
          var centerX = Math.round((f.x + f.x + f.width) / 2);
          var centerY = Math.round((f.y + f.y + f.height) / 2);
          if (centerX >= face.x && centerX <= (face.x + face.width) &&
          centerY >= face.y && centerY <= (face.y + face.height)) {
            // intersecting!
            face.likeCount++;
          }
        });
      });

      // remove non-intersecting faces
      faces = faces.filter(function(face) {
        return face.likeCount > 1;
      });

      if (faces.length === 0) return void cb(); // define no region if faces not found

      var region = {
        width: results.image.width(),
        height: results.image.height()
      };

      region.left = region.width - 1;
      region.top = region.height - 1;
      region.right = 0;
      region.bottom = 0;

      // calc average
      region.center = faces.reduce(function(state, face, curIdx) {
        return {
          x: state.x + Math.round((face.x + face.x + face.width) / 2),
          y: state.y + Math.round((face.y + face.y + face.height) / 2)
        };
      }, { x: 0, y: 0 });
      region.center.x = Math.round(region.center.x / faces.length);
      region.center.y = Math.round(region.center.y / faces.length);

      faces.forEach(function(face) {
        region.left = Math.min(region.left, face.x);
        region.top = Math.min(region.top, face.y);
        region.right = Math.max(region.right, face.x + face.width);
        region.bottom = Math.max(region.bottom, face.y + face.height);

        /*if (color) {
          results.newImage.rectangle([ x, y ], [ 3, 3 ], color, 2);
        }*/
      });

      region.width = region.right - region.left + 1;
      region.height = region.bottom - region.top + 1;

      /* dumb center
      region.center = {
        x: Math.round((region.left + region.right) / 2),
        y: Math.round((region.top + region.bottom) / 2)
      };*/

      if (color) {
        results.newImage.rectangle([ region.center.x - 5, region.center.y - 5 ], [ 10, 10 ], color, 2);
        results.newImage.rectangle([ region.center.x - 2, region.center.y - 2 ], [ 4, 4 ], [50, 50, 50], 2);
        results.newImage.rectangle([ region.left, region.top ], [ region.width, region.height ], color, 2);
      }

      //console.log('originalSizse:', results.image.width() + 'x' + results.image.height());
      //console.log('faces', faces);
      //console.log('face region', region);

      cb(null, region);
    });
  };
}

var GRAVITY_FACTOR = 0.95;

function getFeatures(color, width, rectColor) {
  return function (results, cb) {
    var region = {
      width: results.image.width(),
      height: results.image.height()
    };
    // !!! this bombs out (in C) on some rare images. simple try/catch won't suffice
    var features = results.image.goodFeaturesToTrack();
    region.center = features.reduce(function(state, feature, curIdx) {
      return {
        x: state.x + feature[0],
        y: state.y + feature[1]
      };
    }, { x: 0, y: 0 });

    // calc average
    region.center.x = Math.round(region.center.x / features.length);
    region.center.y = Math.round(region.center.y / features.length);

    // start at average feature location, and work way out
    region.left = region.center.x - 1;
    region.top = region.center.y - 1;
    region.right = region.left + 2;
    region.bottom = region.top + 2;

    features.forEach(function(feature) {
      var x = feature[0];
      var y = feature[1];
      if (x < region.left) {
        // move towards point of interest
        region.left = region.left - Math.ceil((region.left - x) * GRAVITY_FACTOR);
      }
      if (y < region.top) {
        // move towards point of interest
        region.top = region.top - Math.ceil((region.top - y) * GRAVITY_FACTOR);
      }
      if (x > region.right) {
        // move towards point of interest
        region.right = region.right + Math.ceil((x - region.right) * GRAVITY_FACTOR);
      }
      if (y > region.bottom) {
        // move towards point of interest
        region.bottom = region.bottom + Math.ceil((y - region.bottom) * GRAVITY_FACTOR);
      }
      if (color) {
        results.newImage.rectangle([ x, y ], [ 3, 3 ], color, width || 2);
      }
    });

    region.width = region.right - region.left + 1;
    region.height = region.bottom - region.top + 1;

    if (rectColor) {
      results.newImage.rectangle([ region.center.x - 5, region.center.y - 5 ], [ 10, 10 ], rectColor, width || 2);
      results.newImage.rectangle([ region.center.x - 2, region.center.y - 2 ], [ 4, 4 ], [50, 50, 50], width || 2);
      results.newImage.rectangle([ region.left, region.top ], [ region.width, region.height ], rectColor, width || 2);
      //console.log('originalSizse:', results.image.width() + 'x' + results.image.height());
      //console.log('newSize:', region);
    }

    cb(null, region);
  };
}

function contours(color, width, rectColor) {
  return function(results, cb) {
    var im_canny = results.image.copy();
    im_canny.convertGrayscale();

    im_canny.canny(0, 100);
    im_canny.dilate(2);

    var region = {
      width: results.image.width(),
      height: results.image.height(),
      center: { x: 0, y: 0 }
    };

    var points = 0;

    // start at inverted location, and work way out
    region.left = region.width - 1;
    region.top = region.height - 1;
    region.right = 0;
    region.bottom = 0;

    var contours = im_canny.findContours();
    for (var c = 0; c < contours.size(); ++c) {
      var area = contours.area(c);
      if (area < 100 || area > 100000) continue;
      //console.log('area', area);
      for (var i = 0; i < contours.cornerCount(c); ++i) {
        var point = contours.point(c, i);
        //console.log("(" + point.x + "," + point.y + ")");
        region.center.x += point.x;
        region.center.y += point.y;
        region.left = Math.min(region.left, point.x);
        region.top = Math.min(region.top, point.y);
        region.right = Math.max(region.right, point.x);
        region.bottom = Math.max(region.bottom, point.y);
        points++;
      }
      if (color) {
        results.newImage.drawContour(contours, c, color);
      }
    }

    if (points < 5) {
      // insufficient data
      return void cb();
    }

    region.width = region.right - region.left + 1;
    region.height = region.bottom - region.top + 1;

    // calc average
    region.center.x = Math.round(region.center.x / points);
    region.center.y = Math.round(region.center.y / points);

    if (rectColor) {
      results.newImage.rectangle([ region.center.x - 5, region.center.y - 5 ], [ 10, 10 ], rectColor, width || 2);
      results.newImage.rectangle([ region.center.x - 2, region.center.y - 2 ], [ 4, 4 ], [50, 50, 50], width || 2);
      results.newImage.rectangle([ region.left, region.top ], [ region.width, region.height ], rectColor, width || 2);
      //console.log('originalSizse:', results.image.width() + 'x' + results.image.height());
      //console.log('newSize:', region);
    }

    //console.log('contours center', region.center);

    cb(null, region);
  };
}

function resizeAndCrop(finalWidth, finalHeight) {
  return function(results, cb) {
    var aspectX = finalWidth / finalHeight;
    var aspectY = finalHeight / finalWidth;
    var imageWidth = results.image.width();
    var imageHeight = results.image.height();
    var centerX = results.features.center.x;
    var centerY = results.features.center.y;

    var left = results.features.left;
    var top = results.features.top;
    var right = results.features.right;
    var bottom = results.features.bottom;
    var width = results.features.width;
    var height = results.features.height;

    // factor in contours region
    if (results.contours) {
      //console.log('applying contours', results.contours);
      // split the difference
      centerX = Math.round((results.contours.center.x + centerX) / 2);
      centerY = Math.round((results.contours.center.y + centerY) / 2);
      // or use contours instead of, when available
      //centerX = results.contours.center.x;
      //centerY = results.contours.center.y;

      // expand region if contours available
      /* average
      left = Math.round((results.contours.left + left) / 2);
      top = Math.round((results.contours.top + top) / 2);
      right = Math.round((results.contours.right + right) / 2);
      bottom = Math.round((results.contours.bottom + bottom) / 2);
      */
      left = Math.min(left, results.contours.left);
      top = Math.min(top, results.contours.top);
      right = Math.max(right, results.contours.right);
      bottom = Math.max(bottom, results.contours.bottom);
    }

    // factor in faces region
    if (results.faces) {
      //console.log('applying faces', results.faces);
      // split the difference
      centerX = Math.round((results.faces.center.x + centerX) / 2);
      centerY = Math.round((results.faces.center.y + centerY) / 2);
      // or use faces instead of, when available
      //centerX = results.faces.center.x;
      //centerY = results.faces.center.y;

      // expand region if faces available
      // average
      left = Math.round((results.faces.left + left) / 2);
      top = Math.round((results.faces.top + top) / 2);
      right = Math.round((results.faces.right + right) / 2);
      bottom = Math.round((results.faces.bottom + bottom) / 2);
      /*
      left = Math.min(left, results.faces.left);
      top = Math.min(top, results.faces.top);
      right = Math.max(right, results.faces.right);
      bottom = Math.max(bottom, results.faces.bottom);
      */
      // override
      /*
      left = results.faces.left;
      top = results.faces.top;
      right = results.faces.right;
      bottom = results.faces.bottom;
      */
    }

    // region buffer
    left -= 10;
    if (left < 0) left = 0;
    top -= 10;
    if (top < 0) top = 0;
    right += 10;
    if (right >= imageWidth) right = imageWidth - 1;
    bottom += 10;
    if (bottom >= imageHeight) bottom = imageHeight - 1;

    // recalc
    width = right - left;
    height = bottom - top;

    height = Math.round(width * aspectY);
    // if height is not big enough to cover desired region, try to increase it
    if (height < results.features.height) {
      height = results.features.height;
      width = Math.round(height * aspectX);
    }
    if ((left + width) > imageWidth) {
      // move position before shrinking
      left -= ((left + width) - imageWidth);
      if (left < 0) left = 0;
      // too big, force shrink
      width = imageWidth - left;
      // meet aspect
      height = Math.round(width * aspectY);
    }
    if ((top + height) > imageHeight) {
      // move position before shrinking
      top -= ((top + height) - imageHeight);
      if (top < 0) top = 0;
      // too big, force shrink
      height = imageHeight - top;
      width = Math.round(height * aspectX);
    }

    // account for center point
    var newCenterX = Math.round((width / 2) + left);
    if (newCenterX > centerX) {
      // try to move over if off center
      left -= (newCenterX - centerX);
      if (left < 0) left = 0;
    } else if (newCenterX < centerX) {
      // try to move over if off center
      //console.log('centerX < features.center.x', newCenterX, centerX);
      //console.log('left', left);
      //left += (results.features.center.x - centerX);
      left = centerX - Math.round(width / 2);
      if ((left + width) > imageWidth) left = imageWidth - width;
      //console.log('new.left', left);
    }
    var newCenterY = Math.round((height / 2) + top);
    if (newCenterY > centerY) {
      // try to move over if off center
      top -= (newCenterY - centerY);
      if (top < 0) top = 0;
    } else if (newCenterY < centerY) {
      // try to move over if off center
      //console.log('centerY < features.center.y', newCenterY, centerY);
      //console.log('top', top);
      //top += (results.features.center.y - centerY);
      top = centerY - Math.round(height / 2);
      if ((top + height) > imageHeight) top = imageHeight - height;
      //console.log('new.top', top);
    }

    console.log('original', imageWidth + 'x' + imageHeight);
    //console.log('required aspect:', aspectX + 'x' + aspectY);
    console.log('cropping...', left, top, width, height);

    // crop desired view, meeting aspect requirements
    results.newImage = results.newImage.crop(left, top, width, height);
    
    // resize down to final size
    results.newImage.resize(finalWidth, finalHeight);
    
    cb();
  };
}

app.listen(2342, function() {
  console.log('Goto http://localhost:2342/');
});