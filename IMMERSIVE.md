# PC immersive preview and Meta Quest mixed reality

Open the immersive-mode chooser from the headset button in the atlas. The desktop preview, immersive VR and mixed reality use the same map and object catalogue.

## Preview on a PC

Choose **Start desktop preview**. This works in a desktop browser with WebGL and does not require WebXR or a headset. It provides a first-person view of the spatial map, with mouse and keyboard standing in for headset movement. It is a single-camera preview; stereoscopic depth, tracked hands and physical passthrough require a headset.

| Control | Action |
| --- | --- |
| W / A / S / D | Walk forward, left, backward and right |
| Q / E | Move down / up |
| Shift | Move faster |
| Drag the map background | Look around |
| Click an object | Select it |
| Enable mouse look | Enable pointer-lock mouse look |
| R or Reset placement | Place the map around the current viewpoint again |
| Reference-level selector | Change astronomical reference level |
| Room scale / Tabletop | Choose a surrounding volume or a smaller map in front of the viewer |
| Map size and rotation controls | Transform the map explicitly |
| Search / Object data | Find catalogue objects and inspect the current selection |
| Hide controls | Remove the text overlay; the restore button shows it again |
| Esc | Release pointer lock, close a dialog or leave the preview, as applicable |
| Exit preview | Return to the desktop atlas |

Movement pauses while a dialog is open or browser focus is lost. Exiting restores the desktop map controls. The reference level chosen during preview remains available on the desktop.

## Quest: walk inside the map

Open the atlas in the Quest browser and choose **Mixed reality** for the map over the room's passthrough view, or **VR** for the fully virtual background. Availability is detected independently for each mode. A disabled headset option does not prevent the PC preview from starting.

The default **Room scale** layout fits the current map into a volume approximately **12 metres across**. Its initial centre is near the viewer, slightly below eye level. The map then stays at that position in the session's tracked reference space. Turning your head or walking does not drag the map along with you. Objects consequently exhibit positional parallax as you move between them.

The volume's size is adjustable. **Tabletop** provides the smaller overview in front of the viewer. Recentring explicitly places the map again relative to the current tracked position.

| Hand or controller input | Action |
| --- | --- |
| Point, then brief pinch / trigger | Select an object or panel control |
| Hold a pinch or controller grip | Move and rotate the map from its current transform |
| Two simultaneous grips / pinches | Scale and rotate the map |
| Object focus on the panel | Bring the selected object into inspection range |
| Panel reference controls | Change the astronomical view |
| Panel recenter | Place the map around the current viewer again |
| Panel hide controls | Hide writing; select the small restore control to show it again |
| Panel exit | End the session and restore the desktop atlas |

After releasing a manipulation, the map keeps its resulting position, orientation and scale. The camera always follows headset tracking. Catalogue positions stay unchanged; interaction transforms their common map coordinate frame.

The reference space is **session-local** (`local-floor`), with metre units and a floor-relative origin. It is not an absolute geographic coordinate system, and map placement is not saved as a persistent room anchor between sessions. If the platform resets its tracking origin and supplies a transform, the map placement is compensated to preserve its physical location. Otherwise the application recentres it and reports the change.

Earth sky and NASA catalogue sky views are angular projections. They remain centred as a sky around the observer: walking through them would imply distances that those projections do not contain. Desktop translation is disabled for these views; looking and selecting still work. Use a spatial map level or a constellation's **3D space** view to explore a volume.

## Animated map projection

PC preview, VR and mixed reality share a gradual map opening: luminous arcs expand through the surrounding reference grid as the map becomes visible. Fine cyan lines and amber particles provide depth cues inside spatial views. Selecting an object produces a local pulse; manipulating the map adds light near the hands or controllers. The effects do not change catalogue coordinates or move the viewer.

Use **Replay opening** in the PC preview controls to run the opening again without changing the map placement. **Reset placement** also replays it when the map is placed again. The existing **Particle effects** layer controls the additional holographic effects. Lower rendering quality reduces their particle count. The browser's reduced-motion preference replaces animated effects with a static presentation.

Angular sky views keep effects on the sky projection and omit the surrounding particle volume, since those views do not supply physical distances. In mixed reality the effects remain transparent over passthrough.

## Open the atlas securely in a headset

WebXR sessions require a secure browser context. A plain `http://<PC-LAN-address>:5173` address is insufficient.

Use an HTTPS deployment, or start the existing development server with a certificate already trusted by the headset:

```sh
TLS_CERT=/path/to/cert.pem TLS_KEY=/path/to/key.pem npm run dev
```

If the Quest is already configured for USB development and authorised for ADB, USB reverse forwarding is another option:

```sh
npm run dev
# In a second terminal with the authorised Quest connected:
adb reverse tcp:5173 tcp:5173
```

Then open `http://localhost:5173` **in the Quest browser**. Localhost is treated as a trustworthy origin. The browser may request permission to start an immersive session and enable supported hand tracking.

## Rendering and verification

Mixed reality requests WebXR `immersive-ar` and uses a transparent render background so the device compositor can show passthrough. VR requests `immersive-vr`. Both require `local-floor`; hand tracking is optional and controllers remain supported. The application does not implement room scanning, physical-object occlusion or cross-session anchors.

The map's room scale is a presentation scale. Existing astronomical coordinate data and the documented schematic planetary sizes and separations continue to apply. The PC preview and headset modes do not convert schematic views into a physically proportional universe model.

Run the automated checks with the development server available:

```sh
npm test
npm run test:immersive
npm run test:immersive-effects
npm run build
```

The browser checks exercise preview entry without WebXR, reference-level changes, map transforms, clean controls, exit restoration, English and Italian controls, narrow-screen layout, and real WebGL camera movement while the map stays fixed. Automated XR simulations cover session and tracking transforms. Actual passthrough, stereo rendering and tracked-hand usability require verification on a physical Quest.

Primary references:

- [Meta: WebXR mixed reality](https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/)
- [WebXR Device API specification](https://immersive-web.github.io/webxr/)
- [WebXR reference-space reset events](https://immersive-web.github.io/webxr/#xrreferencespaceevent-interface)
- [Three.js WebXRManager](https://threejs.org/docs/pages/WebXRManager.html)
