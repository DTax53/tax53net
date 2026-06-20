(function () {
  // ── Main nav ────────────────────────────────────────────
  var nav = document.getElementById('nav');
  if (nav && window.navLinks && window.navLinks.length > 0) {
    var mainUl = nav.querySelector('#nav-links ul');
    window.navLinks.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'nav-item';
      var a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      a.className = 'nav-link';
      if (item.newtab) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      li.appendChild(a);
      mainUl.appendChild(li);
    });
  }

  // ── Sub nav ─────────────────────────────────────────────
  var subNav = document.getElementById('subnav');
  if (subNav && window.subnavLinks && window.subnavLinks.length > 0) {
    var subUl = document.querySelector('#subnav-links ul');
    window.subnavLinks.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'nav-item';
      var a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      a.className = 'nav-link';
      if (item.newtab) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      li.appendChild(a);
      subUl.appendChild(li);
    });
    subNav.classList.add('has-links');
  }
})();