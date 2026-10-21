(function(){
  let port = document.getElementById('lwys-ctv-port');
  if (!port) {
    port = document.createElement('span');
    port.id = 'lwys-ctv-port';
    port.dataset.enabled = document.documentElement.dataset.smartestEnabled === 'false' ? 'false' : 'true';
    port.dataset.hidden = 'false';
    document.documentElement.append(port);
  }

  const block = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };

  const isEnabled = () => port.dataset.enabled === 'true';

  // Capture the native getter before it is patched below. It is only used
  // internally to know when the tab is really hidden.
  const nativeHiddenGetter = (() => {
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden') ||
                 Object.getOwnPropertyDescriptor(document, 'hidden');
    return desc && typeof desc.get === 'function' ? desc.get : null;
  })();

  function isReallyHidden() {
    try {
      return nativeHiddenGetter ? nativeHiddenGetter.call(document) : false;
    } catch {
      return false;
    }
  }

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

  // Visibility state always reads as visible while protection is on. When it
  // is off, the native values are passed through untouched.
  patchDocumentGetter('visibilityState', () => isEnabled() ? 'visible' : undefined);
  patchDocumentGetter('webkitVisibilityState', () => isEnabled() ? 'visible' : undefined);
  patchDocumentGetter('hidden', () => isEnabled() ? false : undefined);
  patchDocumentGetter('webkitHidden', () => isEnabled() ? false : undefined);

  // Keep the real hidden state internally for the rAF fallback below, without
  // ever exposing it to the page.
  const updateHiddenFlag = () => {
    port.dataset.hidden = isReallyHidden() ? 'true' : 'false';
  };
  updateHiddenFlag();

  const onVisibilityChange = e => {
    updateHiddenFlag();
    port.dispatchEvent(new Event('state'));
    if (isEnabled()) block(e);
  };

  // Capture on both window and document so the page's listeners never see the
  // tab switch. No "first event" is let through.
  window.addEventListener('visibilitychange', onVisibilityChange, true);
  document.addEventListener('visibilitychange', onVisibilityChange, true);
  window.addEventListener('webkitvisibilitychange', onVisibilityChange, true);
  document.addEventListener('webkitvisibilitychange', onVisibilityChange, true);

  window.addEventListener('pagehide', e => {
    if (isEnabled()) block(e);
  }, true);

  window.addEventListener('lostpointercapture', e => {
    if (isEnabled()) block(e);
  }, true);

  const isWindowTarget = e => e.target === document || e.target === window;

  Document.prototype.hasFocus = new Proxy(Document.prototype.hasFocus, {
    apply(target, self, args) {
      if (isEnabled()) return true;
      return Reflect.apply(target, self, args);
    }
  });

  const onfocus = e => {
    if (isEnabled() && isWindowTarget(e)) block(e);
  };
  document.addEventListener('focus', onfocus, true);
  window.addEventListener('focus', onfocus, true);

  const onblur = e => {
    if (isEnabled() && isWindowTarget(e)) block(e);
  };
  document.addEventListener('blur', onblur, true);
  window.addEventListener('blur', onblur, true);

  window.addEventListener('mouseleave', e => {
    if (isEnabled() && isWindowTarget(e)) block(e);
  }, true);

  let lastTime = 0;
  window.requestAnimationFrame = new Proxy(window.requestAnimationFrame, {
    apply(target, self, args) {
      if (isEnabled() && port.dataset.hidden === 'true') {
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
      if (isEnabled() && port.dataset.hidden === 'true') {
        clearTimeout(args[0]);
      }
      return Reflect.apply(target, self, args);
    }
  });
})();
