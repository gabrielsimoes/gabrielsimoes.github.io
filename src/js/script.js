window.onload = function() {
  var sidebar = document.querySelector('header');
  var image = sidebar.querySelector('img.my-image');

  sidebar.onmouseover = function() {
    image.src='/me-colored.png';
  };

  sidebar.onmouseout = function() {
    image.src='/me-bw.png';
  };
};
