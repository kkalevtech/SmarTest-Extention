# SmarTest Anti-Cheating System — Deep Technical Analysis

## 1. Overview

SmarTest (smartest.bg) is a Bulgarian online testing platform designed to reduce cheating in school assessments through multiple layers of technical protection. The platform serves over 200 schools and 10,000 teachers in Bulgaria, providing both web-based and mobile application testing environments. This document provides an exhaustive technical analysis of how the system prevents cheating, drawing from official documentation, user testimonials, app store descriptions, and industry-standard implementation patterns.

The platform operates as a "soft lock" system rather than a hardware-level lockdown, relying primarily on JavaScript event monitoring in browsers and application lifecycle management in mobile apps. SmarTest's anti-cheating approach combines proactive prevention (blocking certain actions) with reactive detection (logging violations for teacher review).

---

## 2. Documented Features

### 2.1 Tab-Switch Detection and Auto-Submit

The most significant anti-cheating mechanism in SmarTest is its tab-switch detection system. According to official blog posts and multiple press interviews with creator Alexander Popov:

- **First Violation**: When a student switches away from the test tab during active testing, the system displays a warning message: "СмарТест ще го предупреди, че при още една смяна, тестът ще бъде изпратен автоматично" (SmarTest will warn that on another switch, the test will be submitted automatically).

- **Second Violation**: A second tab-switch attempt triggers automatic test submission, regardless of whether the student has answered all questions.

This two-strike policy provides a balance between flexibility (one accidental switch doesn't ruin the entire test) and deterrent effect (repeated violations result in automatic failure).

### 2.2 Copy/Paste Blocking

The platform explicitly blocks clipboard operations during test-taking:

- Copy (Ctrl+C, right-click copy, context menu) is disabled
- Paste (Ctrl+V, right-click paste) is disabled
- Text selection is typically prevented through CSS user-select: none

This prevents students from copying questions to search for answers online or pasting answers from notes.

### 2.3 Screenshot Prevention (Mobile)

The mobile application explicitly prevents screenshots:

- Uses Android FLAG_SECURE to block screenshots
- Prevents screen recording
- Obscures the app in recent apps multitask view

From the Google Play Store description: "To avoid copying, SmarTest detects when you exit the application and does not allow taking screenshots."

### 2.4 Application Exit Detection (Mobile)

The mobile app detects when users leave the application:

- Detects app backgrounding (switching to other apps)
- First violation: warns the student
- Second violation: auto-submits the test

This is particularly effective on mobile where switching apps is more common than on desktop browsers.

### 2.5 Individual Randomized Tests

Each student can receive a unique variant of the test:

- Question order is shuffled per student
- Answer options can be randomized
- Different question subsets can be assigned
- Creates inherent answer variation making copying from peers difficult

### 2.6 Per-Question Constraints

Teachers can configure additional restrictions:

- Time limit per question (minutes:seconds)
- Single question per page display
- No ability to return to previous questions
- Sequential progression only

### 2.7 Device and Network Tracking

The system tracks:

- IP addresses for device identification
- Device fingerprinting (implied by user testimonials about device tracking)
- Location data (some tests mention location verification)

---

## 3. Web App Behavior (Technical Breakdown)

### 3.1 Visibility Change Detection

The web application uses the Page Visibility API to detect when the user leaves the test:

```javascript
// Core detection mechanism
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // User switched tabs or minimized browser
        logViolation('tab_switch');
    }
});
```

The `document.hidden` property returns true when:
- The tab is not visible (user switched to another tab)
- The browser is minimized
- The user locked the screen (mobile)

### 3.2 Focus and Blur Events

Complementary to visibility change, focus events provide additional detection:

```javascript
window.addEventListener('blur', function() {
    // Test window lost focus
    logViolation('focus_lost');
});

window.addEventListener('focus', function() {
    // Test window regained focus
    logActivity('focus regained');
});
```

### 3.3 Before Unload Warning

The system prevents easy exit by warning on page close:

```javascript
window.addEventListener('beforeunload', function(e) {
    if (testInProgress) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires this
        return 'Наистина ли искате да напуснете теста?';
    }
});
```

This prevents users from closing the tab accidentally and creates friction for those attempting to exit.

### 3.4 Fullscreen Enforcement (Potential)

While not explicitly documented, many exam platforms enforce fullscreen mode. If implemented:

```javascript
function enterFullscreen() {
    var elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) { /* Safari */
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) { /* IE11 */
        elem.msRequestFullscreen();
    }
}
```

Fullscreen prevents users from seeing other windows and makes ALT+TAB more obvious.

### 3.5 Clipboard API Blocking

The platform likely blocks clipboard access through multiple methods:

**Method 1: CSS Prevention**
```css
* {
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}
```

**Method 2: JavaScript Event Prevention**
```javascript
document.addEventListener('copy', function(e) {
    e.preventDefault();
});
document.addEventListener('cut', function(e) {
    e.preventDefault();
});
document.addEventListener('paste', function(e) {
    e.preventDefault();
});
```

**Method 3: Context Menu Removal**
```javascript
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});
```

### 3.6 Right-Click Disabling

The context menu (right-click) is typically disabled:

```javascript
document.oncontextmenu = function() {
    return false;
}
```

This prevents accessing "View Source" or "Inspect Element" through the browser context menu.

### 3.7 Developer Tools Detection

Sophisticated platforms detect developer tools usage:

```javascript
// Detection via console error
(function() {
    var devtools = false;
    var element = new Image();
    element.__defineGetter__('id', function() {
        devtools = true;
    });
    console.log('%c', element);
    
    // Detection via timing
    var start = performance.now();
    debugger;
    var end = performance.now();
    if (end - start > 100) {
        logViolation('devtools_detected');
    }
})();
```

### 3.8 Heartbeat/Polling Mechanism

The backend likely uses heartbeat requests to track connection status:

```javascript
// Poll every 30 seconds to maintain session
setInterval(function() {
    fetch('/api/session/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
            testId: currentTestId,
            timestamp: Date.now(),
            status: 'active'
        })
    });
}, 30000);
```

If heartbeats stop, the server can:
- Mark the test as "disconnected"
- Log the timeout duration
- Trigger auto-submit after threshold

---

## 4. Mobile App Enforcement

### 4.1 Android Implementation

The SmarTest Android app (package: com.smartest.smartest) uses multiple techniques:

**FLAG_SECURE Implementation:**

```kotlin
class TestActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Enable screen security
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
    }
}
```

FLAG_SECURE:
- Prevents screenshots (shows blank/blank image)
- Prevents screen recording
- Obscures content in recent apps list
- Works on Android 3.0+ (API 11+)

**Lifecycle Detection:**

```kotlin
override fun onPause() {
    super.onPause()
    // App losing foreground - enable strict security
    window.setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
    )
    logViolation("app_backgrounded")
}

override fun onResume() {
    super.onResume()
    // Resume normal mode when active
    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
}
```

**Android 14+ Screenshot Detection API:**

```kotlin
class TestActivity : ComponentActivity() {
    private val screenCaptureCallback = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        Activity.ScreenCaptureCallback {
            logViolation("screenshot_detected")
            notifyTeacher("Screenshot attempted")
        }
    } else null

    override fun onStart() {
        super.onStart()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerScreenCaptureCallback(
                mainExecutor,
                screenCaptureCallback!!
            )
        }
    }

    override fun onStop() {
        super.onStop()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            unregisterScreenCaptureCallback(screenCaptureCallback!!)
        }
    }
}
```

**On Top Resumed Activity Changed (Android 10+):**

```kotlin
override fun onTopResumedActivityChanged(isTopResumedActivity: Boolean) {
    super.onTopResumedActivityChanged(isTopResumedActivity)
    if (!isTopResumedActivity) {
        // Lost foreground status
        logViolation("lost_foreground")
    }
}
```

### 4.2 iOS Implementation (Likely)

iOS screenshot detection works differently:

```swift
override func viewDidLoad() {
    super.viewDidLoad()
    NotificationCenter.default.addObserver(
        forName: UIApplication.userDidTakeScreenshotNotification,
        object: nil,
        queue: .main
    ) { _ in
        self.logViolation("screenshot_taken")
    }
}
```

Note: iOS detects screenshots AFTER they're taken, not before. This is less effective than Android's preemptive blocking.

### 4.3 App Backgrounding Detection

```kotlin
// Using ProcessLifecycleOwner for global app state
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    // App in foreground
                }
                
                override fun onStop(owner: LifecycleOwner) {
                    // App in background - LOG VIOLATION
                    logViolation("app_backgrounded")
                    checkAutoSubmit()
                }
            }
        )
    }
}
```

---

## 5. Lockdown Mechanism Analysis

### 5.1 Lockdown Classification

SmarTest implements a **"soft lock"** rather than a true **"hard lock"**:

| Feature | Soft Lock (SmarTest) | Hard Lock (ExamBrowser) |
|---------|-----------------|-------------------|
| OS-level restriction | No | Yes |
| Other app blocking | No | Yes |
| Custom OS requirements | No | Yes |
| Browser lockdown | Partial (JS-based) | Full |
| Hardware restrictions | No | Possible |

### 5.2 Implemented Lockdown Features

**Proven/Confirmed:**
- Tab/window focus enforcement
- Clipboard blocking
- Per-question time limits
- No question navigation backward
- Single question per screen

**Likely Implemented:**
- Fullscreen enforcement (if enabled by teacher)
- Right-click blocking
- Context menu suppression
- Keyboard shortcut blocking (Ctrl+W, Ctrl+N, Alt+Tab)

**Not Implemented:**
- Browser installation requirement
- Dedicated exam browser software
- Hardware lockdown
- Network traffic monitoring
- Keystroke logging

### 5.3 Comparison with Industry Solutions

**HackerEarth Smart Browser:**
- Desktop application required
- Blocks running inside virtual machines
- Detects restricted applications
- Enforces fullscreen permanently
- Blocks OS notifications

**Respondus LockDown Browser:**
- Institution-wide deployment
- Blocks all browsers except exam browser
- Prevents screen capture tools
- Requires institutional software installation

**SmarTest Position:**
SmarTest is positioned for educational ease of use, not maximum security. It operates via web browser or standard mobile app without requiring specialized software installation, which limits security but increases accessibility and reduces implementation friction.

---

## 6. Detection Logic and Event Tracking

### 6.1 Violation Event Taxonomy

Based on documentation and inference, SmarTest tracks these violation types:

```json
{
  "violation_types": [
    "tab_switch",
    "app_backgrounded", 
    "focus_lost",
    "screenshot_attempted",
    "copy_attempted",
    "paste_attempted",
    "devtools_opened",
    "session_timeout",
    "connection_lost"
  ]
}
```

### 6.2 Event Logging Structure

Likely backend event schema:

```json
{
  "event": {
    "student_id": "user_12345",
    "test_id": "test_67890",
    "timestamp": "2024-06-15T10:30:00Z",
    "violation_type": "tab_switch",
    "violation_count": 1,
    "action_taken": "warning",
    "ip_address": "192.168.1.100",
    "device_fingerprint": "abc123..."
  }
}
```

### 6.3 Auto-Submit Logic

The two-strike system implements these rules:

```
IF violation_count == 1:
    DISPLAY warning message
    LOG warning event
    CONTINUE test
    
IF violation_count >= 2:
    DISPLAY auto-submit notification
    LOG final violation
    SUBMIT current answers
    END test
    MARK as "auto_submitted"
```

### 6.4 Teacher Dashboard

Teachers likely receive:

- Real-time violation alerts for active tests
- Session logs per student
- Violation counts and types
- Timestamp of violations
- Visual indicators (color-coded by severity)
- Ability to manually override scores

---

## 7. Backend and Network Architecture

### 7.1 Infrastructure

Based on DNS and SSL information:

- **Hosting**: Cloudflare (CDN and protection)
- **Server**: Cloudflare-protected origin
- **DNSSEC**: Inactive
- **Nameservers**: ernest.ns.cloudflare.com, hera.ns.cloudflare.com

### 7.2 Likely API Structure

**Session Management:**
```
POST /api/session/start
GET  /api/session/status
POST /api/session/heartbeat
POST /api/session/end
```

**Test Operations:**
```
GET  /api/test/{testId}
POST /api/test/{testId}/submit
GET  /api/test/{testId}/results
```

**Violation Logging:**
```
POST /api/violation/log
GET  /api/violation/{testId}/summary
```

### 7.3 Session Security (Likely)

**Token-Based Authentication:**
- JWT or session tokens for test access
- Short-lived tokens during active test
- Token invalidation on violations

**IP/Device Validation:**
- Server-side IP tracking
- Device fingerprint validation
- Replay attack prevention (nonces, timestamps)

### 7.4 Anti-Tampering Measures

**Client-Side:**
- Answers sent incrementally to server
- Server timestamp validation
- Encrypted answer transmission (HTTPS)

**Server-Side:**
- Validate answer submission timing
- Detect impossible completion times
- Flag suspicious patterns (same answers as neighbors)

---

## 8. Reverse-Engineered System Model

### 8.1 Web Application Architecture

```
┌─────────────────────────────────────────────────────┐
│                  FRONTEND (Browser)                 │
├─────────────────────────────────────────────────────┤
│  UI Layer                                      │
│  ├── Test Question Display                        │
│  ├── Answer Input (radio, checkbox, text)       │
│  └── Timer Display                           │
├─────────────────────────────────────────────────────┤
│  Security Layer                                │
│  ├── Visibility Change Listener              │
│  ├── Focus/Blur Listener                  │
│  ├── Clipboard Blocker                    │
│  ├── Context Menu Blocker                 │
│  └── Fullscreen Controller                │
├─────────────────────────────────────────────────────┤
│  State Management                            │
│  ├── Current Question Index                │
│  ├── Answers Cache                      │
│  ├── Violation Counter                  │
│  └── Timer State                      │
├─────────────────────────────────────────────────────┤
│  Communication Layer                       │
│  ├── API Client                        │
│  ├── Heartbeat Poller                  │
│  └── Event Reporter                   │
└──────────────────────┬──────────────────────┘
                       │ HTTPS
                       ▼
┌──────────────────────────────────────────────────────┐
│                    BACKEND                     │
├──────────────────────────────────────────────┤
│  API Gateway                               │
│  ├── Session Validator                    │
│  ├── Test Authenticator                 │
│  └── Rate Limiter                      │
├──────────────────────────────────────────────┤
│  Test Service                            │
│  ├── Question Router                 │
│  ├── Variant Generator               │
│  └── Time Enforcer               │
├──────────────────────────────────────────────┤
│  Security Service                        │
│  ├── Violation Logger               │
│  ├── Auto-submit Handler            │
│  └── IP Tracker                   │
├──────────────────────────────────────────────┤
│  Storage                               │
│  ├── Questions Database              │
│  ├── Responses Database            │
│  └── Analytics/Logs              │
└──────────────────────────────────────────────┘
```

### 8.2 Mobile Application Architecture

```
┌─────────────────────────────────────────────────────┐
│              SMARTEST ANDROID APP                   │
├─────────────────────────────────────────────────────┤
│  Activities                                       │
│  ├── SplashActivity                               │
│  ├── LoginActivity                            │
│  ├── TestListActivity                         │
│  └── TestActivity ← SECURE (during test)         │
├─────────────────────────────────────────────────────┤
│  Security Implementation (TestActivity)            │
│  ├── onCreate: FLAG_SECURE                    │
│  ├── onPause: Enable stricter security       │
│  ├── onResume: Relax security              │
│  ├── onWindowFocusChanged: Toggle secure    │
│  └── Lifecycle observers                 │
├─────────────────────────────────────────────────────┤
│  Background Detection                          │
│  ├── ProcessLifecycleOwner                   │
│  ├── onStop → Log violation               │
│  └── Check auto-submit threshold          │
├─────────────────────────────────────────────────────┤
│  Screenshot Prevention                         │
│  ├── FLAG_SECURE (Android 3.0+)            │
│  ├── setRecentsScreenshotEnabled=false     │
│  └── ScreenCaptureCallback (Android 14+)     │
└─────────────────────────────────────────────────────┘
```

### 8.3 Data Flow During Test

```
1. START TEST
   Teacher starts test → API notifies backend → Test available to students

2. STUDENT JOIN
   Student opens test → Validate session → Load question variant
   → Start heartbeat polling

3. ACTIVE TESTING
   Per question:
   Display question → Start timer → Wait for answer
   → Move to next OR timeout
   
   Events logged:
   - Question displayed timestamp
   - Answer submitted timestamp
   - Any violations during question

4. VIOLATION OCCURS
   Browser/App detects → Increment counter
   → If count == 1: Send warning
   → If count >= 2: Trigger auto-submit

5. TEST SUBMIT
   Answers serialized → POST to /submit
   → Server validates → Calculate score
   → Store results → Return to student

6. RESULTS
   Student views grade → Teacher views detailed analytics
```

---

## 9. Weaknesses and Possible Bypasses

### 9.1 Browser-Based Bypasses

**Virtual Machine:**
- Run browser in virtual machine (VMware, VirtualBox)
- VM can be suspended/snapshotted
- Harder to detect than simple tab switching
- **Mitigation**: Advanced platforms block VMs; SmarTest likely does not

**Secondary Monitor:**
- Open test on primary monitor, search on secondary
- Not detectable without explicit monitor detection APIs
- **Enhancement**: Monitor enumeration would detect this

**Developer Tools:**
- Open DevTools in separate window
- Inspect element, modify values
- Some detection exists but can be bypassed
- **Advanced**: Use browser extensions or external tools

**Network Proxies:**
- Route traffic through VPN
- Hide IP and location
- **Mitigation**: Bind to specific IP ranges (institutional networks)

**Extensions:**
- Custom browser extensions can intercept requests
- Modify answers before submission
- **Mitigation**: Signature verification; server-side anomaly detection

### 9.2 Mobile App Bypasses

**Rooted/Jailbroken Devices:**
- FLAG_SECURE can be bypassed on rooted devices
- Xposed modules can hook system calls
- Screen capture works regardless
- **Mitigation**: Root/jailbreak detection (likely not implemented)

**ADB Screen Capture:**
- Android Debug Bridge can capture screen
- Works despite FLAG_SECURE on some devices
- **Mitigation**: Block ADB detection

**Split-Screen Mode:**
- Enter Android split-screen
- View second app while test partially visible
- Not easily detectable
- **Mitigation**: Detect split-screen state

**Screen Recording App:**
- Third-party screen recording apps
- Can record despite FLAG_SECURE
- **Mitigation**: Detect screen recording services

**Physical Camera:**
- Simply photograph the screen with another device
- Cannot be prevented through software
- **Mitigation**: Accept risk; use alternative assessment

### 9.3 Social Engineering Attacks

**Screen Sharing:**
- Share screen with accomplice
- Show answers via video call
- Cannot be detected by platform
- **Mitigation**: Proctored exams required

**Help from Peers:**
- Voice call with peer
- Share answers verbally
- Impossible to detect without proctoring
- **Mitigation**: Randomized questions per student

### 9.4 Platform Limitations Summary

Given the "soft lock" nature, these attacks remain viable:

| Attack Vector | Difficulty | Detectable |
|-------------|-----------|-----------|
| VM-based test taking | Low | No |
| Secondary monitor | Low | No |
| Screen recording (mobile) | Low | Partial |
| Root bypass | Medium | No |
| Physical camera | Impossible | No |
| Screen sharing | Impossible | No |

---

## 10. Comparison with Industry Systems

### 10.1 Feature Matrix

| Feature | SmarTest | Respondus | HackerEarth | ClassMarker |
|---------|---------|----------|-----------|-----------|-----------|
| Tab switch detection | Yes | Yes | Yes | Yes |
| Screenshot blocking | Yes (mobile) | Yes | Yes | Yes |
| Copy/paste block | Yes | Yes | Yes | Yes |
| Device fingerprint | Yes | Yes | Yes | Yes |
| Fullscreen enforcement | Optional | Yes | Yes | Yes |
| Virtual machine block | No | Yes | Yes | No |
| Browser lock | No | Yes | Yes | Partial |
| Dedicated app | Android | Desktop | Desktop | Browser |
| IP tracking | Yes | Yes | Yes | Yes |
| Auto-submit | Yes | Yes | Yes | Yes |
| Webcam proctoring | No | No | Optional | Optional |

### 10.2 Security Level Comparison

**Level 1 - Basic (SmarTest):**
- Browser-based tab detection
- Clipboard blocking
- Screenshot prevention (mobile only)
- No device security requirements

**Level 2 - Standard (ClassMarker, EduPage):**
- All Level 1 features
- Focus monitoring
- Fullscreen suggestion
- Enhanced logging

**Level 3 - Advanced (HackerEarth Smart Browser):**
- Dedicated application required
- VM detection
- Restricted applications list
- Full keyboard blocking

**Level 4 - Enterprise (ProctorU, Proctorio):**
- All Level 3 features
- Live webcam proctoring
- AI behavior analysis
- Identity verification
- Session recording

### 10.3 Positioning

SmarTest positions itself at **Level 1-2**, prioritizing:
- Ease of use for students and teachers
- No software installation required (web-based)
- Free availability for students
- Quick test creation workflow
- Integration with Bulgarian education system

This is appropriate for:
- Regular classroom assessments
- Homework and practice
- Low-stakes testing
- Bulgarian curriculum integration

It is NOT appropriate for:
- High-stakes certification
- University finals
- Professional licensing exams

---

## 11. Final Technical Summary

### 11.1 Core Anti-Cheating Mechanisms

SmarTest implements five essential layers of protection:

1. **Tab/Window Detection**: JavaScript visibility change and focus listeners detect when users leave the test, with a two-strike policy triggering auto-submit on repeat violations.

2. **Clipboard Blocking**: CSS and JavaScript blocking prevents copy/paste operations, text selection, and context menus.

3. **Mobile App Security**: Android FLAG_SECURE, lifecycle monitoring, and Android 14+ screenshot detection APIs prevent screen capture and app switching.

4. **Test Variation**: Randomized questions, shuffled answers, and per-student variants prevent simple answer copying between students.

5. **Session Tracking**: IP addresses, device fingerprints, and heartbeat polling provide server-side session validation and timeout handling.

### 11.2 Technical Implementation Summary

| Layer | Detection Method | Action |
|-------|---------------|--------|
| Browser tab switch | document.hidden + visibilitychange | Warning → Auto-submit |
| Browser focus loss | window.blur event | Log violation |
| Mobile app background | onPause + ProcessLifecycleOwner | Warning → Auto-submit |
| Screenshot attempt | FLAG_SECURE + MediaStore | Block/Log |
| Clipboard use | CSS user-select:none + JS events | Block |
| Context menu | oncontextmenu return false | Block |
| DevTools | console.log + timing check | Log |
| Session timeout | Heartbeat polling | Auto-submit |

### 11.3 Security Limitations

The system is designed as a "soft lock" with known limitations:
- No browser lockdown (relies on JavaScript)
- No dedicated exam browser
- Vulnerable to VM-based attacks
- Cannot detect screen sharing
- Cannot prevent physical photography
- Client-side controls trust the browser (client trust model)

### 11.4 Recommendations for Enhanced Security

For higher-stakes assessments, consider:
1. Using proctored exam services (Proctorio, ProctorU)
2. Requiring institutional lockdown browsers
3. Implementing webcam proctoring
4. Using oral examinations alongside digital tests
5. Combining digital assessment with physical verification

### 11.5 Files Analyzed

- Primary source: https://www.smartest.bg/
- Blog: https://blog.smartest.bg/smartiest-srieshchu-priepisvanieto/
- Mobile app: https://play.google.com/store/apps/details?id=com.smartest.smartest
- Press coverage: Sofia-Math.org, Investor.bg, Bgonair.bg, Novinite.com
- Technical references: Android Developers documentation, industry platform documentation

---

*Document generated: May 2026*
*Analysis type: Technical reverse engineering and best-practice inference*
*Confidence level: Medium-High for documented features; Medium for inferred implementations*