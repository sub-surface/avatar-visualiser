# Session Log — February 2026

## 1. Social & Metadata
*   **Open Graph Support:** Added standard OG meta tags to `index.html` (`og:title`, `og:image`, etc.) for high-quality social media previews.
*   **Capture Utility:** Implemented a temporary high-resolution (1200×630) screenshot tool triggered by the 'P' key to generate the project's `preview.png`. Logic was removed post-generation to keep the production build lean.

## 2. UI/UX Architecture
*   **Top-Right Chrome:** Migrated file loading and export actions from the central overlay to a dedicated "Actions" section in the top-right corner.
*   **Metadata Flow:** 
    *   "Load File" now triggers the file picker.
    *   Upon selection, the Parameters Panel automatically expands, prompting the user to check song metadata (Artist, Title, BPM) and export settings.
    *   The "Render Video" button remains disabled until a valid source file is loaded.
*   **Visual Feedback:** Enhanced the `#progress` element with high-contrast colors and added detailed console logging for the entire export lifecycle (decoding, encoding, flushing, muxing).

## 3. Export Pipeline Enhancements
*   **Dynamic Resolution:** Removed fixed constants in favor of a dynamic system that calculates resolution based on orientation and quality presets.
*   **Multi-Mode Support:** Updated the `runExport` loop to branch logic based on the active `visMode` (`bowl`, `polar`, `sphere`, or `wave`), ensuring parity between the live view and the rendered output.
*   **Robust Encoding:** 
    *   Implemented a tiered fallback system for `VideoEncoder`. It now attempts High-Profile Quantizer mode first, falling back to Main Profile (8Mbps) or Baseline (5Mbps) if necessary.
    *   Added periodic `venc.flush()` calls every 30 frames to prevent memory congestion in the browser's encoder buffer.
*   **Security Fixes:** Moved `showSaveFilePicker` to the immediate start of the user gesture to prevent context expiration during long audio decoding tasks.

## 4. PS2 "Lo-Fi" Aesthetic Preset
Implemented an authentic 6th-gen console aesthetic via the `lofi` export preset:
*   **Resolution:** 640×480 (4:3 aspect ratio).
*   **Signal Instability:** Injected a frame-based random jitter to the camera position during export to simulate unstable analog video/composite sync.
*   **Bitrate Constraints:** Lowered the target bitrate to 1.5Mbps to introduce subtle "FMV-style" compression artifacts.
*   **Aliasing:** Forced a 1x pixel ratio during render to avoid modern high-DPI smoothing, giving the scanlines a sharper, more hardware-native look.

## 5. DSP & Logic Fixes
*   **Polar Mode:** Corrected the radius calculation in `applyPolar`. It now uses addition for displacement, making the rings expand outward on audio peaks rather than shrinking.
*   **Memory Efficiency:** Verified that `computeFFTBinsInto` correctly utilizes pre-allocated scratch buffers, preventing garbage collection spikes during high-resolution exports.
*   **Error Handling:** Fixed a suite of runtime errors including a `SyntaxError` (duplicate `be` declaration) and several `ReferenceErrors` related to initialization order.

## 6. Testing Suite (`tests.html`)
Expanded the test coverage to include:
*   **Export Settings:** Verification of the resolution calculation logic across all combinations of presets and orientations.
*   **Pipeline Diagnostics:** Tests for mono-mixing accuracy and asymmetric slew-limit behavior in the envelope followers.
*   **DSP Monotonicity:** Added boundary checks for the 'dnb' scale frequency mapping.
