# Camera Control Debug & Test System

## Overview

A comprehensive logging and testing system has been integrated into the camera control system to diagnose issues with mouse controls and slider interactions.

## How It Works

### Event Logging System
The system tracks:
- **Slider interactions**: When you drag any camera parameter slider, it logs `SLIDER_POINTERDOWN`, `SLIDER_POINTERUP`, `SLIDER_MOUSEDOWN`, `SLIDER_MOUSEUP`
- **Controls state changes**: Logs when `controls.enabled` is set to `true` or `false`
- **Canvas events**: Logs mouse/pointer events hitting the canvas (5% sample rate to avoid spam)
- **OrbitControls callbacks**: Logs when controls emit `start`, `change`, `end` events

### Available Console Commands

Open DevTools (F12) and run these in the console:

#### `checkCamera()`
Shows the current camera state including:
- Whether controls are enabled
- Current camera position (x, y, z)
- Current look-at target position
- Recent 10 log entries

```javascript
checkCamera()
// Output: Shows complete control state and recent events
```

#### `testCamera()`
Runs an automated 3-second test animation:
- Moves the camera in a circular path
- Prints position changes every 100ms
- Useful to verify camera can actually move

```javascript
testCamera()
// Output: Runs animation and logs positions
```

#### `getRecentLogs()`
Shows the last 20 logged events with timestamps:
- Event type
- Control state
- Camera position
- Relevant data

```javascript
getRecentLogs()
// Output: Array of last 20 events
```

#### `clearCameraLogs()`
Clears the event log to start fresh analysis

```javascript
clearCameraLogs()
```

#### `toggleCameraDebug()`
Enables/disables logging (useful to reduce noise during testing)

```javascript
toggleCameraDebug()
```

## Troubleshooting Workflow

### Step 1: Check If Controls Are Enabled
```javascript
checkCamera()
// Look at the "controlsEnabled" field
```

### Step 2: Test Manual Camera Movement
```javascript
testCamera()
// Watch console for position changes
// If positions don't change, the camera update loop isn't responding
```

### Step 3: Try Moving Mouse on Canvas
1. Open DevTools
2. Run `clearCameraLogs()`
3. Try dragging on the canvas with different mouse buttons
4. Run `getRecentLogs()` to see what events arrived

### Step 4: Examine Slider Behavior
1. Run `clearCameraLogs()`
2. Drag a camera slider (X, Y, Z, or Look Y)
3. Run `getRecentLogs()` to see:
   - `SLIDER_POINTERDOWN` → `CONTROLS_DISABLED` transition
   - `SLIDER_POINTERUP` → `CONTROLS_ENABLED` transition
   - Expected order: DOWN → DISABLED → UP → ENABLED

### Step 5: Check if Canvas Gets Events
If sliders work but canvas doesn't:
1. Run `clearCameraLogs()`
2. Open DevTools > Elements/Inspector
3. Click on the canvas to select it
4. Try clicking/dragging the canvas
5. Run `getRecentLogs()` to see if `CANVAS_MOUSEDOWN`, `CANVAS_POINTERDOWN` events appear

## Reasoning About Control Flow

### Expected Flow When Dragging Canvas
```
User mouse down on canvas
  ↓
Canvas receives `mousedown`/`pointerdown`
  ↓
OrbitControls captures event
  ↓
Controls emit `start` event
  ↓
Camera update loop reflects position changes
  ↓
`CONTROLS_CHANGE` events logged
  ↓
User mouse up
  ↓
Canvas receives `mouseup`/`pointerup`
  ↓
OrbitControls releases capture
  ↓
Controls emit `end` event
```

### Expected Flow When Dragging Slider
```
User mouse down on slider
  ↓
Slider receives `mousedown`/`pointerdown`
  ↓
Event handler sets controls.enabled = false
  ↓
Events stopped from propagating to canvas
  ↓
User drags slider (no camera movement)
  ↓
User mouse up on slider
  ↓
Slider receives `mouseup`/`pointerup`
  ↓
Event handler sets controls.enabled = true
  ↓
Canvas is now ready to receive events again
```

## Potential Issues to Look For in Logs

### Issue: Controls Never Get Enabled
**Symptom**: `CONTROLS_DISABLED` logged but no corresponding `CONTROLS_ENABLED`
**Cause**: Mouse up event not firing (common with sticky mouse)
**Solution**: Check if `SLIDER_POINTERUP` or `SLIDER_MOUSEUP` appeared in logs

### Issue: Canvas Events Missing
**Symptom**: Moving mouse, but no `CANVAS_MOUSEDOWN`, `CANVAS_POINTERDOWN` in logs
**Possible Causes**:
- Canvas might be covered by UI overlay
- Canvas might have `pointer-events: none` in CSS
- Events bubbling prevented elsewhere

### Issue: OrbitControls Never Emits 'start'
**Symptom**: `CANVAS_MOUSEDOWN` appears but no `CONTROLS_START` follows
**Cause**: Controls might be disabled or not properly connected to canvas
**Solution**: Check if `controlsEnabled` field is `false` in log entries

### Issue: Camera Position Not Changing
**Symptom**: `CONTROLS_START` and `CONTROLS_CHANGE` logged, but camera.position unchanged
**Cause**: Animation loop might not be running or camera.position not being updated
**Solution**: Run `testCamera()` to verify if direct position changes work

## Sample Log Output

```
[CAM] [+0.001s] INIT {
  time: 1234567890,
  event: "INIT",
  controlsEnabled: true,
  cameraPos: {x: "0.00", y: "5.50", z: "9.00"},
  info: "Camera controls initialized"
}

[CAM] [+0.234s] CANVAS_POINTERDOWN {
  time: 1234567891,
  event: "CANVAS_POINTERDOWN",
  x: 512,
  y: 384,
  buttons: 1,
  button: 0,
  controlsEnabled: true
}

[CAM] [+0.245s] CONTROLS_START {
  time: 1234567892,
  event: "CONTROLS_START",
  controlsEnabled: true,
  userInteracting: true
}

[CAM] [+0.251s] CONTROLS_CHANGE {
  time: 1234567893,
  event: "CONTROLS_CHANGE",
  controlsEnabled: true,
  saving: true
}
```

## Key Properties to Monitor

- **`controls.enabled`**: True = controls responding to input, False = disabled
- **`window.isUserInteractingWithCamera`**: True = user is actively manipulating camera
- **`controls.target`**: The point the camera looks at
- **`camera.position`**: Current camera location in 3D space
- **`controls.autoRotate`**: Whether auto-rotation is active (should be false for manual control)

## Next Steps

1. Open the app in a browser
2. Open DevTools (F12)
3. Run `checkCamera()` to establish baseline
4. Try moving the camera by dragging the canvas
5. Run `getRecentLogs()` to see what happened
6. Share the logs if camera still isn't responding

The logs will show exactly where in the control flow the interaction is breaking down.
