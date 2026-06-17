// plugins/withHighRefreshRate.js
// Expo Config Plugin: inject high refresh rate flags into AndroidManifest.xml
// Needed for Android 90+ devices (Redmi, Samsung, etc.) to unlock 120Hz
//
// What this does:
//  1. Sets android:preferMinimalPostProcessing="true" on the Activity
//     → Disables post-processing that can cap display rate
//  2. Adds metadata "com.android.graphics.egl.swap_interval" = 0
//     → Hint to the GPU driver: don't throttle swap interval
//  3. Sets android:hardwareAccelerated="true" (ensure it's set)
//  4. android:configChanges includes "density" to avoid recreate on Hz change

const { withAndroidManifest } = require('@expo/config-plugins');

const withHighRefreshRate = (config) => {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application[0];

    // ─── 1. Find main Activity ────────────────────────────────────────────
    const activities = application.activity || [];
    const mainActivity = activities.find(
      (a) =>
        a.$?.['android:name'] === '.MainActivity' ||
        a.$?.['android:name']?.includes('MainActivity')
    );

    if (mainActivity) {
      // Set preferred display mode flags
      mainActivity.$['android:preferMinimalPostProcessing'] = 'true';
      mainActivity.$['android:hardwareAccelerated'] = 'true';

      // Extend configChanges to include "density|screenSize" (avoid recreate on Hz change)
      const existingChanges = mainActivity.$['android:configChanges'] || '';
      const neededChanges = ['density', 'screenSize', 'screenLayout'];
      const currentList = existingChanges.split('|').map((s) => s.trim()).filter(Boolean);
      for (const change of neededChanges) {
        if (!currentList.includes(change)) currentList.push(change);
      }
      mainActivity.$['android:configChanges'] = currentList.join('|');
    }

    // ─── 2. Application-level metadata ───────────────────────────────────
    if (!application['meta-data']) application['meta-data'] = [];
    const metaData = application['meta-data'];

    // EGL swap interval hint (0 = no throttle)
    const eglKey = 'com.android.graphics.egl.swap_interval';
    if (!metaData.find((m) => m.$?.['android:name'] === eglKey)) {
      metaData.push({ $: { 'android:name': eglKey, 'android:value': '0' } });
    }

    // Disable GPU driver throttling for high performance workloads
    const gpuKey = 'com.samsung.android.game.gpu.control';
    if (!metaData.find((m) => m.$?.['android:name'] === gpuKey)) {
      metaData.push({ $: { 'android:name': gpuKey, 'android:value': 'false' } });
    }

    return config;
  });
};

module.exports = withHighRefreshRate;
