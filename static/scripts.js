var imgIndex = 0;
var originalDom = document.getElementById('original');
var withVisionDom = document.getElementById('withVision');
var cropResizeDom = document.getElementById('cropResize');
var smartViewDom = document.getElementById('smartView');
var prefetchDom = document.getElementById('hiddenView');

function displayImage() {
  var image = getImageUrls(imgIndex);

  console.log('Image:', image.image.photo_id, image.image);

  // image.fullsize
  originalDom.style.backgroundImage = 'url("' + image.large + '")';
  withVisionDom.style.backgroundImage = 'url("' + image.withVision + '")';
  cropResizeDom.style.backgroundImage = 'url("' + image.large + '")';
  smartViewDom.style.backgroundImage = 'url("' + image.smartView + '")';

  var next = getImageUrls(imgIndex + 1);
  prefetchDom.innerHTML = [
    '<img src="' + next.withVision + '">',
    '<img src="' + next.smartView + '">',
    '<img src="' + next.large + '">'
  ].join();
}

function getImageUrls(index) {
  var image = data.images[index % (data.images.length - 1)];

  var rect = smartViewDom.getClientRects()[0];

  return {
    image: image,
    large: image.large,
    fullsize: image.fullsize,
    withVision: '/image/withVision?url=' + image.large,
    smartView: '/image/smartView?' +
      'width=' + Math.ceil(rect.width) +
      '&height=' + Math.ceil(rect.height) +
      '&url=' + image.large
  };
}

document.addEventListener('keypress', function(e) {
  switch (e.keyCode) {
    case 97: // a: left
      imgIndex--;
      if (imgIndex < 0) imgIndex = data.images.length - 1;
      displayImage();
      break;
    case 100: // d: right
      imgIndex = (imgIndex + 1) % data.images.length;
      displayImage();
      break;
    case 32: // space
    case 119: // e: up
      withVisionDom.className = withVisionDom.className === 'fullScreen' ? '' : 'fullScreen';
      break;
    case 115: // s: down
      smartViewDom.className = smartViewDom.className === 'fullScreen' ? '' : 'fullScreen';
      displayImage();
      break;
    default:
      //console.log('keyCode', e.keyCode);
      break;
  }
});

function randomizeImages() {
  window.data.images.forEach(function(i) {
    i.seed = Math.random();
  });

  window.data.images.sort(function(i1, i2) {
    return i1.seed > i2.seed ? 1 : i1.seed === i2.seed ? 0 : -1;
  });

  displayImage();
}

function gotoImage(photo_id) {
  var img = data.images.find(function(i) { return i.photo_id === photo_id; });
  if (!img) return;
  var idx = data.images.indexOf(img);
  if (idx < 0) return;

  imgIndex = idx;
  displayImage();
}

randomizeImages();
