(function () {
  if (window.__judyFollowerLoaded) return;
  window.__judyFollowerLoaded = true;

  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

  var style = document.createElement('style');
  style.textContent = [
    '#judy-follower{position:fixed;left:0;top:0;width:88px;height:88px;pointer-events:none;user-select:none;z-index:9999;transform:translate3d(-200px,-200px,0);transform-origin:50% 80%;will-change:transform;filter:drop-shadow(0 4px 6px rgba(0,0,0,.25));display:block}',
    '#judy-follower img{width:100%;height:100%;object-fit:contain;display:none}',
    '#judy-follower-ph{width:100%;height:100%;display:grid;place-items:center;font-size:56px}'
  ].join('\n');
  document.head.appendChild(style);

  var follower = document.createElement('div');
  follower.id = 'judy-follower';
  follower.setAttribute('aria-hidden', 'true');
  var img = document.createElement('img');
  img.alt = '';
  var ph = document.createElement('div');
  ph.id = 'judy-follower-ph';
  ph.textContent = '🐰';
  follower.appendChild(img);
  follower.appendChild(ph);
  document.body.appendChild(follower);

  img.src = '/images/judy.png';
  img.addEventListener('load', function () {
    img.style.display = 'block';
    ph.style.display = 'none';
  });
  img.addEventListener('error', function () {
    img.style.display = 'none';
    ph.style.display = 'grid';
  });

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var offset = 0;
  var tx = window.innerWidth * 0.5;
  var ty = window.innerHeight * 0.5;
  var x = tx, y = ty, lastX = x;

  window.addEventListener('pointermove', function (e) {
    tx = e.clientX + offset;
    ty = e.clientY + offset;
  }, { passive: true });

  function animate() {
    var ease = prefersReduced ? 1 : 0.18;
    x += (tx - x) * ease;
    y += (ty - y) * ease;
    var dx = x - lastX;
    lastX = x;
    var tilt = Math.max(-8, Math.min(8, dx * 0.35));
    follower.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + tilt + 'deg)';
    requestAnimationFrame(animate);
  }
  animate();
})();
