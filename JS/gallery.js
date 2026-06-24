(function () {
  var galleryEl = document.getElementById('overview-gallery');
  if (!galleryEl) return;

  var folder = galleryEl.getAttribute('data-gallery-folder');
  if (!folder) return;

  fetch(folder + '/manifest.json')
    .then(function (res) { return res.json(); })
    .then(function (filenames) {
      // Build slides
      filenames.forEach(function (filename, i) {
        var slide = document.createElement('div');
        slide.className = 'slide' + (i === 0 ? ' active' : '');

        var img = document.createElement('img');
        img.src = folder + '/' + filename;
        img.alt = 'Gallery image ' + (i + 1);

        slide.appendChild(img);
        galleryEl.appendChild(slide);
      });

      // Build nav buttons + dots container
      var prevBtn = document.createElement('div');
      prevBtn.id = 'gallery-prev';
      prevBtn.className = 'gallery-btn';
      prevBtn.innerHTML = '&#8249;';

      var nextBtn = document.createElement('div');
      nextBtn.id = 'gallery-next';
      nextBtn.className = 'gallery-btn';
      nextBtn.innerHTML = '&#8250;';

      var dotsContainer = document.createElement('div');
      dotsContainer.id = 'gallery-dots';

      galleryEl.appendChild(prevBtn);
      galleryEl.appendChild(nextBtn);
      galleryEl.appendChild(dotsContainer);

      initGallery();
    })
    .catch(function (err) {
      console.error('Gallery failed to load manifest:', err);
    });

  function initGallery() {
    var slides = document.querySelectorAll('.slide');
    var dotsContainer = document.getElementById('gallery-dots');
    if (!slides.length) return;

    var current = 0;
    var manualDebounce = 2000;
    var lastManualNavigation = 0;

    slides.forEach(function (_, i) {
      var dot = document.createElement('div');
      dot.className = 'gallery-dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', function () { goTo(i, true); });
      dotsContainer.appendChild(dot);
    });

    function goTo(index, manualEntry) {
      if (manualEntry) {
        lastManualNavigation = Date.now();
      }
      if (!manualEntry && (Date.now() - lastManualNavigation < manualDebounce)) {
        return;
      }
      slides[current].classList.remove('active');
      document.querySelectorAll('.gallery-dot')[current].classList.remove('active');
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('active');
      document.querySelectorAll('.gallery-dot')[current].classList.add('active');
    }

    document.getElementById('gallery-prev').addEventListener('click', function () { goTo(current - 1, true); });
    document.getElementById('gallery-next').addEventListener('click', function () { goTo(current + 1, true); });

    setInterval(function () { goTo(current + 1, false); }, 4000);
  }
})();