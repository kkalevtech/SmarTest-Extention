(function(){
  let port = document.getElementById('lwys-ctv-port');
  if (!port) {
    port = document.createElement('span');
    port.id = 'lwys-ctv-port';
    port.dataset.enabled = document.documentElement.dataset.smartestEnabled === 'false' ? 'false' : 'true';
    port.dataset.hidden = 'false';
    port.dataset.visibility = 'false';
    port.dataset.pointercapture = 'false';
    port.dataset.focus = 'false';
    port.dataset.blur = 'false';
    port.dataset.mouseleave = 'false';
    document.documentElement.append(port);
  }

  const block = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };

  const isEnabled = () => port.dataset.enabled === 'true';

  // ── Fake fullscreen ──
  // Test/proctoring pages treat "no fullscreen element" as proof that the user
  // left fullscreen. While protection is on, always report an active fullscreen
  // session and pretend that fullscreen requests succeed.
  let fakeFullscreenElement = null;
  const syntheticEvents = new WeakSet();

  const getFakeFullscreenElement = () => fakeFullscreenElement || document.documentElement || null;

  function patchDocumentGetter(prop, getFakeValue) {
    const protoDesc = Object.getOwnPropertyDescriptor(Document.prototype, prop);
    const ownDesc = Object.getOwnPropertyDescriptor(document, prop);
    const desc = protoDesc || ownDesc;
    if (!desc || typeof desc.get !== 'function') return;

    const original = desc.get;
    const target = protoDesc ? Document.prototype : document;

    try {
      Object.defineProperty(target, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get() {
          if (isEnabled()) {
            const value = getFakeValue();
            if (value !== undefined) return value;
          }
          return original.call(this);
        }
      });
    } catch {}
  }

  // All vendor-prefixed aliases a page might read.
  [
    'fullscreenElement',
    'webkitFullscreenElement',
    'webkitCurrentFullScreenElement',
    'mozFullScreenElement',
    'msFullscreenElement'
  ].forEach(prop => patchDocumentGetter(prop, getFakeFullscreenElement));

  [
    'fullscreenEnabled',
    'webkitFullscreenEnabled',
    'mozFullScreenEnabled',
    'msFullscreenEnabled',
    'webkitIsFullScreen',
    'mozFullScreen'
  ].forEach(prop => patchDocumentGetter(prop, () => true));

  const FULLSCREEN_EVENTS = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'MSFullscreenChange'
  ];

  function dispatchSyntheticFullscreenEvent(type) {
    const event = new Event(type, { bubbles: true, cancelable: false });
    syntheticEvents.add(event);
    document.dispatchEvent(event);
  }

  function enterFakeFullscreen(element) {
    fakeFullscreenElement = element;
    // Real browsers fire the change event asynchronously, after the promise
    // returned by requestFullscreen() settles.
    setTimeout(() => {
      if (isEnabled()) FULLSCREEN_EVENTS.forEach(dispatchSyntheticFullscreenEvent);
    }, 0);
  }

  // Suppress real fullscreen transitions (e.g. the user pressing Escape) so
  // pages never observe a "fullscreen exited" event.
  [...FULLSCREEN_EVENTS, 'fullscreenerror', 'webkitfullscreenerror', 'mozfullscreenerror', 'MSFullscreenError']
    .forEach(type => {
      document.addEventListener(type, e => {
        if (isEnabled() && !syntheticEvents.has(e)) block(e);
      }, true);
    });

  const originalRequestFullscreen = Element.prototype.requestFullscreen;
  if (typeof originalRequestFullscreen === 'function') {
    Element.prototype.requestFullscreen = function(...args) {
      if (isEnabled()) {
        enterFakeFullscreen(this);
        return Promise.resolve();
      }
      return originalRequestFullscreen.apply(this, args);
    };
  }

  // Older prefixed entry points return undefined instead of a promise.
  ['webkitRequestFullscreen', 'webkitRequestFullScreen', 'mozRequestFullScreen', 'msRequestFullscreen']
    .forEach(name => {
      const original = Element.prototype[name];
      if (typeof original !== 'function') return;
      Element.prototype[name] = function(...args) {
        if (isEnabled()) {
          enterFakeFullscreen(this);
          return undefined;
        }
        return original.apply(this, args);
      };
    });

  const originalExitFullscreen = Document.prototype.exitFullscreen;
  if (typeof originalExitFullscreen === 'function') {
    Document.prototype.exitFullscreen = function(...args) {
      if (isEnabled()) {
        // Stay "in fullscreen" from the page's point of view.
        return Promise.resolve();
      }
      return originalExitFullscreen.apply(this, args);
    };
  }

  ['webkitExitFullscreen', 'webkitCancelFullScreen', 'mozCancelFullScreen', 'msExitFullscreen']
    .forEach(name => {
      const original = Document.prototype[name];
      if (typeof original !== 'function') return;
      Document.prototype[name] = function(...args) {
        if (isEnabled()) return undefined;
        return original.apply(this, args);
      };
    });

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get() {
      if (port.dataset.enabled === 'false') { return port.dataset.hidden === 'true' ? 'hidden' : 'visible'; }
      return 'visible';
    }
  });

  Object.defineProperty(document, 'webkitVisibilityState', {
    configurable: true,
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
    configurable: true,
    get() {
      if (port.dataset.enabled === 'false') { return port.dataset.hidden === 'true'; }
      return false;
    }
  });

  Object.defineProperty(document, 'webkitHidden', {
    configurable: true,
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
