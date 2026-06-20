(function () {
  var SPEED = 100; // pixels per second

  var original = document.getElementById('marquee-text');
  var marquee  = document.getElementById('marquee');
  if (!original || !marquee) return;

  // Wait one frame so the DOM has fully rendered and scrollWidth is accurate
  requestAnimationFrame(function () {
    var clone = original.cloneNode(true);
    marquee.appendChild(clone);

    var clone2 = original.cloneNode(true);
    marquee.appendChild(clone2);

    var offset    = 0;
    var lastTime  = null;
    var copyWidth = original.scrollWidth;

    function step(timestamp) {
      if (!lastTime) lastTime = timestamp;
      var delta = (timestamp - lastTime) / 1000;
      lastTime  = timestamp;

      offset += SPEED * delta;
      if (offset >= copyWidth) offset -= copyWidth;

      marquee.style.transform = 'translateX(-' + offset + 'px)';
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
})();