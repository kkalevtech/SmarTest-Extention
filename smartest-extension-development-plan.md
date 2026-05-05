# SmarTest Functionality Restoration Extension — Development Plan

## 1. Overview

This extension restores standard browser functionality within the SmarTest web application by intercepting and neutralizing JavaScript-based anti-cheating mechanisms. The extension operates entirely client-side and does not require backend modifications.

**Goal**: Enable tab switching, clipboard operations, context menus, and standard browser interactions without triggering violations or auto-submission.

**Scope**: Chrome/Chromium-based browsers (Chrome, Edge, Brave, Opera) with potential Firefox compatibility.

**Strategy**: Early Injection Pattern — inject content scripts at `document_start` to override native APIs before SmarTest's detection scripts execute.

---

## 2. Technical Analysis Summary

### 2.1 Key Mechanisms Used by SmarTest

| Mechanism | Detection Method | Trigger Action |
|-----------|-----------------|-----------------|
| Tab Switch | `document.hidden` + `visibilitychange` event | Warning → Auto-submit |
| Focus Loss | `window.blur` event | Log violation |
| Clipboard | CSS `user-select: none` + `copy/cut/paste` events | Block operation |
| Context Menu | `contextmenu` event handler | Block menu |
| DevTools | `console.log` + `debugger` timing | Log detection |
| Fullscreen | `requestFullscreen()` API | Enforce mode |
| Before Unload | `beforeunload` event | Block exit |

### 2.2 Which Mechanisms Will Be Addressed

**Primary Targets (High Priority):**
- Visibility API (`document.hidden`, `visibilityState`)
- Focus/Blur events (`window.blur`, `window.focus`)
- Clipboard events (`copy`, `cut`, `paste`)
- Context menu (`contextmenu`)
- CSS user-select restriction

**Secondary Targets (Medium Priority):**
- DevTools detection bypass
- Fullscreen enforcement handling
- Beforeunload warning suppression

**Not Addressed (Backend/Infrastructure):**
- Server-side heartbeat validation
- IP/device fingerprinting
- Session timeout logic

### 2.3 Mapping: Restricted Behavior → Restoration Approach

| Restricted Behavior | Restoration Approach |
|--------------------|---------------------|
| Tab switching triggers violation | Override `document.hidden` to always return `false` |
| Visibility state detected | Override `document.visibilityState` to always return `"visible"` |
| Focus events logged | Prevent `blur` listeners from firing or neutralize handler |
| Copy/paste blocked | Remove event listeners + restore CSS `user-select` |
| Right-click disabled | Remove `contextmenu` handler |
| Text not selectable | Inject CSS to override `user-select: none` |
| DevTools detected | Neutralize detection loops |
| Fullscreen forced | Allow exit fullscreen via ESC handling |

---

## 3. Restoration Strategy

### 3.1 Tab Switch Detection

**How It Works:**
SmarTest registers a `visibilitychange` event listener and checks `document.hidden`:

```javascript
document.addEventListener('visibilitychange', () => {
    if (document.hidden) logViolation('tab_switch');
});
```

**How to Handle It:**

1. Override `document.hidden` property to always return `false`
2. Override `document.visibilityState` to always return `"visible"`
3. Remove or neutralize existing `visibilitychange` listeners

**Implementation:**

```javascript
Object.defineProperty(Document.prototype, 'hidden', {
    get: function() { return false; },
    configurable: false
});

Object.defineProperty(Document.prototype, 'visibilityState', {
    get: function() { return 'visible'; },
    configurable: false
});
```

### 3.2 Visibility API

**Approach:**
The Page Visibility API has three core components:
- `document.hidden` — boolean
- `document.visibilityState` — `"visible" | "hidden" | "prerender" | "unloaded"`
- `visibilitychange` event

**Implementation Strategy:**

1. Define properties on `Document.prototype` before page scripts load
2. Dispatch a synthetic `visibilitychange` event with `"visible"` state if needed
3. Prevent original listeners from executing by wrapping `EventTarget.prototype.addEventListener`

### 3.3 Focus / Blur Events

**How It Works:**
```javascript
window.addEventListener('blur', () => logViolation('focus_lost'));
```

**How to Handle It:**

1. Wrap `window.addEventListener` to filter `blur`/`focus` listeners added by SmarTest
2. Or: provide no-op handlers that prevent the original handlers from firing
3. Track and remove registered `blur` handlers after injection

**Implementation:**

```javascript
const originalAddEventListener = Window.prototype.addEventListener;
Window.prototype.addEventListener = function(type, listener, options) {
    if (type === 'blur' || type === 'focus') {
        return;
    }
    return originalAddEventListener.call(this, type, listener, options);
};
```

### 3.4 Clipboard Restrictions

**How It Works:**

1. **CSS Prevention:**
   ```css
   * { user-select: none; -webkit-user-select: none; }
   ```

2. **JavaScript Prevention:**
   ```javascript
   document.addEventListener('copy', e => e.preventDefault());
   document.addEventListener('cut', e => e.preventDefault());
   document.addEventListener('paste', e => e.preventDefault());
   ```

3. **Property Override:**
   ```javascript
   document.oncopy = () => false;
   ```

**How to Handle It:**

1. Inject CSS to restore text selection:
   ```css
   body, body * {
       user-select: text !important;
       -webkit-user-select: text !important;
       -moz-user-select: text !important;
       -ms-user-select: text !important;
   }
   ```

2. Override clipboard event methods:
   ```javascript
   const originalClipboard = navigator.clipboard;
   
   Document.prototype.oncopy = null;
   Document.prototype.oncut = null;
   Document.prototype.onpaste = null;
   ```

3. Wrap `addEventListener` to block clipboard listener registration

### 3.5 Context Menu Restrictions

**How It Works:**
```javascript
document.addEventListener('contextmenu', e => e.preventDefault());
// or
document.oncontextmenu = () => false;
```

**How to Handle It:**

1. Remove context menu handler after page loads
2. Override `oncontextmenu` to null

**Implementation:**

```javascript
Document.prototype.oncontextmenu = null;

// After page load, remove listeners
document.removeEventListener('contextmenu', preventDefaultHandler);
```

### 3.6 DevTools Monitoring

**How It Works:**

1. **Console Detection:** Uses `console.log` with styled output and getter traps
2. **Timing Detection:** Uses `debugger` statement and measures execution time
3. **Dimension Detection:** Monitors `window.outerWidth - window.innerWidth`

**How to Handle It:**

1. **Basic:** No direct bypass needed — DevTools in separate window is not detectable
2. **Advanced:** Override console methods to prevent detection hooks
3. **Timing:** The detection is passive and doesn't trigger auto-submit directly

**Implementation (Optional):**

```javascript
const noop = () => {};
console.log = noop;
console.warn = noop;
console.error = noop;

// Note: This may interfere with legitimate debugging
```

### 3.7 Fullscreen Enforcement

**How It Works:**
```javascript
document.documentElement.requestFullscreen();
```

**How to Handle It:**

1. Allow natural ESC key to exit fullscreen
2. Optionally provide UI button to exit fullscreen via content script
3. Note: SmarTest may re-request fullscreen periodically — handle gracefully

**Implementation:**

```javascript
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    }
});
```

---

## 4. Extension Architecture

### 4.1 Components

```
smartest-restore/
├── manifest.json           # Extension manifest (V3)
├── background/
│   └── service-worker.js   # Background script (optional)
├── content/
│   ├── inject.js          # Early injection (document_start)
│   ├── api-override.js   # Property/method overrides
│   ├── event-handler.js  # Event listener management
│   └── styles.css       # CSS restoration
├── popup/
│   ├── popup.html        # Extension popup UI
│   └── popup.js        # Popup logic
└── icons/
    ├── icon48.png
    └── icon128.png
```

### 4.2 Injection Strategy

**CRITICAL: Script Execution Timing**

The extension MUST inject before SmarTest's scripts execute. This requires:

1. **Content Script Injection at `document_start`**
   ```json
   {
       "content_scripts": [{
           "matches": ["*://*.smartest.bg/*"],
           "js": ["content/inject.js"],
           "run_at": "document_start"
       }]
   }
   ```

2. **Manifest Declaration**
   ```json
   {
       "manifest_version": 3,
       "permissions": ["activeTab", "scripting"],
       "host_permissions": ["*://*.smartest.bg/*"]
   }
   ```

### 4.3 Why Each Part Is Needed

| Component | Purpose | Execution Time |
|-----------|---------|----------------|
| `inject.js` | Set up API overrides before page scripts | `document_start` |
| `api-override.js` | Override `document.hidden`, `visibilityState` | `document_start` |
| `event-handler.js` | Manage event listeners | `document_start` + `document_idle` |
| `styles.css` | Restore CSS properties | `document_start` |
| `popup.js` | User controls and status | On demand |

### 4.4 How They Interact

```
manifest.json
       │
       ▼
content_scripts (document_start)
       │
       ├─► inject.js ──► api-override.js
       │                 │  - document.hidden
       │                 │  - visibilityState
       │                 │  - oncontextmenu
       │                 │
       ├─► event-handler.js
       │                 │  - wrap addEventListener
       │                 │  - remove blockers
       │                 │
       └─► styles.css
                          │  - user-select: text
                          │
popup (on click)
       │
       └─► User status display
```

---

## 5. Technology Stack

### 5.1 Manifest Version
**Chrome Manifest V3** (required for Chrome Web Store)
- No remote code execution
- Service workers instead of background pages
- Content scripts still supported

### 5.2 Language
**JavaScript (ES6+)** — No compilation required
- Direct browser support
- Simplified debugging
- No build tool dependency

**Optionally TypeScript** if using build tools:
- Type safety for complex overrides
- Better IDE support
- Requires Vite or Webpack build

### 5.3 Build Tools

**None required** for MVP — pure JavaScript content scripts.

**Optional:**

| Tool | Use Case | Setup Complexity |
|------|----------|-----------------|
| Vite | TypeScript + hot reload | Low |
| Webpack | Complex bundling | Medium |
| Parcel | Zero-config bundling | Low |

**Recommendation:** Start without build tools, add Vite if needed for TypeScript.

### 5.4 Optional Libraries

| Library | Purpose | Required |
|---------|---------|----------|
| webextension-polyfill | Firefox compatibility | No |
| chromepoise | Testing utilities | No |
| jest-webextension | Extension testing | No |

---

## 6. Implementation Plan

### Phase 1: Setup

**Step 1.1: Create Extension Structure**

```
smartest-restore/
├── manifest.json
├── content/
│   ├── inject.js
│   └── styles.css
└── icons/
    ├── icon48.png
    └── icon128.png
```

**Step 1.2: Manifest Configuration**

```json
{
    "manifest_version": 3,
    "name": "SmarTest Functionality Restore",
    "version": "1.0.0",
    "description": "Restores standard browser functionality in SmarTest",
    "permissions": ["activeTab", "scripting"],
    "host_permissions": ["*://*.smartest.bg/*"],
    "content_scripts": [{
        "matches": ["*://*.smartest.bg/*"],
        "js": ["content/inject.js"],
        "css": ["content/styles.css"],
        "run_at": "document_start"
    }],
    "action": {
        "default_popup": "popup/popup.html",
        "default_icon": {
            "48": "icons/icon48.png",
            "128": "icons/icon128.png"
        }
    },
    "icons": {
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
    }
}
```

**Step 1.3: Icon Generation**

Create placeholder icons or generate using browser extension tools.

---

### Phase 2: Core Injection

**Step 2.1: Create `content/inject.js`**

```javascript
(function() {
    'use strict';
    
    if (window.__smartestRestoreInjected) {
        return;
    }
    window.__smartestRestoreInjected = true;
    
    console.log('[SmarTest Restore] Injecting at document_start');
    
    // Import other modules
    const apiOverride = import('./api-override.js');
    const eventHandler = import('./event-handler.js');
    
    // Initialize overrides
    if (apiOverride.initialize) {
        apiOverride.initialize();
    }
    
    if (eventHandler.initialize) {
        eventHandler.initialize();
    }
})();
```

**Step 2.2: Direct Module Approach**

For simplicity, combine all in a single file initially:

```javascript
// content/inject.js - complete early injection

(function() {
    'use strict';
    
    if (window.__smartestInjected) return;
    window.__smartestInjected = true;
    
    // ===== PHASE 2.2: API OVERRIDES =====
    
    // Override document.hidden
    Object.defineProperty(Document.prototype, 'hidden', {
        get: function() { return false; },
        configurable: false
    });
    
    // Override document.visibilityState  
    Object.defineProperty(Document.prototype, 'visibilityState', {
        get: function() { return 'visible'; },
        configurable: false
    });
    
    // Override oncontextmenu
    Document.prototype.oncontextmenu = null;
    
    console.log('[SmarTest Restore] API overrides applied');
    
})();
```

---

### Phase 3: Event Handling Adjustments

**Step 3.1: Wrap addEventListener**

```javascript
// After API overrides, add event handler management

(function() {
    'use strict';
    
    // Store original methods
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    
    // List of event types to block/filter
    const blockedEvents = ['visibilitychange', 'blur', 'focus'];
    const clipboardEvents = ['copy', 'cut', 'paste'];
    const contextMenuEvent = ['contextmenu'];
    
    // Override addEventListener
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        // Filter visibilitychange - allow but neutralize
        if (type === 'visibilitychange') {
            console.log('[SmarTest Restore] Blocked visibilitychange listener');
            return;
        }
        
        // Block blur/focus listeners
        if (type === 'blur' || type === 'focus') {
            console.log('[SmarTest Restore] Blocked', type, 'listener');
            return;
        }
        
        // Allow other events
        return originalAddEventListener.call(this, type, listener, options);
    };
    
    // Override removeEventListener - allow removal of blocked listeners
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
        return originalRemoveEventListener.call(this, type, listener, options);
    };
    
})();
```

**Step 3.2: Runtime Listener Removal**

```javascript
// Execute after page fully loads

setTimeout(function() {
    'use strict';
    
    // Remove any existing clipboard/cut/paste blockers
    const eventTypes = ['copy', 'cut', 'paste', 'contextmenu'];
    
    eventTypes.forEach(function(type) {
        const listeners = document.getEventListeners(type);
        if (listeners) {
            listeners.forEach(function(info) {
                document.removeEventListener(type, info.listener);
                console.log('[SmarTest Restore] Removed', type, 'listener');
            });
        }
    });
    
}, 1000);
```

---

### Phase 4: API Adjustments

**Step 4.1: Document Properties**

```javascript
// Additional document property overrides

Object.defineProperty(Document.prototype, 'webkitHidden', {
    get: function() { return false; }
});

Object.defineProperty(Document.prototype, 'webkitVisibilityState', {
    get: function() { return 'visible'; }
});
```

**Step 4.2: Window Properties**

```javascript
// Window focus state simulation

Object.defineProperty(Window.prototype, 'blur', {
    get: function() { return undefined; }
});

Object.defineProperty(Window.prototype, 'focus', {
    get: function() { return true; }
});
```

**Step 4.3: Fullscreen Handling**

```javascript
// Fullscreen exit handling

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    }
}, { capture: true });

// Optional: Periodic check for fullscreen enforcement
setInterval(function() {
    if (document.fullscreenElement && !document.getElementById('smartest-exit-fs-btn')) {
        // Could inject exit button
    }
}, 5000);
```

---

### Phase 5: UI Behavior Restoration

**Step 5.1: CSS Styles**

```css
/* content/styles.css */

*, *::before, *::after {
    user-select: text !important;
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
    -webkit-user-drag: auto !important;
    user-drag: auto !important;
}

[draggable="true"] {
    cursor: grab !important;
}

/* Ensure inputs remain interactive */
input, textarea, select {
    user-select: text !important;
    -webkit-user-select: text !important;
}

/* Override any inline styles */
body {
    -webkit-user-select: text !important;
    user-select: text !important;
}
```

**Step 5.2: Text Selection Force**

```javascript
// Force user-select on all elements

function forceTextSelection() {
    const allElements = document.querySelectorAll('*');
    allElements.forEach(function(el) {
        el.style.userSelect = 'text';
        el.style.webkitUserSelect = 'text';
        el.style.mozUserSelect = 'text';
        el.style.msUserSelect = 'text';
    });
}

// Run after load and periodically
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', forceTextSelection);
} else {
    forceTextSelection;
}

// Continuous restoration
setInterval(forceTextSelection, 2000);
```

---

### Phase 6: Testing

**Step 6.1: Local Testing**

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension directory
5. Navigate to SmarTest and start a test

**Step 6.2: Test Scenarios**

| Test | Expected Result |
|------|-----------------|
| Switch tabs | No violation logged |
| Right-click | Context menu appears |
| Ctrl+C / Ctrl+V | Clipboard works |
| Select text | Text is selectable |
| Press ESC | Exit fullscreen (if active) |
| Open DevTools | Works normally |

**Step 6.3: Debugging**

```javascript
// Add debug logging
const DEBUG = true;

function log(message) {
    if (DEBUG) {
        console.log('[SmarTest Restore]', message);
    }
}
```

**Console Commands:**
- `window.__smartestInjected` — check if injected
- `document.hidden` — should return `false`
- `document.visibilityState` — should return `"visible"`

---

## 7. Code Strategy

### 7.1 Overriding Properties with Object.defineProperty

```javascript
// Pattern: Override document.hidden

Object.defineProperty(Document.prototype, 'hidden', {
    get: function() {
        // Always return visible
        return false;
    },
    configurable: false  // Prevent redefinition
});
```

**Key Points:**
- Use `configurable: false` to prevent page scripts from overriding
- Set on `Document.prototype` to affect all documents
- Use getter to always return desired value

### 7.2 Monkey Patching Functions

```javascript
// Pattern: Wrap addEventListener

const originalAddEventListener = EventTarget.prototype.addEventListener;

EventTarget.prototype.addEventListener = function(type, handler, options) {
    // Filter blocked events
    if (shouldBlock(type)) {
        console.log('[Restore] Blocked:', type);
        return;
    }
    // Pass through
    return originalAddEventListener.call(this, type, handler, options);
};
```

**Key Points:**
- Store original reference before overriding
- Use `.call()` to preserve `this` context
- Add logging for debugging

### 7.3 Managing Event Listeners

```javascript
// Pattern: Remove existing listeners

function removeListener(type, handler) {
    return EventTarget.prototype.removeEventListener.call(
        document, 
        type, 
        handler
    );
}

// Get all listeners (Chrome only)
function getEventListeners(element) {
    return element._listeners || {};
}
```

### 7.4 Complete Injection Script Example

```javascript
// content/inject.js - Complete early injection script

(function() {
    'use strict';
    
    // Prevent double injection
    if (window.__smtRestoreInjected) return;
    window.__smtRestoreInjected = true;
    
    console.log('%c[SmarTest Restore] Injecting...', 'color: green; font-weight: bold;');
    
    // ===== 1. VISIBILITY API OVERRIDES =====
    
    Object.defineProperty(Document.prototype, 'hidden', {
        get: function() { return false; },
        configurable: false
    });
    
    Object.defineProperty(Document.prototype, 'visibilityState', {
        get: function() { return 'visible'; },
        configurable: false
    });
    
    Object.defineProperty(Document.prototype, 'webkitHidden', {
        get: function() { return false; },
        configurable: false
    });
    
    Object.defineProperty(Document.prototype, 'webkitVisibilityState', {
        get: function() { return 'visible'; },
        configurable: false
    });
    
    // ===== 2. EVENT LISTENER WRAPPING =====
    
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    
    const BLOCKED_EVENTS = Object.freeze([
        'visibilitychange',
        'blur', 
        'focus'
    ]);
    
    EventTarget.prototype.addEventListener = function(type, handler, options) {
        if (BLOCKED_EVENTS.includes(type)) {
            console.log('[SmarTest Restore] Blocked:', type);
            return;
        }
        return originalAddEventListener.call(this, type, handler, options);
    };
    
    // ===== 3. CONTEXT MENU =====
    
    Document.prototype.oncontextmenu = null;
    
    // ===== 4. CLIPBOARD =====
    
    const CLIPBOARD_EVENTS = ['copy', 'cut', 'paste'];
    
    CLIPBOARD_EVENTS.forEach(function(type) {
        Document.prototype['on' + type] = null;
    });
    
    // Also wrap clipboard event listeners
    const _originalClipboardAdd = originalAddEventListener;
    EventTarget.prototype.addEventListener = function(type, handler, opts) {
        if (CLIPBOARD_EVENTS.includes(type)) {
            console.log('[SmarTest Restore] Allowing clipboard:', type);
        }
        // Allow clipboard events
        return originalAddEventListener.call(this, type, handler, opts);
    };
    
    console.log('%c[SmarTest Restore] Complete', 'color: green;');
    
})();
```

---

## 8. Risks & Limitations

### 8.1 What Might Not Work

| Limitation | Description | Mitigation |
|------------|-------------|-------------|
| Backend validation | Server may validate page state | Extension only affects client |
| Heartbeat timing | Server tracks session duration | Cannot be bypassed client-side |
| IP detection | Server tracks IP address | Use VPN/proxy (if allowed) |
| Answer pattern | Server may detect anomalies | N/A — client cannot modify |
| Script injection timing | Race condition possible | Run at `document_start` |

### 8.2 Possible Backend-Side Checks

**Client Cannot Bypass:**
- Session timeout (server-side)
- IP address validation
- Device fingerprint (hardware)
- Answer validation patterns
- Heartbeat response verification
- Auto-submit after timeout

**Client Can Bypass:**
- Tab switch detection (documented in this plan)
- Focus/blur event logging
- Clipboard restrictions
- Context menu blocking
- Text selection prevention

### 8.3 Edge Cases

| Scenario | Behavior | Notes |
|-----------|----------|-------|
| Multiple tabs open | May confuse visibility state | Extension returns `false` |
| Extension disabled | Restrictions apply normally | User must enable extension |
| Incognito mode | Requires special permissions | Add to manifest |
| Mobile Chrome | Limited support | Not primary target |

### 8.4 Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome 100+ | Full support | Primary target |
| Edge 100+ | Full support | Chromium-based |
| Brave 100+ | Full support | Chromium-based |
| Firefox | Partial | Permission differences |
| Safari | Not supported | Extension API differences |

---

## 9. Future Improvements

### 9.1 Stability Improvements

- **Robust Timing Handling:** Use `requestAnimationFrame` instead of `setInterval`
- **MutationObserver:** Watch for dynamically added restrictions
- **Error Handling:** Graceful fallback if overrides fail

### 9.2 Compatibility Enhancements

- **Firefox Support:** Add `browser` polyfill or Firefox-specific manifest
- **Cross-Browser Testing:** Automate testing across browsers
- **Mobile Support:** Chrome for Android extension API

### 9.3 Additional Usability Features

**Popup UI:**
- Status indicator (active/inactive)
- Quick toggle for each feature
- Debug logging toggle

**Advanced Features:**
1. **Custom Hotkeys:** Configurable keyboard shortcuts
2. **Auto-Save:** Backup answers locally before submission
3. **Timer Display:** Show remaining time externally
4. **Export:** Download answers for review

### 9.4 Code Organization

```
Future Structure:
├── src/
│   ├── core/
│   │   ├── inject.ts        # Entry point
│   │   ├── visibility.ts    # Visibility API
│   │   ├── events.ts       # Event handling
│   │   └── clipboard.ts    # Clipboard management
│   ├── ui/
│   │   ├── popup/
│   │   └── options/
│   └── utils/
│       ├── logger.ts
│       └── storage.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 10. Final Execution Plan

### Step-by-Step from Reading This Document

**Phase 1: Initial Setup (Day 1)**
1. Create directory `smartest-restore/`
2. Create `manifest.json` with V3 manifest
3. Create basic `content/inject.js` with console logging
4. Create placeholder icons (48x48, 128x128)
5. Load extension in Chrome for testing
6. Verify injection at `document_start`

**Phase 2: Core Implementation (Day 2)**
1. Add visibility API overrides (`document.hidden`, `visibilityState`)
2. Test tab switching without violations
3. Add event listener wrapping (`blur`, `focus`, `visibilitychange`)
4. Test focus/blur behavior

**Phase 3: UI Restoration (Day 3)**
1. Add CSS styles for `user-select: text`
2. Test text selection
3. Add clipboard event handling
4. Test copy/paste functionality
5. Add context menu handling
6. Test right-click menu

**Phase 4: Testing & Refinement (Day 4)**
1. Full integration testing with real SmarTest
2. Fix edge cases and race conditions
3. Add debug logging
4. Test all scenarios documented in Section 6.2

**Phase 5: Deployment (Day 5)**
1. Create production build
2. Package as `.zip` for Chrome Web Store
3. Optional: Firefox-specific manifest
4. Document usage for end users

### Quick Start Commands

```bash
# Load extension for development
# 1. Navigate to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select smartest-restore/ directory

# Test with SmarTest
# 1. Open new tab to smartest.bg
# 2. Start a test
# 3. Switch tabs - should NOT trigger violation
# 4. Try right-click - should show menu
# 5. Try copy/paste - should work
```

### Success Criteria

| Metric | Target |
|--------|--------|
| Tab switch detection bypass | 100% |
| Clipboard functionality | Working |
| Context menu | Working |
| Text selection | Working |
| Extension stability | No crashes |
| Load time | < 100ms |

---

*Document Version: 1.0.0*
*Last Updated: May 2026*
*Target: Chrome 100+ with Manifest V3*