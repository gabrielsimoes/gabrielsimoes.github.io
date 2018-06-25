'use strict';

window.onload = function() {
  var sidebar = document.querySelector('header');
  var image = sidebar.querySelector('img.my-image');

  sidebar.onmouseover = function() {
    image.src='/me-colored.png';
  };

  sidebar.onmouseout = function() {
    image.src='/me-bw.png';
  };

  tippy('.social-item');

  var quotesTogglers = document.getElementsByClassName('timeline-quotes');
  for (var i = 0; i < quotesTogglers.length; i++) {
    (function(toggler) {
      var mask = toggler.nextSibling;
      var modal = mask.nextSibling;
      var close = modal.querySelector('.close');

      function closeModal() {
        mask.classList.remove('active');
        modal.classList.remove('active');

        window.onkeyup = null;
      }

      toggler.onclick = function() {
        mask.classList.add('active');
        modal.classList.add('active');

        window.onkeyup = function(e) {
          var key = e.keyCode ? e.keyCode : e.which;
          if (key == 27) {
            closeModal();
          }
        }
      }

      close.onclick = closeModal;
      mask.onclick = closeModal;
    })(quotesTogglers[i]);
  }
}
