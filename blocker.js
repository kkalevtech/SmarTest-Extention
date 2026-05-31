(function(){
  let port = document.getElementById('lwys-ctv-port');
  if (port) { port.remove(); }
  else {
    port = document.createElement('span');
    port.id = 'lwys-ctv-port';
    port.dataset.enabled = 'true';
    port.dataset.hidden = 'false';
    port.dataset.visibility = 'false';
    port.dataset.pointercapture = 'false';
    port.dataset.focus = 'false';
    port.dataset.blur = 'false';
    port.dataset.mouseleave = 'false';
    document.documentElement.append(port);
  }

  const block = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };

  const originalRequestFullscreen = Element.prototype.requestFullscreen;
  Element.prototype.requestFullscreen = function(...args) {
    if (port.dataset.enabled === 'true') {
      console.warn('Fullscreen request blocked');
      return Promise.reject(new Error('Fullscreen is disabled'));
    }
    return originalRequestFullscreen.apply(this, args);
  };

  const originalExitFullscreen = document.exitFullscreen;
  document.exitFullscreen = function(...args) {
    if (port.dataset.enabled === 'true') {
      console.warn('Exit fullscreen request blocked');
      return Promise.reject(new Error('Exiting fullscreen is disabled'));
    }
    return originalExitFullscreen.apply(this, args);
  };

  Object.defineProperty(document, 'visibilityState', {
    get() {
      if (port.dataset.enabled === 'false') { return port.dataset.hidden === 'true' ? 'hidden' : 'visible'; }
      return 'visible';
    }
  });

  Object.defineProperty(document, 'webkitVisibilityState', {
    get() {
      if (port.dataset.enabled === 'false') { return port.dataset.hidden === 'true' ? 'hidden' : 'visible'; }
      return 'visible';
    }
  });

  const once = { focus: true, visibilitychange: true, webkitvisibilitychange: true };

  document.addEventListener('visibilitychange', e => {
    port.dispatchEvent(new Event('state'));
    if (port.dataset.enabled === 'true' && port.dataset.visibility !== 'false') {
      if (once.visibilitychange) { once.visibilitychange = false; return; }
      return block(e);
    }
  }, true);

  document.addEventListener('webkitvisibilitychange', e => {
    if (port.dataset.enabled === 'true' && port.dataset.visibility !== 'false') {
      if (once.webkitvisibilitychange) { once.webkitvisibilitychange = false; return; }
      return block(e);
    }
  }, true);

  window.addEventListener('pagehide', e => {
    if (port.dataset.enabled === 'true' && port.dataset.visibility !== 'false') { block(e); }
  }, true);

  window.addEventListener('lostpointercapture', e => {
    if (port.dataset.enabled === 'true' && port.dataset.pointercapture !== 'false') { block(e); }
  }, true);

  Object.defineProperty(document, 'hidden', {
    get() {
      if (port.dataset.enabled === 'false') { return port.dataset.hidden === 'true'; }
      return false;
    }
  });

  Object.defineProperty(document, 'webkitHidden', {
    get() {
      if (port.dataset.enabled === 'false') { return port.dataset.hidden === 'true'; }
      return false;
    }
  });

  Document.prototype.hasFocus = new Proxy(Document.prototype.hasFocus, {
    apply(target, self, args) {
      if (port.dataset.enabled === 'true' && port.dataset.focus !== 'false') { return true; }
      return Reflect.apply(target, self, args);
    }
  });

  const onfocus = e => {
    if (port.dataset.enabled === 'true' && port.dataset.focus !== 'false') {
      if (e.target === document || e.target === window) {
        if (once.focus) { once.focus = false; return; }
        return block(e);
      }
    }
  };
  document.addEventListener('focus', onfocus, true);
  window.addEventListener('focus', onfocus, true);

  const onblur = e => {
    if (port.dataset.enabled === 'true' && port.dataset.blur !== 'false') {
      if (e.target === document || e.target === window) { return block(e); }
    }
  };
  document.addEventListener('blur', onblur, true);
  window.addEventListener('blur', onblur, true);

  window.addEventListener('mouseleave', e => {
    if (port.dataset.enabled === 'true' && port.dataset.mouseleave !== 'false') {
      if (e.target === document || e.target === window) { return block(e); }
    }
  }, true);

  let lastTime = 0;
  window.requestAnimationFrame = new Proxy(window.requestAnimationFrame, {
    apply(target, self, args) {
      if (port.dataset.enabled === 'true' && port.dataset.hidden === 'true') {
        const currTime = Date.now();
        const timeToCall = Math.max(0, 16 - (currTime - lastTime));
        const id = setTimeout(function() { args[0](performance.now()); }, timeToCall);
        lastTime = currTime + timeToCall;
        return id;
      } else {
        return Reflect.apply(target, self, args);
      }
    }
  });

  window.cancelAnimationFrame = new Proxy(window.cancelAnimationFrame, {
    apply(target, self, args) {
      if (port.dataset.enabled === 'true' && port.dataset.hidden === 'true') {
        clearTimeout(args[0]);
      }
      return Reflect.apply(target, self, args);
    }
  });
})();
